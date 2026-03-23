import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { usePersistedUserId } from '@/utils/user-id';
import DeleteAccountConfirmDialog from './DeleteAccountConfirmDialog';
import ClearDataConfirmDialog from './ClearDataConfirmDialog';
import SquareButton from './SquareButton';
import { offlineDB } from '@/utils/offline-db';
import { getSyncState } from '@/utils/sync-manager';
import type { SyncState } from '@/utils/offline-db';
import { clearNavigationCache } from '@/utils/navigation-cache';

interface MyDataPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

// Chevron icon for list items
const ChevronIcon = () => (
  <svg viewBox="0 0 320 512">
    <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
  </svg>
);

export default function MyDataPanel({ onClose, inBottomSheet = false }: MyDataPanelProps) {
  const [isMounted, setIsMounted] = useState(false);
  const userId = usePersistedUserId();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      // Default: dispatch closeProfilePanel event
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<string | null>(null);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [hasCheckedSyncOnce, setHasCheckedSyncOnce] = useState(false);

  // Check sync status
  const checkSyncStatus = async () => {
    if (!isMounted || !userId) return;

    try {
      // Get pending sync count
      const count = await offlineDB.syncQueue
        .where('userId')
        .equals(userId)
        .filter(op => op.retryCount < 5)
        .count();
      setPendingSyncCount(count);

      // Get sync state
      const state = await getSyncState(userId);
      setSyncState(state);
    } catch (error) {
      console.error('[MyDataPanel] Error checking sync status:', error);
    } finally {
      setHasCheckedSyncOnce(true);
    }
  };

  // Check sync status on mount and periodically
  useEffect(() => {
    if (!isMounted || !userId) return;

    checkSyncStatus();

    // Extra check after 1.5s so bootstrap that finishes right after open is reflected quickly
    const delayedCheck = setTimeout(checkSyncStatus, 1500);

    // Check every 5 seconds
    const interval = setInterval(checkSyncStatus, 5000);

    // Also check when window regains focus
    const handleFocus = () => checkSyncStatus();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(delayedCheck);
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isMounted, userId]);

  // Format sync timestamp and footer message
  // Use hard-coded arrays instead of toLocaleString to avoid iOS PWA ignoring 'en-US' locale.
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const formatSyncTimestamp = (): string => {
    const formatTs = (date: Date) => {
      const month = MONTHS_SHORT[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
    };
    if (syncState?.lastSyncTimestamp) {
      return formatTs(new Date(syncState.lastSyncTimestamp));
    } else if (syncState?.lastBootstrapTimestamp) {
      return formatTs(new Date(syncState.lastBootstrapTimestamp));
    }
    return '';
  };

  const syncFooterMessage = ((): string => {
    const ts = formatSyncTimestamp();
    if (ts) return `All synced as of ${ts}`;
    if (syncState?.syncError) return 'Sync issue — will retry when online.';
    if (!hasCheckedSyncOnce && userId) return 'Checking sync…';
    if (syncState?.isSyncing) return 'Syncing…';
    return 'Not yet synced';
  })();

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showDeleteConfirm || showClearDataConfirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [showDeleteConfirm, showClearDataConfirm]);

  const handleExport = async (format: string, label: string) => {
    if (isExporting) return;
    
    setIsExporting(format);
    try {
      const response = await fetch(`/api/user/export?format=${format}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `harvous-export-${new Date().toISOString().split('T')[0]}.${format === 'csv-threads' ? 'csv' : 'md'}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Show success toast
      const message = `${label} exported!`;
      toast.success(message, { icon: null });
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Failed to export ${label}. Please try again.`, { icon: null });
    } finally {
      setIsExporting(null);
    }
  };

  const handleDeleteAccount = async () => {
    // Warn if there are unsynced changes
    if (pendingSyncCount > 0) {
      const confirmed = window.confirm(
        `Warning: You have ${pendingSyncCount} unsynced change${pendingSyncCount > 1 ? 's' : ''} that will be lost forever. ` +
        'Are you sure you want to delete your account?'
      );
      if (!confirmed) {
        return;
      }
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        // Show success message
        toast.success('Account deleted', { icon: null });
        
        // Redirect to sign-in after a short delay
        setTimeout(() => {
          setShowDeleteConfirm(false);
          window.location.href = '/sign-in';
        }, 1000);
      } else {
        throw new Error(data.error || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete account. Please try again.', { icon: null });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const handleCancelClearData = () => {
    setShowClearDataConfirm(false);
  };

  const handleClearData = () => {
    setShowClearDataConfirm(true);
  };

  const handleConfirmClearData = async () => {
    setShowClearDataConfirm(false);
    
    // Warn if there are unsynced changes
    if (pendingSyncCount > 0) {
      const confirmed = window.confirm(
        `Warning: You have ${pendingSyncCount} unsynced change${pendingSyncCount > 1 ? 's' : ''} that will be lost forever. ` +
        'Are you sure you want to clear all data?'
      );
      if (!confirmed) {
        setShowClearDataConfirm(true);
        return;
      }
    }

    setIsClearingData(true);
    try {
      const response = await fetch('/api/user/clear-data', {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('It\'s all been erased', { icon: null });
        
        // Clear localStorage caches that are user-specific
        if (userId) {
          localStorage.removeItem(`harvous_highestSimpleNoteId_${userId}`);
        }
        // Clear generic caches
        localStorage.removeItem('deletedContentItems');
        sessionStorage.removeItem('deletedContentItems');
        sessionStorage.removeItem('recentlyCreatedNotes');
        sessionStorage.removeItem('recentlyCreatedThreads');
        
        // Clear navigation history
        localStorage.removeItem('harvous-navigation-history-v2');
        sessionStorage.removeItem('harvous-navigation-history');
        // Clear navigation backup global variable
        if (typeof window !== 'undefined' && (window as any).navigationHistoryBackup) {
          (window as any).navigationHistoryBackup = null;
        }
        
        // Clear thread context tracking
        localStorage.removeItem('harvous-current-thread-context');
        localStorage.removeItem('harvous-thread-context-timestamp');
        localStorage.removeItem('harvous-referrer-thread-context');
        localStorage.removeItem('harvous-breadcrumb-navigation');
        
        // Clear panel state
        localStorage.removeItem('newNoteThread');
        localStorage.removeItem('newNoteThreadPending');
        localStorage.removeItem('newThreadTitle');
        localStorage.removeItem('newThreadColor');
        localStorage.removeItem('newThreadType');
        localStorage.removeItem('showNewNotePanel');
        localStorage.removeItem('showNewThreadPanel');
        localStorage.removeItem('showNewResourcePanel');
        
        // Clear IndexedDB
        try {
          const { offlineDB, ensureDatabaseOpen } = await import('@/utils/offline-db');
          await offlineDB.delete();
          // Reopen the database after deletion so future sync operations can continue
          // This prevents DatabaseClosedError when sync operations try to access the database
          await ensureDatabaseOpen();
        } catch (e) {
          console.warn('[MyDataPanel] Failed to clear IndexedDB:', e);
        }
        
        // Clear content cache (harvous_content_cache_* for all filters)
        const filters = ['all', 'threads', 'notes', 'scripture', 'resources'];
        filters.forEach(filter => {
          localStorage.removeItem(`harvous_content_cache_${filter}`);
        });
        
        // Clear navigation cache
        clearNavigationCache();
        
        // Hard page reload to reset all React state
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        throw new Error(data.error || 'Failed to clear data');
      }
    } catch (error) {
      console.error('Clear data error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to clear data. Please try again.', { icon: null });
    } finally {
      setIsClearingData(false);
    }
  };

  const handleImport = async (format: string, label: string) => {
    if (isImporting) return;

    // Create file input - support multiple files to detect folder structure
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = format === 'markdown' ? '.md' : '.csv';
    input.multiple = true; // Allow multiple file selection
    // Note: webkitdirectory would require selecting a folder, which might not be desired
    // Instead, we'll detect folder structure from filenames or webkitRelativePath if available
    input.style.display = 'none';

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      setIsImporting(format);

      try {
        const formData = new FormData();
        
        // Add all files
        for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i]);
        }
        
        formData.append('format', format);

        const response = await fetch('/api/user/import', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Import failed: ${response.statusText}`);
        }

        // Show success toast
        toast.success('Import successful', { icon: null });

        // Redirect to dashboard after a short delay to show new content
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } catch (error) {
        console.error('Import error:', error);
        toast.error(error instanceof Error ? error.message : `Failed to import ${label}. Please try again.`, { icon: null });
      } finally {
        setIsImporting(null);
        document.body.removeChild(input);
      }
    };

    document.body.appendChild(input);
    input.click();
  };

  return (
    <>
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-fill flex-stack" : "flex-stack"} style={{ gap: 0 }}>
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            {/* Header section */}
            <div className="panel__header">
              <div className="panel__title">
                <p>My Data</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                {/* Informational text */}
                <div className="text-center px-4 pt-3 pb-2" style={{ color: 'var(--color-pebble-grey)', fontSize: '14px', textWrap: 'balance' }}>
                  Your data is automatically backed up by Harvous. Export your data anytime to keep for yourself.
                </div>

                {/* Export Buttons */}
                <div className="panel__section">
                  {/* Export as CSV */}
                  <button
                    className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 w-full flex items-center justify-center"
                    style={{ 
                      backgroundImage: 'var(--color-gradient-gray)',
                      opacity: isExporting === 'csv-threads' ? 0.6 : 1,
                      pointerEvents: isExporting === 'csv-threads' ? 'none' : 'auto'
                    }}
                    onClick={() => handleExport('csv-threads', 'CSV')}
                    disabled={isExporting === 'csv-threads'}
                  >
                    <span className="font-sans text-[18px] font-semibold" style={{ color: 'var(--color-deep-grey)' }}>
                      Export as CSV
                    </span>
                  </button>
                </div>

                {/* Clear Data Button - For Testing */}
                <div className="panel__section">
                  <button
                    className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 w-full overflow-hidden flex items-center justify-center"
                    style={{ 
                      backgroundImage: 'var(--color-gradient-gray)',
                      opacity: isClearingData ? 0.6 : 1,
                      pointerEvents: isClearingData ? 'none' : 'auto'
                    }}
                    onClick={handleClearData}
                    disabled={isClearingData}
                  >
                    <span className="font-sans text-[18px] font-semibold" style={{ color: 'var(--color-deep-grey)' }}>
                      {isClearingData ? 'Erasing...' : 'Erase all notes, threads, and spaces'}
                    </span>
                  </button>
                </div>

                {/* Horizontal Divider */}
                {/* <div className="panel__divider"></div> */}

                {/* Import Buttons - Commented out */}
                {false && (
                  <>
                    <div className="panel__divider"></div>
                    <div className="panel__section">
                      <button
                        className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full overflow-hidden"
                        style={{ 
                          backgroundImage: 'var(--color-gradient-gray)',
                          opacity: isImporting === 'csv-threads' ? 0.6 : 1,
                          pointerEvents: isImporting === 'csv-threads' ? 'none' : 'auto'
                        }}
                        onClick={() => handleImport('csv-threads', 'CSV')}
                        disabled={isImporting === 'csv-threads'}
                      >
                        <div className="panel__list-item">
                          <div className="panel__list-item-text">
                            <span className="panel__list-item-label">
                              {isImporting === 'csv-threads' ? 'Importing...' : 'Import from CSV'}
                            </span>
                          </div>
                          <div className="panel__list-item-icon">
                            <div className="panel__list-item-icon-wrapper">
                              <div className="panel__chevron">
                                <ChevronIcon />
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>

                      <button
                        className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full overflow-hidden"
                        style={{ 
                          backgroundImage: 'var(--color-gradient-gray)',
                          opacity: isImporting === 'markdown' ? 0.6 : 1,
                          pointerEvents: isImporting === 'markdown' ? 'none' : 'auto'
                        }}
                        onClick={() => handleImport('markdown', 'Markdown')}
                        disabled={isImporting === 'markdown'}
                      >
                        <div className="panel__list-item">
                          <div className="panel__list-item-text">
                            <span className="panel__list-item-label">
                              {isImporting === 'markdown' ? 'Importing...' : 'Import from Markdown'}
                            </span>
                          </div>
                          <div className="panel__list-item-icon">
                            <div className="panel__list-item-icon-wrapper">
                              <div className="panel__chevron">
                                <ChevronIcon />
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </>
                )}

                {/* Sync status text */}
                <div className="panel__footer">
                  <p>{syncFooterMessage}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
          />
          
          {/* Delete Account button */}
          <button 
            type="button"
            data-outer-shadow
            className="btn-cta flex-1 group"
            style={{ 
              backgroundColor: 'var(--color-red)',
              pointerEvents: showDeleteConfirm ? 'none' : 'auto'
            }}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={showDeleteConfirm}
          >
            <span className="btn-cta__content">
              Delete account
            </span>
            <div className="btn-cta__shadow" />
          </button>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog - Rendered via Portal */}
      {showDeleteConfirm && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay-enter"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
            backgroundColor: 'transparent',
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content); don't close while deleting
            if (e.target === e.currentTarget && !isDeleting) {
              handleCancelDelete();
            }
          }}
        >
          <div 
            className="modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              pointerEvents: 'auto',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--color-deep-grey)',
              marginBottom: '0.5rem'
            }}>
              Delete account?
            </h3>
            <p style={{
              color: 'var(--color-pebble-grey)',
              marginBottom: '1.5rem'
            }}>
              Are you sure you want to delete your account? This action cannot be undone. All your notes, threads, spaces, and data will be permanently deleted.
            </p>
            <DeleteAccountConfirmDialog
              onCancel={handleCancelDelete}
              onConfirm={handleDeleteAccount}
              isDeleting={isDeleting}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Clear Data Confirmation Dialog - Rendered via Portal */}
      {showClearDataConfirm && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay-enter"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
            backgroundColor: 'transparent',
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content)
            if (e.target === e.currentTarget) {
              handleCancelClearData();
            }
          }}
        >
          <div 
            className="modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              pointerEvents: 'auto',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--color-deep-grey)',
              marginBottom: '0.5rem'
            }}>
              Erase all notes, threads, and spaces?
            </h3>
            <p style={{
              color: 'var(--color-pebble-grey)',
              marginBottom: '1.5rem'
            }}>
              This will delete all your notes, threads, and tags. This action cannot be undone. But, know your account will remain active.
            </p>
            <ClearDataConfirmDialog
              onCancel={handleCancelClearData}
              onConfirm={handleConfirmClearData}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

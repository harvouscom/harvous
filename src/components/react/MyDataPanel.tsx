import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import DeleteAccountConfirmDialog from './DeleteAccountConfirmDialog';
import ClearDataConfirmDialog from './ClearDataConfirmDialog';
import SquareButton from './SquareButton';

interface MyDataPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function MyDataPanel({ onClose, inBottomSheet = false }: MyDataPanelProps) {
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
      const message = `${label} exported successfully!`;
      toast.success(message, { icon: null });
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Failed to export ${label}. Please try again.`, { icon: null });
    } finally {
      setIsExporting(null);
    }
  };

  const handleDeleteAccount = async () => {
    setShowDeleteConfirm(false);
    
    try {
      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        // Show success message
        toast.success('Account deleted successfully', { icon: null });
        
        // Redirect to sign-in after a short delay
        setTimeout(() => {
          window.location.href = '/sign-in';
        }, 1000);
      } else {
        throw new Error(data.error || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete account. Please try again.', { icon: null });
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
    setIsClearingData(true);
    try {
      const response = await fetch('/api/user/clear-data', {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('All data cleared successfully', { icon: null });
        
        // Reload page after a short delay
        setTimeout(() => {
          window.location.reload();
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
      <div className="h-full flex flex-col min-h-0">
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
          {/* Single unified panel using CardStack structure */}
          <div className={`bg-white box-border flex flex-col items-start ${inBottomSheet ? "min-h-0 flex-1 justify-between" : "justify-start"} overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5`}>
            {/* Header section with paper background */}
            <div className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl" style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-deep-grey)' }}>
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal]">My Data</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={inBottomSheet ? "flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full" : "box-border content-stretch flex flex-col items-start justify-start mb-[-24px] overflow-clip relative w-full"}>
              <div className={inBottomSheet ? "flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full" : "bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start overflow-x-clip p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full"}>
                {/* Export Buttons */}
                <div className="content-stretch flex flex-col gap-3 items-start relative shrink-0 w-full">
                  {/* Export as CSV */}
                  <button
                    className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                    style={{ 
                      backgroundImage: 'var(--color-gradient-gray)',
                      boxShadow: '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset',
                      opacity: isExporting === 'csv-threads' ? 0.6 : 1,
                      pointerEvents: isExporting === 'csv-threads' ? 'none' : 'auto'
                    }}
                    onClick={() => handleExport('csv-threads', 'CSV')}
                    disabled={isExporting === 'csv-threads'}
                  >
                    <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                          Export as CSV
                        </span>
                      </div>
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                          <div className="flex items-center justify-center relative shrink-0">
                            <div className="relative w-6 h-6">
                              <svg className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
                                <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Horizontal Divider */}
                <div className="w-full h-px bg-[var(--color-gray)] my-3"></div>

                {/* Clear Data Button - For Testing */}
                <div className="content-stretch flex flex-col gap-3 items-start relative shrink-0 w-full">
                  <button
                    className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full overflow-hidden"
                    style={{ 
                      backgroundImage: 'var(--color-gradient-gray)',
                      boxShadow: '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset',
                      opacity: isClearingData ? 0.6 : 1,
                      pointerEvents: isClearingData ? 'none' : 'auto'
                    }}
                    onClick={handleClearData}
                    disabled={isClearingData}
                  >
                    <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                          {isClearingData ? 'Clearing...' : 'Clear All Data'}
                        </span>
                      </div>
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                          <div className="flex items-center justify-center relative shrink-0">
                            <div className="relative w-6 h-6">
                              <svg className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
                                <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    {isClearingData && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-gray)] overflow-hidden rounded-b-xl">
                        <div className="h-full bg-[var(--color-bold-blue)] animate-progress"></div>
                      </div>
                    )}
                  </button>
                </div>

                {/* Horizontal Divider */}
                <div className="w-full h-px bg-[var(--color-gray)] my-3"></div>

                {/* Import Buttons */}
                <div className="content-stretch flex flex-col gap-3 items-start relative shrink-0 w-full">
                  {/* Import from CSV */}
                  <button
                    className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full overflow-hidden"
                    style={{ 
                      backgroundImage: 'var(--color-gradient-gray)',
                      boxShadow: '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset',
                      opacity: isImporting === 'csv-threads' ? 0.6 : 1,
                      pointerEvents: isImporting === 'csv-threads' ? 'none' : 'auto'
                    }}
                    onClick={() => handleImport('csv-threads', 'CSV')}
                    disabled={isImporting === 'csv-threads'}
                  >
                    <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                          {isImporting === 'csv-threads' ? 'Importing...' : 'Import from CSV'}
                        </span>
                      </div>
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                          <div className="flex items-center justify-center relative shrink-0">
                            <div className="relative w-6 h-6">
                              <svg className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
                                <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    {isImporting === 'csv-threads' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-gray)] overflow-hidden rounded-b-xl">
                        <div className="h-full bg-[var(--color-bold-blue)] animate-progress"></div>
                      </div>
                    )}
                  </button>

                  {/* Import from Markdown */}
                  <button
                    className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full overflow-hidden"
                    style={{ 
                      backgroundImage: 'var(--color-gradient-gray)',
                      boxShadow: '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset',
                      opacity: isImporting === 'markdown' ? 0.6 : 1,
                      pointerEvents: isImporting === 'markdown' ? 'none' : 'auto'
                    }}
                    onClick={() => handleImport('markdown', 'Markdown')}
                    disabled={isImporting === 'markdown'}
                  >
                    <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                          {isImporting === 'markdown' ? 'Importing...' : 'Import from Markdown'}
                        </span>
                      </div>
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                          <div className="flex items-center justify-center relative shrink-0">
                            <div className="relative w-6 h-6">
                              <svg className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
                                <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    {isImporting === 'markdown' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-gray)] overflow-hidden rounded-b-xl">
                        <div className="h-full bg-[var(--color-bold-blue)] animate-progress"></div>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex items-center justify-between gap-3 shrink-0">
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
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              backgroundColor: 'var(--color-red)',
              pointerEvents: showDeleteConfirm ? 'none' : 'auto'
            }}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={showDeleteConfirm}
          >
            <div className="relative shrink-0 transition-transform duration-125">
              Delete Account
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
          </button>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog - Rendered via Portal */}
      {showDeleteConfirm && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
          role="dialog"
          aria-modal="true"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content)
            if (e.target === e.currentTarget) {
              handleCancelDelete();
            }
          }}
        >
          <div 
            className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
          >
            <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
              Delete Account?
            </h3>
            <p className="text-[var(--color-pebble-grey)] mb-6">
              Are you sure you want to delete your account? This action cannot be undone. All your notes, threads, spaces, and data will be permanently deleted.
            </p>
            <DeleteAccountConfirmDialog
              onCancel={handleCancelDelete}
              onConfirm={handleDeleteAccount}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Clear Data Confirmation Dialog - Rendered via Portal */}
      {showClearDataConfirm && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
          role="dialog"
          aria-modal="true"
          style={{
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
            className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
          >
            <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
              Clear All Data?
            </h3>
            <p className="text-[var(--color-pebble-grey)] mb-6">
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


      <style>{`
        .space-button {
          will-change: transform;
          transition: box-shadow 0.125s ease-in-out;
        }

        .space-button:not([data-outer-shadow]):active {
          filter: brightness(0.97);
          box-shadow: 
            0px -1px 0px 0px rgba(120, 118, 111, 0.2) inset,
            0px 1px 0px 0px rgba(120, 118, 111, 0.2) inset;
        }

        .space-button:active > div {
          translate: 0 0;
          transform: scale(0.98);
        }

        .space-button:active svg {
          transform: scale(0.95);
        }

        @keyframes progress {
          0% {
            transform: translateX(-100%);
            width: 30%;
          }
          50% {
            transform: translateX(0%);
            width: 60%;
          }
          100% {
            transform: translateX(100%);
            width: 30%;
          }
        }

        .animate-progress {
          animation: progress 1.5s ease-in-out infinite;
          width: 50%;
        }
      `}</style>
    </>
  );
}


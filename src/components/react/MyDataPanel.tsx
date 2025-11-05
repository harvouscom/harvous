import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import DeleteAccountConfirmDialog from './DeleteAccountConfirmDialog';
import SquareButton from './SquareButton';

interface MyDataPanelProps {
  onClose?: () => void;
}

export default function MyDataPanel({ onClose }: MyDataPanelProps) {
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      // Default: dispatch closeProfilePanel event
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showDeleteConfirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [showDeleteConfirm]);

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
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `${label} downloaded successfully!`,
          type: 'success'
        }
      }));
    } catch (error) {
      console.error('Export error:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Failed to export ${label}. Please try again.`,
          type: 'error'
        }
      }));
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
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Account deleted successfully',
            type: 'success'
          }
        }));
        
        // Redirect to sign-in after a short delay
        setTimeout(() => {
          window.location.href = '/sign-in';
        }, 1000);
      } else {
        throw new Error(data.error || 'Failed to delete account');
      }
    } catch (error) {
      console.error('Delete account error:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: error instanceof Error ? error.message : 'Failed to delete account. Please try again.',
          type: 'error'
        }
      }));
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div className="h-full flex flex-col min-h-0">
        {/* Content area */}
        <div className="flex flex-col">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col items-start justify-start overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5">
            {/* Header section with paper background */}
            <div className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl" style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-deep-grey)' }}>
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal]">My Data</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="box-border content-stretch flex flex-col items-start justify-start mb-[-24px] overflow-clip relative w-full">
              <div className="bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start overflow-x-clip p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                {/* Export Buttons */}
                <div className="content-stretch flex flex-col gap-3 items-start relative shrink-0 w-full">
                  {/* Export as Markdown */}
                  <button
                    className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                    style={{ 
                      backgroundImage: 'var(--color-gradient-gray)',
                      boxShadow: '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset',
                      opacity: isExporting === 'markdown' ? 0.6 : 1,
                      pointerEvents: isExporting === 'markdown' ? 'none' : 'auto'
                    }}
                    onClick={() => handleExport('markdown', 'Markdown')}
                    disabled={isExporting === 'markdown'}
                  >
                    <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                          Export as Markdown
                        </span>
                      </div>
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                          <div className="flex items-center justify-center relative shrink-0">
                            <div className="relative size-5">
                              <svg className="fill-[var(--color-deep-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 448 512">
                                <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

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
                            <div className="relative size-5">
                              <svg className="fill-[var(--color-deep-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 448 512">
                                <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Delete Account Button */}
                  <button
                    type="button"
                    data-outer-shadow
                    className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] min-h-[60px] w-full shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]"
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
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
          />
        </div>
      </div>

      {/* Confirmation Dialog - Rendered via Portal */}
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
      `}</style>
    </>
  );
}


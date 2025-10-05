import React, { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import NewNotePanel from './NewNotePanel';
import NewThreadPanel from './NewThreadPanel';

export interface BottomSheetProps {
  isOpen?: boolean;
  onClose?: () => void;
  title?: string;
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
}

type DrawerType = 'note' | 'thread' | 'noteDetails';

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen = false,
  onClose,
  title = "Panel",
  currentThread,
  currentSpace,
  currentNote,
  contentType = "dashboard"
}) => {
  const [drawerType, setDrawerType] = useState<DrawerType>('note');
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if we're on mobile
  const checkMobile = useCallback(() => {
    const mobile = window.innerWidth < 1160;
    setIsMobile(mobile);
    if (!mobile) {
      // If we're on desktop, don't show the bottom sheet
      setIsVisible(false);
    }
  }, []);

  // Check mobile on mount and resize
  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  // Handle opening the bottom sheet
  const openBottomSheet = useCallback((type: DrawerType = 'note') => {
    // Only open on mobile
    if (!isMobile) {
      console.log('BottomSheet: Not opening on desktop');
      return;
    }
    
    console.log('BottomSheet: Opening with type:', type);
    setDrawerType(type);
    setIsVisible(true);
    
    // Initialize form handlers for the specific panel type
    if (type === 'thread') {
      console.log('BottomSheet: Initializing thread creation handlers');
      setTimeout(() => {
        if (typeof window.initThreadCreation === 'function') {
          window.initThreadCreation();
        }
      }, 100);
    } else if (type === 'note') {
      console.log('BottomSheet: Initializing note creation handlers');
      setTimeout(() => {
        if (typeof window.setupCreateNoteButton === 'function') {
          window.setupCreateNoteButton();
        }
      }, 100);
    }
  }, [isMobile]);

  // Handle closing the bottom sheet
  const closeBottomSheet = useCallback(() => {
    console.log('BottomSheet: Closing');
    
    // Trigger slide-down animation
    const sheetContent = document.querySelector('.bottom-sheet-content');
    const overlay = document.querySelector('[data-radix-sheet-overlay]');
    
    if (sheetContent) {
      sheetContent.style.transform = 'translateY(100%)';
      sheetContent.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
    }
    
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.4s ease-in';
    }
    
    // Close after animation completes
    setTimeout(() => {
      setIsVisible(false);
      if (onClose && typeof onClose === 'function') {
        onClose();
      }
    }, 200);
  }, [onClose]);

  // Set up event listeners
  useEffect(() => {
    const handleOpenBottomSheet = (event: CustomEvent) => {
      console.log('BottomSheet: openBottomSheet received:', event.detail);
      const type = (event.detail && event.detail.type) || 'note';
      openBottomSheet(type as DrawerType);
    };

    const handleCloseBottomSheet = () => {
      closeBottomSheet();
    };

    // Listen for bottom sheet events
    window.addEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
    window.addEventListener('closeMobileDrawer', handleCloseBottomSheet);
    
    // Listen for panel close events
    window.addEventListener('closeNewNotePanel', handleCloseBottomSheet);
    window.addEventListener('closeNewThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);

    return () => {
      window.removeEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
      window.removeEventListener('closeMobileDrawer', handleCloseBottomSheet);
      window.removeEventListener('closeNewNotePanel', handleCloseBottomSheet);
      window.removeEventListener('closeNewThreadPanel', handleCloseBottomSheet);
      window.removeEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
    };
  }, [openBottomSheet, closeBottomSheet]);

  // Handle visibility changes
  useEffect(() => {
    if (isOpen) {
      openBottomSheet('note');
    } else if (!isVisible) {
      // Component is controlled externally
      setIsVisible(false);
    }
  }, [isOpen, openBottomSheet, isVisible]);

  // Handle animation when sheet opens/closes
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure the element is rendered
      const timer = setTimeout(() => {
        const sheetContent = document.querySelector('.bottom-sheet-content');
        const overlay = document.querySelector('[data-radix-sheet-overlay]');
        
        if (sheetContent) {
          sheetContent.style.transform = 'translateY(0)';
        }
        
        if (overlay) {
          overlay.style.opacity = '0.4';
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Don't render on desktop
  if (!isMobile) {
    return null;
  }

  return (
    <Sheet open={isVisible} onOpenChange={(open) => {
      if (!open) {
        closeBottomSheet();
      }
    }}>
      <SheetContent 
        side="bottom" 
        className="h-[90vh] rounded-t-3xl p-0 bg-[var(--color-light-paper)] bottom-sheet-content"
        style={{ 
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
          paddingTop: '20px',
          transform: 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Content */}
        <div className="h-full flex flex-col min-h-0 px-3">
          {/* New Note Panel */}
          {drawerType === 'note' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <NewNotePanel 
                currentThread={currentThread}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
                }}
              />
            </div>
          )}
          
          {/* New Thread Panel */}
          {drawerType === 'thread' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <NewThreadPanel 
                currentSpace={currentSpace}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
                }}
              />
            </div>
          )}
          
          {/* Note Details Panel */}
          {drawerType === 'noteDetails' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              {contentType === 'note' && currentNote && (
                <div className="text-center py-8 text-gray-500">
                  Note Details Panel - Mobile Bottom Sheet
                  <br />
                  <small className="text-sm text-gray-400">
                    This will show the NoteDetailsPanel component
                  </small>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BottomSheet;

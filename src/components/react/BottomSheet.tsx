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
import NoteDetailsPanel from './NoteDetailsPanel';
import EditNameColorPanel from './EditNameColorPanel';
import EditThreadPanel from './EditThreadPanel';
import EmailPasswordPanel from './EmailPasswordPanel';
import MyChurchPanel from './MyChurchPanel';
import MyDataPanel from './MyDataPanel';
import GetSupportPanel from './GetSupportPanel';

// Extend the Window interface to include custom functions
declare global {
  interface Window {
    initThreadCreation?: () => void;
    setupCreateNoteButton?: () => void;
  }
}

export interface BottomSheetProps {
  isOpen?: boolean;
  onClose?: () => void;
  title?: string;
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
}

type DrawerType = 'note' | 'thread' | 'noteDetails' | 'editNameColor' | 'editThread' | 'getSupport' | 'emailPassword' | 'myChurch' | 'myData';

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
    const sheetContent = document.querySelector('.bottom-sheet-content') as HTMLElement;
    
    if (sheetContent) {
      sheetContent.style.transform = 'translateY(100%)';
      sheetContent.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
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
      const type = (event.detail && (event.detail.type || event.detail.drawerType)) || 'note';
      console.log('BottomSheet: Opening with type:', type);
      openBottomSheet(type as DrawerType);
    };

    const handleCloseBottomSheet = () => {
      closeBottomSheet();
    };

    // Listen for bottom sheet events
    window.addEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
    window.addEventListener('closeMobileDrawer', handleCloseBottomSheet);
    
    // Listen for panel events and open mobile drawer if on mobile
    const handleOpenEditThreadPanel = () => {
      if (isMobile) {
        openBottomSheet('editThread');
      }
    };
    
    window.addEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
    
    // Listen for panel close events
    window.addEventListener('closeNewNotePanel', handleCloseBottomSheet);
    window.addEventListener('closeNewThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
    window.addEventListener('closeProfilePanel', handleCloseBottomSheet);
    window.addEventListener('closeEditThreadPanel', handleCloseBottomSheet);

    return () => {
      window.removeEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
      window.removeEventListener('closeMobileDrawer', handleCloseBottomSheet);
      window.removeEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
      window.removeEventListener('closeNewNotePanel', handleCloseBottomSheet);
      window.removeEventListener('closeNewThreadPanel', handleCloseBottomSheet);
      window.removeEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
      window.removeEventListener('closeProfilePanel', handleCloseBottomSheet);
      window.removeEventListener('closeEditThreadPanel', handleCloseBottomSheet);
    };
  }, [openBottomSheet, closeBottomSheet, isMobile]);

  // Handle visibility changes
  useEffect(() => {
    if (isOpen) {
      openBottomSheet('note');
    } else if (!isVisible) {
      // Component is controlled externally
      setIsVisible(false);
    }
  }, [isOpen, openBottomSheet, isVisible]);

  // Prevent background scrolling when bottom sheet is open
  useEffect(() => {
    if (isVisible) {
      document.body.classList.add('bottom-sheet-open');
    } else {
      document.body.classList.remove('bottom-sheet-open');
    }
    
    return () => {
      document.body.classList.remove('bottom-sheet-open');
    };
  }, [isVisible]);

  // Handle animation when sheet opens/closes
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure the element is rendered
      const timer = setTimeout(() => {
        const sheetContent = document.querySelector('.bottom-sheet-content') as HTMLElement;
        
        if (sheetContent) {
          sheetContent.style.transform = 'translateY(0)';
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
        className="h-[90vh] rounded-t-3xl p-0 bg-[var(--color-light-paper)] bottom-sheet-content border-0"
        style={{ 
          paddingBottom: '12px',
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
                <NoteDetailsPanel
                  noteId={currentNote.id}
                  noteTitle={currentNote.title || "Note Details"}
                  threads={[]}
                  comments={[]}
                  tags={[]}
                  onClose={() => {
                    window.dispatchEvent(new CustomEvent('closeNoteDetailsPanel'));
                  }}
                />
              )}
            </div>
          )}
          
          {/* Edit Name & Color Panel */}
          {drawerType === 'editNameColor' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <EditNameColorPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* Edit Thread Panel */}
          {drawerType === 'editThread' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              {contentType === 'thread' && currentThread && (
                <EditThreadPanel 
                  threadId={currentThread.id}
                  initialTitle={currentThread.title}
                  initialColor={currentThread.color}
                  onClose={() => {
                    window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
                  }}
                  inBottomSheet={true}
                />
              )}
            </div>
          )}
          
          {/* Get Support Panel */}
          {drawerType === 'getSupport' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <GetSupportPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* Email & Password Panel */}
          {drawerType === 'emailPassword' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <EmailPasswordPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* My Church Panel */}
          {drawerType === 'myChurch' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <MyChurchPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* My Data Panel */}
          {drawerType === 'myData' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <MyDataPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BottomSheet;

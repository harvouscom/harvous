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
import EditSpacePanel from './EditSpacePanel';
import EmailPasswordPanel from './EmailPasswordPanel';
import MyChurchPanel from './MyChurchPanel';
import MySpacesPanel from './MySpacesPanel';
import MyDataPanel from './MyDataPanel';
import MyAchievementsPanel from './MyAchievementsPanel';
import GetSupportPanel from './GetSupportPanel';
import InboxItemPreviewPanel from './InboxItemPreviewPanel';

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
  version?: string;
}

type DrawerType = 'note' | 'thread' | 'resource' | 'noteDetails' | 'editNameColor' | 'editThread' | 'editSpace' | 'getSupport' | 'emailPassword' | 'myChurch' | 'mySpaces' | 'myData' | 'myAchievements' | 'inboxPreview';

interface InboxItem {
  id: string;
  contentType: 'thread' | 'note';
  title: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
  color?: string;
  notes?: Array<{
    id: string;
    title?: string;
    content: string;
    order: number;
  }>;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen = false,
  onClose,
  title = "Panel",
  currentThread,
  currentSpace,
  currentNote,
  contentType = "dashboard",
  version = '0.10.0'
}) => {
  const [drawerType, setDrawerType] = useState<DrawerType>('note');
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [panelKey, setPanelKey] = useState(0); // Force remount when panel opens
  const [inboxPreviewData, setInboxPreviewData] = useState<InboxItem | null>(null);

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
      return;
    }

    setDrawerType(type);
    setIsVisible(true);
    // Increment panelKey to force remount and re-read localStorage
    setPanelKey(prev => prev + 1);
    
    // Initialize form handlers for the specific panel type
    if (type === 'thread') {
      setTimeout(() => {
        if (typeof window.initThreadCreation === 'function') {
          window.initThreadCreation();
        }
      }, 100);
    } else if (type === 'note' || type === 'resource') {
      setTimeout(() => {
        if (typeof window.setupCreateNoteButton === 'function') {
          window.setupCreateNoteButton();
        }
      }, 100);
    }
  }, [isMobile]);

  // Handle closing the bottom sheet
  const closeBottomSheet = useCallback(() => {
    // Trigger slide-down animation
    const sheetContent = document.querySelector('.bottom-sheet-content') as HTMLElement;
    
    if (sheetContent) {
      sheetContent.classList.remove('bottom-sheet-slide-up');
      sheetContent.classList.add('bottom-sheet-slide-down');
    }
    
    // Close after animation completes
    setTimeout(() => {
      setIsVisible(false);
      if (onClose && typeof onClose === 'function') {
        onClose();
      }
    }, 250);
  }, [onClose]);

  // Set up event listeners
  useEffect(() => {
    const handleOpenBottomSheet = (event: CustomEvent) => {
      const type = (event.detail && (event.detail.type || event.detail.drawerType)) || 'note';
      
      // Handle inbox preview with data
      if (type === 'inboxPreview' && event.detail?.item) {
        setInboxPreviewData(event.detail.item);
      }
      
      openBottomSheet(type as DrawerType);
    };

    const handleCloseBottomSheet = () => {
      closeBottomSheet();
      // Clear inbox preview data when closing
      if (drawerType === 'inboxPreview') {
        setInboxPreviewData(null);
      }
    };

    // Listen for bottom sheet events
    window.addEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
    window.addEventListener('closeMobileDrawer', handleCloseBottomSheet);
    
    // Listen for inbox preview events
    const handleOpenInboxPreview = (event: CustomEvent) => {
      const item = event.detail?.item;
      if (item && isMobile) {
        setInboxPreviewData(item);
        openBottomSheet('inboxPreview');
      }
    };
    
    window.addEventListener('openInboxPreview', handleOpenInboxPreview as EventListener);
    
    // Listen for panel events and open mobile drawer if on mobile
    const handleOpenEditThreadPanel = () => {
      if (isMobile) {
        openBottomSheet('editThread');
      }
    };
    
    const handleOpenEditSpacePanel = () => {
      if (isMobile) {
        openBottomSheet('editSpace');
      }
    };
    
    window.addEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
    window.addEventListener('openEditSpacePanel', handleOpenEditSpacePanel);
    
    // Listen for profile panel events (for mobile bottom sheet)
    const handleOpenProfilePanel = (event: CustomEvent) => {
      if (!isMobile) return;
      const panelName = event.detail?.panelName;
      if (panelName === 'editNameColor') openBottomSheet('editNameColor');
      else if (panelName === 'emailPassword') openBottomSheet('emailPassword');
      else if (panelName === 'myChurch') openBottomSheet('myChurch');
      else if (panelName === 'mySpaces') openBottomSheet('mySpaces');
      else if (panelName === 'myData') openBottomSheet('myData');
      else if (panelName === 'myAchievements') openBottomSheet('myAchievements');
      else if (panelName === 'getSupport') openBottomSheet('getSupport');
    };
    
    window.addEventListener('openProfilePanel', handleOpenProfilePanel as EventListener);
    
    // Listen for panel open events (for mobile)
    const handleOpenNewNote = () => {
      if (isMobile) {
        openBottomSheet('note');
      }
    };

    const handleOpenNewThread = () => {
      if (isMobile) {
        openBottomSheet('thread');
      }
    };

    const handleOpenNewResource = () => {
      if (isMobile) {
        // Set noteType to resource before opening
        localStorage.setItem('newNoteType', 'resource');
        openBottomSheet('resource');
      }
    };

    window.addEventListener('openNewNotePanel', handleOpenNewNote);
    window.addEventListener('openNewThreadPanel', handleOpenNewThread);
    window.addEventListener('openNewResourcePanel', handleOpenNewResource);

    // Listen for panel close events
    window.addEventListener('closeNewNotePanel', handleCloseBottomSheet);
    window.addEventListener('closeNewThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeNewResourcePanel', handleCloseBottomSheet);
    window.addEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
    window.addEventListener('closeProfilePanel', handleCloseBottomSheet);
    window.addEventListener('closeEditThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeEditSpacePanel', handleCloseBottomSheet);
    window.addEventListener('closeInboxPreview', handleCloseBottomSheet);

    return () => {
      window.removeEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
      window.removeEventListener('closeMobileDrawer', handleCloseBottomSheet);
      window.removeEventListener('openInboxPreview', handleOpenInboxPreview as EventListener);
      window.removeEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
      window.removeEventListener('openEditSpacePanel', handleOpenEditSpacePanel);
      window.removeEventListener('openProfilePanel', handleOpenProfilePanel as EventListener);
      window.removeEventListener('openNewNotePanel', handleOpenNewNote);
      window.removeEventListener('openNewThreadPanel', handleOpenNewThread);
      window.removeEventListener('openNewResourcePanel', handleOpenNewResource);
      window.removeEventListener('closeNewNotePanel', handleCloseBottomSheet);
      window.removeEventListener('closeNewThreadPanel', handleCloseBottomSheet);
      window.removeEventListener('closeNewResourcePanel', handleCloseBottomSheet);
      window.removeEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
      window.removeEventListener('closeProfilePanel', handleCloseBottomSheet);
      window.removeEventListener('closeEditThreadPanel', handleCloseBottomSheet);
      window.removeEventListener('closeEditSpacePanel', handleCloseBottomSheet);
      window.removeEventListener('closeInboxPreview', handleCloseBottomSheet);
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
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.style.top = `-${scrollY}px`;
      document.body.classList.add('bottom-sheet-open');
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.classList.remove('bottom-sheet-open');
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    
    return () => {
      // Cleanup: restore scroll position if component unmounts while open
      const scrollY = document.body.style.top;
      document.body.classList.remove('bottom-sheet-open');
      document.body.style.top = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY) * -1);
      }
    };
  }, [isVisible]);

  // Handle animation when sheet opens/closes and prevent focus outline
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure the element is rendered
      const timer = setTimeout(() => {
        const sheetContent = document.querySelector('.bottom-sheet-content') as HTMLElement;
        
        if (sheetContent) {
          sheetContent.classList.remove('bottom-sheet-slide-down');
          sheetContent.classList.add('bottom-sheet-slide-up');
          
          // Aggressively remove focus from the sheet content and all children
          sheetContent.blur();
          const focusedElement = sheetContent.querySelector(':focus');
          if (focusedElement) {
            (focusedElement as HTMLElement).blur();
          }
          
          // Remove focus-visible attribute that Radix might add
          sheetContent.removeAttribute('data-focus-visible-added');
          sheetContent.querySelectorAll('[data-focus-visible-added]').forEach(el => {
            el.removeAttribute('data-focus-visible-added');
          });
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
          padding: '0',
          transform: 'translateY(100%)',
          outline: 'none',
          boxShadow: 'none',
          border: 'none',
          borderWidth: '0'
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // Also blur any element that might have received focus
          if (e.target) {
            (e.target as HTMLElement).blur();
          }
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        tabIndex={-1}
      >
        {/* Content */}
        <div className="h-full flex flex-col min-h-0">
          {/* New Note Panel */}
          {drawerType === 'note' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <NewNotePanel
                key={`mobile-note-${panelKey}`}
                currentThread={currentThread}
                currentSpace={currentSpace}
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
                key={`mobile-thread-${panelKey}`}
                currentSpace={currentSpace}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
                }}
              />
            </div>
          )}

          {/* New Resource Panel */}
          {drawerType === 'resource' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <NewNotePanel
                key={`mobile-resource-${panelKey}`}
                currentThread={currentThread}
                currentSpace={currentSpace}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNewResourcePanel'));
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
                  inBottomSheet={true}
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
          
          {/* Edit Space Panel */}
          {drawerType === 'editSpace' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              {contentType === 'space' && currentSpace && (
                <EditSpacePanel 
                  spaceId={currentSpace.id}
                  initialTitle={currentSpace.title}
                  initialColor={currentSpace.color}
                  onClose={() => {
                    window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
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
                version={version}
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
                key={`mobile-church-${panelKey}`}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* My Spaces Panel */}
          {drawerType === 'mySpaces' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <MySpacesPanel 
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
          
          {/* My Achievements Panel */}
          {drawerType === 'myAchievements' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <MyAchievementsPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* Inbox Item Preview Panel */}
          {drawerType === 'inboxPreview' && inboxPreviewData && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <InboxItemPreviewPanel
                key={`mobile-inbox-preview-${panelKey}`}
                item={inboxPreviewData}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeInboxPreview'));
                }}
                onAddToHarvous={async (inboxItemId: string) => {
                  // Dispatch event that InboxItemsList will handle
                  window.dispatchEvent(new CustomEvent('inboxItemAddToHarvous', { detail: { inboxItemId } }));
                }}
                onArchive={async (inboxItemId: string) => {
                  // Dispatch event that InboxItemsList will handle
                  window.dispatchEvent(new CustomEvent('inboxItemArchive', { detail: { inboxItemId } }));
                }}
                onUnarchive={async (inboxItemId: string) => {
                  // Dispatch event that InboxItemsList will handle
                  window.dispatchEvent(new CustomEvent('inboxItemUnarchive', { detail: { inboxItemId } }));
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

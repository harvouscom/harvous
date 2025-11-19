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

type DrawerType = 'note' | 'thread' | 'noteDetails' | 'editNameColor' | 'editThread' | 'getSupport' | 'emailPassword' | 'myChurch' | 'myData' | 'inboxPreview';

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
      console.log('BottomSheet: Not opening on desktop');
      return;
    }

    console.log('BottomSheet: Opening with type:', type);
    setDrawerType(type);
    setIsVisible(true);
    // Increment panelKey to force remount and re-read localStorage
    setPanelKey(prev => {
      const newKey = prev + 1;
      console.log('BottomSheet: Incrementing panelKey from', prev, 'to', newKey);
      return newKey;
    });
    
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
      console.log('BottomSheet: openMobileDrawer event received:', event.detail);
      const type = (event.detail && (event.detail.type || event.detail.drawerType)) || 'note';
      console.log('BottomSheet: Opening with type:', type);
      
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
    
    window.addEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
    
    // Listen for panel close events
    window.addEventListener('closeNewNotePanel', handleCloseBottomSheet);
    window.addEventListener('closeNewThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
    window.addEventListener('closeProfilePanel', handleCloseBottomSheet);
    window.addEventListener('closeEditThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeInboxPreview', handleCloseBottomSheet);

    return () => {
      window.removeEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
      window.removeEventListener('closeMobileDrawer', handleCloseBottomSheet);
      window.removeEventListener('openInboxPreview', handleOpenInboxPreview as EventListener);
      window.removeEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
      window.removeEventListener('closeNewNotePanel', handleCloseBottomSheet);
      window.removeEventListener('closeNewThreadPanel', handleCloseBottomSheet);
      window.removeEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
      window.removeEventListener('closeProfilePanel', handleCloseBottomSheet);
      window.removeEventListener('closeEditThreadPanel', handleCloseBottomSheet);
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
          sheetContent.classList.remove('bottom-sheet-slide-down');
          sheetContent.classList.add('bottom-sheet-slide-up');
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Log when NewNotePanel is rendered with a new key
  useEffect(() => {
    if (drawerType === 'note' && isVisible) {
      console.log('BottomSheet: Rendering NewNotePanel with key:', `mobile-note-${panelKey}`);
    }
  }, [drawerType, isVisible, panelKey]);

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
          paddingBottom: '24px',
          paddingTop: '20px',
          transform: 'translateY(100%)'
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Content */}
        <div className="h-full flex flex-col min-h-0 px-3">
          {/* New Note Panel */}
          {drawerType === 'note' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <NewNotePanel
                key={`mobile-note-${panelKey}`}
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
                key={`mobile-thread-${panelKey}`}
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
                onAddNoteToHarvous={async (inboxItemNoteId: string) => {
                  // Dispatch event that InboxItemsList will handle
                  window.dispatchEvent(new CustomEvent('inboxNoteAddToHarvous', { detail: { inboxItemNoteId } }));
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

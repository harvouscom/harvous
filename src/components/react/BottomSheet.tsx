import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import MySharingPanel from './MySharingPanel';
import MyDataPanel from './MyDataPanel';
import MyAchievementsPanel from './MyAchievementsPanel';
import GetSupportPanel from './GetSupportPanel';
import ManageBillingPanel from './ManageBillingPanel';
import ReferralPanel from './ReferralPanel';
import InboxItemPreviewPanel from './InboxItemPreviewPanel';
import AboutHarvousPanel from './AboutHarvousPanel';
import NoteSharePanel from './NoteSharePanel';
import PinEntryPanel from './PinEntryPanel';
import LockPinPanel from './LockPinPanel';

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
  publishableKey?: string | null;
  founderLetterHtml?: string;
}

type DrawerType = 'note' | 'thread' | 'resource' | 'noteDetails' | 'editNameColor' | 'editThread' | 'editSpace' | 'getSupport' | 'emailPassword' | 'myChurch' | 'mySharing' | 'mySpaces' | 'myData' | 'myAchievements' | 'manageBilling' | 'referral' | 'inboxPreview' | 'aboutHarvous' | 'noteShare' | 'pinEntry' | 'lockPin';

type SheetCloseReason = 'dismiss' | 'escape' | 'button';
type SheetCloseHandler = (reason: SheetCloseReason) => boolean | Promise<boolean>;

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

// Helper function to get title for each drawer type
const getDrawerTitle = (drawerType: DrawerType): string => {
  const titleMap: Record<DrawerType, string> = {
    'note': 'New Note',
    'thread': 'New Thread',
    'resource': 'New Resource',
    'noteDetails': 'Note Details',
    'editNameColor': 'Edit Profile',
    'editThread': 'Edit Thread',
    'editSpace': 'Edit Space',
    'getSupport': 'Get Support',
    'emailPassword': 'Email & Password',
    'myChurch': 'My Church',
    'mySharing': 'My Sharing',
    'mySpaces': 'My Spaces',
    'myData': 'My Data',
    'myAchievements': 'My Achievements',
    'manageBilling': 'Manage Billing',
    'referral': 'Refer My Friends',
    'inboxPreview': 'Inbox Preview',
    'aboutHarvous': 'Letter from the Founder',
    'noteShare': 'Share Note',
    'pinEntry': 'Lock Note',
    'lockPin': 'Lock PIN',
  };
  return titleMap[drawerType] || 'Panel';
};

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen = false,
  onClose,
  title = "Panel",
  currentThread,
  currentSpace,
  currentNote,
  contentType = "dashboard",
  version,
  publishableKey = null,
  founderLetterHtml = ''
}) => {
  const [drawerType, setDrawerType] = useState<DrawerType>('note');
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [panelKey, setPanelKey] = useState(0); // Force remount when panel opens
  const [inboxPreviewData, setInboxPreviewData] = useState<InboxItem | null>(null);
  const [noteDetailsTab, setNoteDetailsTab] = useState<string | undefined>(undefined);
  const [noteShareData, setNoteShareData] = useState<{ noteId: string; noteTitle?: string } | null>(null);
  const [pinEntryData, setPinEntryData] = useState<{ noteId: string; mode: 'set' | 'unlock' | 'removeLock' | 'changeLock' | 'setForAccount' | 'lockWithAccountPin'; noteContent: string; isEncrypted: boolean } | null>(null);
  const sheetFocusRef = useRef<HTMLButtonElement | null>(null);
  const sheetContentRef = useRef<HTMLDivElement | null>(null);
  const sheetContentElRef = useRef<HTMLDivElement | null>(null);
  const activeCloseHandlerRef = useRef<SheetCloseHandler | null>(null);
  const isHandlingDismissRef = useRef(false);

  // Check if we're on mobile
  const checkMobile = useCallback(() => {
    const mobile = window.innerWidth < 1160;
    setIsMobile(mobile);
    if (!mobile) {
      // If we're on desktop, don't show the bottom sheet
      setIsVisible(false);
    }
  }, []);

  // Track previous mobile state for detecting transitions
  const prevIsMobileRef = useRef(isMobile);
  
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
  }, [isMobile]);
  
  // Check mobile on mount and resize
  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);
  
  // Sync panel state when transitioning from desktop to mobile
  useEffect(() => {
    const wasMobile = prevIsMobileRef.current;
    prevIsMobileRef.current = isMobile;
    
    // Just switched from desktop to mobile - check if a panel was open on desktop
    if (isMobile && !wasMobile) {
      const showNewNote = localStorage.getItem('showNewNotePanel') === 'true';
      const showNewThread = localStorage.getItem('showNewThreadPanel') === 'true';
      const showNewResource = localStorage.getItem('showNewResourcePanel') === 'true';
      
      if (showNewResource) {
        openBottomSheet('resource');
      } else if (showNewNote) {
        openBottomSheet('note');
      } else if (showNewThread) {
        openBottomSheet('thread');
      }
    }
  }, [isMobile, openBottomSheet]);

  // Handle closing the bottom sheet
  const closeBottomSheet = useCallback(() => {
    setIsVisible(false);
    if (onClose && typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);


  const registerActiveCloseHandler = useCallback((handler: SheetCloseHandler | null) => {
    activeCloseHandlerRef.current = handler;
  }, []);

  // Clear any stale close handler when switching panels
  useEffect(() => {
    registerActiveCloseHandler(null);
  }, [drawerType, registerActiveCloseHandler]);

  const requestClose = useCallback(
    async (reason: SheetCloseReason): Promise<boolean> => {
      const handler = activeCloseHandlerRef.current;
      if (!handler) return true;
      try {
        const result = await handler(reason);
        return result !== false;
      } catch {
        // If the handler throws, fail open so the user isn't trapped.
        return true;
      }
    },
    []
  );

  // Set up event listeners
  useEffect(() => {
    const handleOpenBottomSheet = (event: CustomEvent) => {
      const type = (event.detail && (event.detail.type || event.detail.drawerType)) || 'note';
      
      // Handle inbox preview with data
      if (type === 'inboxPreview' && event.detail?.item) {
        setInboxPreviewData(event.detail.item);
      }
      
      // Handle note details with tab
      if (type === 'noteDetails' && event.detail?.tab) {
        setNoteDetailsTab(event.detail.tab);
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
      else if (panelName === 'mySharing') openBottomSheet('mySharing');
      else if (panelName === 'mySpaces') openBottomSheet('mySpaces');
      else if (panelName === 'myData') openBottomSheet('myData');
      else if (panelName === 'myAchievements') openBottomSheet('myAchievements');
      else if (panelName === 'getSupport') openBottomSheet('getSupport');
      else if (panelName === 'manageBilling') openBottomSheet('manageBilling');
      else if (panelName === 'referral') openBottomSheet('referral');
      else if (panelName === 'aboutHarvous') openBottomSheet('aboutHarvous');
      else if (panelName === 'lockPin') openBottomSheet('lockPin');
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
        // Set noteType to resource before opening - ensure it's set synchronously
        // This is a fallback in case initialNoteType prop doesn't work
        localStorage.setItem('newNoteType', 'resource');
        // Open immediately - initialNoteType prop will be used, localStorage is fallback
        openBottomSheet('resource');
      }
    };

    window.addEventListener('openNewNotePanel', handleOpenNewNote);
    window.addEventListener('openNewThreadPanel', handleOpenNewThread);
    window.addEventListener('openNewResourcePanel', handleOpenNewResource);

    // Listen for note share panel event
    const handleOpenNoteSharePanel = (event: CustomEvent) => {
      if (!isMobile) return;
      const { contentId } = event.detail || {};
      if (contentId) {
        setNoteShareData({ noteId: contentId, noteTitle: currentNote?.title });
        openBottomSheet('noteShare');
      }
    };
    window.addEventListener('openNoteSharePanel', handleOpenNoteSharePanel as EventListener);

    // Listen for pin entry panel event (lock/unlock note)
    const handleOpenPinEntryPanel = (event: CustomEvent) => {
      if (!isMobile) return;
      const { noteId: id, mode, noteContent: content, isEncrypted } = event.detail || {};
      if (id && mode && content !== undefined) {
        setPinEntryData({ noteId: id, mode, noteContent: content, isEncrypted: !!isEncrypted });
        openBottomSheet('pinEntry');
      }
    };
    window.addEventListener('openPinEntryPanel', handleOpenPinEntryPanel as EventListener);

    // Listen for panel close events
    window.addEventListener('closeNewNotePanel', handleCloseBottomSheet);
    window.addEventListener('closeNewThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeNewResourcePanel', handleCloseBottomSheet);
    window.addEventListener('closeNoteDetailsPanel', handleCloseBottomSheet);
    window.addEventListener('closeProfilePanel', handleCloseBottomSheet);
    window.addEventListener('closeEditThreadPanel', handleCloseBottomSheet);
    window.addEventListener('closeEditSpacePanel', handleCloseBottomSheet);
    window.addEventListener('closeInboxPreview', handleCloseBottomSheet);
    window.addEventListener('closeNoteSharePanel', handleCloseBottomSheet);
    window.addEventListener('closePinEntryPanel', handleCloseBottomSheet);

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
      window.removeEventListener('openNoteSharePanel', handleOpenNoteSharePanel as EventListener);
      window.removeEventListener('closeNoteSharePanel', handleCloseBottomSheet);
      window.removeEventListener('openPinEntryPanel', handleOpenPinEntryPanel as EventListener);
      window.removeEventListener('closePinEntryPanel', handleCloseBottomSheet);
    };
  }, [openBottomSheet, closeBottomSheet, isMobile, currentNote]);

  // Handle visibility changes
  useEffect(() => {
    if (isOpen) {
      openBottomSheet('note');
    } else if (!isVisible) {
      // Component is controlled externally
      setIsVisible(false);
    }
  }, [isOpen, openBottomSheet, isVisible]);

  const isPinSheet = drawerType === 'pinEntry' || drawerType === 'lockPin';

  // When note/resource sheet open on mobile: only set toolbar position and editor max-height when keyboard is open; leave sheet unchanged (90vh)
  useEffect(() => {
    if (!isVisible || !isMobile) return;
    const isNoteOrResource = drawerType === 'note' || drawerType === 'resource';
    if (!isNoteOrResource) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const RESERVE_EDITOR_PX = 280;

    const clearOverrides = (element: HTMLDivElement) => {
      element.style.removeProperty('--toolbar-bottom');
      element.style.removeProperty('--editor-scroll-max-height');
      element.removeAttribute('data-keyboard-open');
    };

    const apply = () => {
      const el = sheetContentElRef.current;
      const viewport = window.visualViewport;
      if (!el || !viewport) return;
      const keyboardOpen = viewport.height < window.innerHeight * 0.75;

      if (keyboardOpen) {
        const toolbarBottom = (window.innerHeight - viewport.height) + 12;
        const editorH = Math.max(120, viewport.height - RESERVE_EDITOR_PX);
        el.style.setProperty('--toolbar-bottom', `${toolbarBottom}px`);
        el.style.setProperty('--editor-scroll-max-height', `${editorH}px`);
        el.setAttribute('data-keyboard-open', '');
      } else {
        clearOverrides(el);
      }
    };

    apply();
    const raf = requestAnimationFrame(() => apply());
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);

    const onFocusIn = () => {
      setTimeout(apply, 100);
      setTimeout(apply, 300);
    };
    let focusEl: HTMLDivElement | null = null;
    const rafFocus = requestAnimationFrame(() => {
      focusEl = sheetContentElRef.current;
      if (focusEl) focusEl.addEventListener('focusin', onFocusIn);
    });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rafFocus);
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      if (focusEl) focusEl.removeEventListener('focusin', onFocusIn);
      const el = sheetContentElRef.current;
      if (el) clearOverrides(el);
    };
  }, [isVisible, isMobile, drawerType]);

  // Prevent background scrolling when bottom sheet is open (lock layout-root, not body, so sheet portal is outside fixed container and inner scroll works on iOS)
  useEffect(() => {
    const root = document.getElementById('layout-root');
    if (!root) return;
    if (isVisible) {
      const scrollY = window.scrollY;
      root.style.top = `-${scrollY}px`;
      root.classList.add('bottom-sheet-open');
    } else {
      const scrollY = root.style.top;
      root.classList.remove('bottom-sheet-open');
      root.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
    }
    return () => {
      const scrollY = root.style.top;
      root.classList.remove('bottom-sheet-open');
      root.style.top = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY, 10) * -1);
      }
    };
  }, [isVisible]);

  // Don't render on desktop
  if (!isMobile) {
    return null;
  }

  return (
    <Sheet
      open={isVisible}
      onOpenChange={async (open) => {
        // Fallback: if Radix requests a close without going through our interceptors,
        // treat it as a dismiss and ask the active panel.
        if (!open && !isHandlingDismissRef.current) {
          const ok = await requestClose('dismiss');
          if (ok) closeBottomSheet();
          return;
        }
        isHandlingDismissRef.current = false;
      }}
    >
      <SheetContent
        ref={sheetContentElRef}
        side="bottom"
        className="rounded-t-3xl p-0 bg-[var(--color-light-paper)] bottom-sheet-content border-0"
        style={{
          padding: '0',
          outline: 'none',
          border: 'none',
          borderWidth: '0'
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (isPinSheet) {
            requestAnimationFrame(() => {
              sheetContentRef.current?.querySelector<HTMLInputElement>('.pin-digit-input')?.focus();
            });
          } else {
            requestAnimationFrame(() => sheetFocusRef.current?.focus());
          }
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={async (e) => {
          // Intercept overlay click / outside interactions and run panel close logic first.
          e.preventDefault();
          isHandlingDismissRef.current = true;
          const ok = await requestClose('dismiss');
          if (ok) closeBottomSheet();
        }}
        onEscapeKeyDown={async (e) => {
          // Intercept Escape key and run panel close logic first.
          e.preventDefault();
          isHandlingDismissRef.current = true;
          const ok = await requestClose('escape');
          if (ok) closeBottomSheet();
        }}
        tabIndex={-1}
      >
        {/* Accessibility: Required SheetTitle and SheetDescription for screen readers */}
        <SheetHeader>
          <SheetTitle className="sr-only">
            {getDrawerTitle(drawerType)}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {`${getDrawerTitle(drawerType)} panel`}
          </SheetDescription>
        </SheetHeader>

        {/* Focus anchor: keeps focus out of aria-hidden background (used when not PIN sheet) */}
        <button ref={sheetFocusRef} type="button" className="sr-only">
          {getDrawerTitle(drawerType)}
        </button>
        
        {/* Content */}
        <div ref={sheetContentRef} className="bottom-sheet__inner h-full flex flex-col min-h-0">
          {/* New Note Panel */}
          {drawerType === 'note' && (
            <div className="panel-container panel-container--note flex-1 flex flex-col min-h-0 overflow-hidden">
              <NewNotePanel
                key={`mobile-note-${panelKey}`}
                currentThread={currentThread}
                currentSpace={currentSpace}
                inBottomSheet={true}
                registerSheetCloseHandler={registerActiveCloseHandler}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
                }}
                onPanelReady={() => {
                  if (typeof window.setupCreateNoteButton === 'function') {
                    window.setupCreateNoteButton();
                  }
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
                inBottomSheet={true}
                registerSheetCloseHandler={registerActiveCloseHandler}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
                }}
                onPanelReady={() => {
                  if (typeof window.initThreadCreation === 'function') {
                    window.initThreadCreation();
                  }
                }}
              />
            </div>
          )}

          {/* New Resource Panel */}
          {drawerType === 'resource' && (
            <div className="panel-container panel-container--note flex-1 flex flex-col min-h-0 overflow-hidden">
              <NewNotePanel
                key={`mobile-resource-${panelKey}`}
                currentThread={currentThread}
                currentSpace={currentSpace}
                initialNoteType="resource"
                inBottomSheet={true}
                registerSheetCloseHandler={registerActiveCloseHandler}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNewResourcePanel'));
                }}
                onPanelReady={() => {
                  if (typeof window.setupCreateNoteButton === 'function') {
                    window.setupCreateNoteButton();
                  }
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
                  initialTab={noteDetailsTab}
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
                  key={`mobile-edit-thread-${panelKey}`}
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
                  key={`mobile-edit-space-${panelKey}`}
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
          
          {/* About Harvous Panel */}
          {drawerType === 'aboutHarvous' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <AboutHarvousPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                letterHtml={founderLetterHtml}
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

          {/* My Sharing Panel */}
          {drawerType === 'mySharing' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <MySharingPanel
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
                key={`mobile-spaces-${panelKey}`}
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
          
          {/* Manage Billing Panel */}
          {drawerType === 'manageBilling' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <ManageBillingPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
                publishableKey={publishableKey}
              />
            </div>
          )}

          {drawerType === 'referral' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <ReferralPanel
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

          {/* Note Share Panel */}
          {drawerType === 'noteShare' && noteShareData && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <NoteSharePanel
                key={`mobile-note-share-${panelKey}`}
                noteId={noteShareData.noteId}
                noteTitle={currentNote?.title || noteShareData.noteTitle}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeNoteSharePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}

          {drawerType === 'pinEntry' && pinEntryData && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <PinEntryPanel
                key={`mobile-pin-entry-${panelKey}`}
                noteId={pinEntryData.noteId}
                initialMode={pinEntryData.mode}
                noteContent={pinEntryData.noteContent}
                isEncrypted={pinEntryData.isEncrypted}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closePinEntryPanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}

          {/* Lock PIN Panel (profile) */}
          {drawerType === 'lockPin' && (
            <div className="panel-container flex-1 flex flex-col min-h-0">
              <LockPinPanel
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

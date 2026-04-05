import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense } from 'react';
import type { ThreadColor } from '@/utils/colors';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import EditNameColorPanel from './EditNameColorPanel';
import EditThreadPanel from './EditThreadPanel';
import EditSpacePanel from './EditSpacePanel';
import AddToSpacePanel from './AddToSpacePanel';
import EditSpacePeoplePanel from './EditSpacePeoplePanel';
import EmailPasswordPanel from './EmailPasswordPanel';
import MyChurchPanel from './MyChurchPanel';
import MyPreferencesPanel from './MyPreferencesPanel';
import MySpacesPanel from './MySpacesPanel';
import MySharingPanel from './MySharingPanel';
import MyDataPanel from './MyDataPanel';
import MyAchievementsPanel from './MyAchievementsPanel';
import GetSupportPanel from './GetSupportPanel';
import ReferralPanel from './ReferralPanel';
import InboxItemPreviewPanel from './InboxItemPreviewPanel';
import AboutHarvousPanel from './AboutHarvousPanel';
import NoteSharePanel from './NoteSharePanel';
import PinEntryPanel from './PinEntryPanel';
import LockPinPanel from './LockPinPanel';
import MyInboxPanel from './MyInboxPanel';

const createLazyPanel = (importFn: () => Promise<{ default: React.ComponentType<any> }>, name: string) =>
  lazy(() => importFn().catch((err) => {
    console.error(`Failed to load ${name}:`, err);
    return { default: () => <div className="p-6 text-center text-[var(--color-pebble-grey)]">Failed to load panel. <button type="button" onClick={() => window.location.reload()}>Reload</button></div> };
  }));

const NewNotePanel = createLazyPanel(() => import('./NewNotePanel'), 'NewNotePanel');
const NewThreadPanel = createLazyPanel(() => import('./NewThreadPanel'), 'NewThreadPanel');
const NoteDetailsPanel = createLazyPanel(() => import('./NoteDetailsPanel'), 'NoteDetailsPanel');

/** Shows nothing for delayMs, then children (e.g. Loading…) so fast loads don't flash. */
function DelayedFallback({ delayMs, children }: { delayMs: number; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  if (!show) return <div className="flex-fill" />;
  return <>{children}</>;
}

const mobileLoadingFallback = (
  <div className="flex-fill flex-center text-[var(--color-pebble-grey)]">Loading…</div>
);

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

type DrawerType = 'note' | 'thread' | 'resource' | 'noteDetails' | 'editNameColor' | 'editThread' | 'editSpace' | 'addToSpace' | 'editSpacePeople' | 'getSupport' | 'emailPassword' | 'myChurch' | 'myPreferences' | 'mySharing' | 'myInbox' | 'mySpaces' | 'myData' | 'myAchievements' | 'referral' | 'inboxPreview' | 'aboutHarvous' | 'noteShare' | 'pinEntry' | 'lockPin';

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
    'addToSpace': 'Add to Space',
    'editSpacePeople': 'People',
    'getSupport': 'Get Support',
    'emailPassword': 'Email & Password',
    'myChurch': 'My Church',
    'myPreferences': 'My Preferences',
    'mySharing': 'My Sharing',
    'myInbox': 'My Inbox',
    'mySpaces': 'My Spaces',
    'myData': 'My Data',
    'myAchievements': 'My Achievements',
    'referral': 'Refer My Friends',
    'inboxPreview': 'Inbox Preview',
    'aboutHarvous': 'Letter from the Founder',
    'noteShare': 'Share Note',
    'pinEntry': 'Lock Note',
    'lockPin': 'Lock PIN',
  };
  return titleMap[drawerType] || 'Panel';
};

/** Matches layout.css mobile breakpoint and spa/src/hooks/useIsMobile.ts */
const MOBILE_BREAKPOINT_MQL = '(max-width: 1159px)';

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
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_BREAKPOINT_MQL).matches
  );
  const [panelKey, setPanelKey] = useState(0); // Force remount when panel opens
  const [inboxPreviewData, setInboxPreviewData] = useState<InboxItem | null>(null);
  const [noteDetailsTab, setNoteDetailsTab] = useState<string | undefined>(undefined);
  const [noteDetailsNote, setNoteDetailsNote] = useState<any | null>(null);
  const [noteShareData, setNoteShareData] = useState<{ noteId: string; noteTitle?: string } | null>(null);
  const [pinEntryData, setPinEntryData] = useState<{ noteId: string; mode: 'set' | 'unlock' | 'removeLock' | 'changeLock' | 'setForAccount' | 'lockWithAccountPin'; noteContent: string; isEncrypted: boolean } | null>(null);
  const [addToSpaceSpaceId, setAddToSpaceSpaceId] = useState<string | null>(null);
  const sheetFocusRef = useRef<HTMLButtonElement | null>(null);
  const sheetContentRef = useRef<HTMLDivElement | null>(null);
  const sheetContentElRef = useRef<HTMLDivElement | null>(null);
  const activeCloseHandlerRef = useRef<SheetCloseHandler | null>(null);
  const isHandlingDismissRef = useRef(false);
  const drawerTypeRef = useRef(drawerType);
  const isVisibleRef = useRef(isVisible);
  drawerTypeRef.current = drawerType;
  isVisibleRef.current = isVisible;

  const checkMobile = useCallback(() => {
    const mobile = window.matchMedia(MOBILE_BREAKPOINT_MQL).matches;
    setIsMobile(mobile);
    if (!mobile) {
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

    if (typeof navigator !== 'undefined' && !navigator.onLine && type !== 'note' && type !== 'resource') {
      return;
    }

    setDrawerType(type);
    setIsVisible(true);
    // Only increment panelKey for create/edit panels that need fresh state on each open.
    // Profile panels (mySpaces, myAchievements, etc.) preserve state across re-opens
    // to avoid the loading flash caused by a full remount on every open.
    const needsFreshState: DrawerType[] = [
      'note', 'thread', 'resource', 'noteDetails',
      'editThread', 'editSpace', 'addToSpace', 'editSpacePeople', 'inboxPreview', 'noteShare', 'pinEntry',
    ];
    if (needsFreshState.includes(type)) {
      setPanelKey(prev => prev + 1);
    }
  }, [isMobile]);
  
  useLayoutEffect(() => {
    checkMobile();
  }, [checkMobile]);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_MQL);
    const onMqlChange = () => checkMobile();
    mql.addEventListener('change', onMqlChange);
    window.addEventListener('resize', checkMobile);
    return () => {
      mql.removeEventListener('change', onMqlChange);
      window.removeEventListener('resize', checkMobile);
    };
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
      } else if (showNewThread && typeof navigator !== 'undefined' && navigator.onLine) {
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

  useEffect(() => {
    const onOffline = () => {
      if (!isMobile) return;
      if (
        isVisibleRef.current &&
        drawerTypeRef.current !== 'note' &&
        drawerTypeRef.current !== 'resource'
      ) {
        window.dispatchEvent(new CustomEvent('closeMobileDrawer'));
      }
    };
    window.addEventListener('offline', onOffline);
    return () => window.removeEventListener('offline', onOffline);
  }, [isMobile]);

  // When crossing desktop→mobile, isVisible is often still false on the first mobile frame while
  // DesktopPanelManager still has activePanel set — emitting open:false would clear AppLayout's
  // panelOpen and incorrectly show the strip until the user resizes again.
  const prevStripMobileRef = useRef(isMobile);
  const prevStripVisibleRef = useRef(isVisible);
  useEffect(() => {
    const wasMobile = prevStripMobileRef.current;
    prevStripMobileRef.current = isMobile;

    if (!isMobile) {
      prevStripVisibleRef.current = isVisible;
      return;
    }

    if (!wasMobile) {
      if (isVisible) {
        window.dispatchEvent(new CustomEvent('actionStripPanelOpen', { detail: { open: true } }));
      }
      prevStripVisibleRef.current = isVisible;
      return;
    }

    if (prevStripVisibleRef.current !== isVisible) {
      window.dispatchEvent(new CustomEvent('actionStripPanelOpen', { detail: { open: isVisible } }));
      prevStripVisibleRef.current = isVisible;
    }
  }, [isMobile, isVisible]);

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

  // Drag-to-dismiss is handled by Vaul on Drawer.Content; close still flows through onOpenChange → requestClose.

  // Set up event listeners
  useEffect(() => {
    const handleOpenBottomSheet = (event: CustomEvent) => {
      const type = (event.detail && (event.detail.type || event.detail.drawerType)) || 'note';
      
      // Handle inbox preview with data
      if (type === 'inboxPreview' && event.detail?.item) {
        setInboxPreviewData(event.detail.item);
      }
      
      // Handle note details — capture current note and optional tab at open time
      if (type === 'noteDetails') {
        if (event.detail?.tab) setNoteDetailsTab(event.detail.tab);
        // Snapshot currentNote into state so the panel has it even if the prop updates later
        setNoteDetailsNote(currentNote ?? null);
      }
      
      openBottomSheet(type as DrawerType);
    };

    const handleCloseBottomSheet = () => {
      closeBottomSheet();
      // Clear panel-specific data when closing
      if (drawerType === 'inboxPreview') {
        setInboxPreviewData(null);
      }
      if (drawerType === 'addToSpace') {
        setAddToSpaceSpaceId(null);
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

    const handleOpenAddToSpacePanel = (event: Event) => {
      if (!isMobile) return;
      const detail = (event as CustomEvent<{ spaceId?: string }>)?.detail;
      if (detail?.spaceId) {
        setAddToSpaceSpaceId(detail.spaceId);
        openBottomSheet('addToSpace');
      }
    };

    const handleOpenEditSpacePeoplePanel = () => {
      if (isMobile) {
        openBottomSheet('editSpacePeople');
      }
    };

    // Direct listener for openNoteDetailsPanel (no MobileAdditional middleman in the SPA)
    const handleOpenNoteDetailsPanel = (event: CustomEvent) => {
      if (isMobile) {
        if (event.detail?.tab) setNoteDetailsTab(event.detail.tab);
        const contentId = event.detail?.contentId;
        const noteToShow =
          contentId != null
            ? currentNote && String(currentNote.id) === String(contentId)
              ? currentNote
              : { id: contentId, title: 'Note Details' }
            : currentNote ?? null;
        setNoteDetailsNote(noteToShow);
        openBottomSheet('noteDetails');
      }
    };

    window.addEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
    window.addEventListener('openEditSpacePanel', handleOpenEditSpacePanel as EventListener);
    window.addEventListener('openAddToSpacePanel', handleOpenAddToSpacePanel as EventListener);
    window.addEventListener('openEditSpacePeoplePanel', handleOpenEditSpacePeoplePanel as EventListener);
    window.addEventListener('openNoteDetailsPanel', handleOpenNoteDetailsPanel as EventListener);
    
    // Listen for profile panel events (for mobile bottom sheet)
    const handleOpenProfilePanel = (event: CustomEvent) => {
      if (!isMobile) return;
      const panelName = event.detail?.panelName;
      if (panelName === 'editNameColor') openBottomSheet('editNameColor');
      else if (panelName === 'emailPassword') openBottomSheet('emailPassword');
      else if (panelName === 'myChurch') openBottomSheet('myChurch');
      else if (panelName === 'myPreferences') openBottomSheet('myPreferences');
      else if (panelName === 'mySharing') openBottomSheet('mySharing');
      else if (panelName === 'myInbox') openBottomSheet('myInbox');
      else if (panelName === 'mySpaces') openBottomSheet('mySpaces');
      else if (panelName === 'myData') openBottomSheet('myData');
      else if (panelName === 'myAchievements') openBottomSheet('myAchievements');
      else if (panelName === 'getSupport') openBottomSheet('getSupport');
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
    window.addEventListener('closeAddToSpacePanel', handleCloseBottomSheet);
    window.addEventListener('closeEditSpacePeoplePanel', handleCloseBottomSheet);
    window.addEventListener('closeInboxPreview', handleCloseBottomSheet);
    window.addEventListener('closeNoteSharePanel', handleCloseBottomSheet);
    window.addEventListener('closePinEntryPanel', handleCloseBottomSheet);

    return () => {
      window.removeEventListener('openMobileDrawer', handleOpenBottomSheet as EventListener);
      window.removeEventListener('closeMobileDrawer', handleCloseBottomSheet);
      window.removeEventListener('openInboxPreview', handleOpenInboxPreview as EventListener);
      window.removeEventListener('openEditThreadPanel', handleOpenEditThreadPanel);
      window.removeEventListener('openEditSpacePanel', handleOpenEditSpacePanel as EventListener);
      window.removeEventListener('openAddToSpacePanel', handleOpenAddToSpacePanel as EventListener);
      window.removeEventListener('openEditSpacePeoplePanel', handleOpenEditSpacePeoplePanel as EventListener);
      window.removeEventListener('openNoteDetailsPanel', handleOpenNoteDetailsPanel as EventListener);
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
      window.removeEventListener('closeAddToSpacePanel', handleCloseBottomSheet);
      window.removeEventListener('closeEditSpacePeoplePanel', handleCloseBottomSheet);
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
  const isFullHeightDrawer =
    drawerType === 'note' ||
    drawerType === 'thread' ||
    drawerType === 'resource' ||
    drawerType === 'noteDetails' ||
    drawerType === 'editThread' ||
    drawerType === 'editSpace' ||
    drawerType === 'addToSpace' ||
    drawerType === 'editSpacePeople' ||
    drawerType === 'editNameColor' ||
    drawerType === 'emailPassword' ||
    drawerType === 'myChurch' ||
    drawerType === 'myPreferences' ||
    drawerType === 'mySharing' ||
    drawerType === 'myInbox' ||
    drawerType === 'mySpaces' ||
    drawerType === 'myData' ||
    drawerType === 'myAchievements' ||
    drawerType === 'getSupport' ||
    drawerType === 'referral' ||
    drawerType === 'aboutHarvous' ||
    drawerType === 'lockPin';

  // When note/resource sheet open on mobile: only set toolbar position and editor max-height when keyboard is open; leave sheet unchanged (100vh)
  useEffect(() => {
    if (!isVisible || !isMobile) return;
    const isNoteOrResource = drawerType === 'note' || drawerType === 'resource';
    if (!isNoteOrResource) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const RESERVE_EDITOR_PX = 130;
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

    const clearOverrides = (element: HTMLDivElement) => {
      element.style.removeProperty('--toolbar-bottom');
      element.style.removeProperty('--editor-scroll-max-height');
      element.style.removeProperty('--drawer-keyboard-height');
      element.removeAttribute('data-keyboard-open');
    };

    const apply = (estimatedViewportHeight?: number) => {
      const el = sheetContentElRef.current;
      const viewport = window.visualViewport;
      if (!el || !viewport) return;
      const effectiveHeight = estimatedViewportHeight ?? viewport.height;
      const keyboardOpen = effectiveHeight < window.innerHeight * 0.75;

      if (keyboardOpen) {
        const keyboardHeight = window.innerHeight - effectiveHeight;
        // Vaul uses transform on the drawer, so position:fixed children are relative to the drawer.
        // Since the drawer now shrinks to the visual viewport, toolbar just needs a small offset from drawer bottom.
        const toolbarBottom = 12;
        const editorH = Math.max(120, effectiveHeight - RESERVE_EDITOR_PX);
        el.style.setProperty('--toolbar-bottom', `${toolbarBottom}px`);
        el.style.setProperty('--editor-scroll-max-height', `${editorH}px`);
        el.style.setProperty('--drawer-keyboard-height', `${effectiveHeight}px`);
        el.setAttribute('data-keyboard-open', '');
      } else {
        clearOverrides(el);
      }
    };

    apply();
    const raf = requestAnimationFrame(() => apply());
    const resizeHandler = () => apply();
    const scrollHandler = () => apply();
    vv.addEventListener('resize', resizeHandler);
    vv.addEventListener('scroll', scrollHandler);

    const onFocusIn = () => {
      // Immediate and short delays for all platforms
      setTimeout(apply, 100);
      setTimeout(apply, 300);
      // iOS: visualViewport can update 600–700ms after keyboard opens; run apply again so layout catches up
      if (isIOS) {
        setTimeout(apply, 400);
        setTimeout(apply, 600);
      }
      // iOS: estimate keyboard height on focus so toolbar/editor vars are usable before resize fires
      if (isIOS) {
        const estimatedHeight = Math.round(window.innerHeight * 0.55);
        if (estimatedHeight < window.innerHeight * 0.75) {
          setTimeout(() => apply(estimatedHeight), 50);
        }
      }
    };
    let focusEl: HTMLDivElement | null = null;
    const rafFocus = requestAnimationFrame(() => {
      focusEl = sheetContentElRef.current;
      if (focusEl) focusEl.addEventListener('focusin', onFocusIn);
    });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rafFocus);
      vv.removeEventListener('resize', resizeHandler);
      vv.removeEventListener('scroll', scrollHandler);
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

  // Overlay only on open — clear stale inline opacity/transition on our `.sheet-overlay` (Radix/Vaul may set these during drag/close).
  useEffect(() => {
    if (!isVisible) return;
    const clearOverlayOnly = () => {
      const overlay = document.querySelector('.sheet-overlay') as HTMLElement;
      if (overlay) {
        overlay.style.opacity = '';
        overlay.style.transition = '';
      }
    };
    clearOverlayOnly();
    const raf = requestAnimationFrame(clearOverlayOnly);
    const t = window.setTimeout(clearOverlayOnly, 50);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [isVisible]);

  // Clear overlay inline styles when sheet closes so exit transitions can finish (fixes multi-tap after dismiss).
  useLayoutEffect(() => {
    if (isVisible) return;
    const overlay = document.querySelector('.sheet-overlay') as HTMLElement;
    if (overlay) {
      overlay.style.opacity = '';
      overlay.style.transition = '';
    }
  }, [isVisible]);

  // Post-close safety net: if overlay is still in DOM after animations, force non-interactive so it cannot block taps
  useEffect(() => {
    if (isVisible) return;
    const t = window.setTimeout(() => {
      const overlay = document.querySelector('.sheet-overlay') as HTMLElement;
      if (overlay) {
        overlay.style.pointerEvents = 'none';
        overlay.style.opacity = '0';
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [isVisible]);

  // Don't render on desktop
  if (!isMobile) {
    return null;
  }

  const keyboardHeavyDrawer = drawerType === 'note' || drawerType === 'resource';

  return (
    <Drawer.Root
      open={isVisible}
      onOpenChange={async (open) => {
        // Fallback: if Radix/Vaul requests a close without going through our interceptors,
        // treat it as a dismiss and ask the active panel.
        if (!open && !isHandlingDismissRef.current) {
          const ok = await requestClose('dismiss');
          if (ok) closeBottomSheet();
          return;
        }
        isHandlingDismissRef.current = false;
      }}
      shouldScaleBackground={false}
      noBodyStyles={true}
      fixed={keyboardHeavyDrawer}
      dismissible={!isPinSheet}
    >
      <DrawerContent
        ref={(el) => {
          sheetContentElRef.current = el;
        }}
        className={`rounded-t-3xl p-0 bg-[var(--color-light-paper)] bottom-sheet-content border-0${
          isFullHeightDrawer ? ' bottom-sheet--full-height' : ''
        }`}
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
        onFocusOutside={(e) => {
          const t = e.target;
          if (t instanceof Element && t.closest('[data-harvous-bottom-sheet-floating]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={async (e) => {
          const t = e.target;
          if (t instanceof Element && t.closest('[data-harvous-bottom-sheet-floating]')) {
            e.preventDefault();
            return;
          }
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
        {/* Accessibility: Radix Dialog requires Title and Description */}
        <Drawer.Title className="sr-only">
          {getDrawerTitle(drawerType)}
        </Drawer.Title>
        <Drawer.Description className="sr-only">
          {`${getDrawerTitle(drawerType)} panel`}
        </Drawer.Description>

        {/* Focus anchor: keeps focus out of aria-hidden background (used when not PIN sheet) */}
        <button ref={sheetFocusRef} type="button" className="sr-only">
          {getDrawerTitle(drawerType)}
        </button>
        
        {/* Content - flex-1 so it fills the sheet (no h-full) and footer stays 16px from bottom */}
        <div
          ref={sheetContentRef}
          className="bottom-sheet__inner flex-fill flex-stack"
          data-vaul-no-drag=""
          style={{ gap: 0 }}
        >
          {/* New Note Panel */}
          {drawerType === 'note' && (
            <div className="panel-container panel-container--note flex-fill flex-stack overflow-hidden" style={{ gap: 0 }}>
              <Suspense fallback={<DelayedFallback delayMs={80}>{mobileLoadingFallback}</DelayedFallback>}>
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
              </Suspense>
            </div>
          )}

          {/* New Thread Panel */}
          {drawerType === 'thread' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              <Suspense fallback={<DelayedFallback delayMs={80}>{mobileLoadingFallback}</DelayedFallback>}>
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
              </Suspense>
            </div>
          )}

          {/* New Resource Panel */}
          {drawerType === 'resource' && (
            <div className="panel-container panel-container--note flex-fill flex-stack overflow-hidden" style={{ gap: 0 }}>
              <Suspense fallback={<DelayedFallback delayMs={80}>{mobileLoadingFallback}</DelayedFallback>}>
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
              </Suspense>
            </div>
          )}

          {/* Note Details Panel */}
          {drawerType === 'noteDetails' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              {noteDetailsNote && (
                <Suspense fallback={<DelayedFallback delayMs={80}>{mobileLoadingFallback}</DelayedFallback>}>
                  <NoteDetailsPanel
                    key={`mobile-note-details-${panelKey}`}
                    noteId={noteDetailsNote.id}
                    noteTitle={noteDetailsNote.title || "Note Details"}
                    threads={[]}
                    comments={[]}
                    tags={[]}
                    onClose={() => {
                      window.dispatchEvent(new CustomEvent('closeNoteDetailsPanel'));
                    }}
                    inBottomSheet={true}
                    initialTab={noteDetailsTab}
                  />
                </Suspense>
              )}
            </div>
          )}
          
          {/* Edit Name & Color Panel */}
          {drawerType === 'editNameColor' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack overflow-hidden" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack overflow-hidden" style={{ gap: 0 }}>
              {contentType === 'space' && currentSpace && (
                <EditSpacePanel
                  key={`mobile-edit-space-${panelKey}`}
                  spaceId={currentSpace.id}
                  initialTitle={currentSpace.title}
                  initialColor={(currentSpace as { color?: string }).color as ThreadColor | undefined}
                  initialIsOwner={(currentSpace as { isOwner?: boolean }).isOwner}
                  onClose={() => {
                    window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
                  }}
                  inBottomSheet={true}
                />
              )}
            </div>
          )}

          {/* Add to Space Panel */}
          {drawerType === 'addToSpace' && addToSpaceSpaceId && (
            <div className="panel-container flex-fill flex-stack overflow-hidden" style={{ gap: 0 }}>
              <AddToSpacePanel
                key={`mobile-add-to-space-${panelKey}`}
                spaceId={addToSpaceSpaceId}
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeAddToSpacePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}

          {/* Edit Space People Panel */}
          {drawerType === 'editSpacePeople' && (
            <div className="panel-container flex-fill flex-stack overflow-hidden" style={{ gap: 0 }}>
              {contentType === 'space' && currentSpace && (
                <EditSpacePeoplePanel
                  key={`mobile-edit-space-people-${panelKey}`}
                  spaceId={currentSpace.id}
                  spaceTitle={currentSpace.title}
                  spaceColor={currentSpace.color}
                  onClose={() => {
                    window.dispatchEvent(new CustomEvent('closeEditSpacePeoplePanel'));
                  }}
                  inBottomSheet={true}
                />
              )}
            </div>
          )}
          
          {/* Get Support Panel */}
          {drawerType === 'getSupport' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              <MyChurchPanel
                key="mobile-church"
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}

          {/* My Preferences Panel */}
          {drawerType === 'myPreferences' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              <MyPreferencesPanel
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}

          {/* My Sharing Panel */}
          {drawerType === 'mySharing' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              <MySharingPanel
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}

          {/* My Inbox Panel */}
          {drawerType === 'myInbox' && (
            <div className="panel-container flex-fill flex-stack overflow-hidden" style={{ gap: 0 }}>
              <MyInboxPanel
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* My Spaces Panel */}
          {drawerType === 'mySpaces' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              <MySpacesPanel
                key="mobile-spaces"
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* My Data Panel */}
          {drawerType === 'myData' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              <MyAchievementsPanel 
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
          
          {/* Manage Billing Panel - temporarily removed */}

          {drawerType === 'referral' && (
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
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
            <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
              <LockPinPanel
                onClose={() => {
                  window.dispatchEvent(new CustomEvent('closeProfilePanel'));
                }}
                inBottomSheet={true}
              />
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer.Root>
  );
};

export default BottomSheet;

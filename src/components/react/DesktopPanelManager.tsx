import React, { useReducer, useEffect, useCallback, useState, lazy, Suspense } from 'react';
import PanelErrorBoundary from './PanelErrorBoundary';
import ButtonSmall from './ButtonSmall';

// Helper function to create lazy-loaded components with error handling
const createLazyComponent = (importFn: () => Promise<any>, componentName: string) => {
  return lazy(() => 
    importFn().catch((error) => {
      console.error(`Failed to load ${componentName}:`, error);
      // Return a fallback component that shows an error message
      return {
        default: () => (
          <div className="relative h-full w-full">
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center">
                <p className="text-sm text-[var(--color-pebble-grey)] mb-2">
                  Failed to load {componentName}
                </p>
                <ButtonSmall
                  type="button"
                  onClick={() => window.location.reload()}
                  state="Secondary"
                >
                  Reload Page
                </ButtonSmall>
              </div>
            </div>
          </div>
        )
      };
    })
  );
};

// Lazy load panel components for code splitting with error handling
const NewNotePanel = createLazyComponent(() => import('./NewNotePanel'), 'NewNotePanel');
const NewThreadPanel = createLazyComponent(() => import('./NewThreadPanel'), 'NewThreadPanel');
const NoteDetailsPanel = createLazyComponent(() => import('./NoteDetailsPanel'), 'NoteDetailsPanel');
const EditThreadPanel = createLazyComponent(() => import('./EditThreadPanel'), 'EditThreadPanel');
const EditSpacePanel = createLazyComponent(() => import('./EditSpacePanel'), 'EditSpacePanel');
const InboxItemPreviewPanel = createLazyComponent(() => import('./InboxItemPreviewPanel'), 'InboxItemPreviewPanel');
const MySpacesPanel = createLazyComponent(() => import('./MySpacesPanel'), 'MySpacesPanel');
const MyAchievementsPanel = createLazyComponent(() => import('./MyAchievementsPanel'), 'MyAchievementsPanel');
const MyChurchPanel = createLazyComponent(() => import('./MyChurchPanel'), 'MyChurchPanel');
const EditNameColorPanel = createLazyComponent(() => import('./EditNameColorPanel'), 'EditNameColorPanel');
const EmailPasswordPanel = createLazyComponent(() => import('./EmailPasswordPanel'), 'EmailPasswordPanel');
const ManageBillingPanel = createLazyComponent(() => import('./ManageBillingPanel'), 'ManageBillingPanel');
const ReferralPanel = createLazyComponent(() => import('./ReferralPanel'), 'ReferralPanel');
const MyDataPanel = createLazyComponent(() => import('./MyDataPanel'), 'MyDataPanel');
const MySharingPanel = createLazyComponent(() => import('./MySharingPanel'), 'MySharingPanel');
const GetSupportPanel = createLazyComponent(() => import('./GetSupportPanel'), 'GetSupportPanel');
const LockPinPanel = createLazyComponent(() => import('./LockPinPanel'), 'LockPinPanel');
const AboutHarvousPanel = createLazyComponent(() => import('./AboutHarvousPanel'), 'AboutHarvousPanel');
const NoteSharePanel = createLazyComponent(() => import('./NoteSharePanel'), 'NoteSharePanel');
const PinEntryPanel = createLazyComponent(() => import('./PinEntryPanel'), 'PinEntryPanel');

interface DesktopPanelManagerProps {
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: 'thread' | 'note' | 'space' | 'dashboard' | 'profile';
  publishableKey?: string | null;
  version?: string;
}

type PanelType =
  | 'newNote'
  | 'newThread'
  | 'newResource'
  | 'noteDetails'
  | 'editThread'
  | 'editSpace'
  | 'inboxPreview'
  | 'mySpaces'
  | 'myAchievements'
  | 'myChurch'
  | 'mySharing'
  | 'editNameColor'
  | 'emailPassword'
  | 'manageBilling'
  | 'referral'
  | 'myData'
  | 'getSupport'
  | 'lockPin'
  | 'aboutHarvous'
  | 'noteShare'
  | 'pinEntry'
  | null;

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

interface PanelState {
  activePanel: PanelType;
  panelKey: number; // Used to force remount of panels
}

type PanelAction =
  | { type: 'OPEN_NEW_NOTE' }
  | { type: 'CLOSE_NEW_NOTE' }
  | { type: 'OPEN_NEW_THREAD' }
  | { type: 'CLOSE_NEW_THREAD' }
  | { type: 'OPEN_NEW_RESOURCE' }
  | { type: 'CLOSE_NEW_RESOURCE' }
  | { type: 'OPEN_NOTE_DETAILS' }
  | { type: 'CLOSE_NOTE_DETAILS' }
  | { type: 'OPEN_EDIT_THREAD' }
  | { type: 'CLOSE_EDIT_THREAD' }
  | { type: 'OPEN_EDIT_SPACE' }
  | { type: 'CLOSE_EDIT_SPACE' }
  | { type: 'OPEN_INBOX_PREVIEW' }
  | { type: 'CLOSE_INBOX_PREVIEW' }
  | { type: 'OPEN_MY_SPACES' }
  | { type: 'CLOSE_MY_SPACES' }
  | { type: 'OPEN_MY_ACHIEVEMENTS' }
  | { type: 'CLOSE_MY_ACHIEVEMENTS' }
  | { type: 'OPEN_MY_CHURCH' }
  | { type: 'CLOSE_MY_CHURCH' }
  | { type: 'OPEN_MY_SHARING' }
  | { type: 'CLOSE_MY_SHARING' }
  | { type: 'OPEN_EDIT_NAME_COLOR' }
  | { type: 'CLOSE_EDIT_NAME_COLOR' }
  | { type: 'OPEN_EMAIL_PASSWORD' }
  | { type: 'CLOSE_EMAIL_PASSWORD' }
  | { type: 'OPEN_MANAGE_BILLING' }
  | { type: 'CLOSE_MANAGE_BILLING' }
  | { type: 'OPEN_REFERRAL' }
  | { type: 'CLOSE_REFERRAL' }
  | { type: 'OPEN_MY_DATA' }
  | { type: 'CLOSE_MY_DATA' }
  | { type: 'OPEN_GET_SUPPORT' }
  | { type: 'CLOSE_GET_SUPPORT' }
  | { type: 'OPEN_LOCK_PIN' }
  | { type: 'CLOSE_LOCK_PIN' }
  | { type: 'OPEN_ABOUT_HARVOUS' }
  | { type: 'CLOSE_ABOUT_HARVOUS' }
  | { type: 'OPEN_NOTE_SHARE' }
  | { type: 'CLOSE_NOTE_SHARE' }
  | { type: 'OPEN_PIN_ENTRY' }
  | { type: 'CLOSE_PIN_ENTRY' }
  | { type: 'LOAD_FROM_STORAGE' }
  | { type: 'CLOSE_ALL' };

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'OPEN_NEW_NOTE':
      // Close all other panels and open NewNote
      // Increment panelKey to force remount and re-read localStorage
      localStorage.setItem('showNewNotePanel', 'true');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      return { activePanel: 'newNote', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_NEW_NOTE':
      localStorage.setItem('showNewNotePanel', 'false');
      return { activePanel: null, panelKey: state.panelKey };
    
    case 'OPEN_NEW_THREAD':
      // Close all other panels and open NewThread
      // Increment panelKey to force remount and re-read localStorage
      localStorage.setItem('showNewThreadPanel', 'true');
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      return { activePanel: 'newThread', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_NEW_THREAD':
      localStorage.setItem('showNewThreadPanel', 'false');
      return { activePanel: null, panelKey: state.panelKey };
    
    case 'OPEN_NEW_RESOURCE':
      // Close all other panels and open NewResource
      // Increment panelKey to force remount and re-read localStorage
      localStorage.setItem('showNewResourcePanel', 'true');
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      return { activePanel: 'newResource', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_NEW_RESOURCE':
      localStorage.setItem('showNewResourcePanel', 'false');
      return { activePanel: null, panelKey: state.panelKey };
    
    case 'OPEN_NOTE_DETAILS':
      // Close all other panels and open NoteDetails
      return { activePanel: 'noteDetails', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_NOTE_DETAILS':
      return { activePanel: null, panelKey: state.panelKey };
    
    case 'OPEN_EDIT_THREAD':
      // Close all other panels and open EditThread
      return { activePanel: 'editThread', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_EDIT_THREAD':
      return { activePanel: null, panelKey: state.panelKey };
    
    case 'OPEN_EDIT_SPACE':
      // Close all other panels and open EditSpace
      return { activePanel: 'editSpace', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_EDIT_SPACE':
      return { activePanel: null, panelKey: state.panelKey };
    
    case 'OPEN_INBOX_PREVIEW':
      // Close all other panels and open InboxPreview
      return { activePanel: 'inboxPreview', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_INBOX_PREVIEW':
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_MY_SPACES':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'mySpaces');
      return { activePanel: 'mySpaces', panelKey: state.panelKey + 1 };

    case 'CLOSE_MY_SPACES':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_MY_ACHIEVEMENTS':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'myAchievements');
      return { activePanel: 'myAchievements', panelKey: state.panelKey + 1 };

    case 'CLOSE_MY_ACHIEVEMENTS':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_MY_CHURCH':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'myChurch');
      return { activePanel: 'myChurch', panelKey: state.panelKey + 1 };

    case 'CLOSE_MY_CHURCH':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_MY_SHARING':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'mySharing');
      return { activePanel: 'mySharing', panelKey: state.panelKey + 1 };

    case 'CLOSE_MY_SHARING':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_EDIT_NAME_COLOR':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'editNameColor');
      return { activePanel: 'editNameColor', panelKey: state.panelKey + 1 };

    case 'CLOSE_EDIT_NAME_COLOR':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_EMAIL_PASSWORD':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'emailPassword');
      return { activePanel: 'emailPassword', panelKey: state.panelKey + 1 };

    case 'CLOSE_EMAIL_PASSWORD':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_MANAGE_BILLING':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'manageBilling');
      return { activePanel: 'manageBilling', panelKey: state.panelKey + 1 };

    case 'CLOSE_MANAGE_BILLING':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_REFERRAL':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'referral');
      return { activePanel: 'referral', panelKey: state.panelKey + 1 };

    case 'CLOSE_REFERRAL':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_MY_DATA':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'myData');
      return { activePanel: 'myData', panelKey: state.panelKey + 1 };

    case 'CLOSE_MY_DATA':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_GET_SUPPORT':
      localStorage.setItem('showNewNotePanel', 'false');
      localStorage.setItem('showNewThreadPanel', 'false');
      localStorage.setItem('showNewResourcePanel', 'false');
      localStorage.setItem('showProfilePanel', 'getSupport');
      return { activePanel: 'getSupport', panelKey: state.panelKey + 1 };

    case 'CLOSE_GET_SUPPORT':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_LOCK_PIN':
      localStorage.setItem('showProfilePanel', 'lockPin');
      return { activePanel: 'lockPin', panelKey: state.panelKey + 1 };

    case 'CLOSE_LOCK_PIN':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_ABOUT_HARVOUS':
      localStorage.setItem('showProfilePanel', 'aboutHarvous');
      return { activePanel: 'aboutHarvous', panelKey: state.panelKey + 1 };

    case 'CLOSE_ABOUT_HARVOUS':
      localStorage.setItem('showProfilePanel', '');
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_NOTE_SHARE':
      return { activePanel: 'noteShare', panelKey: state.panelKey + 1 };

    case 'CLOSE_NOTE_SHARE':
      return { activePanel: null, panelKey: state.panelKey };

    case 'OPEN_PIN_ENTRY':
      return { activePanel: 'pinEntry', panelKey: state.panelKey + 1 };

    case 'CLOSE_PIN_ENTRY':
      return { activePanel: null, panelKey: state.panelKey };

    case 'LOAD_FROM_STORAGE':
      // Check localStorage for saved panel state
      const savedNotePanel = localStorage.getItem('showNewNotePanel');
      const savedThreadPanel = localStorage.getItem('showNewThreadPanel');
      const savedResourcePanel = localStorage.getItem('showNewResourcePanel');
      const savedProfilePanel = localStorage.getItem('showProfilePanel');

      if (savedProfilePanel) {
        if (
          savedProfilePanel === 'mySpaces' ||
          savedProfilePanel === 'myAchievements' ||
          savedProfilePanel === 'myChurch' ||
          savedProfilePanel === 'mySharing' ||
          savedProfilePanel === 'editNameColor' ||
          savedProfilePanel === 'emailPassword' ||
          savedProfilePanel === 'manageBilling' ||
          savedProfilePanel === 'referral' ||
          savedProfilePanel === 'myData' ||
          savedProfilePanel === 'getSupport' ||
          savedProfilePanel === 'lockPin' ||
          savedProfilePanel === 'aboutHarvous'
        ) {
          return { activePanel: savedProfilePanel as PanelType, panelKey: 0 };
        }
      }

      if (savedResourcePanel === 'true') {
        // Check if there's new content from text selection - if so, increment panelKey to force remount
        const hasNewContent = !!(localStorage.getItem('newNoteContent') || 
                                 localStorage.getItem('newNoteType') ||
                                 localStorage.getItem('newNoteResourceUrl'));
        return { 
          activePanel: 'newResource', 
          panelKey: hasNewContent ? state.panelKey + 1 : state.panelKey 
        };
      } else if (savedNotePanel === 'true') {
        // Check if there's new content from text selection - if so, increment panelKey to force remount
        const hasNewContent = !!(localStorage.getItem('newNoteContent') ||
                                 localStorage.getItem('newNoteTitle') ||
                                 localStorage.getItem('newNoteType') ||
                                 localStorage.getItem('newNoteScriptureReference'));
        // Increment panelKey if there's new content to force remount and read from localStorage
        const panelKey = hasNewContent ? 1 : 0;
        return { activePanel: 'newNote', panelKey };
      }
      if (savedThreadPanel === 'true') {
        return { activePanel: 'newThread', panelKey: 0 };
      }
      return { activePanel: null, panelKey: 0 };
    
    case 'CLOSE_ALL':
      // Close whatever panel is open (used by SPA route changes)
      localStorage.removeItem('showNewNotePanel');
      localStorage.removeItem('showNewThreadPanel');
      localStorage.removeItem('showNewResourcePanel');
      return { activePanel: null, panelKey: state.panelKey };

    default:
      return state;
  }
}

// Progress bar fallback component matching existing panel pattern
const ProgressBarFallback = ({ containerClasses }: { containerClasses: string }) => (
  <div className={`${containerClasses} relative`}>
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--color-gray)] overflow-hidden rounded-t-[24px] z-50 pointer-events-none">
      <div className="h-full bg-[var(--color-bold-blue)] animate-pulse" style={{
        animation: 'progress 1.5s ease-in-out infinite',
        width: '100%'
      }}></div>
    </div>
    <style>{`
      @keyframes progress {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(0%); }
        100% { transform: translateX(100%); }
      }
    `}</style>
  </div>
);

export default function DesktopPanelManager({
  currentThread,
  currentSpace,
  currentNote,
  contentType = 'dashboard',
  publishableKey = null,
  version
}: DesktopPanelManagerProps) {
  const [state, dispatch] = useReducer(panelReducer, { activePanel: null, panelKey: 0 });
  const [inboxPreviewData, setInboxPreviewData] = useState<InboxItem | null>(null);
  const [noteDetailsTab, setNoteDetailsTab] = useState<string | undefined>(undefined);
  const [editSpaceInitialTab, setEditSpaceInitialTab] = useState<'added' | 'all' | 'people' | undefined>(undefined);
  const [noteShareData, setNoteShareData] = useState<{ noteId: string; noteTitle?: string } | null>(null);
  const [pinEntryData, setPinEntryData] = useState<{ noteId: string; mode: 'set' | 'unlock' | 'removeLock' | 'changeLock' | 'setForAccount' | 'lockWithAccountPin'; noteContent: string; isEncrypted: boolean } | null>(null);

  // Load panel state from localStorage on mount
  useEffect(() => {
    // Check if there's a pending panel open request BEFORE clearing
    const pendingNotePanel = localStorage.getItem('showNewNotePanel');
    const pendingThreadPanel = localStorage.getItem('showNewThreadPanel');
    const pendingResourcePanel = localStorage.getItem('showNewResourcePanel');
    
    // Only clear if there's no pending request (to avoid clearing requests made before component loaded)
    if (pendingNotePanel !== 'true' && pendingThreadPanel !== 'true' && pendingResourcePanel !== 'true') {
      // No pending requests - safe to clear (matches Alpine.js behavior)
      localStorage.removeItem('showNewNotePanel');
      localStorage.removeItem('showNewThreadPanel');
      localStorage.removeItem('showNewResourcePanel');
    }
    
    // Then load any saved state (this will honor pending requests)
    dispatch({ type: 'LOAD_FROM_STORAGE' });
  }, []);
  
  // Check localStorage whenever state changes - this catches requests that come in after mount
  useEffect(() => {
    // Only check if no panel is currently open
    if (state.activePanel === null) {
      const pendingNotePanel = localStorage.getItem('showNewNotePanel');
      const pendingThreadPanel = localStorage.getItem('showNewThreadPanel');
      const pendingResourcePanel = localStorage.getItem('showNewResourcePanel');
      
      if (pendingResourcePanel === 'true') {
        // Set noteType to resource before opening
        localStorage.setItem('newNoteType', 'resource');
        dispatch({ type: 'OPEN_NEW_RESOURCE' });
      } else if (pendingNotePanel === 'true') {
        dispatch({ type: 'OPEN_NEW_NOTE' });
      } else if (pendingThreadPanel === 'true') {
        dispatch({ type: 'OPEN_NEW_THREAD' });
      }
    }
  }, [state.activePanel]);

  // Listen to window events for panel management
  useEffect(() => {
    const handleOpenNewNote = () => {
      dispatch({ type: 'OPEN_NEW_NOTE' });
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };
    
    const handleCloseNewNote = () => {
      dispatch({ type: 'CLOSE_NEW_NOTE' });
    };
    
    const handleOpenNewThread = () => {
      dispatch({ type: 'OPEN_NEW_THREAD' });
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleCloseNewThread = () => {
      dispatch({ type: 'CLOSE_NEW_THREAD' });
    };

    const handleOpenNewResource = () => {
      // Set noteType to resource before opening
      localStorage.setItem('newNoteType', 'resource');
      dispatch({ type: 'OPEN_NEW_RESOURCE' });
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleCloseNewResource = () => {
      dispatch({ type: 'CLOSE_NEW_RESOURCE' });
    };
    
    const handleOpenNoteDetails = (event?: Event) => {
      const customEvent = event as CustomEvent;
      const tab = customEvent?.detail?.tab;
      setNoteDetailsTab(tab);
      dispatch({ type: 'OPEN_NOTE_DETAILS' });
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };
    
    const handleCloseNoteDetails = () => {
      dispatch({ type: 'CLOSE_NOTE_DETAILS' });
    };
    
    const handleOpenEditThread = () => {
      dispatch({ type: 'OPEN_EDIT_THREAD' });
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };
    
    const handleCloseEditThread = () => {
      dispatch({ type: 'CLOSE_EDIT_THREAD' });
    };

    const handleOpenEditSpace = (event: CustomEvent) => {
      setEditSpaceInitialTab(event.detail?.initialTab);
      dispatch({ type: 'OPEN_EDIT_SPACE' });
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleCloseEditSpace = () => {
      dispatch({ type: 'CLOSE_EDIT_SPACE' });
    };

    const handleOpenInboxPreview = (event: CustomEvent) => {
      const item = event.detail?.item;
      if (item) {
        setInboxPreviewData(item);
        dispatch({ type: 'OPEN_INBOX_PREVIEW' });
        window.dispatchEvent(new CustomEvent('closeMoreMenu'));
      }
    };

    const handleUpdateInboxPreview = (event: CustomEvent) => {
      const item = event.detail?.item;
      if (item) {
        // Update the inbox preview data when new data arrives
        setInboxPreviewData(item);
      }
    };

    const handleCloseInboxPreview = () => {
      dispatch({ type: 'CLOSE_INBOX_PREVIEW' });
      setInboxPreviewData(null);
    };

    const handleOpenProfilePanel = (event: CustomEvent) => {
      const panelName = event.detail?.panelName;
      if (panelName === 'mySpaces') dispatch({ type: 'OPEN_MY_SPACES' });
      else if (panelName === 'myAchievements') dispatch({ type: 'OPEN_MY_ACHIEVEMENTS' });
      else if (panelName === 'myChurch') dispatch({ type: 'OPEN_MY_CHURCH' });
      else if (panelName === 'mySharing') dispatch({ type: 'OPEN_MY_SHARING' });
      else if (panelName === 'editNameColor') dispatch({ type: 'OPEN_EDIT_NAME_COLOR' });
      else if (panelName === 'emailPassword') dispatch({ type: 'OPEN_EMAIL_PASSWORD' });
      else if (panelName === 'manageBilling') dispatch({ type: 'OPEN_MANAGE_BILLING' });
      else if (panelName === 'referral') dispatch({ type: 'OPEN_REFERRAL' });
      else if (panelName === 'myData') dispatch({ type: 'OPEN_MY_DATA' });
      else if (panelName === 'getSupport') dispatch({ type: 'OPEN_GET_SUPPORT' });
      else if (panelName === 'lockPin') dispatch({ type: 'OPEN_LOCK_PIN' });
      else if (panelName === 'aboutHarvous') dispatch({ type: 'OPEN_ABOUT_HARVOUS' });

      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    };

    const handleOpenNoteSharePanel = (event: CustomEvent) => {
      const { contentId } = event.detail || {};
      if (contentId) {
        // Fetch note title for display
        setNoteShareData({ noteId: contentId, noteTitle: undefined });
        dispatch({ type: 'OPEN_NOTE_SHARE' });
        window.dispatchEvent(new CustomEvent('closeMoreMenu'));
      }
    };

    const handleCloseNoteSharePanel = () => {
      dispatch({ type: 'CLOSE_NOTE_SHARE' });
      setNoteShareData(null);
    };

    const handleOpenPinEntryPanel = (event: CustomEvent) => {
      const { noteId: id, mode, noteContent: content, isEncrypted } = event.detail || {};
      if (id && mode && content !== undefined) {
        setPinEntryData({ noteId: id, mode, noteContent: content, isEncrypted: !!isEncrypted });
        dispatch({ type: 'OPEN_PIN_ENTRY' });
        window.dispatchEvent(new CustomEvent('closeMoreMenu'));
      }
    };

    const handleClosePinEntryPanel = () => {
      dispatch({ type: 'CLOSE_PIN_ENTRY' });
      setPinEntryData(null);
    };

    // Register all event listeners
    window.addEventListener('openNewNotePanel', handleOpenNewNote);
    window.addEventListener('closeNewNotePanel', handleCloseNewNote);
    window.addEventListener('openNewThreadPanel', handleOpenNewThread);
    window.addEventListener('closeNewThreadPanel', handleCloseNewThread);
    window.addEventListener('openNewResourcePanel', handleOpenNewResource);
    window.addEventListener('closeNewResourcePanel', handleCloseNewResource);
    window.addEventListener('openNoteDetailsPanel', handleOpenNoteDetails);
    window.addEventListener('closeNoteDetailsPanel', handleCloseNoteDetails);
    window.addEventListener('openEditThreadPanel', handleOpenEditThread);
    window.addEventListener('closeEditThreadPanel', handleCloseEditThread);
    window.addEventListener('openEditSpacePanel', handleOpenEditSpace as EventListener);
    window.addEventListener('closeEditSpacePanel', handleCloseEditSpace);
    window.addEventListener('openInboxPreview', handleOpenInboxPreview as EventListener);
    window.addEventListener('updateInboxPreview', handleUpdateInboxPreview as EventListener);
    window.addEventListener('closeInboxPreview', handleCloseInboxPreview);
    window.addEventListener('openProfilePanel', handleOpenProfilePanel as EventListener);
    window.addEventListener('openNoteSharePanel', handleOpenNoteSharePanel as EventListener);
    window.addEventListener('closeNoteSharePanel', handleCloseNoteSharePanel);
    window.addEventListener('openPinEntryPanel', handleOpenPinEntryPanel as EventListener);
    window.addEventListener('closePinEntryPanel', handleClosePinEntryPanel);

    // Close all panels on SPA route change (dispatched by AppLayout on pathname change)
    const handleCloseAllPanels = () => dispatch({ type: 'CLOSE_ALL' });
    window.addEventListener('closeAllPanels', handleCloseAllPanels);

    // Cleanup
    return () => {
      window.removeEventListener('openNewNotePanel', handleOpenNewNote);
      window.removeEventListener('closeNewNotePanel', handleCloseNewNote);
      window.removeEventListener('openNewThreadPanel', handleOpenNewThread);
      window.removeEventListener('closeNewThreadPanel', handleCloseNewThread);
      window.removeEventListener('openNewResourcePanel', handleOpenNewResource);
      window.removeEventListener('closeNewResourcePanel', handleCloseNewResource);
      window.removeEventListener('openNoteDetailsPanel', handleOpenNoteDetails);
      window.removeEventListener('closeNoteDetailsPanel', handleCloseNoteDetails);
      window.removeEventListener('openEditThreadPanel', handleOpenEditThread);
      window.removeEventListener('closeEditThreadPanel', handleCloseEditThread);
      window.removeEventListener('openEditSpacePanel', handleOpenEditSpace as EventListener);
      window.removeEventListener('closeEditSpacePanel', handleCloseEditSpace);
      window.removeEventListener('openInboxPreview', handleOpenInboxPreview as EventListener);
      window.removeEventListener('updateInboxPreview', handleUpdateInboxPreview as EventListener);
      window.removeEventListener('closeInboxPreview', handleCloseInboxPreview);
      window.removeEventListener('openProfilePanel', handleOpenProfilePanel as EventListener);
      window.removeEventListener('openNoteSharePanel', handleOpenNoteSharePanel as EventListener);
      window.removeEventListener('closeNoteSharePanel', handleCloseNoteSharePanel);
      window.removeEventListener('openPinEntryPanel', handleOpenPinEntryPanel as EventListener);
      window.removeEventListener('closePinEntryPanel', handleClosePinEntryPanel);
      window.removeEventListener('closeAllPanels', handleCloseAllPanels);
    };
  }, []);

  // Handler for closing NewNotePanel
  const handleCloseNewNote = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
  }, []);

  // Handler for closing NewThreadPanel
  const handleCloseNewThread = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
  }, []);

  // Handler for closing NewResourcePanel
  const handleCloseNewResource = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeNewResourcePanel'));
  }, []);

  // Handler for closing NoteDetailsPanel
  const handleCloseNoteDetails = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeNoteDetailsPanel'));
  }, []);

  // Handler for closing EditThreadPanel
  const handleCloseEditThread = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
  }, []);

  // Handler for closing EditSpacePanel
  const handleCloseEditSpace = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
  }, []);

  // Handler for closing InboxItemPreviewPanel
  const handleCloseInboxPreview = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeInboxPreview'));
  }, []);

  const handleCloseMySpaces = useCallback(() => {
    dispatch({ type: 'CLOSE_MY_SPACES' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseMyAchievements = useCallback(() => {
    dispatch({ type: 'CLOSE_MY_ACHIEVEMENTS' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseMyChurch = useCallback(() => {
    dispatch({ type: 'CLOSE_MY_CHURCH' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseMySharing = useCallback(() => {
    dispatch({ type: 'CLOSE_MY_SHARING' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseEditNameColor = useCallback(() => {
    dispatch({ type: 'CLOSE_EDIT_NAME_COLOR' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseEmailPassword = useCallback(() => {
    dispatch({ type: 'CLOSE_EMAIL_PASSWORD' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseManageBilling = useCallback(() => {
    dispatch({ type: 'CLOSE_MANAGE_BILLING' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseReferral = useCallback(() => {
    dispatch({ type: 'CLOSE_REFERRAL' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseMyData = useCallback(() => {
    dispatch({ type: 'CLOSE_MY_DATA' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseGetSupport = useCallback(() => {
    dispatch({ type: 'CLOSE_GET_SUPPORT' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseLockPin = useCallback(() => {
    dispatch({ type: 'CLOSE_LOCK_PIN' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseAboutHarvous = useCallback(() => {
    dispatch({ type: 'CLOSE_ABOUT_HARVOUS' });
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  }, []);

  const handleCloseNoteShare = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeNoteSharePanel'));
  }, []);

  const handleClosePinEntry = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closePinEntryPanel'));
  }, []);

  // Expose panel state to hide/show SquareButtons in Layout.astro
  useEffect(() => {
    const buttonsContainer = document.getElementById('square-buttons-container');
    if (buttonsContainer) {
      if (state.activePanel !== null) {
        // Panel is open - hide SquareButtons
        buttonsContainer.style.display = 'none';
      } else {
        // No panel open - show SquareButtons
        buttonsContainer.style.display = 'flex';
      }
    }
  }, [state.activePanel]);

  // Determine if any panel is open
  const isAnyPanelOpen = state.activePanel !== null;

  return (
    <div className="flex flex-col items-stretch h-full min-h-0 w-full" style={{ maxHeight: '100%', width: '100%' }}>
      {/* New Note Panel - Desktop Only */}
      {state.activePanel === 'newNote' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full new-note-panel-container hidden min-[1160px]:block" />}>
            <div className="h-full w-full flex-1 new-note-panel-container hidden min-[1160px]:block" style={{ width: '100%', minWidth: 0 }}>
              <NewNotePanel
                key={`new-note-${state.panelKey}`}
                currentThread={currentThread}
                currentSpace={currentSpace}
                onClose={handleCloseNewNote}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* New Thread Panel - Desktop Only */}
      {state.activePanel === 'newThread' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full w-full flex-1 hidden min-[1160px]:block" style={{ width: '100%', minWidth: 0 }}>
              <NewThreadPanel
                key={`new-thread-${state.panelKey}`}
                currentSpace={currentSpace}
                onClose={handleCloseNewThread}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* New Resource Panel - Desktop Only */}
      {state.activePanel === 'newResource' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full new-note-panel-container hidden min-[1160px]:block" />}>
            <div className="h-full w-full flex-1 new-note-panel-container hidden min-[1160px]:block" style={{ width: '100%', minWidth: 0 }}>
              <NewNotePanel
                key={`new-resource-${state.panelKey}`}
                currentThread={currentThread}
                currentSpace={currentSpace}
                initialNoteType="resource"
                onClose={handleCloseNewResource}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* Note Details Panel (notes only) - Desktop Only */}
      {state.activePanel === 'noteDetails' && contentType === 'note' && currentNote && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <NoteDetailsPanel 
                noteId={currentNote.id} 
                noteTitle={currentNote.title || "Note Details"}
                threads={[]}
                comments={[]}
                tags={[]}
                onClose={handleCloseNoteDetails}
                inBottomSheet={false}
                initialTab={noteDetailsTab}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* Edit Thread Panel (threads only) - Desktop Only */}
      {state.activePanel === 'editThread' && contentType === 'thread' && currentThread && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <EditThreadPanel 
                threadId={currentThread.id}
                initialTitle={currentThread.title}
                initialColor={currentThread.color}
                onClose={handleCloseEditThread}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* Edit Space Panel (spaces only) - Desktop Only */}
      {state.activePanel === 'editSpace' && contentType === 'space' && currentSpace && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <EditSpacePanel
                spaceId={currentSpace.id}
                initialTitle={currentSpace.title}
                initialColor={currentSpace.color}
                initialTab={editSpaceInitialTab}
                onClose={handleCloseEditSpace}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* Note Share Panel - Desktop Only */}
      {state.activePanel === 'noteShare' && noteShareData && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <NoteSharePanel
                key={`note-share-${state.panelKey}`}
                noteId={noteShareData.noteId}
                noteTitle={currentNote?.title || noteShareData.noteTitle}
                onClose={handleCloseNoteShare}
                inBottomSheet={false}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* Pin Entry Panel (Lock / Unlock note) - Desktop Only */}
      {state.activePanel === 'pinEntry' && pinEntryData && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <PinEntryPanel
                key={`pin-entry-${state.panelKey}`}
                noteId={pinEntryData.noteId}
                initialMode={pinEntryData.mode}
                noteContent={pinEntryData.noteContent}
                isEncrypted={pinEntryData.isEncrypted}
                onClose={handleClosePinEntry}
                inBottomSheet={false}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* Inbox Item Preview Panel - Desktop Only */}
      {state.activePanel === 'inboxPreview' && inboxPreviewData && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block" style={{ height: '100%', maxHeight: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <InboxItemPreviewPanel
                key={`inbox-preview-${state.panelKey}`}
                item={inboxPreviewData}
                onClose={handleCloseInboxPreview}
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
                inBottomSheet={false}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {/* Profile Panels - Desktop Only */}
      {contentType === 'profile' && state.activePanel === 'mySpaces' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <MySpacesPanel key="my-spaces" onClose={handleCloseMySpaces} inBottomSheet={false} />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'myAchievements' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <MyAchievementsPanel
                key="my-achievements"
                onClose={handleCloseMyAchievements}
                inBottomSheet={false}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'myChurch' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <MyChurchPanel key="my-church" onClose={handleCloseMyChurch} inBottomSheet={false} />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'mySharing' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <MySharingPanel key="my-sharing" onClose={handleCloseMySharing} inBottomSheet={false} />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'editNameColor' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <EditNameColorPanel
                key="edit-name-color"
                onClose={handleCloseEditNameColor}
                inBottomSheet={false}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'emailPassword' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <EmailPasswordPanel
                key="email-password"
                onClose={handleCloseEmailPassword}
                inBottomSheet={false}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'manageBilling' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <ManageBillingPanel
                key="manage-billing"
                onClose={handleCloseManageBilling}
                inBottomSheet={false}
                publishableKey={publishableKey}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'referral' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <ReferralPanel
                key="referral"
                onClose={handleCloseReferral}
                inBottomSheet={false}
              />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'myData' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <MyDataPanel key="my-data" onClose={handleCloseMyData} inBottomSheet={false} />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'getSupport' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <GetSupportPanel key="get-support" onClose={handleCloseGetSupport} inBottomSheet={false} version={version} />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'lockPin' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <LockPinPanel key="lock-pin" onClose={handleCloseLockPin} inBottomSheet={false} />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}

      {contentType === 'profile' && state.activePanel === 'aboutHarvous' && (
        <PanelErrorBoundary>
          <Suspense fallback={<ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />}>
            <div className="h-full hidden min-[1160px]:block">
              <AboutHarvousPanel key="about-harvous" onClose={handleCloseAboutHarvous} inBottomSheet={false} />
            </div>
          </Suspense>
        </PanelErrorBoundary>
      )}
    </div>
  );
}


import React, { useReducer, useEffect, useCallback } from 'react';
import NewNotePanel from './NewNotePanel';
import NewThreadPanel from './NewThreadPanel';
import NoteDetailsPanel from './NoteDetailsPanel';
import EditThreadPanel from './EditThreadPanel';

interface DesktopPanelManagerProps {
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: 'thread' | 'note' | 'space' | 'dashboard' | 'profile';
}

type PanelType = 'newNote' | 'newThread' | 'noteDetails' | 'editThread' | null;

interface PanelState {
  activePanel: PanelType;
  panelKey: number; // Used to force remount of panels
}

type PanelAction =
  | { type: 'OPEN_NEW_NOTE' }
  | { type: 'CLOSE_NEW_NOTE' }
  | { type: 'OPEN_NEW_THREAD' }
  | { type: 'CLOSE_NEW_THREAD' }
  | { type: 'OPEN_NOTE_DETAILS' }
  | { type: 'CLOSE_NOTE_DETAILS' }
  | { type: 'OPEN_EDIT_THREAD' }
  | { type: 'CLOSE_EDIT_THREAD' }
  | { type: 'LOAD_FROM_STORAGE' };

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'OPEN_NEW_NOTE':
      // Close all other panels and open NewNote
      // Increment panelKey to force remount and re-read localStorage
      localStorage.setItem('showNewNotePanel', 'true');
      localStorage.setItem('showNewThreadPanel', 'false');
      return { activePanel: 'newNote', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_NEW_NOTE':
      localStorage.setItem('showNewNotePanel', 'false');
      return { activePanel: null, panelKey: state.panelKey };
    
    case 'OPEN_NEW_THREAD':
      // Close all other panels and open NewThread
      // Increment panelKey to force remount and re-read localStorage
      localStorage.setItem('showNewThreadPanel', 'true');
      localStorage.setItem('showNewNotePanel', 'false');
      return { activePanel: 'newThread', panelKey: state.panelKey + 1 };
    
    case 'CLOSE_NEW_THREAD':
      localStorage.setItem('showNewThreadPanel', 'false');
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
    
    case 'LOAD_FROM_STORAGE':
      // Check localStorage for saved panel state
      const savedNotePanel = localStorage.getItem('showNewNotePanel');
      const savedThreadPanel = localStorage.getItem('showNewThreadPanel');

      if (savedNotePanel === 'true') {
        return { activePanel: 'newNote', panelKey: 0 };
      }
      if (savedThreadPanel === 'true') {
        return { activePanel: 'newThread', panelKey: 0 };
      }
      return { activePanel: null, panelKey: 0 };
    
    default:
      return state;
  }
}

export default function DesktopPanelManager({
  currentThread,
  currentSpace,
  currentNote,
  contentType = 'dashboard'
}: DesktopPanelManagerProps) {
  const [state, dispatch] = useReducer(panelReducer, { activePanel: null, panelKey: 0 });

  // Load panel state from localStorage on mount
  useEffect(() => {
    // Force panels closed on initialization (matches Alpine.js behavior)
    localStorage.removeItem('showNewNotePanel');
    localStorage.removeItem('showNewThreadPanel');
    
    // Then load any saved state
    dispatch({ type: 'LOAD_FROM_STORAGE' });
  }, []);

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
    
    const handleOpenNoteDetails = () => {
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

    // Register all event listeners
    window.addEventListener('openNewNotePanel', handleOpenNewNote);
    window.addEventListener('closeNewNotePanel', handleCloseNewNote);
    window.addEventListener('openNewThreadPanel', handleOpenNewThread);
    window.addEventListener('closeNewThreadPanel', handleCloseNewThread);
    window.addEventListener('openNoteDetailsPanel', handleOpenNoteDetails);
    window.addEventListener('closeNoteDetailsPanel', handleCloseNoteDetails);
    window.addEventListener('openEditThreadPanel', handleOpenEditThread);
    window.addEventListener('closeEditThreadPanel', handleCloseEditThread);

    // Cleanup
    return () => {
      window.removeEventListener('openNewNotePanel', handleOpenNewNote);
      window.removeEventListener('closeNewNotePanel', handleCloseNewNote);
      window.removeEventListener('openNewThreadPanel', handleOpenNewThread);
      window.removeEventListener('closeNewThreadPanel', handleCloseNewThread);
      window.removeEventListener('openNoteDetailsPanel', handleOpenNoteDetails);
      window.removeEventListener('closeNoteDetailsPanel', handleCloseNoteDetails);
      window.removeEventListener('openEditThreadPanel', handleOpenEditThread);
      window.removeEventListener('closeEditThreadPanel', handleCloseEditThread);
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

  // Handler for closing NoteDetailsPanel
  const handleCloseNoteDetails = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeNoteDetailsPanel'));
  }, []);

  // Handler for closing EditThreadPanel
  const handleCloseEditThread = useCallback(() => {
    window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
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
    <div className="flex flex-col items-left justify-between h-full">
      {/* New Note Panel - Desktop Only */}
      {state.activePanel === 'newNote' && (
        <div className="h-full new-note-panel-container hidden min-[1160px]:block">
          <NewNotePanel
            key={`new-note-${state.panelKey}`}
            currentThread={currentThread}
            onClose={handleCloseNewNote}
          />
        </div>
      )}

      {/* New Thread Panel - Desktop Only */}
      {state.activePanel === 'newThread' && (
        <div className="h-full hidden min-[1160px]:block">
          <NewThreadPanel
            key={`new-thread-${state.panelKey}`}
            currentSpace={currentSpace}
            onClose={handleCloseNewThread}
          />
        </div>
      )}

      {/* Note Details Panel (notes only) - Desktop Only */}
      {state.activePanel === 'noteDetails' && contentType === 'note' && currentNote && (
        <div className="h-full hidden min-[1160px]:block">
          <NoteDetailsPanel 
            noteId={currentNote.id} 
            noteTitle={currentNote.title || "Note Details"}
            threads={[]}
            comments={[]}
            tags={[]}
            onClose={handleCloseNoteDetails}
          />
        </div>
      )}

      {/* Edit Thread Panel (threads only) - Desktop Only */}
      {state.activePanel === 'editThread' && contentType === 'thread' && currentThread && (
        <div className="h-full hidden min-[1160px]:block">
          <EditThreadPanel 
            threadId={currentThread.id}
            initialTitle={currentThread.title}
            initialColor={currentThread.color}
            onClose={handleCloseEditThread}
          />
        </div>
      )}
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import SquareButton from './SquareButton';

/**
 * Small Add (plus) button for note pages only. Opens the new note panel directly
 * instead of the Add menu. Used in AppLayout and Layout.astro when contentType === 'note'.
 * Hidden when NewNotePanel is open or note is in edit mode (same rule as CreateNoteButton).
 */
export default function NotePageAddButton() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isNewNotePanelOpen, setIsNewNotePanelOpen] = useState(false);

  useEffect(() => {
    const handleEditModeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsEditMode(detail?.editing === true);
    };
    window.addEventListener('contentEditModeChange', handleEditModeChange);
    return () => window.removeEventListener('contentEditModeChange', handleEditModeChange);
  }, []);

  useEffect(() => {
    const isDesktop = () => window.matchMedia('(min-width: 1160px)').matches;
    if (isDesktop() && localStorage.getItem('showNewNotePanel') === 'true') {
      setIsNewNotePanelOpen(true);
    }
    const handleOpen = () => setIsNewNotePanelOpen(true);
    const handleClose = () => setIsNewNotePanelOpen(false);
    window.addEventListener('openNewNotePanel', handleOpen);
    window.addEventListener('closeNewNotePanel', handleClose);
    window.addEventListener('closeAllPanels', handleClose);
    return () => {
      window.removeEventListener('openNewNotePanel', handleOpen);
      window.removeEventListener('closeNewNotePanel', handleClose);
      window.removeEventListener('closeAllPanels', handleClose);
    };
  }, []);

  if (isEditMode || isNewNotePanelOpen) {
    return null;
  }

  return (
    <SquareButton
      variant="Add"
      withMenu={false}
      onClick={() => window.dispatchEvent(new CustomEvent('openNewNotePanel'))}
    />
  );
}

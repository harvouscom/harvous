import React from 'react';
import { NewNotePanelProvider } from './NewNotePanelContext';
import { NewThreadPanelProvider } from './NewThreadPanelContext';

/**
 * Combined provider that wraps both NewNotePanel and NewThreadPanel contexts.
 * This ensures form state persists between desktop and mobile panels.
 */
const PanelStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <NewNotePanelProvider>
      <NewThreadPanelProvider>
        {children}
      </NewThreadPanelProvider>
    </NewNotePanelProvider>
  );
};

export default PanelStateProvider;

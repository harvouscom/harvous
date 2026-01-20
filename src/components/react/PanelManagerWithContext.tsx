import React from 'react';
import { NewNotePanelProvider } from './contexts/NewNotePanelContext';
import { NewThreadPanelProvider } from './contexts/NewThreadPanelContext';
import DesktopPanelManager from './DesktopPanelManager';
import BottomSheet from './BottomSheet';

interface PanelManagerWithContextProps {
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: 'thread' | 'note' | 'space' | 'dashboard' | 'profile';
  publishableKey?: string | null;
}

/**
 * Wrapper component that provides panel state context to both desktop and mobile panels.
 * This ensures form state persists when switching between desktop and mobile views.
 * Renders both panels in a single React tree so context works across both.
 */
const PanelManagerWithContext: React.FC<PanelManagerWithContextProps> = ({
  currentThread,
  currentSpace,
  currentNote,
  contentType = 'dashboard',
  publishableKey = null,
}) => {
  return (
    <NewNotePanelProvider>
      <NewThreadPanelProvider>
        {/* Wrapper for both panels */}
        <>
          {/* Desktop Panel Manager - positioned in desktop additional column via parent */}
          <DesktopPanelManager
            currentThread={currentThread}
            currentSpace={currentSpace}
            currentNote={currentNote}
            contentType={contentType}
          publishableKey={publishableKey}
          />
          
          {/* Mobile Bottom Sheet - BottomSheet handles its own positioning */}
          <BottomSheet
            currentThread={currentThread}
            currentSpace={currentSpace}
            currentNote={currentNote}
            contentType={contentType}
            publishableKey={publishableKey}
          />
        </>
      </NewThreadPanelProvider>
    </NewNotePanelProvider>
  );
};

export default PanelManagerWithContext;

import React from 'react';
import { NewNotePanelProvider } from './contexts/NewNotePanelContext';
import { NewThreadPanelProvider } from './contexts/NewThreadPanelContext';
import DesktopPanelManager from './DesktopPanelManager';

interface PanelManagerWithContextProps {
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: 'thread' | 'note' | 'space' | 'dashboard' | 'profile';
  publishableKey?: string | null;
  version?: string;
}

/**
 * Desktop-only wrapper that provides panel state context to the desktop panel manager.
 * Mobile bottom sheet is handled separately in MobileBottomSheetWithContext.
 */
const PanelManagerWithContext: React.FC<PanelManagerWithContextProps> = ({
  currentThread,
  currentSpace,
  currentNote,
  contentType = 'dashboard',
  publishableKey = null,
  version,
}) => {
  return (
    <NewNotePanelProvider>
      <NewThreadPanelProvider>
        {/* Desktop Panel Manager - positioned in desktop additional column via parent */}
        <DesktopPanelManager
          currentThread={currentThread}
          currentSpace={currentSpace}
          currentNote={currentNote}
          contentType={contentType}
          publishableKey={publishableKey}
          version={version}
        />
      </NewThreadPanelProvider>
    </NewNotePanelProvider>
  );
};

export default PanelManagerWithContext;

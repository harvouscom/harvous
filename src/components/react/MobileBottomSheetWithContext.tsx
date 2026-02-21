import React from 'react';
import { NewNotePanelProvider } from './contexts/NewNotePanelContext';
import { NewThreadPanelProvider } from './contexts/NewThreadPanelContext';
import BottomSheet from './BottomSheet';

interface MobileBottomSheetWithContextProps {
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: 'thread' | 'note' | 'space' | 'dashboard' | 'profile' | 'search' | 'new-space';
  publishableKey?: string | null;
  founderLetterHtml?: string;
  version?: string;
}

/**
 * Mobile-only wrapper that mounts the BottomSheet in the mobile layout
 * (since `.desktop-layout` is display:none under 1160px).
 *
 * It provides the same contexts needed for the New Note / New Thread forms.
 */
export default function MobileBottomSheetWithContext({
  currentThread,
  currentSpace,
  currentNote,
  contentType = 'dashboard',
  publishableKey = null,
  founderLetterHtml = '',
  version,
}: MobileBottomSheetWithContextProps) {
  return (
    <NewNotePanelProvider>
      <NewThreadPanelProvider>
        {/* Keep this out of document flow so it doesn't affect mobile layout */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000010 }}>
          <div style={{ pointerEvents: 'auto' }}>
            <BottomSheet
              currentThread={currentThread}
              currentSpace={currentSpace}
              currentNote={currentNote}
              contentType={contentType}
              publishableKey={publishableKey}
              founderLetterHtml={founderLetterHtml}
              version={version}
            />
          </div>
        </div>
      </NewThreadPanelProvider>
    </NewNotePanelProvider>
  );
}


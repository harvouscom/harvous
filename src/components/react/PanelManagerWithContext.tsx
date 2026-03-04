import React, { useEffect, useRef } from 'react';
import { NewNotePanelProvider } from './contexts/NewNotePanelContext';
import { NewThreadPanelProvider } from './contexts/NewThreadPanelContext';
import DesktopPanelManager from './DesktopPanelManager';
import { wrapTextWithNoteLink } from '@/utils/tiptap-helpers';

interface PanelManagerWithContextProps {
  currentThread?: any;
  currentSpace?: any;
  currentNote?: any;
  contentType?: 'thread' | 'note' | 'space' | 'dashboard' | 'profile' | 'search' | 'new-space';
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
  const createHyperlinkTimeoutRef = useRef<number | null>(null);

  // Global createHyperlink fallback: update source note via API when its card isn't mounted
  // (e.g. new note panel replaced the main content). Runs after a short delay so CardFullEditable can handle first.
  useEffect(() => {
    const handleCreateHyperlink = (event: Event) => {
      const { sourceNoteId, newNoteId, plainText } = (event as CustomEvent).detail || {};
      const sid = sourceNoteId ?? (typeof window !== 'undefined' ? localStorage.getItem('newNoteSourceNoteId') : null);
      const nid = newNoteId;
      const text = plainText ?? (typeof window !== 'undefined' ? localStorage.getItem('newNoteSourceSelectionPlainText') : null);
      if (!sid || !nid || !text?.trim()) return;

      if (createHyperlinkTimeoutRef.current) clearTimeout(createHyperlinkTimeoutRef.current);
      createHyperlinkTimeoutRef.current = window.setTimeout(async () => {
        createHyperlinkTimeoutRef.current = null;
        try {
          const res = await fetch(`/api/notes/${sid}/details`, { credentials: 'include' });
          if (!res.ok) return;
          const data = await res.json();
          const note = data?.note ?? data;
          const content = note?.content;
          if (typeof content !== 'string' || (note?.contentEncrypted === true)) return;
          const updatedContent = wrapTextWithNoteLink(content, text.trim(), nid);
          if (!updatedContent || updatedContent === content) return;
          const updateRes = await fetch(`/api/notes/${sid}/update-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ content: updatedContent }),
          });
          if (updateRes.ok) {
            try {
              sessionStorage.setItem('harvous-source-note-content-' + sid, updatedContent);
              sessionStorage.setItem('harvous-source-note-content-at-' + sid, String(Date.now()));
            } catch { /* ignore */ }
            window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId: sid, content: updatedContent } }));
          }
        } catch {
          // ignore
        }
      }, 200);
    };

    window.addEventListener('createHyperlink', handleCreateHyperlink as EventListener);
    return () => {
      window.removeEventListener('createHyperlink', handleCreateHyperlink as EventListener);
      if (createHyperlinkTimeoutRef.current) clearTimeout(createHyperlinkTimeoutRef.current);
    };
  }, []);

  return (
    <NewNotePanelProvider>
      <NewThreadPanelProvider>
        {/* Desktop Panel Manager - positioned in desktop additional column via parent */}
        <DesktopPanelManager
          currentThread={currentThread}
          currentSpace={currentSpace}
          currentNote={currentNote}
          contentType={contentType as 'thread' | 'note' | 'space' | 'dashboard' | 'profile'}
          publishableKey={publishableKey}
          version={version}
        />
      </NewThreadPanelProvider>
    </NewNotePanelProvider>
  );
};

export default PanelManagerWithContext;

/**
 * Greeting chips, pointed at the Library panel.
 *
 * `PrototypeHomeGreeting` renders the same sentence on two surfaces and takes its
 * destinations as a prop, so this is the Activity-side implementation: every chip opens
 * the panel at the thing it names.
 *
 * It also closes a gap the sidebar version could not. There, the book-level scripture
 * drill was component-local state inside `PrototypeSidebar`, so `openScriptureBook` had
 * no way to reach it and degraded to opening the Scripture list at its root — a chip that
 * said "Romans" and delivered "Scripture". The panel's drill is one addressable value in
 * shell state, so the chip now lands on the book.
 */
import { useMemo } from 'react';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import type { HomeGreetingNav } from '../PrototypeHomeGreeting';
import type { LibraryTab } from './library-panel-view';

/** The sidebar's list modes, mapped onto the panel's tabs. */
function tabForListMode(mode: string): LibraryTab {
  switch (mode) {
    case 'notes':
      return 'notes';
    case 'folders':
      return 'folders';
    case 'threads':
      return 'threads';
    case 'highlights':
      return 'highlights';
    case 'scripture':
      return 'scripture';
    case 'resources':
      return 'resources';
    default:
      return 'all';
  }
}

export function useLibraryPanelNav(): HomeGreetingNav {
  const { openLibraryPanel } = useProtoShell();

  return useMemo(
    () => ({
      openList: (mode) => openLibraryPanel({ tab: tabForListMode(mode), drill: null }),
      openThread: (threadId) =>
        openLibraryPanel({ tab: 'threads', drill: { kind: 'thread', threadId } }),
      openFolder: (folderName) =>
        openLibraryPanel({ tab: 'folders', drill: { kind: 'folder', folderKey: folderName } }),
      /* The tag rides in as the opening query. This used to go through a separate
         `sidebarTagSearchIntent` handshake whose only job was to tell the sidebar what the
         chip had already decided. */
      openTag: (_tagId, tagName) =>
        openLibraryPanel({ tab: 'all', drill: null, querySeed: tagName }),
      openScriptureBook: (bookOrder) =>
        openLibraryPanel({
          tab: 'scripture',
          drill: { kind: 'scripture', drill: { level: 'passages', bookOrder } },
        }),
    }),
    [openLibraryPanel],
  );
}

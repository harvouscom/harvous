/**
 * Resources, expanded: the shelf on the left, the resource itself on the right.
 *
 * The Library panel's Resources tab is for reaching for something — a click there docks it
 * or follows it. This is for looking at what you have: a click selects, and the viewer
 * shows the article, the video, the PDF, without leaving Harvous. Same list component, so
 * the two never drift in what a shelf contains or how its rows behave.
 */
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import ProtoSidebarExpandedPanel from '../ProtoSidebarExpandedPanel';
import './resources-viewer.css';
import type { ExpandedSidebarToolProps } from '../PrototypeExpandedSidebarHost';
import PrototypeResourceLibraryList, {
  type ResourceSelection,
} from '../PrototypeResourceLibraryList';
import PrototypeResourceViewer, { type ViewerResource } from './PrototypeResourceViewer';
import { useOpenResource, useDockResource } from '../library-panel/use-open-resource';
import {
  clearPendingResourceSelection,
  peekPendingResourceSelection,
} from './pending-resource-selection';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useActiveSpace } from '../../../hooks/useActiveSpace';
import { resolveLibraryListScope } from '../../../lib/shared-space-capabilities';
import { useLibrary } from '../../../hooks/queries/useLibrary';
import { useChurchLibraryUnion } from '../../../hooks/queries/useChurchLibrary';
import { useSpaceLibrary } from '../../../hooks/queries/useSpaceLibrary';

export default function PrototypeExpandedResources({
  exiting,
  origin,
  onClose,
}: ExpandedSidebarToolProps) {
  const { sidebarListSpaceScope, closeExpandedSidebar } = useProtoShell();
  const { activeSpaceId, homeSpaceId, isSharedSpace, isOwner } = useActiveSpace();
  /*
   * Read once, at open. The Library panel this grew out of resets its "<space> | My Home"
   * switch when it finishes closing — a moment after this mounts — and the shelf should
   * stay the one you expanded, not flip to the room's underneath you.
   */
  const [scope] = useState(() =>
    resolveLibraryListScope({
      activeSpaceId,
      homeSpaceId,
      isSharedSpace,
      isOwner,
      listScope: sidebarListSpaceScope,
    }),
  );
  const shelfSpaceId = scope.isScopedSharedSpace ? scope.spaceId : null;

  /* Opened from a resource click in the Library panel: start on that item. */
  const [selection, setSelection] = useState<ResourceSelection | null>(peekPendingResourceSelection);
  useEffect(() => clearPendingResourceSelection(), []);
  const closeViewer = useCallback(() => setSelection(null), []);

  const library = useLibrary();
  const church = useChurchLibraryUnion();
  const space = useSpaceLibrary(shelfSpaceId, { enabled: Boolean(shelfSpaceId) });

  /*
   * Resolved from the queries on every render, never stored: a rename shows at once, and a
   * removed item closes its own viewer instead of leaving a ghost of itself on screen.
   */
  const selected = useMemo<ViewerResource | null>(() => {
    if (!selection) return null;
    if (selection.source === 'mine') {
      const item = library.data?.items.find((i) => i.id === selection.id);
      return item
        ? { ...item, source: 'mine', shelfLabel: 'My Library', leadersOnly: false, pinned: false }
        : null;
    }
    if (selection.source === 'church') {
      const item = church.data?.items.find((i) => i.id === selection.id);
      return item
        ? {
            ...item,
            source: 'church',
            shelfLabel: church.data?.church?.name ?? 'Church Library',
            leadersOnly: item.access === 'leaders',
            pinned: false,
          }
        : null;
    }
    const item = space.data?.items.find((i) => i.id === selection.id);
    return item
      ? {
          ...item,
          source: 'space',
          shelfLabel: space.data?.space.title ?? 'This space',
          leadersOnly: item.access === 'leaders',
          pinned: item.pinned,
        }
      : null;
  }, [selection, library.data, church.data, space.data]);

  const leaveForNote = useCallback(
    () => closeExpandedSidebar({ preserveHistory: true }),
    [closeExpandedSidebar],
  );
  /* The list still needs an opener for its own fallbacks; with `onSelectResource` set, no
     row calls it, but its menus' "Open" items follow the link directly. */
  const openResource = useOpenResource({ spaceId: scope.spaceId, onDocked: leaveForNote });
  const { canDock, dock } = useDockResource({ spaceId: scope.spaceId, onDocked: leaveForNote });

  /*
   * Escape closes the viewer before the tool. On the wrapper as a React handler, which runs
   * after anything inside that owns the key (a row menu, the add form) and before the
   * panel's document listener — so `defaultPrevented` is the whole protocol.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !selection) return;
    event.preventDefault();
    closeViewer();
  };

  return (
    <ProtoSidebarExpandedPanel
      label="Resources"
      title="Resources"
      exiting={exiting}
      origin={origin}
      centered
      onClose={onClose}
    >
      <div
        className={`proto-planner proto-resources-tool${selected ? ' proto-resources-tool--viewing' : ''}`}
        onKeyDown={onKeyDown}
      >
        <div className="proto-planner__main proto-resources-tool__list">
          <PrototypeResourceLibraryList
            query=""
            onOpenResource={openResource}
            spaceId={shelfSpaceId}
            shelfFilterAs="switch"
            selected={selected ? selection : null}
            onSelectResource={setSelection}
          />
        </div>
        {selected ? (
          <PrototypeResourceViewer
            resource={selected}
            canDock={canDock && selected.source === 'mine'}
            onDock={() => dock(selected)}
            onClose={closeViewer}
          />
        ) : null}
      </div>
    </ProtoSidebarExpandedPanel>
  );
}

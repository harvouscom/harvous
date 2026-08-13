/**
 * Flat join-order trail for connected notes in the thread panel (with optional drag reorder).
 */
import { useMemo, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  type StudyThreadNodeFlat,
  type StudyThreadEdge,
} from '../../hooks/queries/usePrototypeStudyThread';
import { useDisconnectNote } from '../../hooks/mutations/useDisconnectNote';
import { useStudyThreadMemberDragReorder } from '../../hooks/useStudyThreadMemberDragReorder';
import { resolveStudyThreadMemberOrder, orderStudyThreadNodesByIds } from '@/utils/study-thread-trail';
import { protoRelativeCaptionAbbrev } from './proto-time';
import {
  ProtoThreadTrailRecencyLine,
  threadTrailRowPreview,
  threadTrailRowTitle,
  threadTrailRowUpdatedAt,
} from './proto-thread-trail-row';
import ProtoThreadTrailOrb from './ProtoThreadTrailOrb';
import {
  ProtoThreadTrailSortableList,
  ProtoThreadTrailSortableRow,
  type ThreadTrailSortable,
} from './ProtoThreadTrailSortable';

function findEdge(aId: string, bId: string, edges: StudyThreadEdge[]): StudyThreadEdge | undefined {
  return edges.find(
    (e) => (e.fromId === aId && e.toId === bId) || (e.fromId === bId && e.toId === aId),
  );
}

interface ThreadTrailStepProps {
  node: StudyThreadNodeFlat;
  isFocus?: boolean;
  showDisconnect?: boolean;
  focusNoteId: string;
  edges: StudyThreadEdge[];
  onOpen: (id: string) => void;
  isDragging?: boolean;
  /** Present when this list is reorderable; supplies the dnd-kit bindings. */
  sortable?: ThreadTrailSortable | null;
}

function ThreadTrailStep({
  node,
  isFocus,
  showDisconnect,
  focusNoteId,
  edges,
  onOpen,
  isDragging,
  sortable = null,
}: ThreadTrailStepProps) {
  const disconnectNote = useDisconnectNote();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const edge = showDisconnect ? findEdge(focusNoteId, node.id, edges) : undefined;
  const title = threadTrailRowTitle(node);
  const preview = threadTrailRowPreview(node);
  const rel = protoRelativeCaptionAbbrev(threadTrailRowUpdatedAt(node));

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!edge) return;
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      confirmTimerRef.current = setTimeout(() => setConfirmDisconnect(false), 2500);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDisconnect(false);
    disconnectNote.mutate({ fromNoteId: edge.fromId, toNoteId: edge.toId });
  };

  return (
    <div
      ref={sortable?.setNodeRef}
      className={`proto-thread-trail__step${isFocus ? ' proto-thread-trail__step--focus' : ''}${isDragging ? ' proto-thread-trail__step--dragging' : ''}`}
      role="listitem"
      aria-current={isFocus ? 'location' : undefined}
      style={sortable?.style}
      /* On the row, not the handle — see ProtoThreadTrailSortable. */
      {...(sortable?.listeners ?? {})}
    >
      <ProtoThreadTrailOrb active={isFocus} />
      <div className="proto-thread-trail__step-body">
        <button
          type="button"
          className="proto-thread-trail__step-main"
          onClick={() => onOpen(node.id)}
          aria-label={`Open ${title}`}
        >
          {/* No "Current" chip and no highlighted band — the filled check orb
              already says which note you are on, and three signals for one fact
              made the row look like it was also selected. */}
          <div className="proto-thread-trail__title-line proto-note-row__title-line">
            <span className="pds-list-title proto-note-row__title-text">{title}</span>
          </div>
          <ProtoThreadTrailRecencyLine rel={rel} preview={preview} />
        </button>

        {sortable ? (
          /* A grip, not an ellipsis. The old icon was the same glyph the row
             menus use, so the one control on the row that could not be clicked
             open was the one that looked most like a menu. `attributes` go here
             rather than on the row so a screen reader gets the drag
             instructions on something focusable. */
          <span
            ref={sortable.setActivatorNodeRef}
            className="proto-thread-trail__drag-handle"
            aria-label={`Reorder ${title}`}
            title="Drag to reorder"
            {...sortable.attributes}
          >
            <Icon name="bars" size={12} />
          </span>
        ) : null}

        {edge ? (
          <div className="proto-thread-trail__step-actions">
            <button
              type="button"
              className={`proto-side-panel__action-btn proto-side-panel__disconnect-row-btn${confirmDisconnect ? ' proto-side-panel__disconnect-row-btn--confirm' : ''}`}
              title={confirmDisconnect ? 'Tap again to confirm' : 'Disconnect'}
              aria-label={confirmDisconnect ? `Confirm disconnect ${title}` : `Disconnect ${title}`}
              disabled={disconnectNote.isPending}
              onClick={handleDisconnect}
            >
              <Icon name={confirmDisconnect ? 'trash-can' : 'arrow-right-arrow-left'} size={11} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface PrototypeStudyThreadTrailProps {
  focusNoteId: string;
  repNoteId: string;
  spaceId: string;
  nodes: StudyThreadNodeFlat[];
  edges: StudyThreadEdge[];
  memberOrder: string[] | null;
  onOpen: (id: string) => void;
  reorderEnabled?: boolean;
}

export default function PrototypeStudyThreadTrail({
  focusNoteId,
  repNoteId,
  spaceId,
  nodes,
  edges,
  memberOrder,
  onOpen,
  reorderEnabled = true,
}: PrototypeStudyThreadTrailProps) {
  const members = useMemo(
    () => resolveStudyThreadMemberOrder(nodes, edges, repNoteId, memberOrder),
    [nodes, edges, repNoteId, memberOrder],
  );
  const orderedNoteIds = useMemo(() => members.map((n) => n.id), [members]);

  const drag = useStudyThreadMemberDragReorder({
    anchorNoteId: focusNoteId,
    spaceId,
    orderedNoteIds,
    enabled: reorderEnabled && Boolean(spaceId),
  });

  const displayMembers = useMemo(
    () => orderStudyThreadNodesByIds(members, drag.displayOrderedIds),
    [members, drag.displayOrderedIds],
  );

  if (displayMembers.length === 0) {
    return (
      <div className="proto-side-panel__empty">
        <p className="proto-inspector-muted">Connect a related note.</p>
      </div>
    );
  }

  return (
    <div className="proto-thread-trail proto-thread-trail--carded">
      {/* The grouped-row card the rest of the app uses. The trail keeps its
          spine and orbs inside it — see the `--carded` block in
          prototype-components.css for how the two are reconciled. */}
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools proto-thread-trail__card">
        <div
          className={`proto-thread-trail__spine proto-thread-trail__spine--fill${drag.draggingId ? ' proto-thread-trail__spine--dragging' : ''}`}
          role="list"
          aria-label="Connected notes trail"
        >
          <ProtoThreadTrailSortableList
            items={drag.displayOrderedIds}
            onDragStart={drag.handleDragStart}
            onDragEnd={drag.handleDragEnd}
            onDragCancel={drag.handleDragCancel}
          >
            {displayMembers.map((node) => (
              <ProtoThreadTrailSortableRow key={node.id} id={node.id}>
                {(sortable) => (
                  <ThreadTrailStep
                    node={node}
                    isFocus={node.id === focusNoteId}
                    showDisconnect={node.id !== focusNoteId}
                    focusNoteId={focusNoteId}
                    edges={edges}
                    onOpen={onOpen}
                    isDragging={drag.draggingId === node.id}
                    sortable={drag.showDragHandle ? sortable : null}
                  />
                )}
              </ProtoThreadTrailSortableRow>
            ))}
          </ProtoThreadTrailSortableList>
        </div>
      </div>
    </div>
  );
}

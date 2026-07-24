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
  trailReorder?: {
    noteId: string;
    reorderIndex: number;
    onDragStart: (
      event: React.DragEvent<HTMLElement>,
      noteId: string,
      previewSource?: HTMLElement | null,
    ) => void;
    onDragEnd: (event: React.DragEvent<HTMLElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLElement>, insertBeforeIndex: number) => void;
    onDrop: (event: React.DragEvent<HTMLElement>) => void;
  } | null;
}

function ThreadTrailStep({
  node,
  isFocus,
  showDisconnect,
  focusNoteId,
  edges,
  onOpen,
  isDragging,
  trailReorder = null,
}: ThreadTrailStepProps) {
  const disconnectNote = useDisconnectNote();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);

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

  const reorderIndex = trailReorder?.reorderIndex ?? 0;
  const insertBeforeFromPointer = (e: React.DragEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? reorderIndex : reorderIndex + 1;
  };

  return (
    <div
      className={`proto-thread-trail__step${isFocus ? ' proto-thread-trail__step--focus' : ''}${isDragging ? ' proto-thread-trail__step--dragging' : ''}`}
      role="listitem"
      aria-current={isFocus ? 'location' : undefined}
      onDragEnter={
        trailReorder ? (e) => trailReorder.onDragOver(e, insertBeforeFromPointer(e)) : undefined
      }
      onDragOver={
        trailReorder ? (e) => trailReorder.onDragOver(e, insertBeforeFromPointer(e)) : undefined
      }
      onDrop={trailReorder ? trailReorder.onDrop : undefined}
    >
      <ProtoThreadTrailOrb active={isFocus} />
      <div className="proto-thread-trail__step-body">
        <button
          type="button"
          className="proto-thread-trail__step-main"
          onClick={() => onOpen(node.id)}
          aria-label={`Open ${title}`}
        >
          <div className="proto-thread-trail__title-line proto-note-row__title-line">
            <span className="pds-list-title proto-note-row__title-text">{title}</span>
            {isFocus ? <span className="proto-side-panel__current-badge">Current</span> : null}
          </div>
          <ProtoThreadTrailRecencyLine rel={rel} preview={preview} />
        </button>

        {trailReorder ? (
          <div className="proto-menu proto-note-row__menu proto-note-row__menu--reorder">
            <button
              type="button"
              className="proto-note-row__menu-trigger"
              draggable
              aria-label={`Reorder ${title}`}
              title="Drag to reorder"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                }
              }}
              onDragStart={(e) => {
                suppressClickRef.current = true;
                const step = e.currentTarget.closest('.proto-thread-trail__step') as HTMLElement | null;
                trailReorder.onDragStart(e, trailReorder.noteId, step);
              }}
              onDragEnd={(e) => {
                trailReorder.onDragEnd(e);
                window.setTimeout(() => {
                  suppressClickRef.current = false;
                }, 0);
              }}
            >
              <Icon name="ellipsis-vertical" size={14} />
            </button>
          </div>
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
    <div className="proto-thread-trail">
      <div
        className={`proto-thread-trail__spine proto-thread-trail__spine--fill${drag.draggingId ? ' proto-thread-trail__spine--dragging' : ''}`}
        role="list"
        aria-label="Connected notes trail"
      >
        {displayMembers.map((node, index) => (
          <ThreadTrailStep
            key={node.id}
            node={node}
            isFocus={node.id === focusNoteId}
            showDisconnect={node.id !== focusNoteId}
            focusNoteId={focusNoteId}
            edges={edges}
            onOpen={onOpen}
            isDragging={drag.draggingId === node.id}
            trailReorder={
              drag.showDragHandle
                ? {
                    noteId: node.id,
                    reorderIndex: index,
                    onDragStart: drag.handleDragStart,
                    onDragEnd: drag.handleDragEnd,
                    onDragOver: drag.handleDragOver,
                    onDrop: drag.handleDrop,
                  }
                : null
            }
          />
        ))}
      </div>
    </div>
  );
}

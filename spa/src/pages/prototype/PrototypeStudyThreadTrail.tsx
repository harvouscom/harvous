/**
 * Flat join-order trail for connected notes in the thread panel (with optional drag reorder).
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  type StudyThreadNodeFlat,
  type StudyThreadEdge,
} from '../../hooks/queries/usePrototypeStudyThread';
import { useDisconnectNote } from '../../hooks/mutations/useDisconnectNote';
import { useStudyThreadMemberDragReorder } from '../../hooks/useStudyThreadMemberDragReorder';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForCard } from '@/utils/html-stripper';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { resolveStudyThreadMemberOrder, orderStudyThreadNodesByIds } from '@/utils/study-thread-trail';
import ProtoThreadTrailOrb from './ProtoThreadTrailOrb';
import ProtoThreadTrailReorderDivider from './ProtoThreadTrailReorderDivider';

function nodeDisplayTitle(node: StudyThreadNodeFlat): string {
  return (
    (node.noteType === 'resource' && node.resourceTitle ? node.resourceTitle : null) ??
    stripServerAutoUntitledNoteTitleForDisplay(node.title) ??
    `Note N${node.simpleNoteId?.toString().padStart(3, '0') ?? ''}`
  );
}

function nodePreview(node: StudyThreadNodeFlat): string {
  const raw =
    node.noteType === 'resource' && node.resourceDescription
      ? node.resourceDescription
      : node.content ?? '';
  return stripHtmlForCard(raw, false).slice(0, 120);
}

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
}

function ThreadTrailStep({
  node,
  isFocus,
  showDisconnect,
  focusNoteId,
  edges,
  onOpen,
  isDragging,
}: ThreadTrailStepProps) {
  const disconnectNote = useDisconnectNote();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const edge = showDisconnect ? findEdge(focusNoteId, node.id, edges) : undefined;
  const title = nodeDisplayTitle(node);
  const preview = nodePreview(node);
  const rel = protoRelativeCaptionAbbrev(node.updatedAt);

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
      className={`proto-thread-trail__step${isFocus ? ' proto-thread-trail__step--focus' : ''}${isDragging ? ' proto-thread-trail__step--dragging' : ''}`}
      role="listitem"
      aria-current={isFocus ? 'location' : undefined}
    >
      <ProtoThreadTrailOrb active={isFocus} />
      <div className="proto-thread-trail__step-body">
        <button
          type="button"
          className="proto-thread-trail__step-main"
          onClick={() => onOpen(node.id)}
          aria-label={`Open ${title}`}
        >
          <div className="proto-thread-trail__title-line">
            <span className="pds-list-title proto-thread-trail__title">{title}</span>
            {isFocus ? <span className="proto-side-panel__current-badge">Current</span> : null}
          </div>
          {rel || preview ? (
            <div className="pds-list-preview proto-thread-trail__preview">
              {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
              {rel && preview ? '  ' : null}
              {preview ? <span>{preview}</span> : null}
            </div>
          ) : null}
        </button>

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
        <p className="proto-inspector-muted">No notes connected yet.</p>
      </div>
    );
  }

  return (
    <div className="proto-thread-trail">
      <div
        className={`proto-thread-trail__spine${drag.draggingId ? ' proto-thread-trail__spine--dragging' : ''}`}
        role="list"
        aria-label="Connected notes trail"
      >
        {drag.showDragHandle ? (
          <ProtoThreadTrailReorderDivider
            insertBeforeIndex={0}
            dragNoteId=""
            dragNoteTitle=""
            dropOnly
            onDragStart={drag.handleDragStart}
            onDragEnd={drag.handleDragEnd}
            onDragOver={drag.handleDragOver}
            onDrop={drag.handleDrop}
          />
        ) : null}
        {displayMembers.map((node, index) => {
          const isFocus = node.id === focusNoteId;
          const title = nodeDisplayTitle(node);
          return (
            <Fragment key={node.id}>
              <ThreadTrailStep
                node={node}
                isFocus={isFocus}
                showDisconnect={!isFocus}
                focusNoteId={focusNoteId}
                edges={edges}
                onOpen={onOpen}
                isDragging={drag.draggingId === node.id}
              />
              {drag.showDragHandle ? (
                <ProtoThreadTrailReorderDivider
                  insertBeforeIndex={index + 1}
                  dragNoteId={node.id}
                  dragNoteTitle={title}
                  isDragging={drag.draggingId === node.id}
                  onDragStart={drag.handleDragStart}
                  onDragEnd={drag.handleDragEnd}
                  onDragOver={drag.handleDragOver}
                  onDrop={drag.handleDrop}
                />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

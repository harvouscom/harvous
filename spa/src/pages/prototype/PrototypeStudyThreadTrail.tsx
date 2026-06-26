/**
 * Vertical direction-aware trail for connected notes in the thread panel.
 */
import { useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import {
  type StudyThreadNodeFlat,
  type StudyThreadEdge,
} from '../../hooks/queries/usePrototypeStudyThread';
import { useDisconnectNote } from '../../hooks/mutations/useDisconnectNote';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForCard } from '@/utils/html-stripper';
import { protoRelativeCaptionAbbrev } from './proto-time';
import {
  buildStudyThreadTrail,
} from '@/utils/study-thread-trail';
import ProtoThreadTrailOrb from './ProtoThreadTrailOrb';

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
}

function ThreadTrailStep({
  node,
  isFocus,
  showDisconnect,
  focusNoteId,
  edges,
  onOpen,
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
      className={`proto-thread-trail__step${isFocus ? ' proto-thread-trail__step--focus' : ''}`}
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
  nodes: StudyThreadNodeFlat[];
  edges: StudyThreadEdge[];
  onOpen: (id: string) => void;
}

export default function PrototypeStudyThreadTrail({
  focusNoteId,
  nodes,
  edges,
  onOpen,
}: PrototypeStudyThreadTrailProps) {
  const trail = buildStudyThreadTrail(focusNoteId, nodes, edges);
  const hasTrail =
    Boolean(trail.focus) || trail.upstream.length > 0 || trail.downstream.length > 0 || trail.alsoConnected.length > 0;

  if (!hasTrail) {
    return (
      <div className="proto-side-panel__empty">
        <p className="proto-inspector-muted">No notes connected yet.</p>
      </div>
    );
  }

  const spineNodes: StudyThreadNodeFlat[] = [
    ...trail.upstream,
    ...(trail.focus ? [trail.focus] : []),
    ...trail.downstream,
  ];

  return (
    <div className="proto-thread-trail">
      <div className="proto-thread-trail__spine" role="list" aria-label="Connected notes trail">
        {spineNodes.map((node) => {
          const isFocus = trail.focus?.id === node.id;
          return (
            <ThreadTrailStep
              key={node.id}
              node={node}
              isFocus={isFocus}
              showDisconnect={!isFocus}
              focusNoteId={focusNoteId}
              edges={edges}
              onOpen={onOpen}
            />
          );
        })}
      </div>

      {trail.alsoConnected.length > 0 ? (
        <div className="proto-thread-trail__also">
          <div className="proto-thread-trail__also-list" role="list">
            {trail.alsoConnected.map((node) => (
              <ThreadTrailStep
                key={node.id}
                node={node}
                showDisconnect
                focusNoteId={focusNoteId}
                edges={edges}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

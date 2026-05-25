import { type FocusEvent, type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import LinkPreviewCard from '@/components/react/LinkPreviewCard';
import type { LinkedNoteRef } from '../../hooks/queries/useNote';
import PrototypeConnectNoteSheet from './PrototypeConnectNoteSheet';
import PrototypeShareButton from './PrototypeShareButton';
import { noteParamSlug } from './proto-route-slugs';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';

const HOVER_ENTER_MS = 200;
const HOVER_LEAVE_MS = 140;

const PILL_LABEL_MAX = 28;

export interface PrototypeNoteActionBarProps {
  noteId: string;
  spaceId: string;
  currentTitle: string;
  linkedFromNotes: LinkedNoteRef[];
  linkedToNotes: LinkedNoteRef[];
  /** When true, hide Connect note (e.g. onboarding system notes). */
  connectDisabled?: boolean;
  /** Whether the note currently has a public share link. */
  isPublic?: boolean;
  /** The active share token (if any). */
  shareToken?: string | null;
  /** When true, hide the share button (encrypted notes, onboarding, etc.). */
  shareDisabled?: boolean;
}

function pillDisplayTitle(n: LinkedNoteRef): string {
  if (n.noteType === 'resource' && (n.resourceTitle ?? '').trim()) {
    return (n.resourceTitle ?? '').trim();
  }
  const t = stripServerAutoUntitledNoteTitleForDisplay((n.title ?? '').trim());
  return t || 'New Note';
}

function truncatedLabel(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PILL_LABEL_MAX) return trimmed;
  return `${trimmed.slice(0, PILL_LABEL_MAX - 1).trimEnd()}…`;
}

function trimmedCurrentTitle(title: string): string {
  const t = title.trim();
  return t || 'Title';
}

interface ConnectedNotePillProps {
  note: LinkedNoteRef;
  direction: 'from' | 'to';
}

function ConnectedNotePill({ note, direction }: ConnectedNotePillProps) {
  const elementRef = useRef<HTMLElement | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const clearTimers = () => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  };

  const captureAnchor = (e: ReactMouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    elementRef.current = e.currentTarget;
  };

  const scheduleShow = () => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    if (anchorRect) return;
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => {
      if (elementRef.current) setAnchorRect(elementRef.current.getBoundingClientRect());
    }, HOVER_ENTER_MS);
  };

  const scheduleHide = () => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setAnchorRect(null), HOVER_LEAVE_MS);
  };

  const dismiss = () => { clearTimers(); setAnchorRect(null); };

  return (
    <>
      <Link
        to="/prototype/n/$noteId"
        params={{ noteId: noteParamSlug(note.id) }}
        className="proto-note-action-bar__pill proto-note-action-bar__pill--link"
        onMouseEnter={(e: ReactMouseEvent<HTMLElement>) => { captureAnchor(e); scheduleShow(); }}
        onMouseLeave={scheduleHide}
        onFocus={(e: FocusEvent<HTMLElement>) => { captureAnchor(e); scheduleShow(); }}
        onBlur={scheduleHide}
      >
        {direction === 'from' ? (
          <>
            <Icon name="arrow-left" size={14} className="proto-note-action-bar__pill-git" aria-hidden />
            <span className="proto-note-action-bar__pill-text">{truncatedLabel(pillDisplayTitle(note))}</span>
          </>
        ) : (
          <>
            <span className="proto-note-action-bar__pill-text">{truncatedLabel(pillDisplayTitle(note))}</span>
            <Icon name="arrow-right" size={14} className="proto-note-action-bar__pill-git" aria-hidden />
          </>
        )}
      </Link>
      {anchorRect ? (
        <LinkPreviewCard
          kind="note"
          anchorRect={anchorRect}
          payload={{ noteId: note.id }}
          onDismiss={dismiss}
          onPointerEnter={() => {
            if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
          }}
          onPointerLeave={scheduleHide}
        />
      ) : null}
    </>
  );
}

/** Prototype bottom chrome — linked-note strip + Connect note picker (stored as `linkedFromNoteId`). */
export default function PrototypeNoteActionBar({
  noteId,
  spaceId,
  currentTitle,
  linkedFromNotes,
  linkedToNotes,
  connectDisabled = false,
  isPublic = false,
  shareToken = null,
  shareDisabled = false,
}: PrototypeNoteActionBarProps) {
  const hasTrail = linkedFromNotes.length > 0 || linkedToNotes.length > 0;
  const [connectOpen, setConnectOpen] = useState(false);
  const showConnect = !connectDisabled;
  const showShare = !shareDisabled;

  const connectButton = showConnect ? (
    <button
      type="button"
      className="proto-note-action-bar__pill proto-note-action-bar__pill--connect"
      title="Pick another note in this space to connect"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setConnectOpen(true)}
    >
      <Icon name="arrow-right-arrow-left" size={14} className="proto-note-action-bar__pill-git" aria-hidden />
      <span>Connect note</span>
    </button>
  ) : null;

  const shareButton = showShare ? (
    <PrototypeShareButton
      noteId={noteId}
      isPublic={isPublic}
      shareToken={shareToken}
    />
  ) : null;

  const connectSheet = showConnect ? (
    <PrototypeConnectNoteSheet
      open={connectOpen}
      onOpenChange={setConnectOpen}
      spaceId={spaceId}
      parentNoteId={noteId}
    />
  ) : null;

  if (!hasTrail && connectDisabled && shareDisabled) {
    return null;
  }

  if (!hasTrail) {
    return (
      <>
        <div className="proto-note-action-bar" role="toolbar" aria-label="Connected notes">
          <div className="proto-note-action-bar__scroll">
            <div className="proto-note-action-bar__strip proto-note-action-bar__strip--solo">
              {connectButton}
              {shareButton}
            </div>
          </div>
        </div>
        {connectSheet}
      </>
    );
  }

  return (
    <>
      <div className="proto-note-action-bar" role="toolbar" aria-label="Connected notes">
        <div className="proto-note-action-bar__scroll">
          <div className="proto-note-action-bar__strip">
            {linkedFromNotes.map((n) => (
              <span key={n.id} className="proto-note-action-bar__cluster">
                <ConnectedNotePill note={n} direction="from" />
                <Icon name="arrows-left-right" size={14} className="proto-note-action-bar__sep" aria-hidden />
              </span>
            ))}
            <span className="proto-note-action-bar__current">{truncatedLabel(trimmedCurrentTitle(currentTitle))}</span>
            {linkedToNotes.map((n) => (
              <span key={n.id} className="proto-note-action-bar__cluster">
                <Icon name="arrows-left-right" size={14} className="proto-note-action-bar__sep" aria-hidden />
                <ConnectedNotePill note={n} direction="to" />
              </span>
            ))}
            {connectButton ? (
              <>
                <Icon name="arrows-left-right" size={14} className="proto-note-action-bar__sep" aria-hidden />
                {connectButton}
              </>
            ) : null}
            {shareButton ? (
              <>
                <Icon name="arrows-left-right" size={14} className="proto-note-action-bar__sep" aria-hidden />
                {shareButton}
              </>
            ) : null}
          </div>
        </div>
      </div>
      {connectSheet}
    </>
  );
}

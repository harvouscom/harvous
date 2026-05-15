import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import type { LinkedNoteRef } from '../../hooks/queries/useNote';
import PrototypeConnectNoteSheet from './PrototypeConnectNoteSheet';
import { noteParamSlug } from './proto-route-slugs';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';

const PILL_LABEL_MAX = 28;

export interface PrototypeNoteActionBarProps {
  noteId: string;
  spaceId: string;
  currentTitle: string;
  linkedFromNotes: LinkedNoteRef[];
  linkedToNotes: LinkedNoteRef[];
  /** When true, hide Connect note (e.g. onboarding system notes). */
  connectDisabled?: boolean;
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

/** Prototype bottom chrome — linked-note strip + Connect note picker (stored as `linkedFromNoteId`). */
export default function PrototypeNoteActionBar({
  noteId,
  spaceId,
  currentTitle,
  linkedFromNotes,
  linkedToNotes,
  connectDisabled = false,
}: PrototypeNoteActionBarProps) {
  const hasTrail = linkedFromNotes.length > 0 || linkedToNotes.length > 0;
  const [connectOpen, setConnectOpen] = useState(false);
  const showConnect = !connectDisabled;

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

  const connectSheet = showConnect ? (
    <PrototypeConnectNoteSheet
      open={connectOpen}
      onOpenChange={setConnectOpen}
      spaceId={spaceId}
      parentNoteId={noteId}
    />
  ) : null;

  if (!hasTrail && connectDisabled) {
    return null;
  }

  if (!hasTrail) {
    return (
      <>
        <div className="proto-note-action-bar" role="toolbar" aria-label="Connected notes">
          <div className="proto-note-action-bar__scroll">
            <div className="proto-note-action-bar__strip proto-note-action-bar__strip--solo">{connectButton}</div>
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
                <Link
                  to="/prototype/n/$noteId"
                  params={{
                    noteId: noteParamSlug(n.id),
                  }}
                  className="proto-note-action-bar__pill proto-note-action-bar__pill--link"
                >
                  <Icon name="arrow-left" size={14} className="proto-note-action-bar__pill-git" aria-hidden />
                  <span className="proto-note-action-bar__pill-text">{truncatedLabel(pillDisplayTitle(n))}</span>
                </Link>
                <Icon name="arrows-left-right" size={14} className="proto-note-action-bar__sep" aria-hidden />
              </span>
            ))}
            <span className="proto-note-action-bar__current">{truncatedLabel(trimmedCurrentTitle(currentTitle))}</span>
            {linkedToNotes.map((n) => (
              <span key={n.id} className="proto-note-action-bar__cluster">
                <Icon name="arrows-left-right" size={14} className="proto-note-action-bar__sep" aria-hidden />
                <Link
                  to="/prototype/n/$noteId"
                  params={{
                    noteId: noteParamSlug(n.id),
                  }}
                  className="proto-note-action-bar__pill proto-note-action-bar__pill--link"
                >
                  <span className="proto-note-action-bar__pill-text">{truncatedLabel(pillDisplayTitle(n))}</span>
                  <Icon name="arrow-right" size={14} className="proto-note-action-bar__pill-git" aria-hidden />
                </Link>
              </span>
            ))}
            {connectButton ? (
              <>
                <Icon name="arrows-left-right" size={14} className="proto-note-action-bar__sep" aria-hidden />
                {connectButton}
              </>
            ) : null}
          </div>
        </div>
      </div>
      {connectSheet}
    </>
  );
}

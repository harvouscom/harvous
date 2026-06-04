/**
 * Prototype inspector pane — mirrors native NoteInspectorView.
 * Sections: Info · Tags · Connected Notes · Folders
 * Standalone — no SPA CSS variables or shared styles.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import type { NoteDetail, LinkedNoteRef } from '../../hooks/queries/useNote';
import { formatNoteAddedBySource } from '@/utils/note-added-by-display';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { useDisconnectNote } from '../../hooks/mutations/useDisconnectNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeConnectNoteSheet from './PrototypeConnectNoteSheet';
import PrototypeStudyThreadPopover from './PrototypeStudyThreadPopover';
import PrototypeFolderTagEditor from './PrototypeFolderTagEditor';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import { noteParamSlug } from './proto-route-slugs';

interface PrototypeInspectorPaneProps {
  note: NoteDetail;
  spaceId?: string;
}

export default function PrototypeInspectorPane({ note, spaceId = '' }: PrototypeInspectorPaneProps) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectAnchorRect, setConnectAnchorRect] = useState<DOMRect | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [threadsAnchorRect, setThreadsAnchorRect] = useState<DOMRect | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const navigate = useNavigate();
  const { closeInspector, closeDrawer, isMobileSidebar } = useProtoShell();
  const deleteNote = useDeleteNote();

  const onDeleteConfirm = () => {
    if (!spaceId) return;
    deleteNote.mutate(
      { noteId: note.id, spaceId },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          closeInspector();
          navigate({ to: prototypeHomeRouteTo(), replace: true });
          if (isMobileSidebar) closeDrawer();
        },
        onError: (err) => {
          setDeleteConfirmOpen(false);
          const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not delete note';
          toast.error(msg);
        },
      },
    );
  };

  const createdStr = note.createdAt ? formatDate(new Date(note.createdAt)) : '—';
  const updatedStr = note.updatedAt ? formatDate(new Date(note.updatedAt)) : '—';

  const wordCount = estimateWords(note.content ?? '');

  const linkedFromNotes = note.linkedFromNotes ?? [];
  const linkedToNotes = note.linkedToNotes ?? [];
  const hasConnections = linkedFromNotes.length > 0 || linkedToNotes.length > 0;

  return (
    <div className="proto-inspector">
      {/* Info section */}
      <section className="proto-inspector-section">
        <p className="proto-inspector-section-title">Info</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {note.simpleNoteId != null ? (
            <InspectorSimpleNoteIdRow simpleNoteId={note.simpleNoteId} />
          ) : null}
          <InspectorRow label="Created" value={createdStr} />
          <InspectorRow label="Added by" value={formatNoteAddedBySource(note.addedBy)} />
          <InspectorRow label="Modified" value={updatedStr} />
          <InspectorRow label="Words" value={String(wordCount)} />
          {note.noteType && note.noteType !== 'default' ? (
            <InspectorRow label="Type" value={capitalize(note.noteType)} />
          ) : null}
          {note.isPublic ? (
            <InspectorRow label="Sharing" value="Public" />
          ) : null}
        </div>
      </section>

      <section className="proto-inspector-section">
        <p className="proto-inspector-section-title">Tags</p>
        <PrototypeFolderTagEditor note={note} tagsOnly />
      </section>

      {/* Connected Notes section */}
      <section className="proto-inspector-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p className="proto-inspector-section-title" style={{ marginBottom: 0 }}>Connected Notes</p>
          {spaceId ? (
            <button
              type="button"
              className="proto-inspector-connect-btn"
              title="Connect another note"
              aria-label="Connect another note"
              onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                setConnectAnchorRect(e.currentTarget.getBoundingClientRect());
                setConnectOpen(true);
              }}
            >
              <Icon name="plus" size={12} aria-hidden />
              Connect
            </button>
          ) : null}
        </div>
        {hasConnections ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {linkedFromNotes.map((n) => (
                <ConnectedNoteRow key={n.id} note={n} direction="from" currentNoteId={note.id} />
              ))}
              {linkedToNotes.map((n) => (
                <ConnectedNoteRow key={n.id} note={n} direction="to" currentNoteId={note.id} />
              ))}
            </div>
            <button
              type="button"
              className="proto-inspector-view-thread"
              onClick={(e) => { setThreadsAnchorRect(e.currentTarget.getBoundingClientRect()); setThreadsOpen(true); }}
            >
              <Icon name="eye" size={11} aria-hidden />
              <span>View threads</span>
            </button>
          </>
        ) : (
          <p className="proto-inspector-muted">No connections yet.</p>
        )}
      </section>

      <section className="proto-inspector-section">
        <p className="proto-inspector-section-title">Folders</p>
        <PrototypeFolderTagEditor note={note} folderOnly />
      </section>

      {spaceId ? (
        <PrototypeConnectNoteSheet
          open={connectOpen}
          onOpenChange={setConnectOpen}
          spaceId={spaceId}
          parentNoteId={note.id}
          anchorRect={connectAnchorRect}
        />
      ) : null}

      <PrototypeStudyThreadPopover
        open={threadsOpen}
        onOpenChange={setThreadsOpen}
        noteId={note.id}
        spaceId={spaceId ?? ''}
        anchorRect={threadsAnchorRect}
      />

      {spaceId ? (
        <div className="proto-inspector-delete">
          <button
            type="button"
            className="proto-inspector-delete-btn"
            disabled={deleteNote.isPending}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Icon name="trash-can" size={12} aria-hidden />
            Delete note
          </button>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <ProtoConfirmDialog
          title="Delete this note"
          message="This cannot be undone."
          confirmLabel="Delete"
          busy={deleteNote.isPending}
          onConfirm={onDeleteConfirm}
          onCancel={() => {
            if (!deleteNote.isPending) setDeleteConfirmOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ConnectedNoteRow({
  note,
  direction,
  currentNoteId,
}: {
  note: LinkedNoteRef;
  direction: 'from' | 'to';
  currentNoteId: string;
}) {
  const disconnectNote = useDisconnectNote();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawTitle =
    note.noteType === 'resource' && (note.resourceTitle ?? '').trim()
      ? (note.resourceTitle ?? '').trim()
      : stripServerAutoUntitledNoteTitleForDisplay((note.title ?? '').trim()) || 'New Note';

  // direction 'from' means this note is the source (fromNoteId), current is the target (toNoteId).
  // direction 'to' means current is the source (fromNoteId), this note is the target (toNoteId).
  const fromNoteId = direction === 'from' ? note.id : currentNoteId;
  const toNoteId = direction === 'from' ? currentNoteId : note.id;

  const handleDisconnect = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      confirmTimerRef.current = setTimeout(() => setConfirmDisconnect(false), 2500);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDisconnect(false);
    disconnectNote.mutate({ fromNoteId, toNoteId });
  };

  return (
    <div className="proto-inspector-connected-note-row">
      <Link
        to={prototypeNoteRouteTo()}
        params={{ noteId: noteParamSlug(note.id) }}
        className="proto-inspector-connected-note"
      >
        <Icon
          name={direction === 'from' ? 'arrow-left' : 'arrow-right'}
          size={10}
          className="proto-inspector-connected-note__arrow"
          aria-hidden
        />
        <span className="proto-inspector-connected-note__title">{rawTitle}</span>
      </Link>
      <button
        type="button"
        className={`proto-inspector-disconnect-btn${confirmDisconnect ? ' proto-inspector-disconnect-btn--confirm' : ''}`}
        title={confirmDisconnect ? 'Tap again to confirm' : 'Disconnect'}
        aria-label={confirmDisconnect ? `Confirm disconnect from ${rawTitle}` : `Disconnect from ${rawTitle}`}
        disabled={disconnectNote.isPending}
        onClick={handleDisconnect}
      >
        ×
      </button>
    </div>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="proto-inspector-row">
      <span className="proto-inspector-row-label">{label}</span>
      <span className="proto-inspector-row-value">{value}</span>
    </div>
  );
}

function formatSimpleNoteId(id: number): string {
  return `N${String(id).padStart(3, '0')}`;
}

/** Matches native `NoteInspectorView.infoSimpleNoteIdRow`: label ID, tap copies `N###`, brief “Copied”. */
function InspectorSimpleNoteIdRow({ simpleNoteId }: { simpleNoteId: number }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const display = formatSimpleNoteId(simpleNoteId);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [display]);

  return (
    <div className="proto-inspector-row">
      <span className="proto-inspector-row-label">ID</span>
      <span className="proto-inspector-row-value">
        <button
          type="button"
          className="proto-inspector-note-id-btn"
          onClick={onCopy}
          title="Copy note ID"
          aria-label={`Copy note ID ${display}`}
        >
          {copied ? 'Copied' : display}
        </button>
      </span>
    </div>
  );
}

function estimateWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

function formatDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

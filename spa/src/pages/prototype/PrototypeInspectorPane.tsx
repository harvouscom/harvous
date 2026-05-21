/**
 * Prototype inspector pane — mirrors native NoteInspectorView.
 * Sections: Folder · Tags · Info
 * Standalone — no SPA CSS variables or shared styles.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteDetail } from '../../hooks/queries/useNote';
import { noteFolderMembershipLabels } from '@/utils/note-folder-display';
import { formatNoteAddedBySource } from '@/utils/note-added-by-display';
import Icon from '@/components/react/Icon';
import { useProtoShell } from '../../layouts/proto-shell-context';

interface PrototypeInspectorPaneProps {
  note: NoteDetail;
}

export default function PrototypeInspectorPane({ note }: PrototypeInspectorPaneProps) {
  const { prototypeFolderChip } = useProtoShell();
  const serverFolders = noteFolderMembershipLabels({
    primaryCollection: note.primaryCollection ?? null,
    secondaryCollections: note.secondaryCollections ?? [],
  });
  /** Draft chip from editor overrides server list when set for this note; empty string clears to “no folder”. */
  const displayFolders =
    prototypeFolderChip?.noteId === note.id
      ? prototypeFolderChip.label?.trim()
        ? [prototypeFolderChip.label.trim()]
        : []
      : serverFolders;
  const tags = note.tags ?? [];

  const createdStr = note.createdAt ? formatDate(new Date(note.createdAt)) : '—';
  const updatedStr = note.updatedAt ? formatDate(new Date(note.updatedAt)) : '—';

  const wordCount = estimateWords(note.content ?? '');

  return (
    <div className="proto-inspector">
      {/* Folder section */}
      <section className="proto-inspector-section">
        <p className="proto-inspector-section-title">Folder</p>
        {displayFolders.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="folder" size={13} style={{ opacity: 0.45, flexShrink: 0 }} />
            <span className="proto-inspector-body">{displayFolders.join(' · ')}</span>
          </div>
        ) : (
          <p className="proto-inspector-muted">No folder — auto-generated from note content.</p>
        )}
      </section>

      {/* Tags section */}
      <section className="proto-inspector-section">
        <p className="proto-inspector-section-title">Tags</p>
        {tags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tags.map((t) => (
              <span key={t.id} className="proto-inspector-tag">
                {t.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="proto-inspector-muted">No tags yet. Add them in the classic app.</p>
        )}
      </section>

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
            <InspectorRow label="Visibility" value="Public" />
          ) : null}
        </div>
      </section>
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

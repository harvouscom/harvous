import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from '@/utils/toast';
import { useShareNote } from '../../../hooks/mutations/useShareNote';
import { mySharingQueryKey, useMySharing, type SharedNoteItem } from '../../../hooks/queries/useMySharing';
import { useQueryClient } from '@tanstack/react-query';
import { SettingsGroup, SettingsShell } from './SettingsShell';
import { noteParamSlug } from '../proto-route-slugs';

export default function PrototypeSharingPage() {
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const sharingQuery = useMySharing();
  const shareNote = useShareNote();
  const queryClient = useQueryClient();

  const notes = sharingQuery.data?.notes ?? [];
  const isEmpty = !sharingQuery.isLoading && !sharingQuery.error && notes.length === 0;

  const handleDisableNote = async (note: SharedNoteItem) => {
    setDisablingId(note.id);
    try {
      await shareNote.mutateAsync({ noteId: note.id, action: 'disable' });
      await queryClient.invalidateQueries({ queryKey: mySharingQueryKey });
      toast.success('Note is now private');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not stop sharing');
    } finally {
      setDisablingId(null);
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <SettingsShell title="Sharing">
      <p className="pds-caption" style={{ margin: '0 0 16px', color: 'var(--pds-text-secondary)' }}>
        Notes you have shared. Stop sharing to make them private again.
      </p>

      {sharingQuery.isLoading ? (
        <p className="pds-caption" style={{ marginTop: 20, color: 'var(--pds-text-secondary)' }}>Loading…</p>
      ) : null}

      {sharingQuery.error ? (
        <p className="pds-caption" style={{ marginTop: 20, color: 'var(--pds-destructive)' }}>
          Could not load shared notes.
        </p>
      ) : null}

      {isEmpty ? (
        <p className="pds-caption" style={{ marginTop: 20, color: 'var(--pds-text-secondary)' }}>
          Nothing shared yet. Use Share on a note to create a public link.
        </p>
      ) : null}

      {notes.length > 0 ? (
        <SettingsGroup>
          {notes.map((note) => (
            <div key={note.id} className="proto-sharing-row">
              <Link
                to="/prototype/n/$noteId"
                params={{ noteId: noteParamSlug(note.id) }}
                search={{}}
                className="proto-sharing-row__title"
              >
                {note.title || 'Untitled note'}
              </Link>
              <div className="proto-sharing-row__actions">
                <button type="button" className="proto-sharing-action" onClick={() => handleCopyLink(note.shareUrl)}>
                  Copy link
                </button>
                <button
                  type="button"
                  className="proto-sharing-action proto-sharing-action--destructive"
                  disabled={disablingId === note.id}
                  onClick={() => handleDisableNote(note)}
                >
                  {disablingId === note.id ? '…' : 'Stop sharing'}
                </button>
              </div>
            </div>
          ))}
        </SettingsGroup>
      ) : null}
    </SettingsShell>
  );
}

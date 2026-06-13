import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { toast } from '@/utils/toast';
import { useShareNote } from '../../../hooks/mutations/useShareNote';
import { mySharingQueryKey, useMySharing, type SharedNoteItem } from '../../../hooks/queries/useMySharing';
import { useQueryClient } from '@tanstack/react-query';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';
import { noteParamSlug } from '../proto-route-slugs';

/** Middle-truncate long share URLs for one-line list preview. */
function truncateShareUrl(url: string, maxLength = 48): string {
  if (url.length <= maxLength) return url;
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname + parsed.search;
    const prefix = `${parsed.host}${tail.slice(0, 8)}`;
    const suffix = tail.slice(-16);
    return `${prefix}…${suffix}`;
  } catch {
    return `${url.slice(0, maxLength - 1)}…`;
  }
}

export default function PrototypeSharingPage() {
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
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

  const handleCopyLink = async (noteId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedNoteId(noteId);
      window.setTimeout(() => {
        setCopiedNoteId((current) => (current === noteId ? null : current));
      }, 1400);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <SettingsShell>
      <SettingsIntro>See what you have shared and stop sharing.</SettingsIntro>

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
          {notes.map((note, index) => {
            const isCopied = copiedNoteId === note.id;
            const isLast = index === notes.length - 1;

            return (
              <div key={note.id} className={`proto-sharing-row${isLast ? ' proto-sharing-row--last' : ''}`}>
                <Link
                  to={prototypeNoteRouteTo()}
                  params={{ noteId: noteParamSlug(note.id) }}
                  search={{}}
                  className="proto-sharing-row__title pds-list-title"
                >
                  {note.title || 'Untitled note'}
                </Link>
                <p className="proto-sharing-row__url" title={note.shareUrl}>
                  {truncateShareUrl(note.shareUrl)}
                </p>
                <div className="proto-sharing-row__actions">
                  <button
                    type="button"
                    className="proto-sharing-row__copy"
                    onClick={() => handleCopyLink(note.id, note.shareUrl)}
                    aria-label={isCopied ? 'Link copied' : 'Copy share link'}
                  >
                    {isCopied ? (
                      <>
                        <Icon name="check" size={14} aria-hidden />
                        Copied
                      </>
                    ) : (
                      <>
                        <Icon name="copy" size={14} aria-hidden />
                        Copy link
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="proto-sharing-row__stop"
                    disabled={disablingId === note.id}
                    onClick={() => handleDisableNote(note)}
                  >
                    {disablingId === note.id ? 'Working…' : 'Stop sharing'}
                  </button>
                </div>
              </div>
            );
          })}
        </SettingsGroup>
      ) : null}
    </SettingsShell>
  );
}

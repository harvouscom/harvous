import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { toast } from '@/utils/toast';
import { useShareNote } from '../../../hooks/mutations/useShareNote';
import { mySharingQueryKey, useMySharing, type SharedNoteItem } from '../../../hooks/queries/useMySharing';
import { useQueryClient } from '@tanstack/react-query';
import { SettingsCopyRow, SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';
import { protoRelativeCaptionAbbrev } from '../proto-time';
import { noteParamSlug } from '../proto-route-slugs';

function SharingNoteRecencyLine({ rel, preview }: { rel?: string; preview?: string }) {
  if (!rel && !preview) return null;
  return (
    <div className="pds-list-preview proto-note-row__preview proto-sharing-card__preview">
      {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
      {rel && preview ? '  ' : null}
      {preview ? <span>{preview}</span> : null}
    </div>
  );
}

/** Share links in settings omit the protocol prefix. */
function displayShareUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

/** Middle-truncate long share URLs for one-line list preview. */
function truncateShareUrl(url: string, maxLength = 48): string {
  const displayUrl = displayShareUrl(url);
  if (displayUrl.length <= maxLength) return displayUrl;
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname + parsed.search;
    const prefix = `${parsed.host}${tail.slice(0, 8)}`;
    const suffix = tail.slice(-16);
    return `${prefix}…${suffix}`;
  } catch {
    return `${displayUrl.slice(0, maxLength - 1)}…`;
  }
}

export default function PrototypeSharingPage() {
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [confirmRefreshId, setConfirmRefreshId] = useState<string | null>(null);
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

  const handleRefreshNote = async (note: SharedNoteItem) => {
    setRefreshingId(note.id);
    try {
      await shareNote.mutateAsync({ noteId: note.id, action: 'refresh' });
      await queryClient.invalidateQueries({ queryKey: mySharingQueryKey });
      setConfirmRefreshId(null);
      toast.success('New share link created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create a new link');
    } finally {
      setRefreshingId(null);
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

      {notes.map((note) => {
        const isRefreshing = refreshingId === note.id;
        const isConfirmingRefresh = confirmRefreshId === note.id;
        const isRowBusy = disablingId === note.id || isRefreshing;
        const rel = protoRelativeCaptionAbbrev(note.updatedAt ?? note.createdAt ?? null);
        const preview = note.preview?.trim() || undefined;

        return (
          <SettingsGroup key={note.id}>
            <div className="proto-sharing-card">
              <Link
                to={prototypeNoteRouteTo()}
                params={{ noteId: noteParamSlug(note.id) }}
                search={{}}
                className="proto-sharing-card__title pds-list-title"
              >
                {note.title || 'Untitled note'}
              </Link>

              <SharingNoteRecencyLine rel={rel || undefined} preview={preview} />

              <SettingsCopyRow
                value={truncateShareUrl(note.shareUrl)}
                copyValue={note.shareUrl}
                href={note.shareUrl}
                hrefTarget="_blank"
                title={displayShareUrl(note.shareUrl)}
                mono
                layout="field"
                copyLabel="Copy link"
                copyErrorMessage="Could not copy link"
                disabled={isRowBusy}
              />

              {isConfirmingRefresh ? (
                <div className="proto-sharing-card__confirm">
                  <p className="proto-sharing-card__confirm-prompt">
                    Create a new link? The old link will stop working.
                  </p>
                  <div className="proto-sharing-card__actions">
                    <button
                      type="button"
                      className="proto-thread-review__dismiss"
                      disabled={isRowBusy}
                      onClick={() => setConfirmRefreshId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="proto-thread-review__btn proto-thread-review__btn--primary"
                      disabled={isRowBusy}
                      onClick={() => handleRefreshNote(note)}
                    >
                      {isRefreshing ? 'Working…' : 'Get new link'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="proto-sharing-card__actions">
                  <button
                    type="button"
                    className="proto-thread-review__dismiss proto-thread-review__dismiss--danger"
                    disabled={isRowBusy}
                    onClick={() => handleDisableNote(note)}
                  >
                    {disablingId === note.id ? 'Working…' : 'Stop sharing'}
                  </button>
                  <button
                    type="button"
                    className="proto-thread-review__dismiss"
                    disabled={isRowBusy}
                    onClick={() => setConfirmRefreshId(note.id)}
                  >
                    Get a new link
                  </button>
                </div>
              )}
            </div>
          </SettingsGroup>
        );
      })}
    </SettingsShell>
  );
}

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import Icon, { type IconName } from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { toast } from '@/utils/toast';
import { useShareNote } from '../../../hooks/mutations/useShareNote';
import { mySharingQueryKey, useMySharing, type SharedNoteItem } from '../../../hooks/queries/useMySharing';
import { useQueryClient } from '@tanstack/react-query';
import { SettingsGroup, SettingsShell } from './SettingsShell';
import { protoRelativeCaptionAbbrev } from '../proto-time';
import { noteParamSlug } from '../proto-route-slugs';
import { useDeletedSpaces, type DeletedSpaceItem } from '../../../hooks/queries/useDeletedSpaces';
import { useRestoreSpace } from '../../../hooks/mutations/useRestoreSpace';
import { APIError } from '../../../lib/api';
import ProtoSpaceMenuIcon from '../ProtoSpaceMenuIcon';

type SharedItemKind = 'note' | 'thread' | 'space';

/** Leading icon tile for shared-item cards — matches Settings > Add-ons rows. */
export function resolveSharedItemLeadingMeta(kind: SharedItemKind): {
  icon: IconName;
  label: string;
} {
  switch (kind) {
    case 'thread':
      return { icon: 'layer-group', label: 'Thread' };
    case 'space':
      return { icon: 'user-group', label: 'Space' };
    case 'note':
    default:
      return { icon: 'note-sticky', label: 'Note' };
  }
}

/** Share links in settings omit the protocol prefix. */
function displayShareUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}


const RECOVERY_DAY_MS = 24 * 60 * 60 * 1000;

export function deletedSpaceDaysRemaining(recoveryUntil: string, now = Date.now()): number {
  const recoveryTime = new Date(recoveryUntil).getTime();
  if (!Number.isFinite(recoveryTime)) return 0;
  return Math.max(0, Math.ceil((recoveryTime - now) / RECOVERY_DAY_MS));
}

export function deletedSpacesSectionState(input: {
  isLoading: boolean;
  isError: boolean;
  rowCount: number;
}): 'loading' | 'error' | 'hidden' | 'rows' {
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  return input.rowCount > 0 ? 'rows' : 'hidden';
}

function deletedSpaceRecoveryLabel(space: DeletedSpaceItem): string {
  const days = deletedSpaceDaysRemaining(space.recoveryUntil);
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(space.recoveryUntil),
  );
  const daysLabel = `${days} day${days === 1 ? '' : 's'} left`;
  return `Recoverable until ${date} · ${daysLabel}`;
}

async function copyShareLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    toast.error('Could not copy link');
    return false;
  }
}

export default function PrototypeSharingPage() {
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [confirmRefreshId, setConfirmRefreshId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const sharingQuery = useMySharing();
  const deletedSpacesQuery = useDeletedSpaces();
  const shareNote = useShareNote();
  const restoreSpace = useRestoreSpace();
  const queryClient = useQueryClient();

  const notes = sharingQuery.data?.notes ?? [];
  const deletedSpaces = deletedSpacesQuery.data?.spaces ?? [];
  const isEmpty = !sharingQuery.isLoading && !sharingQuery.error && notes.length === 0;
  const deletedSectionState = deletedSpacesSectionState({
    isLoading: deletedSpacesQuery.isLoading,
    isError: Boolean(deletedSpacesQuery.error),
    rowCount: deletedSpaces.length,
  });

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

  const handleCopyNote = async (note: SharedNoteItem) => {
    const ok = await copyShareLink(note.shareUrl);
    if (!ok) return;
    setCopiedId(note.id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === note.id ? null : current));
    }, 1400);
  };

  const handleRestoreSpace = async (space: DeletedSpaceItem) => {
    try {
      await restoreSpace.mutateAsync(space.id);
      toast.success(`Restored ${space.title}`);
    } catch (err) {
      const message =
        err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not restore space';
      toast.error(message);
    }
  };

  return (
    <SettingsShell wide>
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
          <div className="proto-sharing-list">
            {notes.map((note) => {
              const isRefreshing = refreshingId === note.id;
              const isConfirmingRefresh = confirmRefreshId === note.id;
              const isRowBusy = disablingId === note.id || isRefreshing;
              const rel = protoRelativeCaptionAbbrev(note.updatedAt ?? note.createdAt ?? null);
              const preview = note.preview?.trim() || undefined;
              const { icon, label } = resolveSharedItemLeadingMeta('note');
              const metaParts = [rel || undefined, preview].filter(Boolean) as string[];

              return (
                <div key={note.id} className="proto-sharing-card">
                  <span
                    className="proto-settings-list-row__leading"
                    aria-label={label}
                    title={label}
                  >
                    <Icon name={icon} size={18} />
                  </span>

                  <div className="proto-sharing-card__main">
                    <Link
                      to={prototypeNoteRouteTo()}
                      params={{ noteId: noteParamSlug(note.id) }}
                      search={{}}
                      className="proto-sharing-card__title pds-list-title"
                    >
                      {note.title || 'Untitled note'}
                    </Link>

                    {metaParts.length > 0 ? (
                      <span className="pds-list-preview proto-sharing-card__meta">
                        {metaParts.map((part, index) => (
                          <span key={`${note.id}-meta-${index}`}>
                            {index > 0 ? ' · ' : null}
                            {index === 0 && rel ? (
                              <span className="pds-list-timestamp">{part}</span>
                            ) : (
                              part
                            )}
                          </span>
                        ))}
                      </span>
                    ) : null}

                  </div>

                  {/*
                    * Everything you can do to a link, on one line beside it.
                    *
                    * These used to stack under the title with the share URL above them, which
                    * made every row four lines tall and led with the one thing nobody reads:
                    * `/shared/note/1WlqeTV6099T` says nothing the title does not, since every
                    * link looks like that. Copy takes it, the title opens the note, and the
                    * address itself is on the button's tooltip for anyone who wants to see it.
                    */}
                  <span className="proto-sharing-card__actions">
                    {isConfirmingRefresh ? (
                      <>
                        <span className="proto-sharing-card__confirm-prompt">
                          Replace this link? The old one stops working.
                        </span>
                        <button
                          type="button"
                          className="proto-sharing-card__text-action"
                          disabled={isRowBusy}
                          onClick={() => setConfirmRefreshId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="proto-sharing-card__text-action proto-sharing-card__text-action--accent"
                          disabled={isRowBusy}
                          onClick={() => void handleRefreshNote(note)}
                        >
                          {isRefreshing ? 'Working…' : 'Replace'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="proto-sharing-card__text-action"
                          disabled={isRowBusy}
                          onClick={() => setConfirmRefreshId(note.id)}
                        >
                          New link
                        </button>
                        <button
                          type="button"
                          className="proto-sharing-card__text-action proto-sharing-card__text-action--danger"
                          disabled={isRowBusy}
                          onClick={() => void handleDisableNote(note)}
                        >
                          {disablingId === note.id ? 'Working…' : 'Stop sharing'}
                        </button>
                        <button
                          type="button"
                          className="proto-thread-review__dismiss"
                          disabled={isRowBusy}
                          onClick={() => void handleCopyNote(note)}
                          title={displayShareUrl(note.shareUrl)}
                          aria-label={copiedId === note.id ? 'Copied' : 'Copy link'}
                        >
                          {copiedId === note.id ? 'Copied' : 'Copy'}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </SettingsGroup>
      ) : null}

      {deletedSectionState !== 'hidden' ? (
        <section className="proto-sharing-deleted" aria-labelledby="proto-sharing-deleted-title">
          <h2 id="proto-sharing-deleted-title" className="pds-inspector-label proto-sharing-deleted__title">
            Recently deleted spaces
          </h2>

          {deletedSectionState === 'loading' ? (
            <p className="pds-caption proto-sharing-deleted__status" role="status">
              Loading recently deleted spaces…
            </p>
          ) : null}

          {deletedSectionState === 'error' ? (
            <div className="proto-sharing-deleted__status" role="alert">
              <span className="pds-caption">Could not load recently deleted spaces.</span>
              <button
                type="button"
                className="proto-thread-review__dismiss"
                onClick={() => void deletedSpacesQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}

          {deletedSectionState === 'rows' ? (
            <SettingsGroup>
              <div className="proto-sharing-deleted__list">
                {deletedSpaces.map((space) => {
                  const isRestoring = restoreSpace.isPending && restoreSpace.variables === space.id;
                  return (
                    <div key={space.id} className="proto-sharing-deleted__row">
                      <span
                        className="proto-settings-list-row__leading proto-sharing-deleted__space-icon"
                        aria-hidden
                      >
                        <ProtoSpaceMenuIcon
                          color={space.color || 'paper'}
                          size={40}
                          radius={10}
                          glyphSize={18}
                        />
                      </span>
                      <span className="proto-sharing-deleted__main">
                        <span className="pds-list-title">{space.title}</span>
                        <span className="pds-list-preview">{deletedSpaceRecoveryLabel(space)}</span>
                      </span>
                      <button
                        type="button"
                        className="proto-thread-review__dismiss"
                        disabled={restoreSpace.isPending}
                        onClick={() => void handleRestoreSpace(space)}
                      >
                        {isRestoring ? 'Restoring…' : 'Restore'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </SettingsGroup>
          ) : null}
        </section>
      ) : null}
    </SettingsShell>
  );
}

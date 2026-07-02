/**
 * Shared/public space view — rendered in the sidebar's 'space' layer when the
 * active space is not the personal My Home. Foundation scope: browse the
 * space's notes with author attribution, manage people/invites (owner), and
 * compose directly into the space. Folders/threads/scripture index for shared
 * spaces are a fast-follow (see docs/SHARED_SPACES_DEV_NOTES.md).
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useNavigate } from '@tanstack/react-router';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { useSpace, useSpaceNotes, useSpaceMembers, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import { useCreateSimpleNote, alertCreateNoteFailure } from '../../hooks/mutations/useCreateSimpleNote';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import PrototypeSpacePeopleSheet from './PrototypeSpacePeopleSheet';

const PREVIEW_MAX = 80;

function noteRowTitle(note: SpaceNoteRow): string {
  return (
    (note.noteType === 'resource' && note.resourceTitle ? note.resourceTitle : null) ??
    stripServerAutoUntitledNoteTitleForDisplay(note.title ?? null) ??
    `Note N${note.simpleNoteId?.toString().padStart(3, '0') ?? ''}`
  );
}

function noteRowPreview(note: SpaceNoteRow): string {
  const raw = note.content ?? '';
  if (!raw.trim()) return '';
  return stripHtmlForListPreview(raw, PREVIEW_MAX);
}

function noteKindIcon(noteType: string | undefined): 'note-sticky' | 'book' | 'link' {
  if (noteType === 'scripture') return 'book';
  if (noteType === 'resource') return 'link';
  return 'note-sticky';
}

export default function PrototypeSidebarSharedSpaceView() {
  const navigate = useNavigate();
  const { activeSpaceId, isOwner } = useActiveSpace();
  const [peopleOpen, setPeopleOpen] = useState(false);

  const spaceQuery = useSpace(activeSpaceId ?? '');
  const notesQuery = useSpaceNotes(activeSpaceId ?? '', 20, { pollWhileActive: true });
  const membersQuery = useSpaceMembers(activeSpaceId ?? '');
  const createNote = useCreateSimpleNote();

  const notes = useMemo(
    () => notesQuery.data?.pages.flatMap((page) => page.notes) ?? [],
    [notesQuery.data],
  );

  const space = spaceQuery.data;
  const memberCount = membersQuery.data?.memberCount ?? space?.memberCount ?? 0;
  const peopleCount = memberCount + 1; // +1 for the owner

  async function handleCompose() {
    if (!activeSpaceId || createNote.isPending) return;
    try {
      const result = await createNote.mutateAsync({ spaceId: activeSpaceId, allowOffline: false });
      const noteId = 'note' in result ? result.note?.id : undefined;
      if (noteId) {
        void navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(noteId) } });
      }
    } catch (err) {
      alertCreateNoteFailure(err);
    }
  }

  if (!activeSpaceId) return null;

  return (
    <div className="proto-sidebar-root">
      <div
        className="proto-sidebar-home__header"
        style={{
          padding: '14px 16px 10px',
          borderBottom: '0.5px solid var(--pds-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              flexShrink: 0,
              background: space?.backgroundGradient || `var(--color-${space?.color || 'paper'})`,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="pds-list-title"
              style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {space?.title ?? 'Shared space'}
            </div>
            <button
              type="button"
              onClick={() => setPeopleOpen(true)}
              style={{
                appearance: 'none',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--pds-text-secondary)',
                fontSize: 12,
              }}
            >
              <Icon name="user-group" size={11} aria-hidden />
              {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
              {isOwner ? ' · Invite' : ''}
            </button>
          </div>
          <button
            type="button"
            className="proto-toolbar-icon-btn"
            title="Compose in this space"
            aria-label="New note in this space"
            disabled={createNote.isPending}
            onClick={() => void handleCompose()}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
      </div>

      <div className="proto-sidebar-list-view" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {notesQuery.isLoading ? (
          <div className="page-loading" />
        ) : notes.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--pds-text-secondary)', fontSize: 13 }}>
            No notes yet. Tap + to start the first one.
          </div>
        ) : (
          <ul className="proto-note-list">
            {notes.map((note) => (
              <li key={note.id} className="proto-note-row-item">
                <button
                  type="button"
                  className="proto-note-row__main"
                  onClick={() =>
                    navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(note.id) } })
                  }
                >
                  <div className="proto-note-row__title-line">
                    <span className="proto-note-row__kind-icon" aria-hidden>
                      <Icon name={noteKindIcon(note.noteType)} size={11} />
                    </span>
                    <span className="pds-list-title proto-note-row__title-text">{noteRowTitle(note)}</span>
                  </div>
                  <div className="pds-list-preview proto-note-row__preview">
                    {!note.isOwnNote && note.authorDisplayName ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          marginRight: 6,
                          color: `var(--color-${note.authorColor || 'blue'})`,
                          fontWeight: 600,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: `var(--color-${note.authorColor || 'blue'})`,
                            display: 'inline-block',
                          }}
                        />
                        {note.authorDisplayName}
                      </span>
                    ) : null}
                    <span className="pds-list-timestamp">{protoRelativeCaptionAbbrev(note.lastUpdated ?? note.updatedAt)}</span>
                    {noteRowPreview(note) ? <span>  {noteRowPreview(note)}</span> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {notesQuery.hasNextPage ? (
          <button
            type="button"
            className="proto-menu-item"
            style={{ margin: '8px 16px' }}
            disabled={notesQuery.isFetchingNextPage}
            onClick={() => void notesQuery.fetchNextPage()}
          >
            <span className="proto-menu-item__label">
              {notesQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </span>
          </button>
        ) : null}
      </div>

      <PrototypeSpacePeopleSheet
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        spaceId={activeSpaceId}
        spaceTitle={space?.title ?? 'this space'}
      />
    </div>
  );
}

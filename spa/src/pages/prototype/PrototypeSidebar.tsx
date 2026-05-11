import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { useSpaceNotes, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../../hooks/queries/useNote';
import { effectiveNoteFolderLabel } from '@/utils/note-folder-display';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { protoRelativeCaption } from './proto-time';

interface FolderBucket {
  name: string | null;
  count: number;
  mostRecentIso: string | null;
}

function spaceSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

function noteParamSlug(id: string) {
  return id.startsWith('note_') ? id.slice('note_'.length) : id;
}

function stripHtmlPreview(html: string | null | undefined, max = 80) {
  if (!html) return '';
  const t = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function buildFolders(notes: SpaceNoteRow[]): FolderBucket[] {
  const buckets = new Map<string, { count: number; mostRecentIso: string | null }>();
  for (const note of notes) {
    const n = note as SpaceNoteRow & { primaryCollection?: string | null; secondaryCollections?: string[] };
    const label = effectiveNoteFolderLabel({
      primaryCollection: n.primaryCollection ?? null,
      secondaryCollections: n.secondaryCollections ?? [],
    });
    const key = label ?? '__none__';
    const existing = buckets.get(key) ?? { count: 0, mostRecentIso: null };
    existing.count += 1;
    const iso = note.updatedAt ?? note.createdAt ?? null;
    if (iso && (!existing.mostRecentIso || iso > existing.mostRecentIso)) {
      existing.mostRecentIso = iso;
    }
    buckets.set(key, existing);
  }
  const result: FolderBucket[] = [];
  buckets.forEach((v, k) => {
    result.push({ name: k === '__none__' ? null : k, count: v.count, mostRecentIso: v.mostRecentIso });
  });
  // Named folders first, sorted by most recent; ungrouped at end
  return result.sort((a, b) => {
    if (a.name === null) return 1;
    if (b.name === null) return -1;
    if (a.mostRecentIso && b.mostRecentIso) return b.mostRecentIso.localeCompare(a.mostRecentIso);
    return 0;
  });
}

export default function PrototypeSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    closeDrawer,
    isMobileSidebar,
    sidebarListMode: mode,
    setSidebarListMode,
    sidebarFolderDrilldown: activeFolderKey,
    setSidebarFolderDrilldown: setActiveFolderKey,
  } = useProtoShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { spaceId: spaceSlugParam } = useParams({ strict: false }) as { spaceId?: string };
  const spaceId = spaceSlugParam ? (spaceSlugParam.startsWith('space_') ? spaceSlugParam : `space_${spaceSlugParam}`) : null;

  const {
    data: pages,
    isLoading: notesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSpaceNotes(spaceId ?? '');

  const [q, setQ] = useState('');

  const notes = useMemo(() => {
    if (!pages?.pages) return [];
    return pages.pages.flatMap((p) => p.notes);
  }, [pages]);

  const noteMatch = pathname.match(/\/prototype\/space\/[^/]+\/n\/([^/]+)/);
  const activeNoteSlug = noteMatch?.[1];
  const activeNoteFullId = activeNoteSlug
    ? activeNoteSlug.startsWith('note_')
      ? activeNoteSlug
      : `note_${activeNoteSlug}`
    : undefined;

  /* Notes to show in notes mode (or when drilling into a folder) */
  const notesForMode = useMemo(() => {
    const base =
      activeFolderKey !== undefined
        ? notes.filter((n) => {
            const enriched = n as SpaceNoteRow & { primaryCollection?: string | null; secondaryCollections?: string[] };
            const key =
              effectiveNoteFolderLabel({
                primaryCollection: enriched.primaryCollection ?? null,
                secondaryCollections: enriched.secondaryCollections ?? [],
              }) ?? null;
            return key === activeFolderKey;
          })
        : notes;
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((n) => {
      const title = (n.title ?? '').toLowerCase();
      const body = stripHtmlPreview(n.content, 800).toLowerCase();
      return title.includes(t) || body.includes(t);
    });
  }, [notes, q, activeFolderKey]);

  /* Folder buckets for folders mode */
  const folders = useMemo(() => buildFolders(notes), [notes]);
  const filteredFolders = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return folders;
    return folders.filter((c) => (c.name ?? 'No folder').toLowerCase().includes(t));
  }, [folders, q]);

  const prefetchNote = useCallback(
    (row: SpaceNoteRow) => {
      if (!spaceId) return;
      const listSeed: ListNoteForSeed = {
        id: row.id,
        title: row.title ?? '',
        content: row.content ?? '',
        noteType: (row.noteType as ListNoteForSeed['noteType']) || 'default',
        contentEncrypted: row.contentEncrypted === true,
        resourceTitle: row.resourceTitle ?? null,
        userId: undefined,
        threadId: 'thread_unorganized',
        spaceId,
        createdAt: row.createdAt ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
      };
      seedNoteFromList(queryClient, listSeed, {
        id: 'thread_unorganized',
        title: '',
        color: null,
        backgroundGradient: '',
      });
      queryClient.prefetchQuery(getNoteQueryOptions(row.id)).catch(() => {});
    },
    [queryClient, spaceId],
  );

  const afterNav = useCallback(() => {
    if (isMobileSidebar) closeDrawer();
  }, [closeDrawer, isMobileSidebar]);

  const onNoteRow = (row: SpaceNoteRow) => {
    if (!spaceId) return;
    navigate({
      to: '/prototype/space/$spaceId/n/$noteId',
      params: { spaceId: spaceSlug(spaceId), noteId: noteParamSlug(row.id) },
    });
    afterNav();
  };

  const renderSidebarNoteRow = (row: SpaceNoteRow) => {
    const active = !!(activeNoteFullId && row.id === activeNoteFullId);
    const iso = row.updatedAt ?? row.createdAt ?? null;
    const rel = protoRelativeCaption(iso);
    const preview = stripHtmlPreview(row.content, 80);
    const line = rel && preview ? `${rel}  ${preview}` : rel || preview;
    return (
      <li key={row.id}>
        <button
          type="button"
          className="proto-note-row"
          data-active={active ? 'true' : 'false'}
          onClick={() => onNoteRow(row)}
          onMouseEnter={() => prefetchNote(row)}
          onFocus={() => prefetchNote(row)}
        >
          <div className="pds-list-title">{row.title?.trim() || 'Untitled Note'}</div>
          {line ? <div className="pds-list-preview">{line}</div> : null}
        </button>
      </li>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="proto-sidebar-root">
      {/* Search input */}
      <div className="proto-sidebar-search">
        <span className="proto-sidebar-search__icon" aria-hidden>
          <Icon name="magnifying-glass" size={14} />
        </span>
        <input
          type="search"
          placeholder="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          aria-label="Search"
        />
      </div>

      <div className="proto-sidebar-scroll">
        {spaceId ? (
          /* ── Inside a space ──────────────────────────────────────────── */
          <>
            {mode === 'notes' ? (
              /* ── Notes mode ────────────────────────────────────────── */
              <>
                {notesLoading && notesForMode.length === 0 ? (
                  <p className="proto-caption" style={{ padding: '12px 18px' }}>Loading notes…</p>
                ) : notesForMode.length === 0 ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    {q.trim() ? 'No notes match.' : 'No notes yet.'}
                  </p>
                ) : (
                  <ul className="proto-note-list">{notesForMode.map((row) => renderSidebarNoteRow(row))}</ul>
                )}
                {hasNextPage ? (
                  <div style={{ padding: '0 18px 16px', textAlign: 'center' }}>
                    <button
                      type="button"
                      className="proto-caption"
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage()}
                      style={{
                        border: '0.5px solid var(--pds-border)',
                        borderRadius: 8,
                        padding: '7px 14px',
                        background: 'rgba(255,255,255,0.6)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              /* ── Folders mode ──────────────────────────────────────── */
              <>
                {activeFolderKey !== undefined ? (
                  /* Drill-down into a folder */
                  <>
                    <div style={{ padding: '0 18px 8px' }}>
                      <button
                        type="button"
                        className="proto-sidebar-back-btn"
                        onClick={() => { setActiveFolderKey(undefined); setQ(''); }}
                      >
                        <Icon name="chevron-left" size={10} />
                        Folders
                      </button>
                      <div className="pds-list-title" style={{ fontWeight: 600 }}>
                        {activeFolderKey ?? 'No folder'}
                      </div>
                    </div>
                    {notesForMode.length === 0 ? (
                      <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>No notes in this folder.</p>
                    ) : (
                      <ul className="proto-note-list">{notesForMode.map((row) => renderSidebarNoteRow(row))}</ul>
                    )}
                  </>
                ) : (
                  /* Folder list */
                  notesLoading && filteredFolders.length === 0 ? (
                    <p className="proto-caption" style={{ padding: '12px 18px' }}>Loading…</p>
                  ) : filteredFolders.length === 0 ? (
                    <div className="proto-main-empty" style={{ minHeight: 120 }}>
                      <svg width="28" height="28" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.28 }}>
                        <rect x="1" y="4" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
                        <rect x="3.5" y="2" width="9" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                      <span>No folders yet.</span>
                    </div>
                  ) : (
                    <ul className="proto-note-list">
                      {filteredFolders.map((col) => (
                        <li key={col.name ?? '__none__'}>
                          <button
                            type="button"
                            className="proto-note-row"
                            onClick={() => setActiveFolderKey(col.name)}
                          >
                            <div className="pds-list-title">{col.name ?? 'No folder'}</div>
                            <div className="pds-list-preview">
                              {col.count} note{col.count !== 1 ? 's' : ''}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </>
            )}
          </>
        ) : (
          <p className="proto-caption" style={{ padding: '14px 18px' }}>
            Select a space from the space dropdown.
          </p>
        )}
      </div>
    </div>
  );
}

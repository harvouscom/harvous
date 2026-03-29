import { useState, useCallback, useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import OrganizedContentList from '../../../src/components/react/OrganizedContentList';
import TabNav from '../../../src/components/react/TabNav';
import CreateNoteButton from '../../../src/components/react/CreateNoteButton';
import CardStack from '../components/CardStack';
import { useDashboardContent } from '../hooks/queries/useDashboard';
import { useProfile } from '../hooks/queries/useProfile';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import { useIsMobile } from '../hooks/useIsMobile';

type DashboardFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources';

const TABS: Array<{ id: DashboardFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'threads',   label: 'Threads' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
];

export default function DashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DashboardFilter>('all');
  const { isSuccess: profileSuccess } = useProfile();

  // Fire immediately — cookie auth works before Clerk loads. Scripture refs are picked up by the background refetch below.
  const { data: cachedContent, dataUpdatedAt, isFetching, refetch: refetchContent } = useDashboardContent(filter, 30);
  const cachedItems = cachedContent?.pages.flatMap(p => p.items) ?? [];
  const lastPage = cachedContent?.pages?.length ? cachedContent.pages[cachedContent.pages.length - 1] : undefined;
  const initialHasMoreFromParent = lastPage?.hasMore;

  // One-time refetch after first content load when profile succeeded, so we pick up scripture refs if the first response didn't have them (e.g. cross-instance timing).
  const didRefetchForScriptureRef = useRef(false);
  useEffect(() => {
    if (!profileSuccess || !cachedItems.length || didRefetchForScriptureRef.current) return;
    didRefetchForScriptureRef.current = true;
    void refetchContent();
  }, [profileSuccess, cachedItems.length, refetchContent]);

  const isInitialLoading = cachedItems.length === 0 && isFetching;

  // Seed the note detail cache from dashboard content so notes open instantly (no empty flash).
  // Dashboard items include rawContent (full HTML) alongside the truncated preview.
  const seededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!cachedItems.length) return;
    for (const item of cachedItems) {
      const noteItem = item as any;
      if (noteItem.type !== 'note' || !noteItem.noteId) continue;
      if (seededRef.current.has(noteItem.noteId)) continue;
      seededRef.current.add(noteItem.noteId);

      const listNote: ListNoteForSeed = {
        id: noteItem.noteId,
        title: noteItem.rawTitle ?? noteItem.title,
        content: noteItem.rawContent ?? noteItem.content,
        contentEncrypted: noteItem.contentEncrypted,
        noteType: noteItem.noteType,
        threadId: noteItem.threadId,
        spaceId: noteItem.spaceId,
        simpleNoteId: noteItem.simpleNoteId ?? undefined,
        createdAt: noteItem.createdAt,
        updatedAt: noteItem.updatedAt,
        resourceTitle: noteItem.resourceTitle,
        resourceDescription: noteItem.resourceDescription,
        resourceImage: noteItem.resourceImage,
        version: noteItem.version,
        userId: noteItem.userId,
      };
      seedNoteFromList(queryClient, listNote, {
        id: noteItem.threadId ?? noteItem.noteId,
        title: noteItem.threadTitle ?? (noteItem.threadId === 'thread_unorganized' ? 'Unorganized' : 'Thread'),
        color: noteItem.threadColor ?? null,
        backgroundGradient: noteItem.threadBackgroundGradient ?? 'var(--color-gradient-gray)',
      });
    }
  }, [cachedItems, queryClient]);

  // Prefetch full note details on hover/touch as a backup
  const prefetchNote = useCallback((noteId: string) => {
    queryClient.prefetchQuery(getNoteQueryOptions(noteId));
  }, [queryClient]);

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));
  const isMobile = useIsMobile();

  return (
    <CardStack title="My Home" headerBgColor="var(--color-paper)" centerTitle isLoading={isInitialLoading}>
      <TabNav
        tabs={tabs}
        onTabChange={(id) => setFilter(id as DashboardFilter)}
        className="dashboard-tab-nav content-tabs"
      />
      <OrganizedContentList
        initialItems={cachedItems as any}
        filter={filter}
        userId={user?.id}
        dataGeneratedAt={cachedItems.length > 0 ? dataUpdatedAt : undefined}
        onNavigate={(href) => navigate({ to: href as any })}
        parentIsLoading={isInitialLoading}
        initialHasMoreFromParent={initialHasMoreFromParent}
        onNotePrefetch={prefetchNote}
      />
      {/* Spacer so the last item can scroll above the floating "Create a note" button */}
      <div data-cta-spacer className="create-note-cta-spacer" />
      {isMobile && <CreateNoteButton />}
    </CardStack>
  );
}

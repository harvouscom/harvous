import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHarvousIdentity } from '../useHarvousIdentity';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';

/**
 * What a listing looks like to anyone browsing.
 *
 * Mirrors `serializePublic` in server/routes/discover.ts exactly — no submitter,
 * no review state, and no `payload`. Installing is what hands over the content;
 * the catalog only shows you enough to decide.
 */
export type DiscoverListing = {
  slug: string;
  kind: 'template' | 'note' | 'pack' | 'resource';
  title: string;
  description: string | null;
  category: string | null;
  authorDisplayName: string | null;
  preview: DiscoverTemplatePreview | null;
  installCount: number;
  listedAt: string | Date | null;
};

/**
 * The shape of a listing without its body — enough to decide, never enough to
 * read. One type across kinds, because a row renders whichever fields are there:
 * a template has `headings`, a series has `titles` and `noteCount`, a link has
 * its domain. Kept in step with `DiscoverPreview` in harvous.com's
 * `src/lib/discover-data.ts`, which reads the same JSON.
 */
export type DiscoverTemplatePreview = {
  titleTemplate?: string | null;
  /** The colour the author picked; absent falls back to a hash of the slug. */
  iconColor?: string | null;
  headings?: string[];
  titles?: string[];
  noteCount?: number;
  /** So a scripture note is not drawn as a plain one. */
  noteType?: string | null;
  sourceImage?: string | null;
  /**
   * The artifact itself, sanitized and capped — what a listing page renders
   * behind its fade. Absent on rows written before it existed, and on links,
   * which have no body; a page falls back to the outline in that case.
   */
  bodyHtml?: string;
  sourceDomain?: string | null;
  sourceSiteName?: string | null;
  excerpt?: string;
  /**
   * Harvous published this itself — the reviewer's call, set on approve.
   *
   * Changes who gets the credit, not how it is drawn. A built-in template lives
   * in code and never gets a `NoteTemplates` row, so `sourceId` can never
   * identify one, and the account that ran the seed is the wrong author to name.
   * harvous.com has read this since the catalog shipped (`DiscoverCard` draws
   * "Included"); the app's own listing page was still saying a stranger shared it.
   */
  official?: boolean;
};

export type DiscoverListingsResponse = {
  listings: DiscoverListing[];
  /** Slugs the viewer already has. Only ever their own installs. */
  installedSlugs: string[];
  nextCursor: string | null;
};

/** A submission of your own, and what became of it. */
export type MyDiscoverSubmission = {
  id: string;
  slug: string | null;
  kind: string;
  title: string;
  description: string | null;
  category: string | null;
  status: 'submitted' | 'listed' | 'declined' | 'withdrawn' | 'delisted' | 'superseded';
  reviewNote: string | null;
  installCount: number;
  createdAt: string | Date;
  reviewedAt: string | Date | null;
  listedAt: string | Date | null;
};

export type DiscoverSubmissionForReview = MyDiscoverSubmission & {
  sourceId: string;
  submittedByUserId: string;
  authorDisplayName: string | null;
  payload: { name?: string; title?: string | null; content?: string } | null;
  preview: DiscoverTemplatePreview | null;
  staffReadAt: string | Date | null;
  /**
   * Notes for whoever reviews this, written at submit. Reviewer-only — today it
   * says that the submitted link also sits in the submitter's church or space
   * library, which the public serializer must never carry because it names a
   * church. Absent on rows submitted before the column existed.
   */
  reviewFlags: string[] | null;
};

export function discoverListingsQueryKey(kind?: string | null, category?: string | null) {
  return ['discover-listings', kind ?? null, category ?? null] as const;
}

export const DISCOVER_MINE_QUERY_KEY = ['discover-mine'] as const;
export const DISCOVER_ADMIN_QUERY_KEY = ['discover-admin-submissions'] as const;

/** Mark every Discover list stale — after an install, a submit, or a review. */
export function invalidateDiscoverQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['discover-listings'], refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: DISCOVER_MINE_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: DISCOVER_ADMIN_QUERY_KEY }),
  ]);
}

/**
 * The public catalog.
 *
 * The endpoint is anonymous, but a *loading* signed-in session is still gated on
 * `useAuthReady()`: the response marks which listings the viewer already has,
 * and a cold-start request racing ahead of Clerk would come back with that list
 * empty and cache it — every row would offer to add something the person
 * already took.
 *
 * A guest is exempted from that gate rather than blocked by it — `isGuest` is a
 * settled fact the moment the shell resolves it (a local marker, not something
 * Clerk has to finish loading), and a guest's `installedSlugs` is truly always
 * empty, not a caching artifact. Without the exemption the query stayed
 * disabled for a guest forever, since `useAuthReady()` requires `isSignedIn`,
 * which a guest by definition never has — the same idiom
 * `usePrototypeChapterHighlights` already uses for the same reason.
 */
export function useDiscoverListings(
  options: { kind?: string | null; category?: string | null; enabled?: boolean } = {},
) {
  const authReady = useAuthReady();
  const { isGuest } = useHarvousIdentity();
  const { kind = null, category = null, enabled = true } = options;
  return useQuery({
    queryKey: discoverListingsQueryKey(kind, category),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (kind) params.kind = kind;
      if (category) params.category = category;
      return api.get<DiscoverListingsResponse>(
        '/api/discover/listings',
        Object.keys(params).length > 0 ? params : undefined,
      );
    },
    enabled: (isGuest || authReady) && enabled,
    staleTime: 60_000,
  });
}

/** Your own submissions. Never anyone else's. */
export function useMyDiscoverSubmissions(enabled = true) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: DISCOVER_MINE_QUERY_KEY,
    queryFn: () => api.get<{ listings: MyDiscoverSubmission[] }>('/api/discover/mine'),
    enabled: authReady && enabled,
    staleTime: 30_000,
  });
}

/**
 * The review queue.
 *
 * Gated on the admin check rather than just `useAuthReady`, matching
 * useAdminSupport.ts: the endpoint 401s for everyone else, and firing it from
 * every signed-in session would make a failed request the normal case.
 */
export function useDiscoverSubmissionsForReview(status = 'submitted', enabled = true) {
  const authReady = useAuthReady();
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...DISCOVER_ADMIN_QUERY_KEY, status] as const,
    queryFn: () =>
      api.get<{ submissions: DiscoverSubmissionForReview[]; unreadCount: number }>(
        '/api/admin/discover/submissions',
        { status },
      ),
    enabled: authReady && enabled && admin.data?.isAdmin === true,
    staleTime: 15_000,
  });
}

/** Drives the sidebar badge, the way useAdminSupportUnreadCount does. */
export function useAdminDiscoverUnreadCount() {
  const authReady = useAuthReady();
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...DISCOVER_ADMIN_QUERY_KEY, 'unread-count'] as const,
    queryFn: async () => {
      const data = await api.get<{ unreadCount: number }>('/api/admin/discover/submissions', {
        status: 'submitted',
      });
      return data.unreadCount;
    },
    enabled: authReady && admin.data?.isAdmin === true,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

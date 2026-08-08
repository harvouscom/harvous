import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type HeatmapBook = {
  book: string;
  /** Planned weeks that named this book. */
  count: number;
  /** Chapter number → weeks. */
  chapters: Record<string, number>;
};

export type ScriptureHeatmapResponse = {
  church: { id: string; name: string };
  books: HeatmapBook[];
  /** Planned weeks that named a passage at all. */
  totalPlanned: number;
  /** Weeks whose passage could not be parsed — shown, not swallowed. */
  unparsed: number;
};

export function churchScriptureHeatmapQueryKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return ['church-scripture-heatmap', userId ?? 'none', orgId ?? 'home'] as const;
}

/**
 * Shade for a book, 0–4, relative to the most-taught book.
 *
 * Relative rather than absolute because the interesting comparison is within
 * one church: five weeks in Romans means something different for a church with
 * a hundred planned weeks than for one with eight.
 */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

/**
 * Server-gated on `sermon_tools` — pass `enabled: true` only once the viewer is
 * known to be staff, so a congregant never fires a request that will 403.
 */
export function useChurchScriptureHeatmap(
  orgId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = orgId?.trim() || null;

  return useQuery({
    queryKey: churchScriptureHeatmapQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled === true,
    queryFn: () =>
      api.get<ScriptureHeatmapResponse>(
        `/api/church/scripture-heatmap?orgId=${encodeURIComponent(trimmed!)}`,
      ),
    staleTime: 60_000,
    retry: false,
  });
}

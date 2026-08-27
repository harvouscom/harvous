import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';

/** Compact passage memory fingerprint for one note (memory layer). */
export interface NoteFingerprint {
  noteId: string;
  meaningWeight: number;
  emotionalTone: string | null;
  themes: string[];
  people: string[];
  places: string[];
  passageCount: number;
  canonSection: string | null;
  canonSectionLabel: string | null;
  testament: 'ot' | 'nt' | null;
  canonSections: string[];
  /** Workstream B: spaced-repetition stability in days after recall re-engagement. */
  recallStabilityDays?: number | null;
  /** Workstream B: ISO timestamp of last recall-card open. */
  lastRecallEngagedAt?: string | null;
}

/** How often a note has been read, and when it was last read. Excludes glances. */
export interface NoteVisitSummary {
  noteId: string;
  count: number;
  lastVisitedAt: string;
}

interface FingerprintsResponse {
  success: boolean;
  fingerprints: NoteFingerprint[];
  /**
   * A sibling of `fingerprints`, not a field on each one. The server only fingerprints notes
   * that have been through the save pipeline, so a note that has been read but never
   * fingerprinted has no entry to hang a visit count off — and that note is exactly the one
   * this signal exists to notice.
   */
  visits?: NoteVisitSummary[];
}

/**
 * The user's note fingerprints, keyed by noteId. Feeds forgetting-aware resurfacing (meaningWeight,
 * recall stability, last recall time) and the inspector read-out (tone/themes). Server-derived.
 *
 * Also carries the visit aggregate, which rides on the same request deliberately: both are
 * per-note memory signals the same ranking pass consumes, and this query is already inside
 * Home's presentation gate. A second query would be a second thing that can arrive late, and
 * the recall deck rotates by a modulus of its candidate count — so late arrivals move rows
 * under whoever is reading them.
 */
export function useNoteFingerprints() {
  const authReady = useAuthReady();
  const query = useQuery({
    queryKey: ['note-fingerprints'],
    enabled: authReady,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<FingerprintsResponse>('/api/notes/fingerprints');
      return { fingerprints: res.fingerprints ?? [], visits: res.visits ?? [] };
    },
  });

  const fingerprints = query.data?.fingerprints;
  const visits = query.data?.visits;

  const byId = useMemo(() => {
    const map = new Map<string, NoteFingerprint>();
    for (const f of fingerprints ?? []) map.set(f.noteId, f);
    return map;
  }, [fingerprints]);

  const meaningWeightById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of fingerprints ?? []) out[f.noteId] = f.meaningWeight;
    return out;
  }, [fingerprints]);

  const recallStabilityById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of fingerprints ?? []) {
      if (f.recallStabilityDays != null && f.recallStabilityDays > 0) {
        out[f.noteId] = f.recallStabilityDays;
      }
    }
    return out;
  }, [fingerprints]);

  const lastRecallEngagedAtById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of fingerprints ?? []) {
      if (!f.lastRecallEngagedAt) continue;
      const ms = Date.parse(f.lastRecallEngagedAt);
      if (ms > 0) out[f.noteId] = ms;
    }
    return out;
  }, [fingerprints]);

  const canonSectionById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of fingerprints ?? []) {
      if (f.canonSection) out[f.noteId] = f.canonSection;
    }
    return out;
  }, [fingerprints]);

  const visitCountById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of visits ?? []) {
      if (v.count > 0) out[v.noteId] = v.count;
    }
    return out;
  }, [visits]);

  const lastSubstantiveVisitAtById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of visits ?? []) {
      if (!v.lastVisitedAt) continue;
      const ms = Date.parse(v.lastVisitedAt);
      if (ms > 0) out[v.noteId] = ms;
    }
    return out;
  }, [visits]);

  return {
    ...query,
    fingerprintsById: byId,
    meaningWeightById,
    canonSectionById,
    recallStabilityById,
    lastRecallEngagedAtById,
    visitCountById,
    lastSubstantiveVisitAtById,
  };
}

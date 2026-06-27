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
  /** Workstream B: spaced-repetition stability in days after recall re-engagement. */
  recallStabilityDays?: number | null;
  /** Workstream B: ISO timestamp of last recall-card open. */
  lastRecallEngagedAt?: string | null;
}

interface FingerprintsResponse {
  success: boolean;
  fingerprints: NoteFingerprint[];
}

/**
 * The user's note fingerprints, keyed by noteId. Feeds forgetting-aware resurfacing (meaningWeight,
 * recall stability, last recall time) and the inspector read-out (tone/themes). Server-derived.
 */
export function useNoteFingerprints() {
  const authReady = useAuthReady();
  const query = useQuery({
    queryKey: ['note-fingerprints'],
    enabled: authReady,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<FingerprintsResponse>('/api/notes/fingerprints');
      return res.fingerprints ?? [];
    },
  });

  const byId = useMemo(() => {
    const map = new Map<string, NoteFingerprint>();
    for (const f of query.data ?? []) map.set(f.noteId, f);
    return map;
  }, [query.data]);

  const meaningWeightById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of query.data ?? []) out[f.noteId] = f.meaningWeight;
    return out;
  }, [query.data]);

  const recallStabilityById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of query.data ?? []) {
      if (f.recallStabilityDays != null && f.recallStabilityDays > 0) {
        out[f.noteId] = f.recallStabilityDays;
      }
    }
    return out;
  }, [query.data]);

  const lastRecallEngagedAtById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of query.data ?? []) {
      if (!f.lastRecallEngagedAt) continue;
      const ms = Date.parse(f.lastRecallEngagedAt);
      if (ms > 0) out[f.noteId] = ms;
    }
    return out;
  }, [query.data]);

  return {
    ...query,
    fingerprintsById: byId,
    meaningWeightById,
    recallStabilityById,
    lastRecallEngagedAtById,
  };
}

/**
 * Fetches the per-user passage knowledge once per session and caches it client-side, so the
 * (synchronous, offline-capable) folder/tag suggesters can use passage signals. Non-critical:
 * on any failure, suggestions simply stay text-only. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.
 */

import { api } from './api';
import { setCachedPassageKnowledge, type PassageKnowledgeMap } from '@/utils/passage-knowledge-cache';

let lastSyncedUser: string | null = null;

export async function syncPassageKnowledge(userId: string): Promise<void> {
  if (!userId || lastSyncedUser === userId) return;
  try {
    const res = await api.get<{ success?: boolean; passages?: PassageKnowledgeMap }>('/api/scripture/passage-knowledge');
    if (res?.passages) {
      setCachedPassageKnowledge(res.passages);
      lastSyncedUser = userId;
    }
  } catch {
    /* non-critical — folder/tag suggestions fall back to text-only */
  }
}

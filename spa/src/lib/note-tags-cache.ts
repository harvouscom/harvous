import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { NoteDetail } from '../hooks/queries/useNote';
import { setCachedNoteDetail } from '../hooks/queries/useNote';
import { folderLabelsForTagExclusion } from '@/utils/bible-study-concept-overlaps';
import {
  suggestAutoTagsFromNote,
  suggestedAutoTagsToNoteTags,
  type NoteTagPreview,
} from '@/utils/bible-study-tag-web';
import { passageCandidatesFromText, mergePassageTagSuggestions } from '@/utils/passage-tag-candidates';
import { getCachedPassageKnowledge } from '@/utils/passage-knowledge-cache';
import { stripHtml } from '@/utils/html-stripper';

export type NoteTagRow = NoteDetail['tags'][number];

interface NoteTagsResponse {
  success?: boolean;
  tags?: NoteTagRow[];
}

/** Merge authoritative or preview tags into the note detail cache without refetching the full note. */
export function mergeNoteTagsInCache(
  queryClient: QueryClient,
  noteId: string,
  tags: NoteTagRow[] | NoteTagPreview[],
): void {
  queryClient.setQueryData<NoteDetail | undefined>(['note', noteId], (prev) => {
    if (!prev) return prev;
    const next = { ...prev, tags: tags as NoteDetail['tags'] };
    setCachedNoteDetail(noteId, next);
    return next;
  });
}

/** Client-side preview tags from title + body when the server response omits tags. */
export function previewNoteTagsFromContent(
  title: string,
  content: string,
  folderLabels?: {
    primary?: string | null;
    secondaries?: string[] | null;
    dismissedAutoTags?: string[] | null;
  },
): NoteTagPreview[] {
  const excludeFolderLabels = folderLabelsForTagExclusion(
    folderLabels?.primary,
    folderLabels?.secondaries ?? [],
  );
  const dismissed = folderLabels?.dismissedAutoTags ?? [];
  const base = suggestAutoTagsFromNote(title, content, {
    excludeFolderLabels,
    excludeTagNames: dismissed,
  });
  // Augment with passage people/places from the cached knowledge (mirrors folder secondaries).
  const candidates = passageCandidatesFromText(
    `${title}\n${stripHtml(content || '', { preserveSpacing: true })}`,
    getCachedPassageKnowledge(),
  );
  const merged = mergePassageTagSuggestions(base, candidates, {
    excludeLabels: excludeFolderLabels,
    dismissed,
  });
  return suggestedAutoTagsToNoteTags(merged);
}

export async function fetchNoteTagsFromApi(noteId: string): Promise<NoteTagRow[]> {
  const res = await api.get<NoteTagsResponse>(`/api/notes/${encodeURIComponent(noteId)}/tags`);
  return Array.isArray(res.tags) ? res.tags : [];
}

/** Lightweight tags fetch + cache merge (safe while the note editor is open). */
export async function fetchAndMergeNoteTagsInCache(
  queryClient: QueryClient,
  noteId: string,
): Promise<void> {
  try {
    const tags = await fetchNoteTagsFromApi(noteId);
    mergeNoteTagsInCache(queryClient, noteId, tags);
  } catch (err) {
    console.error('[note-tags-cache] fetchAndMergeNoteTagsInCache:', err);
  }
}

export { suggestAutoTagsFromNote, suggestedAutoTagsToNoteTags };

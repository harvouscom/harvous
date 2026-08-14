import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export interface ReaderVerse {
  verse: number;
  text: string;
}

export interface ReaderVerseNote {
  noteId: string;
  title: string | null;
  reference: string;
}

export interface ReaderVerseHighlight {
  id: string;
  parentNoteId: string;
  parentNoteTitle: string | null;
  accent: string;
  entryKind: string;
  reference: string;
  excerpt: string | null;
}

export interface ReaderVerseStudy {
  notes: ReaderVerseNote[];
  highlights: ReaderVerseHighlight[];
}

export interface ReaderChapterResponse {
  success: boolean;
  book: string;
  chapter: number;
  chapterCount: number | null;
  translation: string;
  verses: ReaderVerse[];
  /** Keyed by verse number (JSON object keys are strings). */
  study: Record<string, ReaderVerseStudy>;
  counts: { notes: number; highlights: number };
}

/**
 * A chapter's verses together with the study the user already has against them.
 *
 * Unlike the `by-scripture` lookup this replaces, matching is range-aware: a highlight
 * saved as `John 3:16-18` surfaces while reading John 3 and lands on each of its verses.
 */
export function useReaderChapter(
  book: string | undefined,
  chapter: number | undefined,
  translation: string | undefined,
  enabled = true,
) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['reader', 'chapter', book, chapter, translation],
    enabled: Boolean(authReady && book && chapter && translation && enabled),
    queryFn: () =>
      api.get<ReaderChapterResponse>('/api/reader/chapter', {
        book: book!,
        chapter: chapter!,
        translation: translation!,
      }),
  });
}

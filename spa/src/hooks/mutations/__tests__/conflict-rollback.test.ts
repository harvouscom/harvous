import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { APIError } from '../../../lib/api';
import { rollbackFailedNoteUpdate } from '../useUpdateNote';
import type { NoteDetail } from '../../queries/useNote';

const saveNoteDraft = vi.fn();
const clearNoteDraft = vi.fn();
const getNoteDraft = vi.fn(() => null as unknown);
vi.mock('@/utils/note-draft-store', () => ({
  saveNoteDraft: (...args: unknown[]) => saveNoteDraft(...args),
  clearNoteDraft: (...args: unknown[]) => clearNoteDraft(...args),
  // The conflict path reads the existing draft to carry a truncation seam forward.
  getNoteDraft: (...args: unknown[]) => getNoteDraft(...(args as [])),
}));

/** Toasts ride a window CustomEvent — capture them to assert on what the user is told. */
function captureToasts(): { messages: string[]; stop: () => void } {
  const messages: string[] = [];
  const handler = (e: Event) => {
    messages.push((e as CustomEvent).detail?.message);
  };
  window.addEventListener('toast', handler);
  return { messages, stop: () => window.removeEventListener('toast', handler) };
}

beforeEach(() => {
  saveNoteDraft.mockClear();
  clearNoteDraft.mockClear();
  getNoteDraft.mockReset();
  getNoteDraft.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A 409 used to restore the onMutate snapshot before doing anything else. That snapshot
 * predates the save, so when a concurrent save had already succeeded and written the
 * newer version into the same cache, the restore overwrote it with a stale one. The next
 * save then sent the stale number and conflicted again — self-perpetuating.
 *
 * Observed live as three identical
 *   `version conflict { expectedVersion: 2, currentVersion: 3 }`
 * entries on a note only one person was editing.
 */
function note(overrides: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: 'note_1',
    title: 'T',
    content: '<p>body</p>',
    noteType: 'default',
    contentEncrypted: false,
    isPublic: false,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    threads: [],
    tags: [],
    ...overrides,
  } as NoteDetail;
}

describe('rollbackFailedNoteUpdate on a version conflict', () => {
  it('never writes the stale snapshot back over a newer version', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { queryFn: async () => note({ currentVersion: 3 }), retry: false } },
    });
    qc.setQueryData<NoteDetail>(['note', 'note_1'], note({ currentVersion: 3 }));
    const context = { previousNotes: [[['note', 'note_1'], note({ currentVersion: 2 })]] as any };

    // Assert on the write, not the end state: the 409 path also invalidates and refetches,
    // which would mask a stale write by landing on the right value a moment later.
    const written: unknown[] = [];
    const setQueryData = qc.setQueryData.bind(qc);
    vi.spyOn(qc, 'setQueryData').mockImplementation(((key: any, data: any, ...rest: any[]) => {
      if (Array.isArray(key) && key[0] === 'note' && key[1] === 'note_1') written.push(data);
      return setQueryData(key, data, ...rest);
    }) as typeof qc.setQueryData);

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(409, 'Expected note version 2, but current version is 3', 'NOTE_VERSION_CONFLICT'),
      'note_1',
      context,
      { title: 'T', content: '<p>typed</p>' },
    );

    const staleWrites = written.filter(
      (d) => (d as NoteDetail | undefined)?.currentVersion === 2,
    );
    expect(staleWrites).toEqual([]);
  });

  /**
   * The false-restore loop: server-side scripture processing rewrites the body (plain
   * reference → pill markup) and moves the version, so the editor's in-flight save 409s
   * on a note nobody else touched. Drafting that attempt left a copy that differed from
   * the server only in markup, which the restore path then resurrected on every open —
   * surfacing as a phantom "Restored unsaved changes".
   */
  it('clears the draft and stays silent when the refetch already says what we tried to say', async () => {
    const processed =
      '<p>Read <span class="scripture-pill" data-scripture-reference="Romans 8:1">Romans 8:1</span> tonight</p>';
    const qc = new QueryClient({
      defaultOptions: { queries: { queryFn: async () => note({ content: processed }), retry: false } },
    });
    qc.setQueryData<NoteDetail>(['note', 'note_1'], note({ content: processed }));
    const toasts = captureToasts();

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(409, 'conflict', 'NOTE_VERSION_CONFLICT'),
      'note_1',
      { previousNotes: [] },
      { title: 'T', content: '<p>Read Romans 8:1 tonight</p>' },
    );
    toasts.stop();

    expect(clearNoteDraft).toHaveBeenCalledWith('note_1');
    expect(toasts.messages).toEqual([]);
  });

  it('keeps the draft and reports when the server body genuinely diverged', async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { queryFn: async () => note({ content: '<p>a co-editor wrote this</p>' }), retry: false },
      },
    });
    qc.setQueryData<NoteDetail>(['note', 'note_1'], note({ content: '<p>a co-editor wrote this</p>' }));
    const toasts = captureToasts();

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(409, 'conflict', 'NOTE_VERSION_CONFLICT'),
      'note_1',
      { previousNotes: [] },
      { title: 'T', content: '<p>but I wrote that</p>' },
    );
    toasts.stop();

    expect(saveNoteDraft).toHaveBeenCalledWith('note_1', {
      title: 'T',
      content: '<p>but I wrote that</p>',
    });
    expect(clearNoteDraft).not.toHaveBeenCalled();
    expect(toasts.messages).toEqual([
      'This note changed somewhere else — your version is saved as a draft',
    ]);
  });

  it('keeps the draft when there is no refetched copy to compare against', async () => {
    // Fail closed: an unresolvable compare must never discard the only copy of an edit.
    const qc = new QueryClient({
      defaultOptions: { queries: { queryFn: async () => { throw new Error('offline'); }, retry: false } },
    });
    const toasts = captureToasts();

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(409, 'conflict', 'NOTE_VERSION_CONFLICT'),
      'note_1',
      { previousNotes: [] },
      { title: 'T', content: '<p>typed</p>' },
    );
    toasts.stop();

    expect(clearNoteDraft).not.toHaveBeenCalled();
    expect(toasts.messages).toHaveLength(1);
  });

  it('carries a truncation seam forward when re-drafting the attempt', async () => {
    /*
      A draft written from a list-truncated body records the seam it was cut at, and that is
      the only thing that lets the missing tail be reattached later. Re-drafting the attempt
      as a bare { title, content } stripped it, so a known-incomplete prefix started looking
      like a complete body — and the next open restored that prefix over the full note.
    */
    getNoteDraft.mockReturnValue({
      title: 'T',
      content: '<p>preview</p>',
      savedAt: Date.now(),
      bodyTruncated: true,
      previewHtml: '<p>preview</p>',
      previewLength: 14,
    });
    const qc = new QueryClient({
      defaultOptions: {
        queries: { queryFn: async () => note({ content: '<p>a co-editor wrote this</p>' }), retry: false },
      },
    });
    qc.setQueryData<NoteDetail>(['note', 'note_1'], note({ content: '<p>a co-editor wrote this</p>' }));
    const toasts = captureToasts();

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(409, 'conflict', 'NOTE_VERSION_CONFLICT'),
      'note_1',
      { previousNotes: [] },
      { title: 'T', content: '<p>but I wrote that</p>' },
    );
    toasts.stop();

    expect(saveNoteDraft).toHaveBeenCalledWith('note_1', {
      title: 'T',
      content: '<p>but I wrote that</p>',
      bodyTruncated: true,
      previewHtml: '<p>preview</p>',
      previewLength: 14,
    });
  });

  it('still saves the attempt when the existing draft cannot be read', async () => {
    // The seam is a bonus; the text the user just typed is the point. A throwing read must
    // not be allowed to skip the write that preserves it.
    getNoteDraft.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const qc = new QueryClient({
      defaultOptions: {
        queries: { queryFn: async () => note({ content: '<p>a co-editor wrote this</p>' }), retry: false },
      },
    });
    const toasts = captureToasts();

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(409, 'conflict', 'NOTE_VERSION_CONFLICT'),
      'note_1',
      { previousNotes: [] },
      { title: 'T', content: '<p>but I wrote that</p>' },
    );
    toasts.stop();

    expect(saveNoteDraft).toHaveBeenCalledWith('note_1', {
      title: 'T',
      content: '<p>but I wrote that</p>',
    });
  });

  it('still restores the snapshot for non-conflict failures', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { queryFn: async () => note(), retry: false } },
    });
    qc.setQueryData<NoteDetail>(['note', 'note_1'], note({ title: 'optimistic' }));
    const context = { previousNotes: [[['note', 'note_1'], note({ title: 'original' })]] as any };

    await rollbackFailedNoteUpdate(
      qc,
      new APIError(500, 'boom'),
      'note_1',
      context,
      { title: 'optimistic', content: '<p>x</p>' },
    );

    expect(qc.getQueryData<NoteDetail>(['note', 'note_1'])?.title).toBe('original');
  });
});

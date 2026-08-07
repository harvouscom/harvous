import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  saveNoteDraft,
  getNoteDraft,
  clearNoteDraft,
  isDraftFromThisPageSession,
} from '../note-draft-store';

afterEach(() => {
  vi.useRealTimers();
});

describe('note-draft-store', () => {
  it('round-trips a draft and stamps savedAt', () => {
    saveNoteDraft('note_1', { title: 'Hello', content: '<p>world</p>' });
    const draft = getNoteDraft('note_1');
    expect(draft).not.toBeNull();
    expect(draft?.title).toBe('Hello');
    expect(draft?.content).toBe('<p>world</p>');
    expect(typeof draft?.savedAt).toBe('number');
  });

  it('returns null for a note with no draft', () => {
    expect(getNoteDraft('note_missing')).toBeNull();
  });

  it('clears a draft', () => {
    saveNoteDraft('note_2', { title: 't', content: '<p>c</p>' });
    expect(getNoteDraft('note_2')).not.toBeNull();
    clearNoteDraft('note_2');
    expect(getNoteDraft('note_2')).toBeNull();
  });

  it('supports the note_draft (brand-new note) key', () => {
    saveNoteDraft('note_draft', { title: 'New', content: '<p>typed</p>' });
    expect(getNoteDraft('note_draft')?.content).toBe('<p>typed</p>');
  });

  it('overwrites an existing draft for the same note', () => {
    saveNoteDraft('note_3', { title: 'a', content: '<p>1</p>' });
    saveNoteDraft('note_3', { title: 'b', content: '<p>2</p>' });
    const draft = getNoteDraft('note_3');
    expect(draft?.title).toBe('b');
    expect(draft?.content).toBe('<p>2</p>');
  });

  it('skips persisting pathologically large drafts (quota guard)', () => {
    const huge = 'x'.repeat(300 * 1024);
    saveNoteDraft('note_big', { title: 't', content: huge });
    expect(getNoteDraft('note_big')).toBeNull();
  });

  it('discards drafts older than the TTL and removes them', () => {
    saveNoteDraft('note_old', { title: 't', content: '<p>c</p>' });
    // Jump 8 days ahead — past the 7-day TTL.
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + eightDaysMs);
    expect(getNoteDraft('note_old')).toBeNull();
    // Confirm the expired entry was cleared, not just filtered.
    vi.restoreAllMocks();
    expect(localStorage.getItem('harvous-note-draft-note_old')).toBeNull();
  });

  it('round-trips the truncation seam so a later full open can reattach the tail', () => {
    saveNoteDraft('note_trunc', {
      title: 't',
      content: '<p>one</p><p>two edited</p>',
      bodyTruncated: true,
      previewHtml: '<p>one</p><p>two</p>',
      previewLength: 20,
    });
    const draft = getNoteDraft('note_trunc');
    expect(draft?.bodyTruncated).toBe(true);
    expect(draft?.previewHtml).toBe('<p>one</p><p>two</p>');
    expect(draft?.previewLength).toBe(20);
  });

  it('reads drafts written before the seam fields existed', () => {
    localStorage.setItem(
      'harvous-note-draft-note_legacy',
      JSON.stringify({ title: 't', content: '<p>c</p>', savedAt: Date.now() }),
    );
    const draft = getNoteDraft('note_legacy');
    expect(draft?.content).toBe('<p>c</p>');
    expect(draft?.bodyTruncated).toBeUndefined();
  });

  it('stamps the page session and recognises its own writes', () => {
    // The guard against resurrecting an already-saved compose: a draft written by the
    // still-running page load is not recoverable work, because nothing crashed.
    saveNoteDraft('note_session', { title: 't', content: '<p>c</p>' });
    const draft = getNoteDraft('note_session');
    expect(typeof draft?.pageSessionId).toBe('string');
    expect(isDraftFromThisPageSession(draft)).toBe(true);
  });

  it('treats a draft from another page load — or an unstamped one — as foreign', () => {
    localStorage.setItem(
      'harvous-note-draft-note_prev',
      JSON.stringify({ title: 't', content: '<p>c</p>', savedAt: Date.now(), pageSessionId: 'other-load' }),
    );
    expect(isDraftFromThisPageSession(getNoteDraft('note_prev'))).toBe(false);

    localStorage.setItem(
      'harvous-note-draft-note_unstamped',
      JSON.stringify({ title: 't', content: '<p>c</p>', savedAt: Date.now() }),
    );
    expect(isDraftFromThisPageSession(getNoteDraft('note_unstamped'))).toBe(false);
    expect(isDraftFromThisPageSession(null)).toBe(false);
  });

  it('returns null and does not throw for malformed stored JSON', () => {
    localStorage.setItem('harvous-note-draft-note_bad', '{not json');
    expect(() => getNoteDraft('note_bad')).not.toThrow();
    expect(getNoteDraft('note_bad')).toBeNull();
  });

  it('ignores empty noteId', () => {
    saveNoteDraft('', { title: 't', content: 'c' });
    expect(getNoteDraft('')).toBeNull();
  });
});

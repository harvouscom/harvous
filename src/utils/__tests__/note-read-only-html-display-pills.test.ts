import { describe, expect, it } from 'vitest';
import { prepareReadOnlyNoteBodyHtml, withDisplayScripturePills } from '../note-read-only-html';

const PILL = (reference: string, text = reference, extra = '') =>
  `<span data-scripture-reference="${reference}" data-note-id="note_1"${extra} class="scripture-pill scripture-pill-clickable">${text}</span>`;

describe('withDisplayScripturePills', () => {
  it('wraps a plain-text reference as a pill stamped with the note id', () => {
    const out = withDisplayScripturePills('<p>Read John 3:16 tonight</p>', { noteId: 'note_1' });
    expect(out).toMatch(
      /<p>Read <span data-scripture-reference="John 3:16" data-note-id="note_1"[^>]*class="scripture-pill scripture-pill-clickable">John 3:16<\/span> tonight<\/p>/,
    );
  });

  it('returns HTML with no plain-text reference untouched', () => {
    const html = `<p>See ${PILL('John 3:16')} and nothing else</p>`;
    expect(withDisplayScripturePills(html, { noteId: 'note_1' })).toBe(html);
    expect(withDisplayScripturePills('<p>No verses here</p>', { noteId: 'note_1' })).toBe(
      '<p>No verses here</p>',
    );
  });

  it('leaves existing pills alone while wrapping a bare repeat of the same reference', () => {
    const html = `<p>${PILL('Romans 8:28', 'Romans 8:28', ' data-pill-accent="violet"')}</p><p>Again, Romans 8:28.</p>`;
    const out = withDisplayScripturePills(html, { noteId: 'note_1' });
    expect(out).toContain('data-pill-accent="violet"');
    expect(out.match(/data-scripture-reference="Romans 8:28"/g)).toHaveLength(2);
    expect(out).not.toMatch(/<span[^>]*scripture-pill[^>]*>\s*<span[^>]*scripture-pill/);
    expect(out.startsWith(`<p>${PILL('Romans 8:28', 'Romans 8:28', ' data-pill-accent="violet"')}</p>`)).toBe(true);
  });

  it('puts a pending pill back as stored rather than through the highlighter clean-up', () => {
    const pending = '<span data-scripture-reference="Mark 1:1" data-note-id="pending" class="scripture-pill">Mark 1:1</span>';
    const out = withDisplayScripturePills(`<p>${pending} and Luke 1:1</p>`, { noteId: 'note_1' });
    expect(out).toContain(pending);
    expect(out).toContain('data-scripture-reference="Luke 1:1"');
  });

  it('keeps the words of a chapter-only reference while resolving it in the attribute', () => {
    const out = withDisplayScripturePills('<p>Start with John 3.</p>', { noteId: 'note_1' });
    expect(out).toMatch(/data-scripture-reference="John 3:1-36"[^>]*>John 3<\/span>/);
  });

  it("borrows the translation already on the page before the fallback", () => {
    const html = `<p>${PILL('John 1:1', 'John 1:1', ' data-scripture-translation="ESV"')} then Genesis 1:1</p>`;
    const out = withDisplayScripturePills(html, { noteId: 'note_1', fallbackTranslation: 'NET' });
    expect(out).toMatch(/data-scripture-reference="Genesis 1:1"[^>]*data-scripture-translation="ESV"/);
  });

  it('uses the fallback translation when no pill names one', () => {
    const out = withDisplayScripturePills('<p>Psalm 23:1</p>', { noteId: 'note_1', fallbackTranslation: 'CSB' });
    expect(out).toMatch(/data-scripture-reference="Psalms 23:1"[^>]*data-scripture-translation="CSB"[^>]*>Psalm 23:1</);
  });

  it('does not wrap reference text that lives inside an attribute value', () => {
    const html =
      '<blockquote data-scripture-quote-accent="neutral" data-scripture-quote-reference="Proverbs 3:5"><p>Trust in the LORD</p></blockquote>';
    expect(withDisplayScripturePills(html, { noteId: 'note_1' })).toBe(html);
  });

  it('skips references the reader cannot resolve', () => {
    const html = '<p>Exodus 16:1620</p>';
    expect(withDisplayScripturePills(html, { noteId: 'note_1' })).toBe(html);
  });
});

describe('prepareReadOnlyNoteBodyHtml display pills', () => {
  it('only pills plain text when asked', () => {
    const html = '<p>Read John 3:16</p>';
    expect(prepareReadOnlyNoteBodyHtml(html)).not.toContain('scripture-pill');
    expect(prepareReadOnlyNoteBodyHtml(html, { displayPills: { noteId: 'note_1' } })).toContain(
      'data-scripture-reference="John 3:16"',
    );
  });

  it('labels a new pill with its translation like a stored one', () => {
    const out = prepareReadOnlyNoteBodyHtml('<p>Read John 3:16</p>', {
      displayPills: { noteId: 'note_1', fallbackTranslation: 'ESV' },
    });
    expect(out).toContain('data-scripture-translation-label="ESV"');
  });
});

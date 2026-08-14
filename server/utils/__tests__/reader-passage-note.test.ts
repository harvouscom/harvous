import { describe, expect, it } from 'vitest';
import {
  appendVerseHighlightHtml,
  buildVerseHighlightHtml,
  readerHighlightReference,
  readerPassageNoteTitle,
} from '../reader-passage-note';
import { serializeNoteToPortable } from '@/utils/portable-markdown';
import { parsePortableMarkdownDocument } from '@/utils/portable-markdown';

describe('readerPassageNoteTitle', () => {
  it('names the note after the chapter it holds', () => {
    expect(readerPassageNoteTitle('John', 3)).toBe('John 3');
    expect(readerPassageNoteTitle('1 John', 1)).toBe('1 John 1');
  });
});

describe('readerHighlightReference', () => {
  it('normalizes a single verse', () => {
    expect(readerHighlightReference('John', 3, 16)).toBe('John 3:16');
  });

  it('normalizes a verse range', () => {
    expect(readerHighlightReference('John', 3, 16, 18)).toBe('John 3:16-18');
  });

  it('collapses a range that ends where it starts', () => {
    expect(readerHighlightReference('John', 3, 16, 16)).toBe('John 3:16');
  });

  it('produces a reference the chapter query prefix will match', () => {
    // The reader's read side narrows highlights with a `"<Book> <chapter>:"` LIKE prefix,
    // so a reference that drifted from that shape would be written but never displayed.
    expect(readerHighlightReference('Romans', 8, 1)).toMatch(/^Romans 8:/);
  });

  it('keeps the canonical book name instead of the normalized alias', () => {
    // normalizeScriptureReference renames this book to "Song of Songs", which is not what
    // BibleVerses or ScriptureMetadata store. Writing the alias would leave the highlight
    // invisible to the reader's chapter query.
    expect(readerHighlightReference('Song of Solomon', 2, 1, 3)).toBe('Song of Solomon 2:1-3');
  });
});

describe('buildVerseHighlightHtml', () => {
  it('marks the verse text with its accent and study id', () => {
    const html = buildVerseHighlightHtml({
      verseStart: 16,
      verseEnd: null,
      text: 'For God so loved the world',
      accent: 'warmAmber',
      studyThreadId: 'study_1',
    });

    expect(html).toContain('data-verse="16"');
    expect(html).toContain('<sup class="verse-num">16</sup>');
    expect(html).toContain('data-color="warmAmber"');
    expect(html).toContain('data-study-thread-id="study_1"');
    expect(html).toContain('For God so loved the world');
  });

  it('labels a range with both ends', () => {
    const html = buildVerseHighlightHtml({
      verseStart: 16,
      verseEnd: 18,
      text: 'text',
      accent: 'warmAmber',
      studyThreadId: 'study_1',
    });
    expect(html).toContain('data-verse="16-18"');
    expect(html).toContain('<sup class="verse-num">16-18</sup>');
  });

  it('escapes verse text so scripture cannot inject markup', () => {
    const html = buildVerseHighlightHtml({
      verseStart: 1,
      verseEnd: null,
      text: '<script>alert("x")</script>',
      accent: 'warmAmber',
      studyThreadId: 'study_1',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('appendVerseHighlightHtml', () => {
  it('uses the snippet alone for the first highlight', () => {
    expect(appendVerseHighlightHtml('', '<blockquote>a</blockquote>')).toBe('<blockquote>a</blockquote>');
    expect(appendVerseHighlightHtml('   ', '<blockquote>a</blockquote>')).toBe('<blockquote>a</blockquote>');
  });

  it('keeps earlier highlights when appending', () => {
    const out = appendVerseHighlightHtml('<blockquote>first</blockquote>', '<blockquote>second</blockquote>');
    expect(out).toContain('first');
    expect(out).toContain('second');
    expect(out.indexOf('first')).toBeLessThan(out.indexOf('second'));
  });
});

describe('the materialized passage note survives serialization', () => {
  it('round-trips a body built by the reader, keeping the mark and the verse text', () => {
    // Ties the write path to the format guarantee: whatever buildVerseHighlightHtml
    // produces has to come back out of the portable serializer intact.
    const studyThreadId = 'study_reader_1';
    const body = appendVerseHighlightHtml(
      '',
      buildVerseHighlightHtml({
        verseStart: 16,
        verseEnd: null,
        text: 'For God so loved the world',
        accent: 'warmAmber',
        studyThreadId,
      }),
    );
    const reference = readerHighlightReference('John', 3, 16);

    const markdown = serializeNoteToPortable(
      {
        id: 'note_john_3',
        title: readerPassageNoteTitle('John', 3),
        noteType: 'scripture',
        scriptureReference: 'John 3',
        scriptureTranslation: 'NET',
      },
      body,
      [
        {
          id: studyThreadId,
          kind: 'scriptureLink',
          accent: 'warmAmber',
          anchorText: 'For God so loved the world',
          scriptureReference: reference,
          scriptureTranslation: 'NET',
          scriptureExcerpt: 'For God so loved the world',
        },
      ],
    );

    const doc = parsePortableMarkdownDocument(markdown);
    expect(doc).not.toBeNull();
    if (!doc) return;

    expect(doc.meta.title).toBe('John 3');
    expect(doc.meta.scriptureReference).toBe('John 3');
    expect(doc.highlights).toHaveLength(1);
    expect(doc.highlights[0].scriptureReference).toBe('John 3:16');
    expect(doc.highlights[0].anchorText).toBe('For God so loved the world');
    // The verse text reaches the body, so the inline mark can be re-applied on import.
    expect(doc.body).toContain('For God so loved the world');
  });
});

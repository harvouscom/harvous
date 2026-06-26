import { describe, expect, it } from 'vitest';
import {
  applyHighlightMarksToMarkdownBody,
  buildImportFromPortableDocument,
  isPortableMarkdownExport,
  parsePortableMarkdownDocument,
  parsePortableMarkdownExport,
  serializeNoteToPortable,
  type PortableHighlight,
} from '@/utils/portable-markdown';
import { markdownToHtml } from '@/utils/markdown-to-html';

describe('portable-markdown', () => {
  const sampleHighlights: PortableHighlight[] = [
    {
      id: 'study_1',
      kind: 'miniNote',
      accent: 'warmAmber',
      anchorText: 'for God so loved',
      annotation: 'The hinge of the gospel.',
    },
  ];

  it('serializes and parses a portable note with highlights', () => {
    const md = serializeNoteToPortable(
      {
        id: 'note_1',
        title: 'Gospel note',
        created: '2026-05-30T12:00:00.000Z',
        thread: 'John',
        tags: ['grace'],
      },
      '<p>God ==for God so loved== the world.</p>'.replace(/==/g, ''),
      sampleHighlights,
    );

    expect(isPortableMarkdownExport(md)).toBe(true);
    const doc = parsePortableMarkdownDocument(md);
    expect(doc?.meta.id).toBe('note_1');
    expect(doc?.meta.title).toBe('Gospel note');
    expect(doc?.highlights).toHaveLength(1);
    expect(doc?.highlights[0].annotation).toBe('The hinge of the gospel.');
    expect(doc?.body).toContain('==for God so loved==');
  });

  it('round-trips highlight marks into HTML on import build', () => {
    const md = serializeNoteToPortable(
      { id: 'note_2', title: 'Test' },
      '<p>Hello world of grace.</p>',
      [
        {
          kind: 'miniNote',
          accent: 'skyBlue',
          anchorText: 'world',
          annotation: 'Key word',
        },
      ],
    );
    const doc = parsePortableMarkdownDocument(md)!;
    const built = buildImportFromPortableDocument(doc, () => 'study_new_1', markdownToHtml);
    expect(built.htmlContent).toContain('<mark');
    expect(built.htmlContent).toContain('data-study-thread-id="study_new_1"');
    expect(built.studyInserts).toHaveLength(1);
    expect(built.studyInserts[0].miniNoteBody).toBe('Key word');
  });

  it('round-trips primary and secondary folders', () => {
    const md = serializeNoteToPortable(
      {
        id: 'note_folder',
        title: 'Folder note',
        folder: 'Romans',
        folders: ['Pauline Epistles', 'Justification'],
      },
      '<p>Body text.</p>',
      [],
    );
    expect(md).toContain('folder: Romans');
    const doc = parsePortableMarkdownDocument(md)!;
    expect(doc.meta.folder).toBe('Romans');
    expect(doc.meta.folders).toEqual(['Pauline Epistles', 'Justification']);
  });

  it('accepts legacy "collection"/"collections" frontmatter aliases', () => {
    const md = ['---', 'id: legacy_1', 'title: Legacy', 'collection: Genesis', 'collections:', '  - Torah', '---', '', '# Legacy', '', 'Body'].join('\n');
    const doc = parsePortableMarkdownDocument(md)!;
    expect(doc.meta.folder).toBe('Genesis');
    expect(doc.meta.folders).toEqual(['Torah']);
  });

  it('parses bulk export with multiple documents', () => {
    const a = serializeNoteToPortable({ id: 'n1', title: 'One' }, '<p>Alpha</p>', []).trim();
    const b = serializeNoteToPortable({ id: 'n2', title: 'Two' }, '<p>Beta</p>', []).trim();
    const docs = parsePortableMarkdownExport(`${a}\n\n${b}`);
    expect(docs).toHaveLength(2);
    expect(docs[0].meta.title).toBe('One');
    expect(docs[1].meta.title).toBe('Two');
  });

  it('keeps a note whose body contains a "---" horizontal rule as a single document', () => {
    // A `---` HR inside the body looks like a note boundary to the splitter; the fold-back logic
    // must reattach the tail rather than drop it.
    const a = [
      '---',
      'id: hr1',
      'title: Has rule',
      '---',
      '',
      '# Has rule',
      '',
      'Before the rule.',
      '',
      '---',
      '',
      'After the rule.',
    ].join('\n');
    const b = serializeNoteToPortable({ id: 'hr2', title: 'Next' }, '<p>Beta</p>', []).trim();
    const docs = parsePortableMarkdownExport(`${a}\n\n${b}`);
    expect(docs).toHaveLength(2);
    expect(docs[0].meta.id).toBe('hr1');
    expect(docs[0].body).toContain('Before the rule.');
    expect(docs[0].body).toContain('After the rule.');
    expect(docs[1].meta.id).toBe('hr2');
  });

  it('no longer writes highlightsJSON but highlights still round-trip', () => {
    const md = serializeNoteToPortable({ id: 'h_note', title: 'H' }, '<p>Body of grace.</p>', sampleHighlights);
    expect(md).not.toContain('highlightsJSON');
    const doc = parsePortableMarkdownDocument(md)!;
    expect(doc.highlights).toHaveLength(1);
    expect(doc.highlights[0].annotation).toBe('The hinge of the gospel.');
  });

  it('still reads legacy highlightsJSON when YAML highlights are absent (backward compat)', () => {
    const md = [
      '---',
      'id: legacy_h',
      'title: Legacy highlights',
      `highlightsJSON: '${JSON.stringify([{ kind: 'miniNote', accent: 'warmAmber', anchorText: 'grace', annotation: 'Old.' }])}'`,
      '---',
      '',
      '# Legacy highlights',
      '',
      'Body about grace.',
    ].join('\n');
    const doc = parsePortableMarkdownDocument(md)!;
    expect(doc.highlights).toHaveLength(1);
    expect(doc.highlights[0].anchorText).toBe('grace');
    expect(doc.highlights[0].annotation).toBe('Old.');
  });

  it('applyHighlightMarksToMarkdownBody wraps ==text==', () => {
    const html = applyHighlightMarksToMarkdownBody(
      'Say ==hello== there',
      [{ kind: 'miniNote', accent: 'violet', anchorText: 'hello' }],
      new Map([['hello', 'study_99']]),
    );
    expect(html).toContain('<mark');
    expect(html).toContain('data-study-thread-id="study_99"');
    expect(html).toContain('hello');
  });
});

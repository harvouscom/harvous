/**
 * Evernote (.enex) import — the format was advertised on web for months while
 * silently producing "no content recognized", so these lock in the shapes real
 * exports actually contain.
 */
import { describe, it, expect } from 'vitest';
import { parseEnexToPortableDocs, ingestFileToPortableDocs } from '../portable-ingest';

const TWO_NOTE_ENEX = `<?xml version="1.0" encoding="UTF-8"?>
<en-export export-date="20260101T120000Z">
  <note>
    <title>Romans 8 study</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?>
<en-note><div>No condemnation for those in Christ.</div><div><span style="background-color: #ffff00;">The Spirit gives life</span></div></en-note>]]></content>
    <created>20251115T093000Z</created>
    <updated>20251116T101500Z</updated>
    <tag>romans</tag>
    <tag>grace</tag>
  </note>
  <note>
    <title>Sermon outline</title>
    <content><![CDATA[<en-note><div>Point one</div><div><en-todo checked="true"/>Read the passage</div><div><en-todo/>Write the close</div></en-note>]]></content>
    <created>20251201T080000Z</created>
  </note>
</en-export>`;

describe('parseEnexToPortableDocs', () => {
  it('returns one document per note in the export', () => {
    const docs = parseEnexToPortableDocs(TWO_NOTE_ENEX);
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.meta.title)).toEqual(['Romans 8 study', 'Sermon outline']);
  });

  it('carries tags and converts Evernote timestamps to ISO', () => {
    const [first] = parseEnexToPortableDocs(TWO_NOTE_ENEX);
    expect(first.meta.tags).toEqual(['romans', 'grace']);
    expect(first.meta.created).toBe('2025-11-15T09:30:00.000Z');
    expect(first.meta.updated).toBe('2025-11-16T10:15:00.000Z');
  });

  it('leaves dates null when the note has none', () => {
    const [, second] = parseEnexToPortableDocs(TWO_NOTE_ENEX);
    expect(second.meta.created).toBe('2025-12-01T08:00:00.000Z');
    expect(second.meta.updated).toBeNull();
  });

  it('extracts highlighted spans as highlights', () => {
    const [first] = parseEnexToPortableDocs(TWO_NOTE_ENEX);
    const anchors = first.highlights.map((h) => h.anchorText);
    expect(anchors).toContain('The Spirit gives life');
    expect(first.body).toContain('==The Spirit gives life==');
  });

  it('turns en-todo elements into markdown checkboxes', () => {
    const [, second] = parseEnexToPortableDocs(TWO_NOTE_ENEX);
    expect(second.body).toContain('[x] Read the passage');
    expect(second.body).toContain('[ ] Write the close');
  });

  it('replaces embedded media with a placeholder rather than dropping the note', () => {
    const docs = parseEnexToPortableDocs(
      `<note><title>With image</title><content><![CDATA[<en-note><div>Before</div><en-media hash="abc" type="image/png"/><div>After</div></en-note>]]></content></note>`,
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].body).toContain('[attachment]');
    expect(docs[0].body).toContain('Before');
    expect(docs[0].body).toContain('After');
  });

  it('decodes XML entities in titles', () => {
    const docs = parseEnexToPortableDocs(
      `<note><title>Faith &amp; works</title><content><![CDATA[<en-note><div>Body</div></en-note>]]></content></note>`,
    );
    expect(docs[0].meta.title).toBe('Faith & works');
  });

  it('falls back to the raw content when a note has no CDATA wrapper', () => {
    const docs = parseEnexToPortableDocs(
      `<note><title>Plain</title><content>&lt;en-note&gt;Body text&lt;/en-note&gt;</content></note>`,
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].body).toContain('Body text');
  });

  it('ignores an export with no notes', () => {
    expect(parseEnexToPortableDocs('<en-export></en-export>')).toEqual([]);
  });

  it('uses the file-name fallback when a note has no title', () => {
    const docs = parseEnexToPortableDocs(
      `<note><content><![CDATA[<en-note><div>Body</div></en-note>]]></content></note>`,
      'My notebook',
    );
    expect(docs[0].meta.title).toBe('My notebook');
  });
});

describe('ingestFileToPortableDocs', () => {
  it('expands an .enex file into one document per contained note', async () => {
    const docs = await ingestFileToPortableDocs('notebook.enex', TWO_NOTE_ENEX);
    expect(docs).toHaveLength(2);
  });

  it('returns a single document for formats that hold one note', async () => {
    const docs = await ingestFileToPortableDocs('note.md', '# Heading\n\nSome body text.');
    expect(docs).toHaveLength(1);
    expect(docs[0].meta.title).toBe('Heading');
  });

  it('returns an empty list for unknown extensions', async () => {
    expect(await ingestFileToPortableDocs('archive.tar', 'binary junk')).toEqual([]);
  });
});

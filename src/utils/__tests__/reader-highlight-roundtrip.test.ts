/**
 * Reader-origin highlights must survive a full export → import round trip.
 *
 * A highlight made while reading a passage has no user-authored note to live inside.
 * Rather than detaching it from a note (which would strand it outside the portable
 * format — nothing to serialize it into, so exports would silently drop it), the
 * reader materializes a lightweight scripture note for the passage and hangs the
 * highlight off that. `parentNoteId` therefore stays non-null, and the highlight
 * round-trips through the same path every other highlight already uses.
 *
 * These tests lock that guarantee in: if a future change stops carrying the
 * highlight's verse pointer, or stops materializing the passage note, a user's
 * reading highlights would vanish from their backup and these fail.
 *
 * Mirrors the harness in import-folders-roundtrip.test.ts — real serializer, real
 * zip, real parser, no live DB.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { serializeNoteToPortable, type PortableHighlight, type PortableNoteMeta } from '../portable-markdown';
import { parseImportFiles } from '../../../server/utils/parse-import-files';
import type { ParsedMarkdownNote } from '../markdown-import-parser';

// jsdom's File doesn't implement arrayBuffer()/text(); the server runs on undici where it does.
function fileFromBytes(name: string, bytes: Uint8Array): File {
  return {
    name,
    size: bytes.byteLength,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}

/** The note the reader materializes the first time a passage is highlighted. */
const PASSAGE_NOTE_META: PortableNoteMeta = {
  id: 'note_john_3',
  title: 'John 3',
  created: '2026-08-01T10:00:00.000Z',
  updated: '2026-08-01T10:00:00.000Z',
  noteType: 'scripture',
  scriptureReference: 'John 3',
  scriptureTranslation: 'ESV',
};

const READER_HIGHLIGHT: PortableHighlight = {
  id: 'study_reader_john_3_16',
  kind: 'miniNote',
  accent: 'warmAmber',
  anchorText: 'For God so loved the world',
  scriptureReference: 'John 3:16',
  scriptureTranslation: 'ESV',
  scriptureExcerpt: 'For God so loved the world, that he gave his only Son.',
  annotation: 'The hinge of the whole chapter.',
};

/** Passage body as the reader writes it: verse text with the highlighted span marked. */
const PASSAGE_BODY =
  '<p><mark data-color="warmAmber">For God so loved the world</mark>, that he gave his only Son, ' +
  'that whoever believes in him should not perish but have eternal life.</p>';

async function roundTripThroughBackupZip(files: Array<{ path: string; markdown: string }>) {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.markdown);
  zip.file('manifest.json', JSON.stringify({ version: 1, app: 'harvous', connections: [] }));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return parseImportFiles([fileFromBytes('harvous-backup-2026-08-01.zip', bytes)], 'markdown');
}

describe('reader-origin highlight → export → import', () => {
  it('survives the round trip with its verse pointer, accent, and anchor text intact', async () => {
    const markdown = serializeNoteToPortable(PASSAGE_NOTE_META, PASSAGE_BODY, [READER_HIGHLIGHT]);

    const result = await roundTripThroughBackupZip([{ path: 'Unsorted/2026-08-01 John 3.md', markdown }]);

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // The passage note itself comes back as a scripture note, so the highlight
    // still has a passage to belong to after import.
    expect(row.title).toBe('John 3');
    // A markdown import always yields ParsedMarkdownNote, which is the arm carrying the
    // scripture fields; ParsedCSVNote has no notion of a passage.
    const note = row.note as ParsedMarkdownNote;
    expect(note.scriptureReference).toBe('John 3');
    expect(note.scriptureTranslation).toBe('ESV');

    // The highlight came through, and kept the verse it points at.
    expect(row.highlightCount).toBe(1);
    const inserts = row.portableBuild?.studyInserts;
    expect(inserts).toHaveLength(1);
    const insert = inserts![0];
    expect(insert.scriptureReference).toBe('John 3:16');
    expect(insert.scripturePassageTranslation).toBe('ESV');
    expect(insert.scripturePassageExcerpt).toBe('For God so loved the world, that he gave his only Son.');
    expect(insert.highlightAccentRaw).toBe('warmAmber');
    expect(insert.anchorTextSnapshot).toBe('For God so loved the world');
    expect(insert.miniNoteBody).toBe('The hinge of the whole chapter.');
  });

  it('re-anchors the highlight to the passage note rather than importing it detached', async () => {
    const markdown = serializeNoteToPortable(PASSAGE_NOTE_META, PASSAGE_BODY, [READER_HIGHLIGHT]);

    const result = await roundTripThroughBackupZip([{ path: 'Unsorted/2026-08-01 John 3.md', markdown }]);
    const insert = result.rows[0].portableBuild!.studyInserts[0];

    // buildImportFromPortableDocument deliberately omits parentNoteId/userId — import-commit
    // fills parentNoteId from the note it just inserted. That is the mechanism keeping a
    // reader highlight attached to its passage, so assert the shape it relies on.
    expect(insert).not.toHaveProperty('parentNoteId');
    expect(insert).not.toHaveProperty('userId');

    // The body keeps the mark, so the highlight can be re-resolved against the passage text.
    expect(result.rows[0].portableBuild!.htmlContent).toContain('For God so loved the world');
    expect(result.rows[0].portableBuild!.htmlContent).toContain('<mark');
  });

  it('survives even when the passage note carries no prose of its own', async () => {
    // The degenerate reader case: the user highlighted a verse and wrote nothing.
    // The note exists purely as the passage container, so the body is just the verse.
    const bare = serializeNoteToPortable(
      { ...PASSAGE_NOTE_META, id: 'note_rom_8' , title: 'Romans 8', scriptureReference: 'Romans 8' },
      '<p><mark data-color="warmAmber">There is therefore now no condemnation</mark></p>',
      [
        {
          id: 'study_reader_rom_8_1',
          kind: 'miniNote',
          accent: 'warmAmber',
          anchorText: 'There is therefore now no condemnation',
          scriptureReference: 'Romans 8:1',
          scriptureTranslation: 'ESV',
        },
      ],
    );

    const result = await roundTripThroughBackupZip([{ path: 'Unsorted/2026-08-01 Romans 8.md', markdown: bare }]);

    expect(result.rows).toHaveLength(1);
    const inserts = result.rows[0].portableBuild?.studyInserts;
    expect(inserts).toHaveLength(1);
    expect(inserts![0].scriptureReference).toBe('Romans 8:1');
    expect(inserts![0].anchorTextSnapshot).toBe('There is therefore now no condemnation');
    // No annotation was written, so there is no mini-note body to carry.
    expect(inserts![0].miniNoteBody).toBe('');
  });

  it('keeps multiple reader highlights on one passage distinct', async () => {
    const markdown = serializeNoteToPortable(
      PASSAGE_NOTE_META,
      '<p><mark data-color="warmAmber">For God so loved the world</mark>, that he gave his only Son, ' +
        'that <mark data-color="coolTeal">whoever believes in him</mark> should not perish.</p>',
      [
        READER_HIGHLIGHT,
        {
          id: 'study_reader_john_3_16b',
          kind: 'miniNote',
          accent: 'warmAmber',
          anchorText: 'whoever believes in him',
          scriptureReference: 'John 3:16',
          scriptureTranslation: 'ESV',
          annotation: 'Universal offer.',
        },
      ],
    );

    const result = await roundTripThroughBackupZip([{ path: 'Unsorted/2026-08-01 John 3.md', markdown }]);

    const inserts = result.rows[0].portableBuild?.studyInserts ?? [];
    expect(inserts).toHaveLength(2);
    expect(new Set(inserts.map((i) => i.id)).size).toBe(2);
    expect(inserts.map((i) => i.anchorTextSnapshot).sort()).toEqual([
      'For God so loved the world',
      'whoever believes in him',
    ]);
  });
});

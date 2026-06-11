import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { serializeNoteToPortable } from '../portable-markdown';
import { parseImportFiles } from '../../../server/utils/parse-import-files';
import {
  collectionsFromPath,
  resolveImportCollections,
} from '../../../server/utils/note-secondary-collections';

// jsdom's File doesn't implement arrayBuffer()/text(); the server runs on undici where it does.
// This minimal File-like exposes only what parseImportFiles reads.
function fileFromBytes(name: string, bytes: Uint8Array): File {
  return {
    name,
    size: bytes.byteLength,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}

describe('collectionsFromPath', () => {
  it('splits a nested path into leaf (primary) + ancestors (secondary)', () => {
    expect(collectionsFromPath('Pauline Epistles/Romans/Chapter 8')).toEqual({
      primary: 'Chapter 8',
      secondary: ['Pauline Epistles', 'Romans'],
    });
  });

  it('returns nulls for an empty path', () => {
    expect(collectionsFromPath(null)).toEqual({ primary: null, secondary: [] });
    expect(collectionsFromPath('')).toEqual({ primary: null, secondary: [] });
  });
});

describe('resolveImportCollections', () => {
  it('prefers explicit frontmatter folder over directory structure', () => {
    expect(resolveImportCollections('Romans', ['Pauline'], 'SomeFolder/Other')).toEqual({
      primary: 'Romans',
      secondary: ['Pauline'],
    });
  });

  it('falls back to the directory path when no frontmatter folder', () => {
    expect(resolveImportCollections(null, [], 'Pauline/Romans')).toEqual({
      primary: 'Romans',
      secondary: ['Pauline'],
    });
  });
});

describe('parseImportFiles — backup zip round-trip', () => {
  it('restores folders, highlights, and the connection graph from a backup zip', async () => {
    const noteA = serializeNoteToPortable(
      { id: 'note_a', title: 'Grace', folder: 'Romans', folders: ['Pauline Epistles'] },
      '<p>For by grace you have been saved.</p>',
      [{ id: 'h1', kind: 'miniNote', accent: 'warmAmber', anchorText: 'grace', annotation: 'The gift.' }],
    );
    const noteB = serializeNoteToPortable(
      { id: 'note_b', title: 'Faith', folder: 'Romans', folders: ['Pauline Epistles'] },
      '<p>Faith comes by hearing.</p>',
      [],
    );

    const zip = new JSZip();
    zip.file('Romans/2026-01-01 Grace.md', noteA);
    zip.file('Romans/2026-01-02 Faith.md', noteB);
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        connections: [{ fromNoteId: 'note_a', toNoteId: 'note_b' }],
      }),
    );
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const file = fileFromBytes('harvous-backup-2026-01-01.zip', bytes);

    const result = await parseImportFiles([file], 'markdown');

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.primaryCollection).toBe('Romans');
      expect(row.secondaryCollections).toEqual(['Pauline Epistles']);
    }
    const grace = result.rows.find((r) => r.title === 'Grace')!;
    expect(grace.highlightCount).toBe(1);
    expect(grace.portableBuild?.studyInserts).toHaveLength(1);

    expect(result.connections).toEqual([{ fromNoteId: 'note_a', toNoteId: 'note_b' }]);
  });

  it('derives folders from a plain directory tree (no frontmatter)', async () => {
    const zip = new JSZip();
    zip.file('Study/Genesis/note.md', '# Creation\n\nIn the beginning.');
    zip.file('loose-note.md', '# Loose\n\nNo folder here.');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const file = fileFromBytes('export.zip', bytes);

    const result = await parseImportFiles([file], 'markdown');

    const nested = result.rows.find((r) => r.fileName === 'note.md')!;
    expect(nested.primaryCollection).toBe('Genesis');
    expect(nested.secondaryCollections).toEqual(['Study']);

    const loose = result.rows.find((r) => r.fileName === 'loose-note.md')!;
    expect(loose.primaryCollection).toBeNull();
  });
});

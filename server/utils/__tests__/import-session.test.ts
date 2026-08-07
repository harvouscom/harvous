/**
 * Import session helpers that don't need a database — the payload round-trip and
 * the rules that decide what undo may take back.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IMPORT_LIMITS,
  buildImportItemSummary,
  importItemPayloadToRow,
  isSupportedImportExtension,
  type ImportSessionItemRow,
} from '../import-session';
import type { ParsedImportRow } from '../parse-import-files';

function itemRow(overrides: Partial<ImportSessionItemRow> = {}): ImportSessionItemRow {
  return {
    id: 'impitem_1',
    sessionId: 'impsess_1',
    userId: 'user_1',
    clientFileId: 'impfile_1',
    fileName: 'romans-8.md',
    folderPath: 'Pauline Epistles',
    sourceType: 'md',
    fileSize: 1234,
    ord: 7,
    title: 'Romans 8 study',
    highlightCount: 3,
    tagCount: 2,
    primaryCollection: 'Romans',
    payload: JSON.stringify({
      note: { title: 'Romans 8 study', content: 'body', tags: ['grace'] },
      secondaryCollections: ['Doctrine', 'Grace'],
    }),
    sourceId: 'note_original',
    status: 'parsed',
    duplicateHint: null,
    resultNoteId: null,
    enrichedAt: null,
    error: null,
    createdAt: new Date('2026-08-06T12:00:00Z'),
    updatedAt: null,
    ...overrides,
  } as ImportSessionItemRow;
}

describe('isSupportedImportExtension', () => {
  it('accepts every format the parser handles', () => {
    for (const name of [
      'a.md', 'b.markdown', 'c.txt', 'd.csv', 'e.docx', 'f.html', 'g.htm', 'h.pdf', 'i.enex',
    ]) {
      expect(isSupportedImportExtension(name)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(isSupportedImportExtension('Notes.MD')).toBe(true);
    expect(isSupportedImportExtension('Export.ENEX')).toBe(true);
  });

  it('rejects a zip, which the client expands into its entries instead', () => {
    expect(isSupportedImportExtension('backup.zip')).toBe(false);
  });

  it('rejects formats we cannot read', () => {
    for (const name of ['photo.heic', 'archive.tar', 'song.mp3', 'noextension']) {
      expect(isSupportedImportExtension(name)).toBe(false);
    }
  });
});

describe('importItemPayloadToRow', () => {
  it('rebuilds a parsed row from the stored columns and payload', () => {
    const row: ParsedImportRow = importItemPayloadToRow(itemRow());
    expect(row).toMatchObject({
      index: 7,
      fileName: 'romans-8.md',
      folderPath: 'Pauline Epistles',
      title: 'Romans 8 study',
      highlightCount: 3,
      tagCount: 2,
      sourceType: 'md',
      primaryCollection: 'Romans',
      secondaryCollections: ['Doctrine', 'Grace'],
    });
    expect(row.note).toMatchObject({ title: 'Romans 8 study', content: 'body' });
  });

  it('tolerates a payload written without secondary collections', () => {
    const row = importItemPayloadToRow(
      itemRow({ payload: JSON.stringify({ note: { title: 'A', content: 'b' } }) }),
    );
    expect(row.secondaryCollections).toEqual([]);
  });
});

describe('buildImportItemSummary', () => {
  it('reports enrichment as a boolean rather than leaking the timestamp', () => {
    expect(buildImportItemSummary(itemRow()).enriched).toBe(false);
    expect(buildImportItemSummary(itemRow({ enrichedAt: new Date() })).enriched).toBe(true);
  });

  it('carries the client file id so rows can be matched back', () => {
    expect(buildImportItemSummary(itemRow()).clientFileId).toBe('impfile_1');
  });
});

describe('undo eligibility', () => {
  // A behaviour test would need a database; this guards the specific mistake that
  // shipped once: using Notes.updatedAt to mean "the user edited this". Scripture
  // processing stamps updatedAt on every imported note, so that check kept
  // everything and undo silently deleted nothing.
  const source = () => readFileSync(resolve(process.cwd(), 'server/utils/import-session.ts'), 'utf8');

  it('decides by version provenance, not by Notes.updatedAt', () => {
    const undo = source().slice(source().indexOf('export async function undoImportSession'));
    expect(undo).toContain('NoteVersions.source');
    expect(undo).toContain('IMPORT_OWNED_VERSION_SOURCES');
    expect(undo).not.toContain('Notes.updatedAt');
  });

  it('treats only the import’s own writes as untouched', () => {
    const match = source().match(/IMPORT_OWNED_VERSION_SOURCES = \[(.*?)\]/s);
    expect(match?.[1]).toContain("'import'");
    expect(match?.[1]).toContain("'scripture-processing'");
  });

  it('deletes through the shared cascade rather than raw row deletes', () => {
    const undo = source().slice(source().indexOf('export async function undoImportSession'));
    expect(undo).toContain('deleteNotesCascadeForUser');
    expect(undo).not.toContain('delete(Notes)');
  });
});

describe('IMPORT_LIMITS', () => {
  it('keeps per-request batches small enough to finish inside the function timeout', () => {
    expect(IMPORT_LIMITS.maxCommitBatch).toBeLessThanOrEqual(10);
    expect(IMPORT_LIMITS.maxEnrichBatch).toBeLessThanOrEqual(5);
  });

  it('bounds a single session', () => {
    expect(IMPORT_LIMITS.maxFiles).toBeGreaterThan(0);
    expect(IMPORT_LIMITS.maxItemsPerFile).toBeLessThanOrEqual(IMPORT_LIMITS.maxItems);
  });
});

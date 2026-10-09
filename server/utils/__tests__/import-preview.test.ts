/**
 * The preview an import row opens to: the same body commit would write, the
 * highlights a backup carries, and a cap so a long PDF can't flood the response.
 */
import { describe, expect, it } from 'vitest';
import { IMPORT_PREVIEW_MAX_HTML, buildImportItemPreview } from '../import-preview';
import type { ImportSessionItemRow } from '../import-session';

function itemRow(payload: object, overrides: Partial<ImportSessionItemRow> = {}): ImportSessionItemRow {
  return {
    id: 'impitem_1',
    sessionId: 'impsess_1',
    userId: 'user_1',
    clientFileId: 'impfile_1',
    fileName: 'romans-8.md',
    folderPath: null,
    sourceType: 'md',
    fileSize: 100,
    ord: 0,
    title: 'Romans 8 study',
    highlightCount: 0,
    tagCount: 0,
    primaryCollection: 'Romans',
    payload: JSON.stringify(payload),
    sourceId: null,
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

describe('buildImportItemPreview', () => {
  it('renders a markdown note to the HTML commit would write', () => {
    const preview = buildImportItemPreview(
      itemRow({
        note: { title: 'Romans 8 study', content: 'No **condemnation**.', tags: ['grace'], createdDate: '2026-03-01' },
        secondaryCollections: ['Doctrine'],
      }),
    );
    expect(preview.html).toContain('<strong>condemnation</strong>');
    expect(preview.tags).toEqual(['grace']);
    expect(preview.primaryCollection).toBe('Romans');
    expect(preview.secondaryCollections).toEqual(['Doctrine']);
    expect(preview.createdDate).toBe('2026-03-01');
    expect(preview.truncated).toBe(false);
  });

  it('passes a CSV note body through as stored', () => {
    const preview = buildImportItemPreview(
      itemRow(
        {
          note: { threadTitle: 'Log', threadColor: null, noteTitle: 'Week 1', content: '<p>Psalm 1</p>', createdDate: '', tags: [] },
          secondaryCollections: [],
        },
        { fileName: 'log.csv', sourceType: 'csv', title: 'Week 1' },
      ),
    );
    expect(preview.html).toBe('<p>Psalm 1</p>');
    expect(preview.createdDate).toBeNull();
  });

  it('lists the highlights a portable backup carries', () => {
    const highlights = [
      { kind: 'miniNote', accent: 'yellow' /* not a real swatch — falls back */, anchorText: 'no condemnation', annotation: 'A verdict' },
      { kind: 'scriptureLink', accent: 'skyBlue', anchorText: 'Galatians 5', scriptureReference: 'Galatians 5:16' },
    ];
    const preview = buildImportItemPreview(
      itemRow(
        {
          note: { title: 'Romans 8 study', content: 'ignored', tags: [], portable: { meta: {}, body: '', highlights } },
          portableBuild: { title: 'Romans 8 study', htmlContent: '<p>built</p>', highlights, studyInserts: [] },
          secondaryCollections: [],
        },
        { highlightCount: 2, duplicateHint: 'id' },
      ),
    );
    expect(preview.html).toBe('<p>built</p>');
    expect(preview.highlights).toEqual([
      { kind: 'miniNote', accent: 'neutral', anchorText: 'no condemnation', annotation: 'A verdict', scriptureReference: null },
      { kind: 'scriptureLink', accent: 'skyBlue', anchorText: 'Galatians 5', annotation: null, scriptureReference: 'Galatians 5:16' },
    ]);
    expect(preview.highlightCount).toBe(2);
    expect(preview.duplicateHint).toBe('id');
  });

  it('caps a long body at a tag boundary and says so', () => {
    const paragraph = '<p class="x">' + 'word '.repeat(40) + '</p>';
    const html = paragraph.repeat(Math.ceil((IMPORT_PREVIEW_MAX_HTML * 2) / paragraph.length));
    const preview = buildImportItemPreview(
      itemRow({
        note: { title: 'Long', content: '', tags: [] },
        portableBuild: { title: 'Long', htmlContent: html, highlights: [], studyInserts: [] },
        secondaryCollections: [],
      }),
    );
    expect(preview.truncated).toBe(true);
    expect(preview.html.length).toBeLessThanOrEqual(IMPORT_PREVIEW_MAX_HTML);
    // Never cut inside a tag: the last '<' is always closed by a later '>'.
    expect(preview.html.lastIndexOf('<')).toBeLessThan(preview.html.lastIndexOf('>'));
  });
});

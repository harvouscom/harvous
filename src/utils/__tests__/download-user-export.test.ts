import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildUserExportUrl,
  downloadUserBackupZip,
  parseExportFilename,
  validateExportResponse,
} from '../download-user-export';

describe('buildUserExportUrl', () => {
  it('encodes format query param', () => {
    expect(buildUserExportUrl('csv-threads', '')).toBe('/api/user/export?format=csv-threads');
  });

  it('prefixes configured API base', () => {
    expect(buildUserExportUrl('markdown', 'https://app.harvous.com')).toBe(
      'https://app.harvous.com/api/user/export?format=markdown',
    );
  });
});

describe('validateExportResponse', () => {
  it('accepts text/csv', () => {
    expect(() =>
      validateExportResponse(new Response('a,b', { status: 200, headers: { 'Content-Type': 'text/csv' } })),
    ).not.toThrow();
  });

  it('rejects HTML responses', () => {
    expect(() =>
      validateExportResponse(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } })),
    ).toThrow(/unexpected response type/);
  });

  it('rejects non-ok status', () => {
    expect(() => validateExportResponse(new Response(null, { status: 401 }))).toThrow(/Export failed/);
  });
});

describe('parseExportFilename', () => {
  it('uses Content-Disposition when present', () => {
    const response = new Response(null, {
      headers: { 'Content-Disposition': 'attachment; filename="my-export.csv"' },
    });
    expect(parseExportFilename(response, 'csv-threads')).toBe('my-export.csv');
  });

  it('falls back to dated filename', () => {
    const response = new Response(null);
    expect(parseExportFilename(response, 'csv-threads')).toMatch(/^harvous-export-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('downloadUserBackupZip', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the backup zip and saves a dated filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['zip-bytes'], { type: 'application/zip' }), {
        status: 200,
        headers: { 'Content-Type': 'application/zip' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const filename = await downloadUserBackupZip('https://app.harvous.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.harvous.com/api/user/export?format=backup',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(filename).toMatch(/^harvous-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(downloadUserBackupZip('')).rejects.toThrow(/Backup failed/);
  });
});

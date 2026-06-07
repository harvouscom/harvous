import { describe, expect, it } from 'vitest';
import {
  buildUserExportUrl,
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

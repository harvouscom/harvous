/**
 * Source-contract test for GET /api/notes/by-reference.
 *
 * The whole feature is "what have *I* written on this passage". A single
 * unscoped read here would turn sermon prep into surveillance of the
 * congregation, so the scoping is asserted structurally rather than trusted.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const handler = () => {
  const text = readFileSync(resolve(process.cwd(), 'server/routes/notes.ts'), 'utf8');
  const start = text.indexOf("route.get('/api/notes/by-reference'");
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf("// ─── GET /api/notes/connect-suggestions", start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
};

describe('GET /api/notes/by-reference', () => {
  it('scopes every Notes read to the caller', () => {
    const body = handler();
    const scoped = body.split('eq(Notes.userId, auth.userId)').length - 1;
    const reads = body.split('.from(').length - 1;
    expect(reads).toBeGreaterThan(0);
    // One userId predicate per query — a `.from(` without one is the bug.
    expect(scoped).toBe(reads);
  });

  it('takes no orgId and reads no church table', () => {
    const body = handler();
    expect(body).not.toMatch(/c\.req\.(query|param)\(\s*'orgId'\s*\)/);
    expect(body).not.toContain('Churches');
    expect(body).not.toContain('connectedOrgId');
  });

  it('never touches the service-lineage column', () => {
    // Reading it here would let a church-planning surface learn which notes
    // came from which service; that column has exactly one reader by contract.
    expect(handler()).not.toContain('startedFromServiceId');
  });

  it('excludes encrypted bodies it cannot read anyway', () => {
    expect(handler()).toContain('eq(Notes.contentEncrypted, false)');
  });

  it('prefilters in SQL so it never scans a whole library', () => {
    const body = handler();
    expect(body).toContain('like(Notes.content');
    expect(body).toContain('parsed.book');
  });

  it('rejects an unparseable reference with the validator’s own wording', () => {
    const body = handler();
    expect(body).toContain('canonicalizeServiceReference');
    expect(body).toContain('canonical.reason');
    expect(body).toContain('INVALID_REFERENCE');
  });

  it('caps what it returns but reports the true total', () => {
    const body = handler();
    expect(body).toContain('totalCount: matches.length');
    expect(body).toContain('matches.slice(0, 3)');
  });

  it('does no aggregation', () => {
    const body = handler();
    expect(body).not.toMatch(/\bgroupBy\b/);
    expect(body).not.toMatch(/\bcount\(/);
  });
});

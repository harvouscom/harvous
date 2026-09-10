import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One material load per passage per request, and no whole-view build for a single string.
 *
 * Recording one answer loaded the same verse's material four times — to resolve the rung, to
 * mark it, to fetch the verse it withheld, and to build the row that came back — on a database
 * whose round-trip floor is 82ms. Measured against a real account: 2904ms for one tap, 1062ms
 * after. Neither number is enforceable from a test, so these guard the two shapes that produced
 * them; without a guard the loads come back one careless call at a time.
 */
const repoRoot = join(__dirname, '..', '..', '..');
const service = readFileSync(join(repoRoot, 'server/utils/review-service.ts'), 'utf8');
const route = readFileSync(join(repoRoot, 'server/routes/review.ts'), 'utf8');

describe('material is loaded once per passage', () => {
  it('puts every caller through the memo rather than the raw loader', () => {
    // The uncached loaders exist, and nothing but the memo may call them.
    expect(service).toContain('async function loadVerseMaterialUncached(');
    expect(service).toContain('async function loadChapterMaterialUncached(');
    const calls = (name: string) =>
      service.split(`${name}(`).length - 1 - 1; // occurrences minus the declaration
    expect(calls('loadVerseMaterialUncached')).toBe(1);
    expect(calls('loadChapterMaterialUncached')).toBe(1);
    expect(service).toContain('memoisedMaterial(');
  });

  it('keeps the window short and the map bounded', () => {
    // Long enough to span one request's passes, far too short to answer a later one staleley.
    const ttl = Number(service.match(/const MATERIAL_TTL_MS = (\d+);/)?.[1]);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10_000);
    expect(service).toMatch(/const MATERIAL_CACHE_MAX = \d+;/);
    // A failed load must not be served for the rest of the window.
    expect(service).toContain('value.catch(() => materialMemo.delete(key))');
  });
});

describe('the answer path asks for what it needs', () => {
  it('resolves the rung on its own rather than building the whole view for one string', () => {
    const outcome = route.slice(route.indexOf("'/api/review/items/:id/outcome'"));
    const block = outcome.slice(0, outcome.indexOf('const graded'));
    expect(block).toContain('askedRungFor(auth.userId, item)');
    expect(block).not.toContain('buildReviewItemViews');
  });

  it('resolves it through the same three functions the shelf does, so the two cannot disagree', () => {
    const fn = service.slice(service.indexOf('export async function askedRungFor'));
    const body = fn.slice(0, fn.indexOf('export async function gradeAnswerFor'));
    expect(body).toContain('resolveNoteRung(');
    expect(body).toContain('chapterRungFor(');
    expect(body).toContain('verseRungFor(');
    // And with the same seed, which is the whole drift guard.
    expect(body.match(/reviewSeed\(item\)/g)?.length).toBe(3);
  });
});

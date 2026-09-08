/**
 * `filterAskableReviewRows` and `buildReviewItemViews` must drop the same rows.
 *
 * They are two answers to one question — which stored rows become rows a reader can be asked
 * about — and they exist separately only so counting a queue does not cost what building one
 * does. When they disagree, the queue lies: a fold says "12 more" and opens onto eleven, or the
 * inbox reports three and returns two.
 *
 * This is not hypothetical. The filter shipped with two of the build's three drop rules, missing
 * the one that needs a chapter's text — and because the inbox had been changed to cut to three
 * rows *before* building, a single unfetchable chapter in the top three took the whole Review
 * section off Home in production.
 *
 * Read from the source because both sides are database calls end to end; there is no seam to
 * unit test without standing one up. What it can still do is fail the moment the two counts
 * diverge, which is the only warning that would have helped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server/utils/review-service.ts'), 'utf8');

function bodyOf(signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  // Both functions end at the next top-level declaration.
  const rest = source.slice(start + signature.length);
  const end = rest.search(/\n(?:export )?(?:async )?function |\n\/\*\*/);
  return rest.slice(0, end === -1 ? undefined : end);
}

const buildBody = bodyOf('export async function buildReviewItemViews');
const filterBody = bodyOf('export async function filterAskableReviewRows');

describe('askable-row rules stay in step', () => {
  it('the build drops rows in exactly three places', () => {
    /*
     * A guard on the number, not the wording. If a fourth `continue` appears in the build loop,
     * this fails — and the fix is to teach `filterAskableReviewRows` the same rule, not to bump
     * the number. Counting anything the reader can still be asked about as askable is the whole
     * contract between these two.
     */
    const drops = buildBody.match(/\bcontinue;/g) ?? [];
    expect(drops).toHaveLength(3);
  });

  it('the filter rejects rows in the same three places', () => {
    const rejects = filterBody.match(/\breturn false;/g) ?? [];
    expect(rejects).toHaveLength(3);
  });

  it('both know the kind rule', () => {
    expect(buildBody).toContain('isReviewAskableKind');
    expect(filterBody).toContain('isReviewAskableKind');
  });

  it('both know the unaskable-note rule', () => {
    expect(buildBody).toContain('noteRungFor');
    expect(filterBody).toContain('noteRungFor');
  });

  it('both know the chapter-without-text rule', () => {
    // The one that was missing. The build reads it off loaded chapter material; the filter asks
    // the cheaper question — are there verses at all — but it must ask it.
    expect(buildBody).toContain("kind === 'chapter'");
    expect(buildBody).toContain('verses.length');
    expect(filterBody).toContain("kind === 'chapter'");
    expect(filterBody).toContain('splitChapterHtmlIntoVerses');
  });
});

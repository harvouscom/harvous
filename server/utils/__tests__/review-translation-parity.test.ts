import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Review asks in the reader's translation, everywhere or not at all.
 *
 * Read from the source, in the style of `review-askable-rules-parity.test.ts` next door and for
 * the same reason it gives: both sides are database calls end to end, so there is no seam to unit
 * test without standing one up.
 *
 * What this guards is not a preference being honoured — it is a reader being marked fairly. The
 * gaps in a cloze are one translation's words and the first letters are its letters, so if the
 * list resolved one wording and the grader another, someone would be marked wrong for correctly
 * knowing the text they were shown. Before this, every site read a hard-coded `'NET'`.
 */
const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const service = () => withoutComments(source('server/utils/review-service.ts'));
const opportunities = () => withoutComments(source('server/utils/review-opportunities.ts'));
const route = () => withoutComments(source('server/routes/review.ts'));

describe('no rung resolves its own wording', () => {
  it('has no hard-coded translation left in the service', () => {
    /*
     * The whole point. Twenty-two of these read `item.translation ?? 'NET'`, which is the account
     * default ignored twenty-two times over.
     */
    expect(service()).not.toContain("?? 'NET'");
  });

  it('leaves the wording hard-coded only where there is no reader to ask', () => {
    /*
     * Named exceptions rather than a blanket ban, the way `review-routes.test.ts` names
     * `SAMPLE_ROUTES`: the list has to stay short enough that adding to it is a decision.
     *
     * Both are parameter defaults on the sample — the one marked question shown to an account
     * that has no Review at all. There is no item and no stored preference to resolve, and the
     * route passes a translation whenever it has one.
     *
     * The fail-soft in `loadDefaultTranslation` is deliberately not a third: it reaches for the
     * named `DEFAULT_REVIEW_TRANSLATION`, so there is one place that decides what "no reader"
     * means rather than three that happen to agree.
     */
    const text = service();
    // Anchored on code rather than the section comments, which `withoutComments` has removed.
    const sample = text.indexOf('export async function buildReviewSample');
    expect(sample).toBeGreaterThan(0);

    expect(text.slice(0, sample)).not.toContain("'NET'");
    expect(text.slice(sample).match(/'NET'/g)).toHaveLength(2);
    expect(text.slice(sample)).toContain("translation = 'NET'");
  });

  it('has none in the engine or the route either', () => {
    expect(opportunities()).not.toContain("'NET'");
    /*
     * The route's one permitted mention is the unauthenticated sample, which has no reader and
     * therefore no default to resolve.
     */
    const text = route();
    expect(text.match(/'NET'/g) ?? []).toHaveLength(1);
    expect(text.slice(text.indexOf('sampleTranslationFrom'))).toContain("'NET'");
  });

  it('resolves once per request rather than once per item', () => {
    const text = service();
    expect(text).toContain('const translationCache');
    // Per call, not process-wide: a reader who changes their translation must be asked in the new
    // one on the next question, not after the next deploy.
    const memo = text.slice(text.indexOf('async function loadDefaultTranslation'));
    expect(memo.slice(0, 900)).toContain('queueMicrotask');
    expect(memo.slice(0, 900)).toContain('translationCache.delete');
  });

  it('reuses the one definition of what an account reads in', () => {
    // Not a second copy of the `?.trim() || 'NET'` fallback — the daily passage and Review must
    // not be able to disagree about the same account.
    expect(service()).toContain('getUserDefaultTranslation');
  });

  it('writes the precedence down once, where it can be tested without a database', () => {
    // `askedTranslation` lives in `src/utils/review-translation.ts` so both halves of the answer
    // are reachable from a unit test; this file only pins that the service defers to it.
    const text = service();
    expect(text).not.toContain('export function askedTranslation');
    expect(text).toContain("from '@/utils/review-translation'");
    expect(text).toContain('askedTranslation(');
  });

  it('never lets the truth be resolved without a reader', () => {
    // `verseTruthFor(item, userId?)` could resolve a rung with no material — a different rung, and
    // now a different wording, from the one that was actually asked.
    expect(service()).not.toMatch(/verseTruthFor\([^)]*userId\?:/);
  });
});

describe('the view carries the wording it was asked in', () => {
  it('sends it to the client rather than leaving it to be re-derived', () => {
    const text = service();
    const iface = text.slice(text.indexOf('export interface ReviewItemView'));
    expect(iface.slice(0, iface.indexOf('\n}'))).toMatch(/translation: string;/);
    expect(text).toContain('translation: askedTranslation(row, defaultTranslation)');
  });

  it('does not let the dock fall back to a guess', () => {
    // The chip read `item.translation ?? 'NET'` on a view that never carried the field, so it
    // said NET for every item including ones stored as something else.
    const dock = withoutComments(source('spa/src/pages/prototype/PrototypeReviewDock.tsx'));
    expect(dock).not.toContain("item.translation ?? 'NET'");
    expect(dock).toContain('{item.translation}');
  });
});

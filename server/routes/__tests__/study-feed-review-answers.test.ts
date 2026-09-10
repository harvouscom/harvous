/**
 * What the day's review answers are allowed to carry.
 *
 * The feed is read on a screen someone else can be looking at, and a review answer is the one
 * thing in this product that records getting something wrong. The line moved once, deliberately:
 * the day's sentence names what you came back to, so a **display label** — the same reference or
 * note title the feed already prints on its reading and writing rows — may cross. What still may
 * not: ids of any kind, and above all `attempt`, the text the reader actually typed. A
 * source-level guard, because the shape is the whole safety argument and a later `select()` that
 * adds a column would pass every behavioural test.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const route = () => readFileSync(resolve(process.cwd(), 'server/routes/study-feed.ts'), 'utf8');
const answersBlock = () => {
  const source = route();
  const start = source.indexOf('const reviewAnswers = await source(');
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('const body: StudyFeedResponse', start));
};

describe('the review aggregate on the study feed', () => {
  it('selects when it happened, how it went, and what it was about', () => {
    const block = answersBlock();
    expect(block).toContain('at: ReviewEvents.createdAt');
    expect(block).toContain('action: ReviewEvents.action');
    // The label, by the names the feed already prints elsewhere.
    expect(block).toContain('reference: ReviewItems.scriptureReference');
    expect(block).toContain('noteTitle: Notes.title');
  });

  it('never carries an id, and never what the reader typed', () => {
    const block = answersBlock();
    /*
     * The columns chosen. An id may be joined on — that is how the label is reached — but must
     * not be one of them. Comments are stripped first: this file's own prose says "attempt".
     */
    const selected = block
      .slice(block.indexOf('.select({'), block.indexOf('.from('))
      .replace(/\/\/.*$/gm, '');
    expect(selected).not.toMatch(/reviewItemId|noteId|attempt|\.id\b/);
    expect(block).not.toContain('ReviewEvents.attempt');
    const body = route().slice(route().indexOf('const body: StudyFeedResponse'));
    expect(body).not.toMatch(/reviewItemId|noteId|attempt/);
  });

  it('counts only answers, never the fact that something was shown', () => {
    // `shown` is written for every card the session puts up; counting it would report reading
    // the queue as having answered it.
    expect(answersBlock()).toContain('inArray(ReviewEvents.action, [...REVIEW_OUTCOMES])');
  });

  it('is scoped to the reader and the feed window, and bounded', () => {
    const block = answersBlock();
    expect(block).toContain('eq(ReviewEvents.userId, auth.userId)');
    expect(block).toContain('...windowed(ReviewEvents.createdAt)');
    expect(block).toContain('.limit(REVIEW_ANSWER_LIMIT)');
  });

  it('survives a database without the Review tables at all', () => {
    // Same tolerance every other source in this route has: a missing table is an empty list.
    expect(answersBlock()).toContain('isReviewTableMissing');
  });

  it('sends only a timestamp and a boolean over the wire', () => {
    const body = route().slice(route().indexOf('const body: StudyFeedResponse'));
    expect(body).toContain('at: row.at.toISOString()');
    expect(body).toContain("held: row.action === 'recalled'");
    expect(body).toMatch(/label: row\.reference\?\.trim\(\) \|\| row\.noteTitle\?\.trim\(\) \|\| null/);
  });
});

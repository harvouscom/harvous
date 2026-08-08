/**
 * Source-contract tests for the public study-plan preview.
 *
 * This endpoint is the one crack in SHARED_THREAD_NOT_PUBLIC, so what matters
 * is exactly what it will and will not resolve, and exactly which columns it
 * reads. A behavioural test exercises one path; these fail if someone widens
 * the gate or swaps the source of the text that goes public.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const planRoute = () => {
  const text = source('server/routes/shared.ts');
  const start = text.indexOf("app.get('/api/shared/thread-plan/:shareToken'");
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf("app.get('/api/shared/note/:shareToken'", start);
  return text.slice(start, end > start ? end : start + 6000);
};

describe('GET /api/shared/thread-plan/:shareToken', () => {
  it('resolves only a Thread a series published', () => {
    const block = withoutComments(planRoute());
    expect(block).toContain('ChurchSeries.publishedThreadId');
    // Without this the endpoint would expose any shared-space Thread, which is
    // precisely what SHARED_THREAD_NOT_PUBLIC exists to prevent.
    expect(block).toContain('if (!series) return notFound()');
  });

  it('requires the Thread to be public and a sequence', () => {
    const block = withoutComments(planRoute());
    expect(block).toContain('eq(Threads.isPublic, true)');
    expect(block).toContain("thread.mode !== 'sequence'");
  });

  it('reads titles and passages from plan rows, never from the step notes', () => {
    const block = withoutComments(planRoute());
    expect(block).toContain('ChurchServices.title');
    expect(block).toContain('ChurchServices.reference');
    /*
      Reading Notes.title here would let a member editing a step push their own
      words onto a public page — the staff plan row is the only safe source.
    */
    expect(block).not.toContain('Notes.title');
    expect(block).not.toContain('Notes.content');
  });

  it('never returns a note body, an author, or who is walking it', () => {
    const block = withoutComments(planRoute());
    expect(block).not.toMatch(/\bcontent\b/);
    expect(block).not.toMatch(/authorUserId|authorDisplayName/);
    expect(block).not.toContain('ThreadProgress');
  });

  it('offers a join link only when the room already has an active one', () => {
    const block = withoutComments(planRoute());
    expect(block).toContain('SpaceInvites');
    expect(block).toContain('isNull(SpaceInvites.revokedAt)');
    // Minting an invite on a public page read would let the page decide who
    // may join, which is the room's decision.
    expect(block).not.toContain('insert(SpaceInvites)');
  });

  it('says the same thing for every kind of miss', () => {
    /*
      A missing Thread, a private one, a collection, one no series published,
      and a deleted space all leave through the same notFound(). Anything that
      distinguished them would turn a share token into a probe for which it is.
    */
    const block = planRoute();
    expect(block).toContain('const notFound = ()');
    expect(block.match(/return notFound\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    // Exactly one 404 in the whole handler — the one notFound() itself sends.
    expect(block.match(/no longer available/g)?.length).toBe(1);
    expect(block.match(/,\s*404\)/g)?.length).toBe(1);
  });
});

describe('the share toggle', () => {
  const shareRoute = () => {
    const text = source('server/routes/threads.ts');
    const start = text.indexOf("route.post('/api/threads/:threadId/share'");
    expect(start).toBeGreaterThan(-1);
    return text.slice(start, start + 3000);
  };

  it('still refuses an ordinary shared-space Thread', () => {
    expect(shareRoute()).toContain('SHARED_THREAD_NOT_PUBLIC');
  });

  it('asks the database whether this is a published plan, never the request', () => {
    const block = withoutComments(shareRoute());
    expect(block).toContain('await isPublishedSeriesThread(threadId)');
    expect(block).not.toMatch(/body\??\.(isPublishedPlan|publishedPlan)/);
  });

  it('lets disable through regardless, so a link can always be revoked', () => {
    expect(withoutComments(shareRoute())).toContain("action !== 'disable'");
  });
});

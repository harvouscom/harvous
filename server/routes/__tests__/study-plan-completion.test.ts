/**
 * Contract tests for the two completions a study plan has.
 *
 * The whole design rests on one property — **neither completion writes the
 * other** — and that is a property of which columns each route touches, not of
 * any single request. Asserted against the source in the style of
 * church-services-routes.test.ts, because what must not happen is a second path
 * appearing that collapses them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const threads = () => source('server/routes/threads.ts');

const routeBlock = (name: string) => {
  const text = withoutComments(threads());
  const start = text.indexOf(`route.post('/api/threads/:threadId/${name}'`);
  if (start === -1) throw new Error(`route /${name} not found`);
  const next = text.indexOf("route.post('/api/threads", start + 10);
  return text.slice(start, next === -1 ? text.length : next);
};

describe('the two completions never write each other', () => {
  it('a member finishing touches only their own ThreadProgress row', () => {
    const block = routeBlock('complete');
    expect(block).toContain('ThreadProgress');
    expect(block).toContain('eq(ThreadProgress.userId, auth.userId)');
    // It must not close the run.
    expect(block).not.toContain('closedAt');
    expect(block).not.toContain('closedByUserId');
  });

  it('a leader closing the run touches only the Thread', () => {
    const block = routeBlock('close');
    expect(block).toContain('closedAt');
    /*
      The point of the whole design: closing must not mark anybody complete.
      Someone who fell behind did not finish because the room moved on.
    */
    expect(block).not.toContain('ThreadProgress');
    expect(block).not.toContain('completedAt');
  });

  it('keeps them in different tables so they cannot share a column', () => {
    const schema = source('server/db/schema.ts');
    expect(schema).toContain("completedAt: ts('completedAt')");
    expect(schema).toContain("closedAt: ts('closedAt')");
  });
});

describe('completion is claimed, never derived', () => {
  it('is written only by an explicit boolean from the member', () => {
    const block = routeBlock('complete');
    expect(block).toContain("typeof body?.completed !== 'boolean'");
    // Nothing infers it from how many steps were opened.
    expect(block).not.toContain('openedNoteIds');
  });

  it('the step-opened route still never writes completion', () => {
    // `progress` records opening. Opening is not finishing, and this is the
    // line that keeps those two facts apart at the point of writing.
    expect(routeBlock('progress')).not.toContain('completedAt');
  });
});

describe('who may do which', () => {
  it('closing a run is gated on authoring in the room', () => {
    const block = routeBlock('close');
    expect(block).toContain('canAuthorInSpace');
    expect(block).toContain('FORBIDDEN');
  });

  it('a personal plan has no run to close', () => {
    expect(routeBlock('close')).toContain('NO_COHORT');
  });

  it('a personal plan can still be completed by its owner', () => {
    // The space check is conditional — a sequence Thread with no spaceId is one
    // person's, and requireThreadReadAccess already resolved that ownership.
    const block = routeBlock('complete');
    expect(block).toContain('if (thread.spaceId)');
  });

  it('a closed run is labelled, not locked', () => {
    // Nothing in the complete route refuses a closed thread: people finish late,
    // and taking the material away when the room moves on is the opposite of
    // what a study plan is for.
    expect(routeBlock('complete')).not.toContain('closedAt');
  });
});

describe('privacy holds', () => {
  it('the leader aggregate counts completions, never names them', () => {
    const pulse = source('server/utils/thread-sequence.ts');
    const block = pulse.slice(
      pulse.indexOf('export async function readTogetherPulse'),
      pulse.indexOf('export function withOpenedStep'),
    );
    expect(block).toContain('completedCount');
    /*
      The existing rule: how many, never who. Asserted on the declared return
      type rather than the body — the body reads `userId` legitimately, to count
      distinct members for the denominator. What must never happen is one
      leaving, and the signature is where that is stated.
    */
    const signature = block.slice(block.indexOf('): Promise<'), block.indexOf('> {'));
    expect(signature).toContain('memberCount');
    expect(signature).toContain('completedCount');
    expect(signature).not.toContain('userId');
  });

  it('the viewer reads only their own completion', () => {
    const text = withoutComments(threads());
    const start = text.indexOf('viewerCompletedAt =');
    expect(start).toBeGreaterThan(-1);
    const near = text.slice(text.lastIndexOf('const own', start), start);
    expect(near).toContain('eq(ThreadProgress.userId, auth.userId)');
  });
});

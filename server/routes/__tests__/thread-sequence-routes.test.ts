/**
 * Source-contract tests for the sequence-Thread route.
 *
 * Same style as church-services-routes.test.ts: assert the shape of the route
 * source rather than booting the app, because what matters here is structural —
 * which gate runs before the write, and what the member read path is allowed to
 * withhold. A behavioural test exercises one path; these fail if someone adds a
 * second path that skips the gate.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const threadRoutes = () => source('server/routes/threads.ts');

const sequenceRoute = () => {
  const text = threadRoutes();
  const start = text.indexOf("route.post('/api/threads/:threadId/sequence'");
  const end = text.indexOf("// ─── GET /api/threads/:threadId/share");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
};

describe('POST /api/threads/:threadId/sequence', () => {
  it('is a write — rate limited and authenticated like its neighbours', () => {
    expect(sequenceRoute()).toContain("requireAuth, rateLimit('write')");
  });

  it('asks the shared gate who may author a plan, never re-deriving it inline', () => {
    const block = sequenceRoute();
    expect(block).toContain('canManageSpaceThreadStructure(access.space, access.role, auth.userId)');
    // A bare owner check here would re-introduce the staff-turnover trap the
    // gate exists to solve.
    expect(block).not.toContain('isActualSpaceOwner');
  });

  it('refuses ministry channels with a code that says why', () => {
    expect(sequenceRoute()).toContain('CHANNELS_READ_ONLY_PILOT');
  });

  it('keeps a personal Thread to its owner — a private reading plan has no members', () => {
    expect(sequenceRoute()).toContain('thread.userId !== auth.userId');
  });

  it('validates every step against live membership before storing an order', () => {
    const block = sequenceRoute();
    expect(block).toContain('loadLiveThreadNoteIds');
    expect(block).toContain('STEP_NOT_IN_THREAD');
  });

  it('refuses a current step that is not in the plan', () => {
    const block = sequenceRoute();
    const pointerCheck = block.slice(block.indexOf('body.currentNoteId !== undefined'));
    expect(pointerCheck).toContain('resolved.orderedNoteIds.includes(body.currentNoteId)');
  });

  it('tells the rest of the space, not just the actor', () => {
    const block = sequenceRoute();
    expect(block).toContain('SpaceMemberships');
    expect(block).toContain("type: 'space:updated'");
  });
});

describe('GET /api/threads/:threadId/notes', () => {
  const notesRoute = () => {
    const text = threadRoutes();
    const start = text.indexOf("route.get('/api/threads/:threadId/notes'");
    const end = text.indexOf("// ─── POST /api/threads/:threadId/sequence");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it('counts the whole plan, not the page — "Step 3 of 8" spans pagination', () => {
    const block = notesRoute();
    expect(block).toContain('loadLiveThreadNoteIds(threadId, sequenceThread.spaceId)');
  });

  it('sends the ordered list to members: dimming is pacing, not access control', () => {
    // No branch may withhold steps by role. If one appears, the "Step i of n"
    // copy stops being true and the dimming becomes a false security promise.
    const block = notesRoute();
    expect(block).not.toMatch(/currentIndex\s*\)\s*\.slice/);
    expect(block).toMatch(/pacing, not access control/);
  });
});

describe('member thread ordering', () => {
  it('overrides recency with the authored order for a sequence', () => {
    const text = source('server/utils/dashboard-data.ts');
    const block = text.slice(text.indexOf('export async function getNotesForThreadForMember'));
    expect(block).toContain('isSequenceMode(contextThread.mode)');
    expect(block).toContain('sortNotesBySequence(mappedMember, contextThread)');
  });

  it('does not slice a recency-ordered page before applying the plan order', () => {
    const text = source('server/utils/dashboard-data.ts');
    const block = text.slice(text.indexOf('export async function getNotesForThreadForMember'));
    expect(block).toContain('SEQUENCE_THREAD_FETCH_CAP');
  });
});

describe('space thread listing', () => {
  it('lets leaders see unpinned Threads so they can make one current', () => {
    const text = source('server/utils/shared-space-group-threads.ts');
    expect(text).toContain("access.role === 'leader'");
  });

  it('still shows members only the current Thread', () => {
    const text = source('server/utils/shared-space-group-threads.ts');
    expect(text).toContain('canSeeUnpinned || thread.isPinned');
  });
});

describe('read-together pulse', () => {
  const notesRoute = () => {
    const text = threadRoutes();
    const start = text.indexOf("route.get('/api/threads/:threadId/notes'");
    const end = text.indexOf('// ─── POST /api/threads/:threadId/progress');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it('resolves counts only for someone who may manage the plan', () => {
    const block = notesRoute();
    const gate = block.indexOf('canManageSpaceThreadStructure');
    const resolve = block.indexOf('readTogetherPulse');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(resolve);
  });

  it('never serializes who — the promise is how many, never who', () => {
    const text = source('server/utils/thread-sequence.ts');
    const pulse = text.slice(
      text.indexOf('export async function readTogetherPulse'),
      text.indexOf('export function withOpenedStep'),
    );
    expect(pulse).toContain('memberCount');
    // A userId in the returned shape would make this a roster.
    expect(pulse).not.toMatch(/return[\s\S]*userId:/);
  });
});

describe('POST /api/threads/:threadId/progress', () => {
  const progressRoute = () => {
    const text = threadRoutes();
    const start = text.indexOf("route.post('/api/threads/:threadId/progress'");
    const end = text.indexOf('// ─── POST /api/threads/:threadId/sequence');
    expect(start).toBeGreaterThan(-1);
    return text.slice(start, end > start ? end : undefined);
  };

  it("writes only the caller's own row", () => {
    const block = progressRoute();
    expect(block).toContain('eq(ThreadProgress.userId, auth.userId)');
    // No route may take a userId from the request and write someone else's.
    expect(block).not.toMatch(/body\??\.userId/);
  });

  it('ignores a step that is not in this plan', () => {
    expect(progressRoute()).toContain('liveNoteIds.includes(noteId)');
  });

  it('stores nothing for a collection Thread', () => {
    expect(progressRoute()).toContain('isSequenceMode(thread.mode)');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideStudyPlanCopy, orderedCopySteps } from '../study-plan-copy';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const base = {
  thread: { spaceId: 'space_channel', mode: 'sequence' },
  sourceSpace: { type: 'public', orgId: 'org_1', deletedAt: null },
  channelSpaceId: 'space_channel',
  callerIsMember: true,
  target: null,
};

const group = {
  spaceId: 'space_group',
  type: 'shared',
  deletedAt: null,
  callerCanManageThreads: true,
};

describe('decideStudyPlanCopy', () => {
  it('lets any follower take a channel’s study plan into their own Home', () => {
    expect(decideStudyPlanCopy(base)).toEqual({ ok: true });
  });

  it('lets a group’s leader hand the plan to their group', () => {
    expect(decideStudyPlanCopy({ ...base, target: group })).toEqual({ ok: true });
  });

  it('refuses someone who does not follow the channel', () => {
    expect(decideStudyPlanCopy({ ...base, callerIsMember: false })).toMatchObject({
      status: 403,
      code: 'CHANNEL_FOLLOW_REQUIRED',
    });
  });

  it('refuses a plain member handing a plan to a group they do not lead', () => {
    expect(
      decideStudyPlanCopy({ ...base, target: { ...group, callerCanManageThreads: false } }),
    ).toMatchObject({ status: 403, code: 'SPACE_THREAD_ROLE_REQUIRED' });
  });

  it.each([
    ['a thread from another space', { thread: { spaceId: 'space_other', mode: 'sequence' } }],
    ['a missing thread', { thread: null }],
    ['a church Shared Space as the source', { sourceSpace: { type: 'shared', orgId: 'org_1', deletedAt: null } }],
    ['a personal public space', { sourceSpace: { type: 'public', orgId: null, deletedAt: null } }],
    ['a deleted channel', { sourceSpace: { type: 'public', orgId: 'org_1', deletedAt: new Date() } }],
  ])('treats %s as not found', (_label, patch) => {
    expect(decideStudyPlanCopy({ ...base, ...patch })).toMatchObject({ status: 404, code: 'STUDY_PLAN_NOT_FOUND' });
  });

  it('only copies study plans, not ordinary threads', () => {
    expect(
      decideStudyPlanCopy({ ...base, thread: { spaceId: 'space_channel', mode: 'collection' } }),
    ).toMatchObject({ status: 400, code: 'NOT_A_STUDY_PLAN' });
  });

  it('refuses a personal space, a missing space, or the channel itself as the target', () => {
    expect(decideStudyPlanCopy({ ...base, target: { ...group, type: 'personal' } })).toMatchObject({
      status: 404,
    });
    expect(decideStudyPlanCopy({ ...base, target: { ...group, type: null } })).toMatchObject({ status: 404 });
    expect(
      decideStudyPlanCopy({ ...base, target: { ...group, spaceId: 'space_channel' } }),
    ).toMatchObject({ status: 400, code: 'SAME_SPACE' });
  });
});

describe('orderedCopySteps', () => {
  it('keeps the plan’s order, not the order the notes came back in', () => {
    const notes = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
    expect(orderedCopySteps(['a', 'b', 'c'], notes).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops steps a follower cannot see (removed or locked)', () => {
    expect(orderedCopySteps(['a', 'gone', 'c'], [{ id: 'a' }, { id: 'c' }]).map((n) => n.id)).toEqual(['a', 'c']);
  });
});

describe('copy write path', () => {
  const util = () => source('server/utils/study-plan-copy.ts');

  it('writes the Thread first so the dedupe index refuses a racing copy before any note lands', () => {
    const text = util();
    const tx = text.slice(text.indexOf('db.transaction'));
    expect(tx.indexOf('tx.insert(Threads)')).toBeLessThan(tx.indexOf('tx.insert(Notes)'));
    expect(tx).toContain('copiedFromThreadId: source.id');
  });

  it('copies as a sequence and starts at the first step', () => {
    expect(util()).toContain("mode: 'sequence'");
    expect(util()).toContain('sequenceCurrentNoteId: newIds[0] ?? null');
  });

  it('never copies a locked note', () => {
    expect(util()).toContain('eq(Notes.contentEncrypted, false)');
  });

  it('pins into a group only when nothing else is pinned', () => {
    expect(util()).toContain('pinned = !pinnedNow');
  });
});

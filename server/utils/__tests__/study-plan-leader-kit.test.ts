import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baselineRowFor,
  canUseLeaderKit,
  decideKitCarry,
  normalizeGuideInput,
  parseQuestions,
  remapGuidesForCopy,
  stepFingerprint,
} from '../study-plan-leader-kit';

describe('canUseLeaderKit', () => {
  const group = { type: 'shared', userId: 'u_owner', orgId: 'org_1' };
  const channel = { type: 'public', userId: 'u_owner', orgId: 'org_1' };
  it('lets a group or channel’s leaders in, and nobody else', () => {
    expect(canUseLeaderKit(group, 'leader', 'u_lead')).toBe(true);
    expect(canUseLeaderKit(group, 'owner', 'u_x')).toBe(true);
    expect(canUseLeaderKit(channel, 'leader', 'u_staff')).toBe(true);
    expect(canUseLeaderKit(group, 'member', 'u_member')).toBe(false);
    expect(canUseLeaderKit(channel, 'member', 'u_follower')).toBe(false);
  });
  it('never in a Home', () => {
    expect(canUseLeaderKit({ type: 'personal', userId: 'u_me', orgId: null }, 'owner', 'u_me')).toBe(false);
    expect(canUseLeaderKit(null, 'owner', 'u_me')).toBe(false);
  });
});

describe('decideKitCarry — only the church’s own rooms', () => {
  it('carries into a room of the same church', () => {
    expect(decideKitCarry({ targetSpace: { type: 'shared', orgId: 'org_1' }, sourceOrgId: 'org_1' })).toBe(true);
  });
  it('never into Home, a churchless group, or another church', () => {
    expect(decideKitCarry({ targetSpace: null, sourceOrgId: 'org_1' })).toBe(false);
    expect(decideKitCarry({ targetSpace: { type: 'shared', orgId: null }, sourceOrgId: 'org_1' })).toBe(false);
    expect(decideKitCarry({ targetSpace: { type: 'shared', orgId: 'org_2' }, sourceOrgId: 'org_1' })).toBe(false);
    expect(decideKitCarry({ targetSpace: { type: 'personal', orgId: 'org_1' }, sourceOrgId: 'org_1' })).toBe(false);
  });
});

describe('normalizeGuideInput', () => {
  it('trims, collapses questions, and drops blanks', () => {
    const r = normalizeGuideInput({ leaderNotes: '  Open with prayer \r\n', questions: ['  What   surprised you? ', '', 3] });
    expect(r).toEqual({ ok: true, guide: { leaderNotes: 'Open with prayer', questions: ['What surprised you?'] } });
  });
  it('an empty guide means delete', () => {
    expect(normalizeGuideInput({ leaderNotes: ' ', questions: [] })).toEqual({ ok: true, guide: null });
  });
  it('refuses the wrong shapes and too much', () => {
    expect(normalizeGuideInput({ leaderNotes: 4 }).ok).toBe(false);
    expect(normalizeGuideInput({ questions: 'one' }).ok).toBe(false);
    expect(normalizeGuideInput({ leaderNotes: 'x'.repeat(4001) }).ok).toBe(false);
    expect(normalizeGuideInput({ questions: Array.from({ length: 13 }, (_, i) => `q${i}`) }).ok).toBe(false);
    expect(normalizeGuideInput({ questions: ['x'.repeat(301)] }).ok).toBe(false);
  });
});

describe('parseQuestions', () => {
  it('reads a list and survives junk', () => {
    expect(parseQuestions('["a","b"]')).toEqual(['a', 'b']);
    expect(parseQuestions('not json')).toEqual([]);
    expect(parseQuestions('{"a":1}')).toEqual([]);
    expect(parseQuestions(null)).toEqual([]);
  });
});

describe('copying the kit', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  it('re-keys guides onto the copy’s steps and drops ones for uncopied steps', () => {
    const rows = remapGuidesForCopy({
      guides: [
        { id: 'spg_1', noteId: 'src_a', leaderNotes: 'n', questions: '["q"]' },
        { id: 'spg_2', noteId: 'src_gone', leaderNotes: null, questions: '["x"]' },
      ],
      stepIdMap: new Map([['src_a', 'copy_a']]),
      copyThreadId: 'thr_copy',
      actorId: 'u_lead',
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ threadId: 'thr_copy', noteId: 'copy_a', copiedFromGuideId: 'spg_1', questions: '["q"]' });
  });

  it('records what each copied step said', () => {
    const row = baselineRowFor({
      copyThreadId: 'thr_copy',
      sourceThreadId: 'thr_src',
      steps: [{ id: 'src_a', title: 'Week 1', content: '<p>Romans 8</p>' }],
      now,
    });
    expect(JSON.parse(row.stepFingerprints!)).toEqual({ src_a: stepFingerprint({ title: 'Week 1', content: '<p>Romans 8</p>' }) });
  });

  it('a fingerprint changes when the words do, and only then', () => {
    const a = stepFingerprint({ title: 'Week 1', content: '<p>Romans 8</p>' });
    expect(stepFingerprint({ title: 'Week 1', content: '<p>Romans 8</p>' })).toBe(a);
    expect(stepFingerprint({ title: 'Week 1', content: '<p>Romans 9</p>' })).not.toBe(a);
    expect(stepFingerprint({ title: 'Week 2', content: '<p>Romans 8</p>' })).not.toBe(a);
  });
});

describe('leader kit — wiring and privacy', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('every kit route resolves leader access before reading or writing', () => {
    const routes = src('server/routes/study-plan-leader-kit.ts');
    for (const marker of ["app.get('/api/threads/:threadId/leader-kit'", "app.post('/api/threads/:threadId/leader-kit/steps/:noteId'"]) {
      const body = routes.slice(routes.indexOf(marker));
      const gate = body.indexOf('resolveLeaderKitAccess(');
      expect(gate).toBeGreaterThan(-1);
      for (const touch of ['loadGuides(', 'db.delete(', 'db.insert(', '.update(StudyPlanStepGuides)']) {
        const at = body.indexOf(touch);
        if (at !== -1) expect(gate).toBeLessThan(at);
      }
    }
    expect(routes).toContain("'Cache-Control': 'private, max-age=0, no-store'");
  });

  it('member-facing reads never touch the kit tables', () => {
    for (const file of ['server/routes/threads.ts', 'server/routes/shared.ts', 'server/routes/church-space-plan.ts']) {
      const text = code(src(file));
      expect(text, file).not.toMatch(/StudyPlanStepGuides|GatheringAgendas|StudyPlanLibraryItems/);
    }
  });

  it('the copy carries guides only when told to, inside its transaction, after the plan row', () => {
    const text = src('server/utils/study-plan-copy.ts');
    expect(text).toContain('const guideRows = carryKit');
    const tx = text.slice(text.indexOf('await db.transaction('));
    const plan = tx.indexOf('tx.insert(Threads)');
    expect(tx.indexOf('tx.insert(StudyPlanStepGuides)')).toBeGreaterThan(plan);
    expect(tx.indexOf('tx.insert(StudyPlanCopyBaselines)')).toBeGreaterThan(plan);
    expect(src('server/routes/church-study-plan-copy.ts')).toContain('carryKit: decideKitCarry(');
  });

  it('deleting a plan deletes its kit', () => {
    expect(src('server/routes/threads.ts')).toContain('deleteLeaderKitForThreads(db, [threadId])');
    const lifecycle = src('server/utils/shared-space-lifecycle.ts');
    expect(lifecycle).toContain('deleteLeaderKitForThreads(tx, [thread.id])');
    expect(lifecycle).toContain('deleteLeaderKitForThreads(tx, threadIds)');
  });
});

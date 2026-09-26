import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffUpstream, parseFingerprints, placeNewSteps } from '../study-plan-source-update';
import { stepFingerprint } from '../study-plan-leader-kit';

const step = (id: string, title: string, content = `<p>${title}</p>`) => ({ id, title, content });

describe('diffUpstream', () => {
  const w1 = step('src_1', 'Week 1');
  const w2 = step('src_2', 'Week 2');
  const w3 = step('src_3', 'Week 3');
  const copySteps = [
    { id: 'copy_1', copiedFromNoteId: 'src_1' },
    { id: 'copy_2', copiedFromNoteId: 'src_2' },
  ];
  const baseline = { src_1: stepFingerprint(w1), src_2: stepFingerprint(w2) };

  it('finds a step the church added', () => {
    const diff = diffUpstream({ sourceSteps: [w1, w2, w3], baseline, copySteps });
    expect(diff.newSteps).toEqual([{ sourceNoteId: 'src_3', title: 'Week 3' }]);
    expect(diff.editedSteps).toEqual([]);
  });

  it('finds a step the church changed, paired with the group’s copy', () => {
    const edited = step('src_2', 'Week 2', '<p>Week 2, rewritten</p>');
    const diff = diffUpstream({ sourceSteps: [w1, edited], baseline, copySteps });
    expect(diff.editedSteps).toEqual([{ sourceNoteId: 'src_2', copyNoteId: 'copy_2', title: 'Week 2' }]);
  });

  it('says nothing when nothing changed', () => {
    expect(diffUpstream({ sourceSteps: [w1, w2], baseline, copySteps })).toEqual({ newSteps: [], editedSteps: [] });
  });

  it('a step the group removed from its copy isn’t flagged as changed', () => {
    const edited = step('src_2', 'Week 2', '<p>changed</p>');
    const diff = diffUpstream({ sourceSteps: [w1, edited], baseline, copySteps: [copySteps[0]] });
    expect(diff.editedSteps).toEqual([]);
  });

  it('a copy from before baselines: what it holds is seen, and no edit is claimed', () => {
    const edited = step('src_1', 'Week 1', '<p>changed</p>');
    const diff = diffUpstream({ sourceSteps: [edited, w2, w3], baseline: null, copySteps });
    expect(diff.newSteps.map((s) => s.sourceNoteId)).toEqual(['src_3']);
    expect(diff.editedSteps).toEqual([]);
  });
});

describe('placeNewSteps', () => {
  const copyBySource = new Map([
    ['src_1', 'copy_1'],
    ['src_2', 'copy_2'],
    ['src_4', 'copy_4'],
  ]);
  it('puts a new step right after its nearest earlier church step', () => {
    expect(
      placeNewSteps({
        copySequence: ['copy_1', 'copy_2', 'copy_4'],
        sourceSequence: ['src_1', 'src_2', 'src_3', 'src_4'],
        copyBySource,
        added: new Map([['src_3', 'new_3']]),
      }),
    ).toEqual(['copy_1', 'copy_2', 'new_3', 'copy_4']);
  });
  it('keeps several new steps in the church’s order', () => {
    expect(
      placeNewSteps({
        copySequence: ['copy_1'],
        sourceSequence: ['src_1', 'src_5', 'src_6'],
        copyBySource: new Map([['src_1', 'copy_1']]),
        added: new Map([
          ['src_5', 'new_5'],
          ['src_6', 'new_6'],
        ]),
      }),
    ).toEqual(['copy_1', 'new_5', 'new_6']);
  });
  it('follows the group’s own order when they rearranged it', () => {
    expect(
      placeNewSteps({
        copySequence: ['copy_2', 'copy_1'],
        sourceSequence: ['src_1', 'src_2', 'src_3'],
        copyBySource,
        added: new Map([['src_3', 'new_3']]),
      }),
    ).toEqual(['copy_2', 'new_3', 'copy_1']);
  });
  it('appends when there is nothing earlier to follow', () => {
    expect(
      placeNewSteps({
        copySequence: ['copy_1'],
        sourceSequence: ['src_0', 'src_1'],
        copyBySource: new Map([['src_1', 'copy_1']]),
        added: new Map([['src_0', 'new_0']]),
      }),
    ).toEqual(['copy_1', 'new_0']);
  });
});

describe('parseFingerprints', () => {
  it('reads a map and survives junk', () => {
    expect(parseFingerprints('{"a":"x"}')).toEqual({ a: 'x' });
    expect(parseFingerprints('[1]')).toEqual({});
    expect(parseFingerprints('nope')).toEqual({});
    expect(parseFingerprints(null)).toEqual({});
  });
});

describe('source update — wiring', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('adding steps locks the baseline first and recomputes inside the transaction', () => {
    const text = src('server/utils/study-plan-source-update.ts');
    const fn = text.slice(text.indexOf('export async function addUpstreamSteps'));
    const tx = fn.slice(fn.indexOf('db.transaction('));
    const lock = tx.indexOf('lockBaseline(tx,');
    const recompute = tx.indexOf('!(step.id in baseline.fingerprints)');
    const insert = tx.indexOf('insertCopiedStepsInTx(tx,');
    expect(lock).toBeGreaterThan(-1);
    expect(recompute).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(recompute);
    expect(text.slice(text.indexOf('async function lockBaseline'))).toContain(".for('update')");
  });

  it('never writes into a copy step it didn’t just create', () => {
    const text = src('server/utils/study-plan-source-update.ts');
    expect(text).not.toMatch(/\.update\(Notes\)/);
  });

  it('only a church channel plan the viewer can see counts as a source', () => {
    const text = src('server/utils/study-plan-source-update.ts');
    const fn = text.slice(text.indexOf('export async function resolveSourcePlan'));
    expect(fn).toContain("channel.type !== 'public' || !channel.orgId");
    expect(fn).toContain('if (!member) return null;');
  });

  it('the routes gate on leading the plan and only take steps into a group', () => {
    const routes = src('server/routes/study-plan-leader-kit.ts');
    for (const marker of ["app.post('/api/threads/:threadId/source-update/add-steps'", "app.post('/api/threads/:threadId/source-update/dismiss'"]) {
      const body = routes.slice(routes.indexOf(marker));
      expect(body.indexOf('resolveLeaderKitAccess(')).toBeGreaterThan(-1);
      expect(body.indexOf('resolveLeaderKitAccess(')).toBeLessThan(body.search(/addUpstreamSteps\(|dismissUpstream\(/));
    }
    const add = routes.slice(routes.indexOf("app.post('/api/threads/:threadId/source-update/add-steps'"));
    expect(add).toContain("'NOT_A_GROUP_COPY'");
    expect(add).toContain('carryKit: decideKitCarry(');
  });
});

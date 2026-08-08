/**
 * Contract tests for publishing a series as a study plan.
 *
 * The pure helpers are tested directly; the write path's invariants — which
 * gate runs, what is refused, what republishing does — are asserted against the
 * source, in the style of church-services-routes.test.ts, because what matters
 * is that no second path appears that skips them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stepNoteSeedContent } from '../church-series-publish';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
/** Prose explaining a decision is not the code making it. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('stepNoteSeedContent', () => {
  it('seeds a step with its passage', () => {
    expect(stepNoteSeedContent({ reference: 'Romans 8:1-11' })).toBe('<p>Romans 8:1-11</p>');
  });

  it('leaves a step blank when the week has no passage yet', () => {
    expect(stepNoteSeedContent({ reference: null })).toBe('');
    expect(stepNoteSeedContent({ reference: '   ' })).toBe('');
  });

  it('escapes a passage rather than trusting it into markup', () => {
    expect(stepNoteSeedContent({ reference: '<script>x</script>' })).toBe(
      '<p>&lt;script&gt;x&lt;/script&gt;</p>',
    );
  });
});

describe('publish write path', () => {
  const publish = () => source('server/utils/church-series-publish.ts');

  it('never mints a second Thread for a series that already published one', () => {
    const text = publish();
    expect(text).toContain('let threadId = series.publishedThreadId');
    expect(text).toContain('if (!threadId)');
  });

  it('pins only into a vacancy, so publishing cannot demote the current Thread', () => {
    const text = publish();
    expect(text).toContain('eq(Threads.isPinned, true)');
    expect(text).toContain('pinned = !existingPinned');
  });

  it('skips weeks this Thread already holds — republishing appends', () => {
    const text = publish();
    expect(text).toContain('alreadyPublished.has(week.id)');
    expect(text).toContain('continue');
  });

  it('claims the week through the published-notes row, not startedFromServiceId', () => {
    const text = publish();
    expect(text).toContain('ChurchServicePublishedNotes');
    /*
      startedFromServiceId is the congregant's OWN note and its read path is
      scoped to one user by a rule stated twice in church-teaching-plan.ts.
      Writing published church material through it would make that read
      unable to tell the two facts apart.
    */
    expect(withoutComments(text)).not.toContain('startedFromServiceId');
  });

  it('keeps the room on its current step across a republish', () => {
    const text = publish();
    expect(text).toContain('orderedNoteIds.includes(currentThread.sequenceCurrentNoteId)');
  });

  it("gives a step note the author's home space, not the room", () => {
    // Notes.spaceId is the note's home; SpaceNotes is the room association.
    // A step written straight into the shared space would be the only note in
    // the system shaped differently from every other one.
    const text = publish();
    expect(text).toContain('homeSpaceIdFor');
    expect(text).toContain('spaceId: noteHomeSpaceId ?? spaceId');
  });

  it('orders undated backlog weeks after the dated ones', () => {
    const text = publish();
    expect(text).toContain('asc(ChurchServices.serviceDate)');
    expect(text).toContain('asc(ChurchServices.createdAt)');
  });
});

describe('publish route', () => {
  const routeBlock = () => {
    const text = source('server/routes/church-space-plan.ts');
    const start = text.indexOf("'/api/church/spaces/:spaceId/series/publish-thread'");
    expect(start).toBeGreaterThan(-1);
    return text.slice(start);
  };

  it('requires both the plan gate and the space Thread gate', () => {
    const block = routeBlock();
    expect(block).toContain('assertCanManageSpaceTeachingPlan');
    expect(block).toContain('canManageSpaceThreadStructure');
  });

  it('refuses ministry channels before touching a row', () => {
    const block = routeBlock();
    const channelCheck = block.indexOf('CHANNELS_READ_ONLY_PILOT');
    const publishCall = block.indexOf('publishSeriesAsStudyPlan');
    expect(channelCheck).toBeGreaterThan(-1);
    expect(channelCheck).toBeLessThan(publishCall);
  });

  it('refuses a church-wide series rather than guessing a room for it', () => {
    expect(routeBlock()).toContain('CHURCH_PLAN_PUBLISH_UNSUPPORTED');
  });

  it('proves the series belongs to the gate\'s own church and space', () => {
    const block = routeBlock();
    expect(block).toContain('series.churchId !== gate.church.id');
    expect(block).toContain('series.spaceId !== gate.space.id');
  });

  it('tells the room, not just the publisher', () => {
    const block = routeBlock();
    expect(block).toContain("type: 'space:updated'");
  });
});

describe('thread deletion', () => {
  it('nulls a series pointer at the Thread being deleted', () => {
    const text = source('server/utils/shared-space-lifecycle.ts');
    const block = text.slice(text.indexOf('export async function deleteThreadInTransaction'));
    expect(block).toContain('ChurchSeries');
    expect(block).toContain('publishedThreadId: null');
  });
});

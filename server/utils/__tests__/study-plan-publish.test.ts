import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidePlanPublishToChannel } from '../study-plan-publish';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const base = {
  actorId: 'user_staff',
  thread: { userId: 'user_staff', mode: 'sequence', spaceId: 'space_home' },
  sourceSpaceType: 'personal',
  channel: { type: 'public', orgId: 'org_1', deletedAt: null },
  callerLeadsChannel: true,
  approvalRequired: false,
};

describe('decidePlanPublishToChannel', () => {
  it('lets a staffer publish a plan from their own Home into a channel they lead', () => {
    expect(decidePlanPublishToChannel(base)).toEqual({ ok: true });
  });

  it('accepts a plan with no space at all (a personal reading plan)', () => {
    expect(
      decidePlanPublishToChannel({ ...base, thread: { ...base.thread, spaceId: null }, sourceSpaceType: null }),
    ).toEqual({ ok: true });
  });

  it("refuses someone else's plan as not found", () => {
    const d = decidePlanPublishToChannel({ ...base, thread: { ...base.thread, userId: 'user_other' } });
    expect(d).toMatchObject({ ok: false, status: 404, code: 'STUDY_PLAN_NOT_FOUND' });
  });

  it('refuses a plain collection Thread', () => {
    const d = decidePlanPublishToChannel({ ...base, thread: { ...base.thread, mode: 'collection' } });
    expect(d).toMatchObject({ ok: false, code: 'NOT_A_STUDY_PLAN' });
  });

  it('refuses a plan that already lives in a shared space or channel', () => {
    const d = decidePlanPublishToChannel({ ...base, sourceSpaceType: 'shared' });
    expect(d).toMatchObject({ ok: false, code: 'NOT_IN_YOUR_STUDY' });
  });

  it('answers the same 404 for a channel the caller does not lead as for none', () => {
    const notLed = decidePlanPublishToChannel({ ...base, callerLeadsChannel: false });
    const none = decidePlanPublishToChannel({ ...base, channel: null });
    expect(notLed).toEqual(none);
    expect(none).toMatchObject({ status: 404, code: 'CHANNEL_NOT_FOUND' });
  });

  it('refuses a shared space or a deleted channel', () => {
    expect(decidePlanPublishToChannel({ ...base, channel: { ...base.channel, type: 'shared' } })).toMatchObject({
      code: 'CHANNEL_NOT_FOUND',
    });
    expect(
      decidePlanPublishToChannel({ ...base, channel: { ...base.channel, deletedAt: '2026-11-01' } }),
    ).toMatchObject({ code: 'CHANNEL_NOT_FOUND' });
  });

  it('honours content approval like add-note does', () => {
    const d = decidePlanPublishToChannel({ ...base, approvalRequired: true });
    expect(d).toMatchObject({ ok: false, status: 409, code: 'CONTENT_APPROVAL_REQUIRED' });
  });
});

describe('publish route wiring', () => {
  const route = source('server/routes/church-study-plan-publish.ts');

  it('proves staff, sponsorship-gated, before the decision', () => {
    expect(route).toMatch(/sponsorshipGated: true/);
    expect(route.indexOf('resolveChurchOrgAccess(')).toBeLessThan(route.indexOf('decidePlanPublishToChannel('));
  });

  it('is mounted in the app', () => {
    expect(source('server/app.ts')).toMatch(/app\.route\('\/', churchStudyPlanPublish\)/);
  });
});

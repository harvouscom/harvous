import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PUBLISH_AT_MAX_AHEAD_MS,
  cleanReviewNote,
  parsePublishAt,
  planApproval,
  planSubmission,
  roleCanReview,
  submissionActor,
} from '../church-content';

const now = new Date('2026-09-25T12:00:00Z');

describe('parsePublishAt', () => {
  it('reads nothing as now', () => {
    expect(parsePublishAt(undefined, now)).toEqual({ ok: true, publishAt: null });
    expect(parsePublishAt(null, now)).toEqual({ ok: true, publishAt: null });
    expect(parsePublishAt('', now)).toEqual({ ok: true, publishAt: null });
  });
  it('treats the past and the next minute as now', () => {
    expect(parsePublishAt('2026-09-24T12:00:00Z', now)).toEqual({ ok: true, publishAt: null });
    expect(parsePublishAt('2026-09-25T12:00:30Z', now)).toEqual({ ok: true, publishAt: null });
  });
  it('keeps a time ahead', () => {
    const r = parsePublishAt('2026-09-27T13:00:00Z', now);
    expect(r.ok && r.publishAt?.toISOString()).toBe('2026-09-27T13:00:00.000Z');
  });
  it('refuses garbage and more than a year out', () => {
    expect(parsePublishAt('soon', now).ok).toBe(false);
    expect(parsePublishAt(42, now).ok).toBe(false);
    expect(parsePublishAt(new Date(now.getTime() + PUBLISH_AT_MAX_AHEAD_MS + 60_000).toISOString(), now).ok).toBe(false);
  });
});

describe('planSubmission', () => {
  const later = new Date('2026-09-27T13:00:00Z');
  it('publishes now without approval or a time', () => {
    expect(planSubmission({ approvalRequired: false, publishAt: null })).toBe('publish_now');
  });
  it('schedules with a time', () => {
    expect(planSubmission({ approvalRequired: false, publishAt: later })).toBe('scheduled');
  });
  it('goes to review whenever approval is required, time or not', () => {
    expect(planSubmission({ approvalRequired: true, publishAt: null })).toBe('in_review');
    expect(planSubmission({ approvalRequired: true, publishAt: later })).toBe('in_review');
  });
});

describe('planApproval', () => {
  it('publishes when the requested time has passed or was never set', () => {
    expect(planApproval({ publishAt: null, now })).toBe('publish_now');
    expect(planApproval({ publishAt: new Date('2026-09-25T11:00:00Z'), now })).toBe('publish_now');
  });
  it('schedules for a time still ahead', () => {
    expect(planApproval({ publishAt: new Date('2026-09-26T08:00:00Z'), now })).toBe('scheduled');
  });
});

describe('who acts on a submission', () => {
  it('its author and reviewers can see it; nobody else', () => {
    const submission = { authorUserId: 'u_teacher' };
    expect(submissionActor({ submission, userId: 'u_teacher', canReview: false }).canSee).toBe(true);
    expect(submissionActor({ submission, userId: 'u_pastor', canReview: true }).canSee).toBe(true);
    expect(submissionActor({ submission, userId: 'u_other', canReview: false }).canSee).toBe(false);
  });
  it('reviewers are the church-wide teaching roles; an unknown role never reviews', () => {
    expect(roleCanReview('org:admin')).toBe(true);
    expect(roleCanReview('org:pastor')).toBe(true);
    expect(roleCanReview('org:coordinator')).toBe(true);
    expect(roleCanReview('org:teacher')).toBe(false);
    expect(roleCanReview('org:member')).toBe(false);
    expect(roleCanReview(null)).toBe(false);
    expect(roleCanReview(undefined)).toBe(false);
  });
});

describe('cleanReviewNote', () => {
  it('collapses, trims and caps', () => {
    expect(cleanReviewNote('  needs   a  verse  ')).toBe('needs a verse');
    expect(cleanReviewNote('')).toBeNull();
    expect(cleanReviewNote(3)).toBeNull();
    expect(cleanReviewNote('x'.repeat(400))?.length).toBe(280);
  });
});

describe('content lifecycle — wiring', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('never writes SpaceNotes itself — going live is the ordinary publish', () => {
    for (const file of ['server/utils/church-content.ts', 'server/routes/church-content.ts']) {
      const text = src(file);
      expect(text).not.toMatch(/insert\(SpaceNotes\)|update\(SpaceNotes\)/);
    }
    expect(src('server/utils/church-content.ts')).toContain('associateAuthoredNoteWithSpace(tx,');
  });

  it('claims a submission before publishing it, in the same transaction', () => {
    const text = src('server/utils/church-content.ts');
    const fn = text.slice(text.indexOf('export async function publishSubmission'));
    const claim = fn.indexOf(".set({ status: 'published'");
    const publish = fn.indexOf('associateAuthoredNoteWithSpace(tx,');
    expect(claim).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(claim);
    expect(fn.slice(0, claim)).toContain('db.transaction(');
  });

  it('refuses a direct publish into a channel when approval is on', () => {
    expect(src('server/routes/spaces.ts')).toContain('contentApprovalRequired(auth.userId, accessInfo.space.orgId)');
    expect(src('server/routes/notes.ts')).toContain('contentApprovalRequired(auth.userId, targetSpaceAccess.space.orgId)');
  });

  it('only reviewers approve or decline', () => {
    const routes = src('server/routes/church-content.ts');
    for (const name of ['approve', 'decline']) {
      const body = routes.slice(routes.indexOf(`app.post('/api/church/content/${name}'`));
      expect(body.slice(0, 900)).toContain("'REVIEW_ROLE_REQUIRED'");
    }
  });

  it('the tick runs every five minutes on the scheduler', () => {
    const scheduler = src('server/scheduler.ts');
    expect(scheduler).toContain('runChurchContentTick()');
    expect(scheduler).toContain('5 * 60_000');
  });
});

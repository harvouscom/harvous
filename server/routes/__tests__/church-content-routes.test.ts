/**
 * Contract tests for the church content routes (schedule, approve, decline). Source assertions,
 * matching the other church route tests: who is gated, before what, and on which rule.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routes = () => readFileSync(resolve(process.cwd(), 'server/routes/church-content.ts'), 'utf8');

function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const post = (name: string) => `app.post('/api/church/content/${name}'`;
const WRITE_ROUTES = ['submit', 'approve', 'decline', 'publish-now', 'reschedule', 'withdraw'];

describe('church content routes', () => {
  it.each(WRITE_ROUTES)('%s is rate-limited and gated before any write', (name) => {
    const body = handlerBody(routes(), post(name));
    expect(body).toContain("rateLimit('write')");
    const gate = body.search(/resolveChurchOrgAccess\(|loadForActor\(/);
    expect(gate, 'no gate').toBeGreaterThan(-1);
    for (const write of [/\.insert\(ChurchContentSubmissions\)/, /\.update\(ChurchContentSubmissions\)/, /publishSubmission\(/, /associateAuthoredNoteWithSpace\(/]) {
      const at = body.search(write);
      if (at !== -1) expect(gate, `${write} before the gate`).toBeLessThan(at);
    }
  });

  it('putting something new out is plan-gated; reading and taking back are not', () => {
    const text = routes();
    const read = text.slice(text.indexOf('const READ'), text.indexOf('};', text.indexOf('const READ')));
    expect(read).toContain('sponsorshipGated: false');
    expect(text).toContain('const PUBLISH: ChurchOrgAccessRule = { ...READ, sponsorshipGated: true }');
    for (const name of ['submit', 'approve', 'publish-now']) {
      expect(handlerBody(text, post(name))).toMatch(/PUBLISH\)/);
    }
    for (const name of ['decline', 'reschedule', 'withdraw']) {
      expect(handlerBody(text, post(name))).toMatch(/READ\)/);
    }
  });

  it.each(['approve', 'decline'])('only a reviewer may %s', (name) => {
    const body = handlerBody(routes(), post(name));
    const check = body.indexOf('!loaded.actor.canReview');
    expect(check).toBeGreaterThan(-1);
    expect(body).toContain("'REVIEW_ROLE_REQUIRED'");
    const write = body.search(/\.update\(ChurchContentSubmissions\)|publishSubmission\(/);
    expect(check).toBeLessThan(write);
  });

  it('submitting requires owning the note and leading the channel', () => {
    const body = handlerBody(routes(), post('submit'));
    expect(body).toContain('note.userId !== auth.userId');
    expect(body).toContain("membership?.role !== 'owner' && membership?.role !== 'leader'");
  });

  it('someone else’s submission reads as missing', () => {
    const text = routes();
    const fn = text.slice(text.indexOf('async function loadForActor'));
    expect(fn.slice(0, 1200)).toContain('if (!actor.canSee) return { ok: false as const, status: 404 as const');
  });
});

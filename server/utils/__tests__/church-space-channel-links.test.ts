/**
 * Contract tests for the space↔channel pairing.
 *
 * What these protect is the single finding that killed the pointer this
 * replaces (docs/future/CHURCH_STUDY_MATERIAL_LINKING.md): a stored relation
 * with no read-side semantics. Every assertion below is some form of "the row
 * is not the relation" — if one starts failing, a caller has begun trusting the
 * table.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const util = () => source('server/utils/church-space-channel-links.ts');
const routes = () => source('server/routes/church-space-channel-links.ts');

describe('companion resolution', () => {
  it('re-verifies both halves on every read', () => {
    const fn = util().slice(util().indexOf('async function resolvePair'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    // Present, active, same org, and each still the kind of room its side means.
    expect(body).toContain('if (!space || !channel) return null');
    expect(body).toMatch(/!space\.isActive \|\| !channel\.isActive/);
    expect(body).toMatch(/space\.orgId !== link\.orgId \|\| channel\.orgId !== link\.orgId/);
    expect(body).toContain("space.type !== 'shared'");
    expect(body).toContain('isMinistryBroadcastSpaceRow(channel)');
  });

  it('routes every public read through the resolver, never the raw row', () => {
    // The listing included: a picker that showed pairings the detail view would
    // deny is worse than one that shows fewer.
    const text = util();
    for (const fn of [
      'export async function resolveCompanionChannel',
      'export async function resolveCompanionOf',
      'export async function listCompanionLinks',
    ]) {
      const body = text.slice(text.indexOf(fn));
      const end = body.indexOf('\n}');
      expect(body.slice(0, end), fn).toContain('resolvePair');
    }
  });

  it('only excludes live spaces from a listing after resolving them', () => {
    const text = util();
    const body = text.slice(text.indexOf('export async function listCompanionLinks'));
    expect(body.slice(0, body.indexOf('\n}'))).toMatch(/filter\(.*pair !== null/s);
  });
});

describe('setChannelLink', () => {
  const fn = () => {
    const text = util();
    return text.slice(text.indexOf('export async function setChannelLink'));
  };

  it('validates both rooms against the caller’s own org', () => {
    // A bare id in a body is exactly how a staff member ends up borrowing
    // another church's channel.
    const body = fn();
    expect(body).toMatch(/space\.orgId !== orgId/);
    expect(body).toMatch(/channel\.orgId !== orgId/);
    expect(body).toContain('isMinistryBroadcastSpaceRow(channel)');
    expect(body).toContain("space.type !== 'shared'");
  });

  it('treats null as unpair rather than needing a second route', () => {
    expect(fn()).toMatch(/if \(!channelSpaceId\)[\s\S]{0,200}db\.delete\(/);
  });

  it('refuses a channel already speaking for another space', () => {
    const body = fn();
    expect(body).toContain('CHANNEL_ALREADY_PAIRED');
    expect(body).toMatch(/claimed\.spaceId !== spaceId/);
  });

  it('upserts on the space, so two staff converge instead of forking', () => {
    expect(fn()).toMatch(/onConflictDoUpdate[\s\S]{0,120}ChurchSpaceChannelLinks\.spaceId/);
  });
});

describe('routes', () => {
  it('gates both staff endpoints before any work', () => {
    const text = routes();
    for (const marker of [
      "app.get('/api/church/space-channel-links'",
      "app.post('/api/church/space-channel-links/set'",
    ]) {
      const start = text.indexOf(marker);
      expect(start, marker).toBeGreaterThan(-1);
      const next = text.indexOf('\napp.', start + 1);
      const body = text.slice(start, next === -1 ? undefined : next);
      const gateAt = body.indexOf('assertCanManageChannelLinks');
      expect(gateAt, `${marker} has no gate`).toBeGreaterThan(-1);
      for (const work of ['listCompanionLinks(', 'setChannelLink(']) {
        const at = body.indexOf(work);
        if (at === -1) continue;
        expect(gateAt, `${work} runs before the gate`).toBeLessThan(at);
      }
    }
  });

  it('rate-limits the write', () => {
    const text = routes();
    const start = text.indexOf("app.post('/api/church/space-channel-links/set'");
    expect(text.slice(start, start + 200)).toContain("rateLimit('write')");
  });

  it('gates the companion read on membership, not on staff', () => {
    // The pairing is a fact about the room, and the people in it are who the
    // chip is for.
    const text = routes();
    const start = text.indexOf("app.get('/api/spaces/:spaceId/companion'");
    const body = text.slice(start, text.indexOf('\napp.', start + 1));
    expect(body).toContain('requireSpaceAccess');
    expect(body).not.toContain('assertCanManageChannelLinks');
  });

  it('takes the org from the gate, not from the body, when writing', () => {
    const text = routes();
    const start = text.indexOf("app.post('/api/church/space-channel-links/set'");
    const body = text.slice(start);
    expect(body).toContain('orgId: gate.church.orgId');
  });
});

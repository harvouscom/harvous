/**
 * Contract tests for the shared-space suggestion box.
 *
 * Source assertions rather than a running server, the house pattern for
 * these routes (church-library-routes.test.ts). What they protect: the
 * attribution exception stays confined to the leader queue; a member reads
 * only their own rows, scoped in the query; accepting cannot outlive the
 * Thread it promises; and the per-room switch is honoured on the write.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveThreadTitle, OPEN_SUGGESTIONS_MAX } from '../space-study-suggestions';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = () => source('server/routes/space-study-suggestions.ts');

function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const CREATE = "app.post(\n  '/api/spaces/:spaceId/study-suggestions/create'";
const MINE = "app.get('/api/spaces/:spaceId/study-suggestions/mine'";
const QUEUE = "app.get('/api/spaces/:spaceId/study-suggestions'";
const MARK_READ = "app.post('/api/spaces/:spaceId/study-suggestions/mark-read'";
const REVIEW = "app.post(\n  '/api/spaces/:spaceId/study-suggestions/review'";
const WITHDRAW = "app.post(\n  '/api/spaces/:spaceId/study-suggestions/withdraw'";

describe('space study suggestions', () => {
  it('is mounted', () => {
    const app = source('server/app.ts');
    expect(app).toContain("from './routes/space-study-suggestions'");
    expect(app).toContain('app.route(\'/\', spaceStudySuggestions)');
  });

  it('refuses to create while the room has suggestions off', () => {
    const body = handlerBody(routes(), CREATE);
    expect(body).toContain("studyPlanningMode === 'off'");
    expect(body).toContain('SUGGESTIONS_OFF');
  });

  it('answers only for shared rooms, and says "not found" for the rest', () => {
    const text = routes();
    const helper = text.slice(
      text.indexOf('async function requireSuggestionRoom'),
      text.indexOf('function canReview'),
    );
    expect(helper).toContain("space.type !== 'shared'");
    expect(helper).toContain('SpaceAccessError(404');
  });

  it('scopes "mine" to the caller in the query, not after the fact', () => {
    const body = handlerBody(routes(), MINE);
    expect(body).toContain('eq(SpaceStudySuggestions.suggestedByUserId, auth.userId)');
  });

  it('names the suggester only in the leader-gated queue', () => {
    const text = routes();
    const queue = handlerBody(text, QUEUE);
    expect(queue).toContain('canReview(access, auth.userId)');
    expect(queue).toContain('suggestedByName:');
    expect(queue).toContain('displayNamesFor(');

    for (const marker of [CREATE, MINE, WITHDRAW]) {
      const body = handlerBody(text, marker);
      expect(body, marker).not.toContain('suggestedByName:');
      expect(body, marker).not.toContain('displayNamesFor(');
    }
    const mine = text.slice(text.indexOf('function serializeMine'), text.indexOf('/** Resolve Thread'));
    expect(mine).not.toContain('suggestedByUserId');
    expect(mine).not.toContain('reviewedByUserId');
  });

  it('gates every leader action on the same rule that governs the room\'s Threads', () => {
    const text = routes();
    expect(text).toContain('canManageSpaceThreadStructure(access.space, access.role, userId)');
    for (const marker of [QUEUE, MARK_READ, REVIEW]) {
      const body = handlerBody(text, marker);
      const gateAt = body.indexOf('canReview(access, auth.userId)');
      expect(gateAt, `${marker} has no leader gate`).toBeGreaterThan(-1);
      for (const write of ['db.update(', 'db.transaction(', 'db.select(']) {
        const at = body.indexOf(write);
        if (at === -1) continue;
        expect(gateAt, `${write} runs before the gate in ${marker}`).toBeLessThan(at);
      }
    }
  });

  it('accepts inside a transaction so a status change cannot outlive its Thread', () => {
    const body = handlerBody(routes(), REVIEW);
    const txAt = body.indexOf('db.transaction(');
    expect(txAt).toBeGreaterThan(-1);
    expect(body.indexOf('tx.insert(Threads)')).toBeGreaterThan(txAt);
    expect(body.indexOf('setSingularThreadPin(tx')).toBeGreaterThan(txAt);
    expect(body.indexOf("status: 'accepted'")).toBeGreaterThan(txAt);
  });

  it('refuses a second review rather than pinning a second Thread', () => {
    const body = handlerBody(routes(), REVIEW);
    expect(body).toContain('ALREADY_REVIEWED');
    expect(body).toMatch(/status !== 'open'/);
  });

  it('lets a member withdraw only their own open suggestion, scoped in the query', () => {
    const body = handlerBody(routes(), WITHDRAW);
    expect(body).toContain('eq(SpaceStudySuggestions.suggestedByUserId, auth.userId)');
    expect(body).toContain("eq(SpaceStudySuggestions.status, 'open')");
    expect(body).not.toContain('canReview(');
  });

  it('caps open suggestions per person per room', () => {
    expect(OPEN_SUGGESTIONS_MAX).toBe(10);
    expect(handlerBody(routes(), CREATE)).toContain('SUGGESTION_LIMIT');
  });

  it('cleans up with the room and with a leaving member', () => {
    const lifecycle = source('server/utils/shared-space-lifecycle.ts');
    const purge = lifecycle.slice(lifecycle.indexOf('export async function purgeExpiredDeletedSpaces'));
    expect(purge).toContain('tx.delete(SpaceStudySuggestions).where(eq(SpaceStudySuggestions.spaceId, spaceId))');
    const leave = lifecycle.slice(
      lifecycle.indexOf('export async function removeMemberPreservingResponses'),
      lifecycle.indexOf('export async function purgeExpiredDeletedSpaces'),
    );
    expect(leave).toContain('.delete(SpaceStudySuggestions)');
    expect(leave).toContain("eq(SpaceStudySuggestions.status, 'open')");
  });
});

describe('deriveThreadTitle', () => {
  it('names a passage by its reference', () => {
    expect(deriveThreadTitle({ kind: 'scripture', scriptureReference: 'Romans 8', body: 'why' })).toBe(
      'Romans 8',
    );
  });

  it('names a note by its title, and falls back to the why', () => {
    expect(
      deriveThreadTitle({ kind: 'note', scriptureReference: null, body: 'because', refTitle: 'On grief' }),
    ).toBe('On grief');
    expect(deriveThreadTitle({ kind: 'note', scriptureReference: null, body: 'because', refTitle: '  ' })).toBe(
      'because',
    );
  });

  it('cuts free text to its first line and a card-sized length', () => {
    expect(deriveThreadTitle({ kind: 'text', scriptureReference: null, body: 'Grief\nand more' })).toBe('Grief');
    const long = 'a'.repeat(120);
    const title = deriveThreadTitle({ kind: 'text', scriptureReference: null, body: long });
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
  });

  it('never returns an empty title', () => {
    expect(deriveThreadTitle({ kind: 'text', scriptureReference: null, body: null })).toBe('What we study next');
  });
});

/**
 * Contract tests for Challenges' routes and the retirement rule.
 *
 * Source-level for the same reason as review-routes.test.ts: the properties are about every
 * handler and about which columns the cascade touches, and both break by omission when
 * something new is added rather than by a request returning the wrong body.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const routes = () => withoutComments(source('server/routes/challenges.ts'));
const service = () => withoutComments(source('server/utils/challenge-service.ts'));
const cascade = () => withoutComments(source('server/utils/delete-note-cascade.ts'));

function registrations(text: string): string[] {
  return text.match(/route\.(get|post)\([\s\S]*?async \(c\) => \{/g) ?? [];
}

describe('every Challenges route is gated', () => {
  const lines = registrations(routes());

  it('registers the routes the client needs', () => {
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });

  it('requires auth, then the paid feature key, on every route', () => {
    for (const line of lines) {
      expect(line).toContain('requireAuth');
      expect(line).toContain("requireFeature('challenges')");
      expect(line.indexOf('requireAuth')).toBeLessThan(line.indexOf('requireFeature'));
    }
  });

  it('rate-limits every route', () => {
    for (const line of lines) expect(line).toMatch(/rateLimit\('(read|write)'\)/);
  });
});

describe('a step is resolved deliberately', () => {
  const text = routes();
  const block = text.slice(text.indexOf("'/api/challenges/:id/steps/:stepKey'"));

  it('rejects a missing status rather than defaulting one', () => {
    // `typeof` rather than truthiness, matching the study-plan complete route: a body with no
    // status must be a 400, not a silent resolution of the step the wrong way.
    expect(block).toContain("typeof body?.status === 'string'");
    expect(block).toContain('CHALLENGE_STEP_STATUS_INVALID');
  });

  it('accepts only done or skipped', () => {
    expect(block).toMatch(/status !== 'done' && status !== 'skipped'/);
  });
});

describe('completion is earned, never set', () => {
  it('refuses completed and retired over HTTP', () => {
    const text = routes();
    const block = text.slice(text.indexOf("'/api/challenges/:id/status'"));
    expect(block).toContain('isChallengeSettableStatus');
    expect(block).not.toMatch(/status === 'completed'/);
  });

  it('is written only by resolving every step', () => {
    const text = service();
    const block = text.slice(text.indexOf('export async function completeChallengeStep'));
    expect(block).toContain('isChallengeComplete');
    expect(block).toContain("status: 'completed'");
  });

  it('does not restamp completedAt on an already finished path', () => {
    const block = service().slice(service().indexOf('export async function completeChallengeStep'));
    expect(block).toContain('challenge.completedAt ?? now');
  });
});

describe('one open path per source', () => {
  it('conflicts only against active and paused, so a Thread can be revisited later', () => {
    const text = service();
    const block = text.slice(
      text.indexOf('export async function createChallenge'),
      text.indexOf('export type StepOutcomeResult'),
    );
    expect(block).toContain("inArray(Challenges.status, ['active', 'paused'])");
    expect(block).toContain('CHALLENGE_ALREADY_ACTIVE');
  });

  it('hands back the id of the open one, so the client can open it', () => {
    expect(service()).toContain('existingId: existing.id');
    expect(routes()).toContain('existingId');
  });
});

describe('a deleted source retires a challenge rather than deleting it', () => {
  const text = cascade();

  it('updates the status instead of removing the row', () => {
    const block = text.slice(text.indexOf('await tx.delete(NoteVisitEvents)'));
    expect(block).toContain('.update(Challenges)');
    expect(block).toContain("status: 'retired'");
    expect(block).not.toContain('.delete(Challenges)');
  });

  it('retires from either end of a connection', () => {
    const block = text.slice(text.indexOf('.update(Challenges)'));
    expect(block).toContain('Challenges.sourceNoteId');
    expect(block).toContain('Challenges.sourceSecondaryNoteId');
  });

  it('leaves a completed path alone', () => {
    const block = text.slice(text.indexOf('.update(Challenges)'));
    expect(block).toContain("inArray(Challenges.status, ['active', 'paused'])");
  });

  it('does delete the review rows, which have no artifacts to orphan', () => {
    expect(text).toContain('.delete(ReviewItems)');
    expect(text).toContain('.delete(ReviewEvents)');
  });

  it('lists all three tables so the cascade audit sees them', () => {
    for (const name of ["'ReviewItems'", "'ReviewEvents'", "'Challenges'"]) {
      expect(text).toContain(name);
    }
  });
});

describe('steps are authored, not generated', () => {
  it('calls no model', () => {
    for (const text of [routes(), service()]) {
      expect(text).not.toMatch(/mistral|openai|anthropic|generateText|completion\(/i);
    }
  });

  it('builds steps once, from the shared template registry', () => {
    expect(service()).toContain("from '@/utils/challenge-templates'");
    expect(service()).toContain('buildChallengeSteps');
  });

  it('verifies ownership of every id the client supplied', () => {
    const text = service();
    const block = text.slice(
      text.indexOf('export async function resolveChallengeSource'),
      text.indexOf('async function ownsNote'),
    );
    expect(block).toContain('ownsNote');
    expect(block).toContain('eq(Notes.userId, userId)');
    expect(block).toContain('NoteConnections');
  });
});

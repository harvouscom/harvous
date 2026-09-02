/**
 * Contract tests for Review's routes.
 *
 * Asserted against the source in the style of study-plan-completion.test.ts, because what
 * matters here is a set of properties of *every* handler — each one gated, each one
 * degrading rather than failing when the tables are missing — and the failure mode is a new
 * route being added later that quietly skips one. A request-level test would exercise the
 * handlers that exist today and say nothing about the next one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const review = () => withoutComments(source('server/routes/review.ts'));
const service = () => withoutComments(source('server/utils/review-service.ts'));

/** Every `route.get(...)` / `route.post(...)` registration line in the file. */
function registrations(text: string): string[] {
  return text.match(/route\.(get|post)\([\s\S]*?async \(c\) => \{/g) ?? [];
}

describe('every Review route is gated', () => {
  const lines = registrations(review());

  it('registers the routes the client needs', () => {
    expect(lines.length).toBeGreaterThanOrEqual(8);
  });

  it('requires authentication before anything else', () => {
    for (const line of lines) expect(line).toContain('requireAuth');
  });

  it('requires the paid feature key on every single route', () => {
    for (const line of lines) expect(line).toContain("requireFeature('review')");
  });

  it('puts the feature gate after requireAuth, which it reads from', () => {
    for (const line of lines) {
      expect(line.indexOf('requireAuth')).toBeLessThan(line.indexOf('requireFeature'));
    }
  });

  it('rate-limits every route', () => {
    for (const line of lines) expect(line).toMatch(/rateLimit\('(read|write)'\)/);
  });
});

describe('the queue fills itself from the reader\'s own study', () => {
  it('tops up before listing, on both reads that show items', () => {
    const text = review();
    const inbox = text.slice(text.indexOf("'/api/review/inbox'"), text.indexOf("'/api/review/items'"));
    const session = text.slice(text.indexOf("'/api/review/session'"), text.indexOf("'/api/review/items/:id/reveal'"));
    expect(inbox).toContain('refillReviewQueue');
    expect(session).toContain('refillReviewQueue');
  });

  it('has no cold-start seed left to offer', () => {
    // The seed only ever made `note` items, which is why every question looked the same.
    const text = review();
    expect(text).not.toContain('/api/review/seed');
    expect(text).not.toContain('canSeed');
    expect(service()).not.toContain('seedReviewItems');
  });
});

describe('the inbox stays calm', () => {
  it('never sends a count of what it is not showing', () => {
    const text = review();
    const inbox = text.slice(text.indexOf("'/api/review/inbox'"), text.indexOf("'/api/review/items'"));
    expect(inbox).toContain('hasMore');
    // A number in the payload is a number that eventually gets rendered as "27 due".
    expect(inbox).not.toMatch(/dueCount|totalDue|overdue/i);
  });

  it('caps what it returns at the shared constant rather than a local number', () => {
    expect(review()).toContain('REVIEW_INBOX_MAX_ROWS');
  });

  it('uses no guilt language anywhere in the feature', () => {
    for (const text of [review(), service()]) {
      expect(text).not.toMatch(/overdue|behind schedule|you missed|streak broken/i);
    }
  });
});

describe('missing tables degrade instead of failing', () => {
  it('answers empty for every read when the migration has not run', () => {
    const text = review();
    const reads = ['/api/review/inbox', '/api/review/items', '/api/review/session'];
    for (const path of reads) {
      const start = text.indexOf(`'${path}'`);
      const block = text.slice(start, start + 2200);
      expect(block).toContain('isReviewTableMissing');
    }
  });
});

describe('answering an item', () => {
  const text = service();

  it('feeds the passive resurfacing layer on a clean recall', () => {
    // Without this, Home would keep offering a note as neglected while Review is actively
    // asking about it.
    expect(text).toContain('recordNoteRecallEngaged');
    const block = text.slice(text.indexOf('export async function applyReviewOutcome'));
    expect(block).toContain("outcome === 'recalled'");
  });

  it('advances the verse ladder only on a clean recall', () => {
    const block = text.slice(
      text.indexOf('export async function applyReviewOutcome'),
      text.indexOf('export async function deferReviewItem'),
    );
    expect(block).toContain('VERSE_LADDER_MAX_STEP');
    expect(block).toMatch(/kind === 'verse' &&\s*outcome === 'recalled'/);
  });

  it('records what was answered, with the interval on both sides of it', () => {
    const block = text.slice(text.indexOf('export async function applyReviewOutcome'));
    expect(block).toContain('previousIntervalDays: item.intervalDays');
    expect(block).toContain('nextIntervalDays: next.intervalDays');
  });

  it('takes the schedule from the shared pure module, not from inline arithmetic', () => {
    expect(text).toContain("from '@/utils/review-scheduling'");
    expect(text).not.toMatch(/24 \* 60 \* 60 \* 1000/);
  });
});

describe('adding an item', () => {
  const text = service();

  it('is idempotent on the source key rather than erroring on a repeat', () => {
    const block = text.slice(
      text.indexOf('export async function createReviewItem'),
      text.indexOf('export async function recordReviewEvent'),
    );
    expect(block).toContain('onConflictDoNothing');
    expect(block).toContain('ReviewItems.sourceKey');
  });

  it('verifies the caller owns every note id it was handed', () => {
    const block = text.slice(
      text.indexOf('export async function createReviewItem'),
      text.indexOf('export async function recordReviewEvent'),
    );
    expect(block).toContain('ownsNote(userId, noteId)');
    expect(block).toContain('ownsNote(userId, secondaryNoteId)');
  });

  it('requires a real connection before reviewing one', () => {
    const block = text.slice(
      text.indexOf('export async function createReviewItem'),
      text.indexOf('export async function recordReviewEvent'),
    );
    expect(block).toContain('NoteConnections');
  });
});

describe('no generative AI reaches this feature', () => {
  it('calls no model from either file', () => {
    for (const text of [review(), service()]) {
      expect(text).not.toMatch(/mistral|openai|anthropic|generateText|completion\(/i);
    }
  });

  it('takes prompt wording from the authored registry', () => {
    expect(service()).toContain("from '@/utils/review-prompts'");
  });
});

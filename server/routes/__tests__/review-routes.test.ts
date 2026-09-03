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

describe('the two graded rungs are marked on the server', () => {
  it('marks the answer rather than trusting the reader\'s verdict', () => {
    const text = review();
    const outcome = text.slice(text.indexOf("'/api/review/items/:id/outcome'"));
    expect(outcome).toContain('gradeVerseAnswer');
    // `graded ?? outcome` — the client's claim is the fallback, not the input.
    expect(outcome).toMatch(/graded \?\? outcome/);
  });

  it('marks a note rung on the server too, not just the verse ones', () => {
    const outcome = review().slice(review().indexOf("'/api/review/items/:id/outcome'"));
    expect(outcome).toContain('gradeNoteAnswer');
    expect(outcome).toMatch(/graded \?\? outcome/);
  });

  it('builds a note rung and marks it from one function, so the two cannot drift', () => {
    // The reveal keeps the options and throws the key away; the grader keeps the key and
    // throws the options away. Two implementations would eventually disagree.
    const text = service();
    expect(text).toContain('async function buildNoteExercise');
    const grader = text.slice(text.indexOf('export async function gradeNoteAnswer'));
    expect(grader.slice(0, 600)).toContain('buildNoteExercise');
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    expect(reveal).toContain('buildNoteExercise');
  });

  it('never sends a note rung its own answer', () => {
    const text = service();
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("item.kind === 'note'"));
    const block = branch.slice(0, branch.indexOf('const noteIds'));
    expect(block).toContain('options: built.exercise.options');
    expect(block).not.toContain('answerIndex');
    expect(block).not.toContain('acceptable');
  });

  it('refuses a note with nothing to ask about, rather than inventing a question', () => {
    const text = service();
    expect(text).toContain('noteHasReviewableMaterial');
    const engine = readFileSync(
      resolve(process.cwd(), 'server/utils/review-opportunities.ts'),
      'utf8',
    );
    expect(engine).toContain('noteHasReviewableMaterial');
  });

  it('never sends the answer key with the puzzle', () => {
    const text = service();
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    // The payload carries phrases and options; `order` and `answerIndex` stay here.
    expect(reveal).toContain('phrases: exercise.phrases');
    expect(reveal).not.toContain('order: exercise.order');
    expect(reveal).not.toContain('answerIndex');
  });

  it('withholds the verse text on each rung where it would be the answer', () => {
    /*
     * Asserted per rung, not as a count. This was `toBe(2)`, and a test whose maintenance is
     * "bump the number" gets bumped without anyone asking whether the new rung withholds.
     */
    const text = service();
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    for (const key of ['verse.sequence', 'verse.locate']) {
      const guard = reveal.slice(reveal.indexOf(`rung.key === '${key}'`));
      const rung = guard.slice(0, guard.indexOf('\n        }'));
      expect(rung).toContain('payload.verseText = null');
    }
  });

  it('never previews an encrypted note body', () => {
    // The server holds ciphertext for a locked note; `loadTitles` always guarded this and the
    // reveal did not, so the encrypted bytes shipped to whatever asked.
    const text = service();
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    expect(reveal).toContain('contentEncrypted');
    expect(reveal).toMatch(/contentEncrypted \? '' :/);
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

  it('advances a ladder only on a clean recall', () => {
    /*
     * Half-remembering something is not a reason to be asked a harder question about it next
     * time. Notes climb as well as verses now, so this asserts the rule rather than the shape
     * it used to have — `nextLadderStep` is the one place that knows which kinds have a ladder.
     */
    const block = text.slice(
      text.indexOf('export async function applyReviewOutcome'),
      text.indexOf('export async function deferReviewItem'),
    );
    expect(block).toMatch(/outcome === 'recalled'\s*\?\s*nextLadderStep\(/);
    expect(block).toContain(': item.ladderStep');
  });

  it('asks a note the rung it can answer, not the rung it has reached', () => {
    // A note with no links cannot be asked what it was linked to, whatever step it sits on.
    const views = text.slice(text.indexOf('export async function buildReviewItemViews'));
    expect(views).toContain('resolveNoteRung');
    expect(views).toContain('loadNoteMaterial');
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

describe('the "what comes next" rung', () => {
  it('builds the question and marks it from one function', () => {
    const text = service();
    expect(text).toContain('async function buildVerseNextFor');
    // Searched over the whole function, not a fixed slice of it: a character window is a test
    // that breaks when an unrelated rung is added above the line it was aiming at.
    const grader = text.slice(text.indexOf('export async function gradeVerseAnswer'));
    expect(grader).toContain('buildVerseNextFor');
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    expect(reveal).toContain('buildVerseNextFor');
  });

  it('never names the verse that answers it', () => {
    /*
     * The reference is the answer. Shipping "Romans 1:8" alongside the options would turn a
     * question about what you remember into one about what number comes after seven.
     */
    const reveal = service().slice(service().indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("rung.key === 'verse.next'"));
    const block = branch.slice(0, branch.indexOf("rung.key === 'verse.locate'"));
    expect(block).toContain('options: exercise.options');
    expect(block).not.toContain('reference');
    expect(block).not.toContain('answerIndex');
  });

  it('marks the tap on the server, whatever outcome the client claims', () => {
    const grader = service().slice(service().indexOf('export async function gradeVerseAnswer'));
    expect(grader).toContain('gradeVerseNext');
    expect(grader).toMatch(/isNext/);
  });
});

describe('the ladder wrap and the truth restore', () => {
  it('decides every verse branch by the rung, not by the step number', () => {
    /*
     * Past the top the same rungs come round again on a maintenance pass, at step numbers that
     * match no constant. A branch comparing `ladderStep === VERSE_LOCATE_STEP` would stop
     * recognising its own rung the moment a verse wrapped.
     */
    const text = service();
    expect(text).toContain('verseRungFor(item.ladderStep)');
    expect(text).not.toMatch(/ladderStep === VERSE_(LOCATE|SEQUENCE|NEXT|REBUILD)_STEP/);
  });

  it('erodes the cloze by the pass, never by how many times it was answered', () => {
    // `reviewCount` rises on every answer, so ten near misses would hand someone a
    // mostly-blank verse they have never once recalled.
    const text = service();
    expect(text).toContain('verseClozeRatio(rung.pass)');
    expect(text).not.toContain('verseClozeRatio(item.reviewCount');
  });

  it('hands back the verse a rung withheld, once it has been answered', () => {
    const text = service();
    expect(text).toContain('export async function verseTruthFor');
    const fn = text.slice(text.indexOf('export async function verseTruthFor'));
    // Only the two rungs that hide it; everything else showed the verse all along.
    expect(fn.slice(0, 500)).toContain("'verse.sequence'");
    expect(fn.slice(0, 500)).toContain("'verse.locate'");
  });

  it('reads the truth from the item as it was asked, not as the outcome left it', () => {
    // `applyReviewOutcome` has already advanced the rung; the verse owed is the one just
    // answered about.
    const route = readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');
    const outcome = route.slice(route.indexOf("'/api/review/items/:id/outcome'"));
    const call = outcome.indexOf('verseTruthFor(item)');
    expect(call).toBeGreaterThan(-1);
    expect(outcome.slice(0, call)).toContain('applyReviewOutcome');
    expect(outcome).not.toContain('verseTruthFor(updated)');
  });
});

describe('the altered rung', () => {
  it('ships the altered words and nothing that says which one', () => {
    /*
     * The client holding `alteredIndex` would be a puzzle with the answer on the back, and also
     * a record of exactly which word was falsified.
     */
    const reveal = service().slice(service().indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("rung.key === 'verse.altered'"));
    const block = branch.slice(0, branch.indexOf("rung.key === 'verse.locate'"));
    expect(block).toContain('tokens: exercise.tokens');
    expect(block).not.toContain('alteredIndex');
    expect(block).not.toContain('original');
    expect(block).not.toContain('substitute');
  });

  it('never prints the true verse beside the altered one', () => {
    const reveal = service().slice(service().indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("rung.key === 'verse.altered'"));
    expect(branch.slice(0, branch.indexOf("rung.key === 'verse.locate'"))).toContain(
      'payload.verseText = null',
    );
  });

  it('restores the true verse once the rung is answered', () => {
    // Leaving someone holding a falsified line and no correction is the one ending this rung
    // must never have.
    const fn = service().slice(service().indexOf('export async function verseTruthFor'));
    expect(fn.slice(0, 700)).toContain("'verse.altered'");
  });

  it('builds and marks it from one function', () => {
    const text = service();
    expect(text).toContain('async function buildVerseAlteredFor');
    const grader = text.slice(text.indexOf('export async function gradeVerseAnswer'));
    expect(grader).toContain('buildVerseAlteredFor');
    expect(grader).toContain('gradeVerseAltered');
  });

  it('sanitises the tapped word index rather than trusting it', () => {
    const route = readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');
    expect(route).toMatch(/Number\.isInteger\(body\.answer\.wordIndex\)/);
    expect(route).toContain('MAX_WORD_INDEX');
  });
});

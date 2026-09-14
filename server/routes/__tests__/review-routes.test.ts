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
  const all = registrations(review());
  /*
   * The one deliberate exception, named so it cannot grow by accident: the sample exists to
   * show the feature to an account that has not paid for it. Everything else is gated.
   */
  const SAMPLE_ROUTES = ["'/api/review/sample'", "'/api/review/sample/answer'"];
  const isSample = (line: string) => SAMPLE_ROUTES.some((path) => line.includes(path));
  const lines = all.filter((line) => !isSample(line));

  it('registers the routes the client needs', () => {
    expect(lines.length).toBeGreaterThanOrEqual(8);
  });

  it('requires authentication before anything else', () => {
    for (const line of all) expect(line).toContain('requireAuth');
  });

  it('requires the paid feature key on every single route but the sample pair', () => {
    for (const line of lines) expect(line).toContain("requireFeature('review')");
    expect(all.filter(isSample)).toHaveLength(2);
    expect(all.filter((line) => !line.includes("requireFeature('review')"))).toEqual(all.filter(isSample));
  });

  it('puts the feature gate after requireAuth, which it reads from', () => {
    for (const line of lines) {
      expect(line.indexOf('requireAuth')).toBeLessThan(line.indexOf('requireFeature'));
    }
  });

  it('rate-limits every route', () => {
    for (const line of all) expect(line).toMatch(/rateLimit\('(read|write)'\)/);
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
    expect(outcome).toContain('gradeAnswerFor');
    // The server's verdict decides; the client's claim is only the fallback where it cannot mark.
    expect(outcome).toMatch(/verdict \?\? outcome/);
  });

  it('marks every kind through one door, so a new kind cannot fall into another\'s grader', () => {
    /*
     * The route used to pick between two graders with a ternary. A third kind landed in the
     * `else`, was marked as a verse, and got null — and null on a graded rung records the
     * client's own verdict as truth.
     */
    const text = service();
    const door = text.slice(text.indexOf('export async function gradeAnswerFor'));
    const block = door.slice(0, door.indexOf('export async function buildReviewReveal'));
    for (const grader of ['gradeNoteAnswer', 'gradeVerseAnswer', 'gradeChapterAnswer']) {
      expect(block).toContain(grader);
    }
    expect(block).toMatch(/default:\s*return null/);
  });

  it('never sends a chapter rung the chapter\'s text, or its answer', () => {
    const text = service();
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("item.kind === 'chapter'"));
    const block = branch.slice(0, branch.indexOf("item.kind === 'note'"));
    expect(block).toContain('options: exercise.options');
    expect(block).toContain('phrases: exercise.phrases');
    expect(block).not.toContain('verseText');
    expect(block).not.toContain('answerIndex');
    expect(block).not.toContain('order:');
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

  it('quotes one line per note, chosen the same way on the shelf and in the dock', () => {
    /*
     * The row printed a random window of the prose while the card preferred a span the reader
     * had marked, so the same item quoted two different lines and the better one never reached
     * the list. Both go through `noteStemFor` now, with the same seed and the same `avoid`.
     */
    const text = service();
    const views = text.slice(text.indexOf('export async function buildReviewItemViews'));
    const viewsBlock = views.slice(0, views.indexOf('export async function', 10));
    expect(viewsBlock).toContain('noteStemFor(');
    expect(viewsBlock).toContain('loadNoteSpans(');
    // The window is the last resort inside the chooser, never a call of its own out here.
    expect(viewsBlock).not.toContain('noteFragment(');

    const exercise = text.slice(text.indexOf('async function buildNoteExercise'));
    const exerciseBlock = exercise.slice(0, exercise.indexOf('\nasync function', 10));
    expect(exerciseBlock).toContain('noteStemFor(');
    expect(exerciseBlock).toContain('loadNoteSpans(');
    expect(exerciseBlock).not.toContain('noteFragment(');
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
    /*
     * The copy file is in here too. The vocabulary rule it opens with is the reason it exists,
     * and it is the one file in the feature where a careless string is shipped verbatim to a
     * reader rather than being shaped by a route first.
     */
    const copy = withoutComments(source('spa/src/pages/prototype/proto-review-copy.ts'));
    for (const text of [review(), service(), copy]) {
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

  it('refuses a retired kind before it touches the database', () => {
    /*
     * This asserted that a `connection` item checked for a real edge first. There is no
     * connection item any more — the open questions moved to Home — so what matters now is
     * that the refusal happens before any read or write, not after a lookup for a row that
     * can never be created.
     */
    const block = text.slice(
      text.indexOf('export async function createReviewItem'),
      text.indexOf('export async function recordReviewEvent'),
    );
    const guard = block.indexOf('isReviewAskableKind');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(block.indexOf('await db'));
    expect(block).not.toContain('NoteConnections');
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
    // Every branch resolves the rung — now with the item's seed and material, since a step is a
    // family — and none compares the step to a constant.
    expect(text).toMatch(/verseRungFor\(item\.ladderStep,/);
    expect(text).not.toMatch(/ladderStep === VERSE_(LOCATE|SEQUENCE|NEXT|REBUILD)_STEP/);
  });

  it('erodes the cloze by the pass, never by how many times it was answered', () => {
    /*
     * `reviewCount` rises on every answer, so ten near misses would hand someone a mostly-blank
     * verse they have never once recalled. The spec is read from the rung's own pass — and from
     * the item's recall state, which is the scheduler's verdict rather than a tally of attempts.
     */
    const text = service();
    expect(text).toMatch(/verseClozeSpec\(rung\.pass/);
    expect(text).not.toMatch(/verseClozeSpec\(item\.reviewCount/);
    expect(text).not.toMatch(/verseClozeRatio\(item\.reviewCount/);
  });

  it('asks every staged rung at the tier the pass says, never at a tier the page claims', () => {
    /*
     * The tier decides which shape is graded, so reading it from the submission instead would
     * let a page pick its own marking — send free text on a tier-0 initials item and the
     * all-or-nothing subsequence match runs against a verse that was mostly on screen.
     */
    const text = service();
    for (const call of [
      /verseInitialsShare\(rung\.pass/,
      /verseKeywordsCount\(rung\.pass/,
      /verseRecallMode\(rung\.pass/,
    ]) {
      expect(text).toMatch(call);
    }
    const grader = text.slice(text.indexOf('async function gradeVerseAnswer'));
    const initials = grader.slice(grader.indexOf("rung.key === 'verse.initials'"));
    expect(initials.slice(0, 1200)).toMatch(/exercise\.tier < 2/);
    expect(initials.slice(0, 1200)).toMatch(/exercise\.tier === 2/);
  });

  it('only offers a hint while there is a go left', () => {
    /*
     * The finalized response carries the answer itself, so a hint beside it would be a worse
     * version of what the reader is about to be shown. One branch, and only one.
     */
    const text = review();
    const nonFinal = text.slice(text.indexOf('attemptNumber < maxAttempts'));
    const upToFinal = nonFinal.slice(0, nonFinal.indexOf('const verdict'));
    expect(upToFinal).toContain('graded.hint');
    expect(text.slice(text.indexOf('const verdict'))).not.toContain('graded.hint');
  });

  it('hands back the verse a rung withheld, once it has been answered', () => {
    const text = service();
    expect(text).toContain('export async function verseTruthFor');
    const fn = text.slice(text.indexOf('export async function verseTruthFor'));
    // Every rung that hides the verse owes it back. The free-recall pair joined them when
    // they started being marked: you cannot be asked to write it out with it on screen.
    const withheld = fn.slice(0, 700);
    for (const key of ["'verse.sequence'", "'verse.locate'", "'verse.recognize'", "'verse.recall'"]) {
      expect(withheld).toContain(key);
    }
  });

  it('reads the truth from the item as it was asked, not as the outcome left it', () => {
    // `applyReviewOutcome` has already advanced the rung; the verse owed is the one just
    // answered about.
    const route = readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');
    const outcome = route.slice(route.indexOf("'/api/review/items/:id/outcome'"));
    // The user goes along so the truth resolves the same family member the reveal did.
    const call = outcome.indexOf('verseTruthFor(item, auth.userId)');
    expect(call).toBeGreaterThan(-1);
    expect(outcome.slice(0, call)).toContain('applyReviewOutcome');
    expect(outcome).not.toContain('verseTruthFor(updated');
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

describe('the fill-in-the-gaps rung', () => {
  it('sends the gaps without the verse that fills them', () => {
    /*
     * It used to send both and render neither. The rung was not graded, so the reveal was only
     * fetched after "Check the verse" — by which point the dock had shown a textarea and was
     * about to print the whole passage, and the cloze it had built went unused.
     */
    const reveal = service().slice(service().indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("rung.key === 'verse.rebuild'"));
    const block = branch.slice(0, branch.indexOf("rung.key === 'verse.sequence'"));
    expect(block).toContain('payload.cloze');
    expect(block).toContain('payload.verseText = null');
  });

  it('marks the filled-in words on the server', () => {
    const grader = service().slice(service().indexOf('export async function gradeVerseAnswer'));
    // `markVerseRebuild` is `gradeVerseRebuild` keeping what it already computed: the same
    // per-blank comparison, returned per blank so a miss can say which word it was.
    expect(grader).toContain('markVerseRebuild');
    expect(grader).toMatch(/isRebuild/);
  });

  it('hands the verse back once the gaps are answered', () => {
    const fn = service().slice(service().indexOf('export async function verseTruthFor'));
    expect(fn.slice(0, 800)).toContain("'verse.rebuild'");
  });

  it('bounds the words that arrive rather than trusting them', () => {
    const route = readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');
    expect(route).toContain('MAX_CLOZE_BLANKS');
    expect(route).toContain('MAX_CLOZE_WORD_LENGTH');
  });
});

describe('the cloze payload', () => {
  it('never ships the tokens or the missing words', () => {
    /*
     * `VerseCloze` carries `tokens` — the whole verse — and `blanks[].word`, every answer. The
     * first version of this rung shipped the object wholesale, so withholding `verseText` beside
     * it achieved nothing: the passage was in the payload, spelled differently. Caught by
     * reading the response, not by a type.
     */
    const text = service();
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("rung.key === 'verse.rebuild'"));
    const block = branch.slice(0, branch.indexOf("rung.key === 'verse.sequence'"));
    // Segments and gap widths — the pieces either side of each blank, never the tokens.
    expect(block).toMatch(/clozeSegments\(cloze/);
    expect(block).not.toMatch(/payload\.cloze = buildVerseCloze/);

    // And the payload type says so, so a later edit cannot widen it by accident.
    const shape = text.slice(text.indexOf('cloze?:'), text.indexOf('cloze?:') + 140);
    expect(shape).not.toContain('VerseCloze');
    expect(shape).toContain('segments');
  });
});

describe('what the reader is told after a graded rung', () => {
  it('returns the outcome the server recorded, not the one the page sent', () => {
    /*
     * The page has no answer key, so on a graded rung it sends `almost` and lets the server
     * mark the tap — and then told the reader "Almost." whichever way the marking went. A right
     * answer on every graded rung read as a near miss. Found by filling a cloze correctly and
     * watching the dock disagree with the item it had just updated.
     */
    const route = readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');
    const outcomeRoute = route.slice(route.indexOf("'/api/review/items/:id/outcome'"));
    expect(outcomeRoute).toMatch(/outcome: verdict \?\? outcome/);
  });
});

describe('a wrong answer gets another go', () => {
  const route = () => readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');

  it('writes nothing when a miss still has a go left', () => {
    /*
     * Being told "back in 4 days" the instant you slip teaches nothing. The retry happens while
     * the question is still up, so the non-final path must return before anything is applied —
     * no outcome, no schedule, no event.
     */
    const outcome = route().slice(route().indexOf("'/api/review/items/:id/outcome'"));
    const early = outcome.indexOf('finalized: false');
    expect(early).toBeGreaterThan(-1);
    expect(early).toBeLessThan(outcome.indexOf('applyReviewOutcome'));
  });

  it('lets how many goes it took set the interval', () => {
    // Right first time is a fortnight; right on the second is a few days; twice wrong is tomorrow.
    const outcome = route().slice(route().indexOf("'/api/review/items/:id/outcome'"));
    expect(outcome).toMatch(/attemptNumber > 1\s*\?\s*'almost'\s*:\s*'recalled'/);
    expect(outcome).toContain(": 'revealed'");
  });

  it('bounds the attempt count the page claims', () => {
    expect(route()).toMatch(/Math\.min\(REVIEW_MAX_ATTEMPTS, body\.attemptNumber\)/);
  });

  it('shows the right option only once the question is over', () => {
    const outcome = route().slice(route().indexOf("'/api/review/items/:id/outcome'"));
    const at = outcome.indexOf('correctAnswer: graded.correctAnswer');
    expect(at).toBeGreaterThan(-1);
    // Guarded on the answer having been wrong — a correct answer needs no answer shown.
    expect(outcome.slice(Math.max(0, at - 160), at)).toContain('!graded.correct');
  });
});

describe('the context-step rungs', () => {
  it('ships four options and never which one, nor any id the index keys on', () => {
    /*
     * A topic id, an entity id or a cross-reference target reference would let the client work
     * out the answer without the reader. The payload is the labels and whether they trail off.
     */
    const reveal = service().slice(service().indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf('VERSE_CONTEXT_KEYS.has(rung.key)'));
    const block = branch.slice(0, branch.indexOf("rung.key === 'verse.rebuild'"));
    expect(block).toContain('options: built.exercise.options');
    expect(block).not.toContain('answerIndex');
    expect(block).not.toContain('acceptable');
    expect(block).not.toContain('topicId');
    expect(block).not.toContain('entityId');
  });

  it('resolves the rung with the same seed and material on the list, the reveal and the grader', () => {
    /*
     * With families a step can wear several rungs. If any one of the three resolved without the
     * seed it would land on the family default while the others landed on a member — the same
     * drift a step-number comparison caused before, wearing a new face.
     */
    const text = service();
    const grader = text.slice(text.indexOf('export async function gradeVerseAnswer'));
    expect(grader).toMatch(/verseRungFor\(item\.ladderStep, seedForRung, material\)/);
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    expect(reveal).toMatch(/verseRungFor\(item\.ladderStep, seed, material\)/);
    const truth = text.slice(text.indexOf('export async function verseTruthFor'));
    expect(truth.slice(0, 600)).toMatch(/verseRungFor\(item\.ladderStep, reviewSeed\(item\), material\)/);
    const list = text.slice(text.indexOf('export async function buildReviewItemViews'));
    expect(list).toContain('material: verseMaterial');
  });

  it('withholds the verse on the rung that asks which words were marked', () => {
    /*
     * The verse in full would print the marked words among the options and again in the text,
     * with only the highlighting missing — which is the question. It comes back as the truth.
     */
    const text = service();
    const reveal = text.slice(text.indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf("rung.key === 'verse.marked'"));
    const block = branch.slice(0, branch.indexOf("rung.key === 'verse.locate'"));
    expect(block).toContain('payload.verseText = null');
    expect(block).not.toContain('answerIndex');
    const truth = text.slice(text.indexOf('export async function verseTruthFor'));
    expect(truth.slice(0, 900)).toContain("'verse.marked'");
  });

  it('builds and marks every context rung from one function', () => {
    const text = service();
    expect(text).toContain('async function buildVerseContextFor');
    const grader = text.slice(text.indexOf('export async function gradeVerseAnswer'));
    expect(grader).toContain('buildVerseContextFor');
  });
});

describe('the text-keyed rungs withhold the verse', () => {
  const revealBlock = (key: string, until: string) => {
    const reveal = service().slice(service().indexOf('export async function buildReviewReveal'));
    const branch = reveal.slice(reveal.indexOf(`rung.key === '${key}'`));
    return branch.slice(0, branch.indexOf(until));
  };

  it('sends first letters and a count, never the words', () => {
    const block = revealBlock('verse.initials', "rung.key === 'verse.keywords'");
    expect(block).toMatch(/buildVerseInitials\(/);
    expect(block).toContain('payload.verseText = null');
    /*
     * `reduced` is the answer key — which words were taken out, and what they were. The staged
     * tiers build it so they can grade, and the payload is assembled field by field precisely so
     * a later edit cannot ship it by spreading the exercise.
     */
    expect(block).not.toContain('reduced');
    expect(block).not.toMatch(/\.\.\.exercise/);
    for (const field of ['initials:', 'wordCount:', 'tier:', 'segments:']) {
      expect(block).toContain(field);
    }
  });

  it('sends only how many words to name', () => {
    const block = revealBlock('verse.keywords', "rung.key === 'verse.before'");
    expect(block).toMatch(/buildVerseKeywords\(/);
    expect(block).toContain('payload.verseText = null');
  });

  it('gives the recall rung a way in without giving it the answer', () => {
    const reveal = service().slice(service().indexOf('export async function buildReviewReveal'));
    const block = reveal.slice(
      reveal.indexOf('FREE_RECALL_KEYS.has(rung.key)'),
      reveal.indexOf("rung.key === 'verse.initials'"),
    );
    // What is shown, and nothing about what is not: `hiddenText` is the thing being asked for.
    expect(block).toContain('shown: built.shown');
    expect(block).not.toContain('hiddenText');
    expect(block).toContain('payload.verseText = null');
  });

  it('sends two openings and not which is first', () => {
    const block = revealBlock('verse.before', "rung.key === 'verse.book'");
    expect(block).toContain('options: exercise.options');
    expect(block).not.toContain('answerIndex');
    expect(block).toContain('payload.verseText = null');
  });

  it('hands every one of them the verse back once answered', () => {
    const fn = service().slice(service().indexOf('export async function verseTruthFor'));
    for (const key of ['verse.initials', 'verse.keywords', 'verse.before', 'verse.book']) {
      expect(fn.slice(0, 900)).toContain(`'${key}'`);
    }
  });

  it('bounds the text written back from first letters', () => {
    const route = readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');
    expect(route).toMatch(/text: typeof body\.answer\.text === 'string' \? body\.answer\.text\.slice\(0, MAX_ATTEMPT_LENGTH\)/);
  });
});

describe('a scheduler that remembers', () => {
  const route = () => readFileSync(resolve(process.cwd(), 'server/routes/review.ts'), 'utf8');
  const outcome = () => route().slice(route().indexOf("'/api/review/items/:id/outcome'"));

  it('weighs the rung the server resolved, never the one the page claims', () => {
    /*
     * The client sends `answer.promptKey` so the grader knows which exercise it is marking, but
     * the schedule must not take the page's word for which rung was asked — a `verse.locate`
     * claim on a recognize card would buy a fortnight for a four-option tap.
     */
    // Resolved once, near the top, and used for both the weight and the attempt budget. It is
    // `askedRungFor` rather than a whole view build now — same resolution, a second less of it.
    const block = outcome();
    expect(block).toContain('const askedKey = await askedRungFor(auth.userId, item)');
    expect(block).toMatch(/applyReviewOutcome\([\s\S]*askedKey,/);
    expect(block).not.toMatch(/applyReviewOutcome\([^)]*answer\.promptKey/);
  });

  it('says so only when this miss made the item stop working, and says which way', () => {
    // Two roads in: four lapses after being held, or never once recalled. The card words them
    // differently, because "keeps slipping away" is untrue of something never held.
    expect(outcome()).toMatch(/\.\.\.\(leech \? \{ leech: true, stalled \} : \{\}\)/);
  });

  it('refuses a step back on anything that is not slipping', () => {
    const from = route().indexOf("'/api/review/items/:id/step-back'");
    const stepBack = route().slice(from, route().indexOf('route.', from + 1));
    expect(stepBack).toContain('REVIEW_NOT_SLIPPING');
    // No body is read: the only thing the reader can say here is "yes".
    expect(stepBack).not.toContain('req.json');
  });

  it('orders the sitting rather than serving it by the clock', () => {
    const session = route().slice(route().indexOf("'/api/review/session'"));
    const listAt = session.indexOf('listDueReviewItems');
    const orderAt = session.indexOf('composeSitting');
    expect(orderAt).toBeGreaterThan(-1);
    expect(session).toContain('listUpcomingReviewItems');
    // Ordered before the views are built, so what is dropped as unaskable does not reshuffle it.
    expect(orderAt).toBeLessThan(session.indexOf('buildReviewItemViews'));
    expect(listAt).toBeGreaterThan(-1);
    expect(listAt).toBeLessThan(orderAt);
  });
});

describe('the sample, for an account without Review', () => {
  const route = () => source('server/routes/review.ts');
  const sampleRoutes = () => route().slice(route().indexOf("route.get('/api/review/sample'"));

  it('is the one pair of routes deliberately not behind the feature gate', () => {
    /*
     * The point is to show the thing to someone who has not paid for it. Auth and a rate limit
     * stay; `requireFeature` must not appear on either route, and must still be on everything
     * above them.
     */
    const block = sampleRoutes().slice(0, sampleRoutes().indexOf('function sampleDayFrom'));
    expect(block).toContain("route.get('/api/review/sample', requireAuth, rateLimit('read'), async");
    expect(block).toContain("route.post('/api/review/sample/answer', requireAuth, rateLimit('write'), async");
    expect(block).not.toContain('requireFeature');
    expect(route().slice(0, route().indexOf("'/api/review/sample'"))).toContain("requireFeature('review')");
  });

  it('reads and marks, and never writes', () => {
    // No item, no event, no schedule: a free account must not accumulate queue state.
    const block = sampleRoutes();
    for (const writer of ['applyReviewOutcome', 'recordReviewEvent', 'createReviewItem', 'refillReviewQueue']) {
      expect(block).not.toContain(writer);
    }
  });

  it('keeps the retry rule and bounds what the page sends', () => {
    const block = sampleRoutes();
    /*
     * Each sample exercise gets the goes its own paid rung gets — three where the reader types,
     * two where they tap — rather than the blanks rung's three for all four.
     */
    expect(block).toContain('maxAttemptsFor(SAMPLE_PROMPT_KEYS[kind])');
    expect(block).toContain("blanks: 'verse.rebuild'");
    expect(block).toContain("next: 'verse.next'");
    expect(block).toContain('attemptNumber < sampleAttempts');
    expect(block).toContain('finalized: false');
    // Every field the page may send is bounded exactly as the outcome route bounds it.
    expect(block).toContain('.slice(0, MAX_CLOZE_BLANKS)');
    expect(block).toContain('w.slice(0, MAX_CLOZE_WORD_LENGTH)');
    expect(block).toContain('.slice(0, MAX_ATTEMPT_LENGTH)');
    expect(block).toContain('.slice(0, MAX_ORDER_POSITIONS)');
    // The translation reaches a file read, so it is checked against the list, never trusted.
    expect(block).toContain('TRANSLATION_ORDER.includes(id)');
  });

  it('accepts only a calendar day from the page, and falls back rather than trusting it', () => {
    expect(sampleRoutes()).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(raw\)/);
  });
});

describe('every resolver is handed the reader', () => {
  /*
   * What the reader is asked in is theirs, not the file's — `UserMetadata.defaultTranslation`,
   * resolved per request in `review-service.ts`. A resolver called without the userId cannot read
   * it and silently falls back, which is how the feature spent its whole life asking NET.
   *
   * This is the route's share of that: the four resolvers it calls after an answer — the rung that
   * was asked, the verse truth, the chapter truth, and the reveal — must each be given the reader.
   * The wording has to be the same on all four or someone is marked against text they were never
   * shown, and here that failure is one missing argument.
   */
  const text = () => review();

  it('resolves the asked rung and the reveal as this reader', () => {
    expect(text()).toContain('askedRungFor(auth.userId, item)');
    expect(text()).toContain('buildReviewReveal(auth.userId, item)');
  });

  it('restores the truth as this reader', () => {
    expect(text()).toContain('verseTruthFor(item, auth.userId)');
    expect(text()).toContain('chapterTruthFor(item, auth.userId)');
  });

  it('does not resolve a wording of its own', () => {
    // The route's only permitted mention is the unauthenticated sample, which has no reader.
    const body = text();
    expect(body.match(/'NET'/g) ?? []).toHaveLength(1);
    expect(body.slice(body.indexOf('sampleTranslationFrom'))).toContain("'NET'");
  });
});

describe('what a miss is allowed to say', () => {
  const route = () => source('server/routes/review.ts');
  const outcome = () => route().slice(route().indexOf("'/api/review/items/:id/outcome'"));

  it('sends the per-part marks on a miss that still has a go left', () => {
    /*
     * The whole point of the retry: it should be about the part that was actually missed. The
     * parts index what the reader submitted, so nothing here names anything they did not write.
     */
    const early = outcome().slice(0, outcome().indexOf('applyReviewOutcome'));
    expect(early).toContain('finalized: false');
    expect(early).toMatch(/graded\.parts \? \{ parts: graded\.parts \}/);
    expect(early).toMatch(/graded\.reached \? \{ reached: graded\.reached \}/);
  });

  it('still writes nothing on that path', () => {
    // Adding fields to the early return must not have moved it after the write.
    const at = outcome().indexOf('finalized: false');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(outcome().indexOf('applyReviewOutcome'));
  });

  it('never sends the answer key alongside the marks', () => {
    // `parts` is a verdict on the reader's own submission; the verse itself only ever comes
    // back through `truth`, once the question is over.
    expect(outcome()).not.toMatch(/parts:.*blank\.word/);
    expect(outcome()).not.toContain('cloze.blanks');
  });
});

describe('question feedback is filed against the question that was asked', () => {
  const handler = () => {
    const text = review();
    const start = text.indexOf("'/api/review/items/:id/feedback'");
    expect(start).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf('route.post', start + 10));
  };

  it('takes the rung from the item row rather than resolving it again', () => {
    /*
     * `applyReviewOutcome` writes `lastRungKey` moments before the vote is cast, so it names the
     * question the reader actually saw. `askedRungFor` would name whatever the *current*
     * preferences resolve to — and a vote filed against the wrong rung would quiet a family the
     * reader never complained about, which is the one way this feature can do harm.
     */
    expect(handler()).toContain('item.lastRungKey');
    expect(handler()).not.toContain('askedRungFor');
  });

  it('refuses a vote it does not recognise', () => {
    expect(handler()).toContain("vote !== 'liked'");
    expect(handler()).toContain("vote !== 'disliked'");
    expect(handler()).toContain('REVIEW_FEEDBACK_INVALID');
  });

  it('reads the tally past the per-request memo, since it just wrote to it', () => {
    expect(handler()).toContain('reviewDislikeRowsFor');
  });

  it('invalidates nothing on the client', () => {
    /*
     * A sitting is a fixed set of questions on purpose. Quieting takes effect the next time one
     * is composed; doing it sooner would reshuffle the queue under someone mid-answer.
     */
    const hook = withoutComments(source('spa/src/hooks/mutations/useReviewMutations.ts'));
    const start = hook.indexOf('export function useReviewFeedback');
    const body = hook.slice(start, hook.indexOf('export function', start + 10));
    expect(body).not.toContain('invalidateQueries');
  });
});

describe('the dislike tally', () => {
  it('reads only disliked rows, inside the window, with a cap', () => {
    const text = service();
    const start = text.indexOf('async function loadRecentDislikes');
    const body = text.slice(start, text.indexOf('async function', start + 10));
    expect(body).toContain("eq(ReviewEvents.action, 'disliked')");
    expect(body).toContain('reviewDislikeWindowStart');
    expect(body).toContain('DISLIKE_ROW_CAP');
  });

  it('degrades to no dampening rather than a broken queue', () => {
    // The same bargain the preference read strikes: a database the migration has not reached
    // has no `rungKey` column, and Review opening matters more than a lean being honoured.
    const text = service();
    const start = text.indexOf('async function loadRecentDislikes');
    expect(text.slice(start, text.indexOf('async function', start + 10))).toContain('catch');
  });
});


import { describe, it, expect } from 'vitest';
import { CHALLENGE_TEMPLATE_KEYS } from '../review-item-kinds';
import {
  type ChallengeSource,
  applyStepOutcome,
  buildChallengeSteps,
  challengeSourceKey,
  challengeTitle,
  countResolvedSteps,
  isChallengeComplete,
  isQuestionNoteTitle,
  nextPendingStepIndex,
  parseChallengeSteps,
} from '../challenge-templates';

const THREAD: ChallengeSource = {
  kind: 'thread',
  repNoteId: 'note_1',
  threadTitle: 'Covenant',
  memberNoteIds: ['note_1', 'note_2', 'note_3'],
  memberTitles: ['Noah', 'Abraham', 'Sinai'],
};
const VERSE: ChallengeSource = { kind: 'verse', reference: 'John 15:5', translation: 'ESV' };
const QUESTION: ChallengeSource = {
  kind: 'question',
  noteId: 'note_9',
  title: 'What does it mean for the kingdom to be near?',
};
const CONNECTION: ChallengeSource = {
  kind: 'connection',
  fromNoteId: 'note_b',
  toNoteId: 'note_a',
  fromTitle: 'Exodus 19:6',
  toTitle: '1 Peter 2:9',
};

const SOURCE_FOR: Record<string, ChallengeSource> = {
  strengthen_thread: THREAD,
  keep_verse: VERSE,
  return_to_question: QUESTION,
  trace_connection: CONNECTION,
};

describe('buildChallengeSteps', () => {
  it('builds a bounded path for every template', () => {
    for (const key of CHALLENGE_TEMPLATE_KEYS) {
      const steps = buildChallengeSteps(key, SOURCE_FOR[key]);
      expect(steps.length).toBeGreaterThanOrEqual(4);
      expect(steps.length).toBeLessThanOrEqual(5);
      expect(steps.every((s) => s.status === 'pending')).toBe(true);
      expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length);
    }
  });

  it('gives every step a prompt with the reader material filled in', () => {
    for (const key of CHALLENGE_TEMPLATE_KEYS) {
      for (const step of buildChallengeSteps(key, SOURCE_FOR[key])) {
        expect(step.prompt).not.toMatch(/\{|\}|undefined|null/);
        expect(step.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('ends every path with something the reader keeps', () => {
    for (const key of CHALLENGE_TEMPLATE_KEYS) {
      const steps = buildChallengeSteps(key, SOURCE_FOR[key]);
      const last = steps[steps.length - 1];
      expect(['summary', 'ladder']).toContain(last.kind);
    }
  });

  it('asks for recall before it asks anything to be opened', () => {
    const steps = buildChallengeSteps('strengthen_thread', THREAD);
    expect(steps[0].kind).toBe('recall');
    expect(steps[0].prompt.toLowerCase()).toContain('before opening');
  });

  it('names the Thread, capitalized, in the path it builds', () => {
    const steps = buildChallengeSteps('strengthen_thread', THREAD);
    expect(steps[0].prompt).toContain('Covenant Thread');
    expect(steps.some((s) => /\bthread\b/.test(s.prompt))).toBe(false);
  });

  it('walks the whole verse ladder in order', () => {
    const steps = buildChallengeSteps('keep_verse', VERSE);
    expect(steps.map((s) => s.ladderStep)).toEqual([0, 1, 2, 3, 4]);
    expect(steps.every((s) => s.kind === 'ladder')).toBe(true);
  });

  it('rejects a source that does not match the template', () => {
    expect(() => buildChallengeSteps('keep_verse', THREAD)).toThrow();
    expect(() => buildChallengeSteps('strengthen_thread', VERSE)).toThrow();
  });
});

describe('challengeTitle', () => {
  it('names the reader material', () => {
    expect(challengeTitle('strengthen_thread', THREAD)).toBe('Strengthen Covenant');
    expect(challengeTitle('keep_verse', VERSE)).toBe('Keep John 15:5');
    expect(challengeTitle('return_to_question', QUESTION)).toContain('kingdom to be near');
  });
});

describe('challengeSourceKey', () => {
  it('is stable per source', () => {
    expect(challengeSourceKey('strengthen_thread', THREAD)).toBe('strengthen_thread:note_1');
  });

  it('treats a connection as one pair regardless of direction', () => {
    const reversed: ChallengeSource = {
      ...CONNECTION,
      fromNoteId: CONNECTION.kind === 'connection' ? CONNECTION.toNoteId : '',
      toNoteId: CONNECTION.kind === 'connection' ? CONNECTION.fromNoteId : '',
    } as ChallengeSource;
    expect(challengeSourceKey('trace_connection', reversed)).toBe(
      challengeSourceKey('trace_connection', CONNECTION),
    );
  });

  it('is case-insensitive on a reference', () => {
    expect(challengeSourceKey('keep_verse', { kind: 'verse', reference: 'JOHN 15:5' })).toBe(
      challengeSourceKey('keep_verse', VERSE),
    );
  });
});

describe('isQuestionNoteTitle', () => {
  it('is about the title, not the body', () => {
    expect(isQuestionNoteTitle('What is the kingdom?')).toBe(true);
    expect(isQuestionNoteTitle('  Trailing space?  ')).toBe(true);
    expect(isQuestionNoteTitle('Notes on Romans 8')).toBe(false);
    expect(isQuestionNoteTitle('')).toBe(false);
    expect(isQuestionNoteTitle(null)).toBe(false);
  });
});

describe('applyStepOutcome and completion', () => {
  const steps = buildChallengeSteps('trace_connection', CONNECTION);

  it('resolves only the named step', () => {
    const next = applyStepOutcome(steps, 'why-linked', 'done', { response: 'Both name a priesthood.' });
    expect(next[0].status).toBe('done');
    expect(next[0].response).toBe('Both name a priesthood.');
    expect(next[0].completedAt).toBeTruthy();
    expect(next.slice(1).every((s) => s.status === 'pending')).toBe(true);
  });

  it('records the artifact a step produced', () => {
    const next = applyStepOutcome(steps, 'keep-or-revise', 'done', { artifactNoteId: 'note_new' });
    expect(next[next.length - 1].artifactNoteId).toBe('note_new');
  });

  it('counts a skipped step as resolved, so a path can always finish', () => {
    let current = steps;
    for (const s of steps) current = applyStepOutcome(current, s.key, 'skipped');
    expect(isChallengeComplete(current)).toBe(true);
    expect(countResolvedSteps(current)).toBe(steps.length);
  });

  it('is not complete while anything is pending', () => {
    const partial = applyStepOutcome(steps, 'why-linked', 'done');
    expect(isChallengeComplete(partial)).toBe(false);
    expect(isChallengeComplete([])).toBe(false);
  });

  it('points at the first unresolved step', () => {
    expect(nextPendingStepIndex(steps)).toBe(0);
    const partial = applyStepOutcome(steps, 'why-linked', 'skipped');
    expect(nextPendingStepIndex(partial)).toBe(1);
  });
});

describe('parseChallengeSteps', () => {
  it('round-trips what buildChallengeSteps produced', () => {
    const steps = buildChallengeSteps('strengthen_thread', THREAD);
    expect(parseChallengeSteps(JSON.stringify(steps))).toEqual(steps);
  });

  it('never throws on a malformed column', () => {
    expect(parseChallengeSteps('not json')).toEqual([]);
    expect(parseChallengeSteps('{"a":1}')).toEqual([]);
    expect(parseChallengeSteps(null)).toEqual([]);
    expect(parseChallengeSteps('[{"nope":true}]')).toEqual([]);
  });
});

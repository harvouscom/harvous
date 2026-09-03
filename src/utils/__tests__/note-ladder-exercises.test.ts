import { describe, it, expect } from 'vitest';
import {
  buildNoteChoice,
  buildNoteRecognize,
  gradeNoteChoice,
  labelNamesWhat,
  noteFragment,
  resolveNoteRung,
  type NoteMaterial,
} from '@/utils/note-ladder-exercises';

const ALL: NoteMaterial = { canRecognize: true, canPassage: true, canConnect: true };
const NONE: NoteMaterial = { canRecognize: false, canPassage: false, canConnect: false };

const BODY =
  'God chose us before the foundation of the world, not because we had done anything to deserve it but because it pleased him to do so, and that is the whole ground of adoption.';

describe('resolveNoteRung', () => {
  it('asks the rung the note has climbed to when it can answer it', () => {
    expect(resolveNoteRung(0, ALL)).toBe('note.recognize');
    expect(resolveNoteRung(1, ALL)).toBe('note.passage');
    expect(resolveNoteRung(2, ALL)).toBe('note.connect');
  });

  it('walks past a rung the note has no material for', () => {
    // A note with no links cannot be asked what it was linked to, whatever step it is on.
    expect(resolveNoteRung(2, { ...ALL, canConnect: false })).toBe('note.recognize');
    expect(resolveNoteRung(1, { ...ALL, canPassage: false })).toBe('note.connect');
  });

  it('wraps once rather than falling off the end', () => {
    expect(resolveNoteRung(2, { canRecognize: true, canPassage: false, canConnect: false })).toBe(
      'note.recognize',
    );
  });

  it('says nothing can be asked, which is a real answer', () => {
    // The floor: a note like this does not become a review item at all.
    expect(resolveNoteRung(0, NONE)).toBeNull();
    expect(resolveNoteRung(2, NONE)).toBeNull();
  });

  it('gives an encrypted note the two rungs built on plaintext', () => {
    expect(resolveNoteRung(0, { canRecognize: false, canPassage: true, canConnect: true })).toBe(
      'note.passage',
    );
  });

  it('tolerates a nonsense step', () => {
    expect(resolveNoteRung(-5, ALL)).toBe('note.recognize');
    expect(resolveNoteRung(99, ALL)).toBeTruthy();
    expect(resolveNoteRung(Number.NaN, ALL)).toBe('note.recognize');
  });
});

describe('noteFragment', () => {
  it('quotes from the middle, never the opening words', () => {
    /*
     * The row and the dock both print the note's opening line as their context line, and an
     * untitled note's option label falls back to that same line. An opening-words fragment
     * would be printed directly above its own answer.
     */
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const fragment = noteFragment(BODY, seed)!;
      expect(BODY.startsWith(fragment)).toBe(false);
      expect(BODY).toContain(fragment);
    }
  });

  it('is the same fragment for the same seed', () => {
    expect(noteFragment(BODY, 'a')).toBe(noteFragment(BODY, 'a'));
  });

  it('refuses a body with nothing recognisable in it', () => {
    expect(noteFragment('Romans 8:15', 'a')).toBeNull();
    expect(noteFragment('', 'a')).toBeNull();
  });

  it('takes the whole of a short-but-usable body', () => {
    const short = 'the ground of adoption is his good pleasure';
    expect(noteFragment(short, 'a')).toBe(short);
  });
});

describe('buildNoteRecognize', () => {
  const poolLabels = ['Adoption, not slavery', 'Covenant and kingship', 'Ruth 3', 'Written 9 Aug'];

  it('offers four notes with the right one among them', () => {
    const ex = buildNoteRecognize({
      fragment: 'not because we had done anything to deserve it',
      answerLabel: 'The ground of adoption',
      poolLabels,
      seed: 'a',
    })!;
    expect(ex.options).toHaveLength(4);
    expect(ex.options[ex.answerIndex]).toBe('The ground of adoption');
    expect(ex.fragment).toContain('deserve');
  });

  it('refuses when the fragment contains one of its own options', () => {
    /*
     * Not hypothetical. An untitled note's label falls back to its opening line, so a question
     * built from that note's body can quote the very string that is offered as an answer.
     */
    // Exactly three distractors, so the offending one is certain to be drawn.
    const ex = buildNoteRecognize({
      fragment: 'God chose us before the foundation of the world',
      answerLabel: 'The ground of adoption',
      poolLabels: ['Ruth 3', 'Covenant and kingship', 'God chose us before the foundation'],
      seed: 'a',
    });
    expect(ex).toBeNull();
  });

  it('refuses when an option contains the whole fragment', () => {
    const ex = buildNoteRecognize({
      fragment: 'the ground of adoption',
      answerLabel: 'On the ground of adoption, and what follows',
      poolLabels,
      seed: 'a',
    });
    expect(ex).toBeNull();
  });

  it('refuses rather than offering a thin question', () => {
    expect(
      buildNoteRecognize({ fragment: 'x', answerLabel: 'A', poolLabels: ['B'], seed: 'a' }),
    ).toBeNull();
  });
});

describe('buildNoteChoice', () => {
  /*
   * Six, not four. Every acceptable answer is also barred as a distractor, so a note citing two
   * passages that the reader has also studied elsewhere shrinks the usable pool by two. The
   * server must pass a generous pool for the same reason.
   */
  const pool = [
    'Romans 8:28',
    'Psalm 23:1',
    '1 Peter 2:9',
    'Genesis 1:1',
    'Hebrews 11:1',
    'Isaiah 40:31',
  ];

  it('accepts any passage the note actually cites', () => {
    /*
     * A note citing three passages has three right answers. Naming one of them *the* answer
     * would grade the row order of a scripture detector rather than the reader's study.
     */
    const acceptable = ['John 15:5', 'Ephesians 2:8'];
    const ex = buildNoteChoice({ acceptable, poolLabels: pool, seed: 'a' })!;
    const shown = ex.options[ex.answerIndex];
    expect(acceptable).toContain(shown);
    expect(gradeNoteChoice(ex, shown, acceptable)).toBe(true);
  });

  it('never offers a second right answer as a wrong one', () => {
    const acceptable = ['Romans 8:28', 'Psalm 23:1'];
    for (const seed of ['a', 'b', 'c', 'd']) {
      const ex = buildNoteChoice({ acceptable, poolLabels: pool, seed })!;
      const wrong = ex.options.filter((_, i) => i !== ex.answerIndex);
      expect(wrong).not.toContain('Romans 8:28');
      expect(wrong).not.toContain('Psalm 23:1');
    }
  });

  it('refuses when the note committed nothing to ask about', () => {
    expect(buildNoteChoice({ acceptable: [], poolLabels: pool, seed: 'a' })).toBeNull();
  });

  it('marks a wrong pick wrong', () => {
    const acceptable = ['John 15:5'];
    const ex = buildNoteChoice({ acceptable, poolLabels: pool, seed: 'a' })!;
    for (const wrong of ex.options.filter((o) => o !== 'John 15:5')) {
      expect(gradeNoteChoice(ex, wrong, acceptable)).toBe(false);
    }
  });
});

describe('labelNamesWhat', () => {
  /*
   * Found in preview against real notes, not in design. Rung 0 came back offering "August 13,
   * 2026", "Written 10 Jul", "Written 26 Jun" and "August 16, 2026" — four dates. Nobody can say
   * which day a sentence of their own came from, so the question had no answer.
   */
  it('accepts a title that says what the note is about', () => {
    for (const label of ['Adoption, not slavery', 'Romans 8:15', 'Covenant and kingship', 'Ruth 3']) {
      expect(labelNamesWhat(label)).toBe(true);
    }
  });

  it('rejects a title that is only a date, however it is written', () => {
    for (const label of ['August 13, 2026', '2026-08-13', '13 August 2026', 'August 13']) {
      expect(labelNamesWhat(label)).toBe(false);
    }
  });

  it('rejects the written-on fallback, which is the same problem wearing different words', () => {
    expect(labelNamesWhat('Written 9 Aug')).toBe(false);
  });

  it('rejects nothing at all', () => {
    expect(labelNamesWhat('   ')).toBe(false);
  });
});

describe('labelNamesWhat and chapter references', () => {
  it('keeps a chapter reference, which reads like a date and is nothing like one', () => {
    /*
     * "Ruth 3" is among the best labels a note can have, and a bare `[A-Z][a-z]+ \d+` pattern
     * throws it away along with "August 13". Months are named for exactly this reason.
     */
    for (const label of ['Ruth 3', 'John 15', 'Psalm 23', 'Acts 2', 'Mark 1']) {
      expect(labelNamesWhat(label)).toBe(true);
    }
  });
});

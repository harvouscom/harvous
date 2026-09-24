import { describe, it, expect } from 'vitest';
import {
  buildNoteChoice,
  gradeNoteChoice,
  labelNamesWhat,
  noteChoiceBuildable,
  resolveNoteRung,
  type NoteMaterial,
} from '@/utils/note-ladder-exercises';

const ALL: NoteMaterial = { canPassage: true, canConnect: true, canFolder: true };
const NONE: NoteMaterial = { canPassage: false, canConnect: false, canFolder: false };

describe('a preference can never be the reason a note goes unasked', () => {
  /*
   * The fall-forward invariant, at the one walk that used to break it. `verseRungFor` ends on
   * `members[0]` whatever the material says; this walk returned null when `skip` removed the last
   * buildable rung, and null means `dropUnaskable` takes the note out of the queue altogether.
   * Turning "ask me this less" into "never show me this note" is the failure being pinned here.
   */
  it('still resolves when the only buildable rung is skipped', () => {
    const onlyFolder: NoteMaterial = {
      canPassage: false,
      canConnect: false,
      canFolder: true,
      skip: new Set(['note.folder' as const]),
    };
    expect(resolveNoteRung(0, onlyFolder, 'seed')).toBe('note.folder');
  });

  it('still resolves when every rung the note has is skipped', () => {
    const allSkipped: NoteMaterial = {
      ...ALL,
      skip: new Set(['note.passage', 'note.connect', 'note.folder'] as const),
    };
    expect(resolveNoteRung(0, allSkipped, 'seed')).not.toBeNull();
  });

  it('prefers an unskipped rung over the skipped one when the note has both', () => {
    const both: NoteMaterial = {
      canPassage: true,
      canConnect: false,
      canFolder: true,
      skip: new Set(['note.folder' as const]),
    };
    expect(resolveNoteRung(0, both, 'seed')).toBe('note.passage');
  });

  it('still returns null when the note has no buildable rung at all', () => {
    // No material is a different thing from a preference, and it must keep its old answer.
    expect(resolveNoteRung(0, NONE, 'seed')).toBeNull();
  });
});

describe('resolveNoteRung', () => {
  it('asks the rung the note has climbed to when it can answer it', () => {
    expect(resolveNoteRung(0, ALL)).toBe('note.passage');
    expect(resolveNoteRung(1, ALL)).toBe('note.connect');
    expect(resolveNoteRung(2, ALL)).toBe('note.folder');
  });

  it('walks past a rung the note has no material for', () => {
    // A note with no links cannot be asked what it was linked to, whatever step it is on.
    expect(resolveNoteRung(1, { ...ALL, canConnect: false })).toBe('note.folder');
    expect(resolveNoteRung(0, { ...ALL, canPassage: false })).toBe('note.connect');
  });

  it('wraps once rather than falling off the end', () => {
    expect(resolveNoteRung(2, { canPassage: true, canConnect: false, canFolder: false })).toBe('note.passage');
  });

  it('says nothing can be asked, which is a real answer', () => {
    // The floor: a note like this does not become a review item at all.
    expect(resolveNoteRung(0, NONE)).toBeNull();
    expect(resolveNoteRung(2, NONE)).toBeNull();
  });

  it('keeps a note that climbed past the retired rungs askable', () => {
    // Stored steps up to 3 exist from the four-rung ladder; the walk wraps rather than failing.
    expect(resolveNoteRung(3, ALL)).toBe('note.passage');
    expect(resolveNoteRung(3, { ...ALL, canPassage: false })).toBe('note.connect');
  });

  it('tolerates a nonsense step', () => {
    expect(resolveNoteRung(-5, ALL)).toBe('note.passage');
    expect(resolveNoteRung(99, ALL)).toBeTruthy();
    expect(resolveNoteRung(Number.NaN, ALL)).toBe('note.passage');
  });

  it('spreads notes on the same step across different questions', () => {
    const keys = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'].map((id) =>
      resolveNoteRung(0, ALL, `${id}:0:0`),
    );
    expect(new Set(keys).size).toBeGreaterThan(1);
    // Same seed, same question — list, reveal and grader must agree.
    expect(resolveNoteRung(0, ALL, 'n1:0:0')).toBe(resolveNoteRung(0, ALL, 'n1:0:0'));
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

describe('buildNoteChoice and what the card already says', () => {
  const folders = ['Providence', 'Exile', 'Kingship', 'Psalms of ascent', 'Covenant'];

  it('drops a wrong option the note title names', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const ex = buildNoteChoice({
        acceptable: ['Providence'],
        poolLabels: folders,
        shown: 'Exile and return',
        seed,
      })!;
      expect(ex.options).not.toContain('Exile');
    }
  });

  it('will not ask a question the title already answers', () => {
    // "Grace in Romans 8" cannot be asked which folder it is in when the only folder is "Grace".
    expect(
      buildNoteChoice({ acceptable: ['Grace'], poolLabels: folders, shown: 'Grace in Romans 8', seed: 'a' }),
    ).toBeNull();
  });

  it('still asks about a right answer the title does not name', () => {
    const ex = buildNoteChoice({
      acceptable: ['Grace', 'Providence'],
      poolLabels: folders,
      shown: 'Grace in Romans 8',
      seed: 'a',
    })!;
    expect(ex.options[ex.answerIndex]).toBe('Providence');
    // The one the title named is still right, so it is never offered as a wrong answer either.
    expect(ex.options).not.toContain('Grace');
  });

  it('treats a cited passage inside the title as named', () => {
    expect(
      buildNoteChoice({
        acceptable: ['Romans 8:28'],
        poolLabels: ['Psalm 23:1', 'John 3:16', 'Genesis 1:1'],
        shown: 'Romans 8',
        seed: 'a',
      }),
    ).toBeNull();
  });
});

describe('noteChoiceBuildable', () => {
  /*
   * The probe and the builder used to be two readings of the same note, and every disagreement
   * reached the reader as a prompt over an empty card. The probe is the builder now, without a
   * seed — so it must agree with a build under every seed.
   */
  const cases = [
    { acceptable: ['Grace'], poolLabels: ['Exile', 'Kingship', 'Covenant'] },
    { acceptable: ['Grace'], poolLabels: ['Exile', 'Kingship'] },
    { acceptable: ['Grace'], poolLabels: ['Exile', 'exile', 'Kingship'] },
    { acceptable: ['Grace'], poolLabels: ['Exile', 'Kingship', 'Grace'] },
    { acceptable: ['Grace'], poolLabels: ['Exile', 'Kingship', 'Covenant'], shown: 'Grace notes' },
    { acceptable: [], poolLabels: ['Exile', 'Kingship', 'Covenant'] },
  ];
  it('agrees with the builder under every seed', () => {
    for (const input of cases) {
      const buildable = noteChoiceBuildable(input);
      for (const seed of ['a', 'b', 'c', 'x:1:0', 'y:2:5']) {
        expect(buildNoteChoice({ ...input, seed }) !== null).toBe(buildable);
      }
    }
  });
});

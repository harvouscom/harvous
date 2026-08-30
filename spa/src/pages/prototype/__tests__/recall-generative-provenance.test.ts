/**
 * Every card that seeds a note must say which card it was.
 *
 * This is the guard on the bug it was written for. `complete` is one of five members of
 * `RECALL_EVENT_ACTIONS` and it had never once been recorded, across every kind, in sixty
 * days — because the only thing that ever reported it was `connectNotes`. The repair hangs
 * entirely on the seed carrying `recall`, and a seed is easy to add a card without.
 *
 * So the assertion is not "the code calls `reportRecallCompleted`" — that is unreachable from
 * a unit test and would be a restatement of the implementation anyway. It is: for every kind
 * that creates a note, tapping the card hands `startDraftNote` an opportunity id **equal to
 * the card's own id**. A mismatch there is the quiet failure, because it would rest a
 * suggestion that was never shown while leaving the one you acted on to come back tomorrow.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildRecallCandidates } from '../proto-recall-candidates';
import { NOTE_CREATING_RECALL_KINDS } from '@/utils/recall-opportunity-kinds';

/** Only the fields the generative branches actually read; everything else stays absent. */
function buildWith(overrides: Record<string, unknown>) {
  /* Typed, so `mock.calls[0][0]` is the seed rather than an index into an empty tuple. */
  const startDraftNote = vi.fn(
    (_seed: {
      title?: string;
      contentHtml?: string;
      recall?: { opportunityId: string; kind: string };
    }) => true,
  );
  const out = buildRecallCandidates({
    deletedNoteKey: '',
    continueNote: null,
    revisitNote: null,
    revisitOnHome: null,
    spotlightHighlight: null,
    studyArc: null,
    sectionArc: null,
    activeArc: null,
    activeArcIsSection: false,
    studyArcCopy: null,
    subjectConnection: null,
    crossRefConnection: null,
    passageConnection: null,
    referenceWordConnection: null,
    fingerprintsById: new Map(),
    meaningWeightById: new Map(),
    handleOpenRevisitNote: vi.fn(),
    onOpenHighlight: vi.fn(),
    openStudyArc: vi.fn(),
    openSubjectConnection: vi.fn(),
    openCrossRefConnection: vi.fn(),
    openPassageConnection: vi.fn(),
    continueBookSuggestion: null,
    navigate: vi.fn(),
    recurringPerson: null,
    bareHighlight: null,
    highlightsWithRecency: [],
    reflectionPrompt: null,
    topCrossRefGap: null,
    topConnectSuggestion: null,
    homeSpaceId: 'space_1',
    onOpenCreateThreadPrefill: vi.fn(),
    startDraftNote,
    openCrossRefGap: vi.fn(),
    handleRecallCompleted: vi.fn(),
    searchGap: null,
    ...overrides,
  } as never);
  return { out, startDraftNote };
}

const CASES: { kind: string; overrides: Record<string, unknown> }[] = [
  {
    kind: 'continueBook',
    overrides: {
      continueBookSuggestion: { book: 'John', nextChapter: 4, citedCount: 3 },
    },
  },
  {
    kind: 'studyPerson',
    overrides: { recurringPerson: { name: 'Barnabas', noteCount: 3 } },
  },
  {
    kind: 'searchGap',
    overrides: { searchGap: { query: 'patience' } },
  },
  {
    kind: 'reflection',
    overrides: {
      reflectionPrompt: {
        source: 'season',
        label: 'Advent',
        title: 'A prayer for Advent',
        eyebrow: "It's Advent",
        meta: 'A prayer to write',
      },
    },
  },
];

describe('a generative card hands its own id to the draft it seeds', () => {
  for (const { kind, overrides } of CASES) {
    it(`${kind} carries its opportunity id`, () => {
      const { out, startDraftNote } = buildWith(overrides);
      const card = out.find((c) => c.kind === kind);
      expect(card, `no ${kind} card was built`).toBeDefined();

      card!.onOpen();

      expect(startDraftNote).toHaveBeenCalledTimes(1);
      const seed = startDraftNote.mock.calls[0][0];
      expect(seed.recall).toBeDefined();
      expect(seed.recall!.kind).toBe(kind);
      /* The whole point: the id reported must be the id shown. */
      expect(seed.recall!.opportunityId).toBe(card!.id);
    });
  }

  it('covers every note-creating kind that this builder can produce', () => {
    /*
     * `crossrefGap` is the fourth member of `NOTE_CREATING_RECALL_KINDS` and is deliberately
     * absent above: its tap goes through `openCrossRefGap`, which prefers to open an existing
     * note and only falls back to seeding a draft. That fallback carries its own provenance
     * (see `use-home-surface-data`), and it is not reachable from this pure builder.
     *
     * The assertion is here so that adding a fifth note-creating kind fails this file rather
     * than silently shipping without a completion signal.
     */
    const covered = new Set([...CASES.map((c) => c.kind), 'crossrefGap']);
    for (const kind of NOTE_CREATING_RECALL_KINDS) {
      expect(covered.has(kind), `${kind} creates notes but has no provenance test`).toBe(true);
    }
    expect(covered.size).toBe(NOTE_CREATING_RECALL_KINDS.length);
  });
});

/**
 * Home steps aside for Review on the two kinds that are memory exercises in disguise.
 *
 * The failure this guards is not a crash: it is one screen showing the same passage twice,
 * once as a question with a right answer and once as a nudge to re-read, with the reader left
 * to work out whether those are the same thing. See `review-suggestion-handoff.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildRecallCandidates } from '../proto-recall-candidates';

/*
 * Annotated on purpose: an unannotated highlight takes the "add a thought" branch instead, and
 * that card is a Suggestion by the rule — its outcome is something new written.
 */
const highlight = (reference: string | null) => ({
  id: 'highlight_1',
  parentNoteId: 'note_1',
  parentNoteTitle: 'A note',
  entryKind: 'scriptureLink',
  miniNoteBody: 'What I made of it.',
  notesBody: '',
  scriptureReference: reference,
  scripturePassageExcerpt: 'you are the branches',
  createdAt: '2026-08-01T00:00:00.000Z',
});

function build(overrides: Record<string, unknown>) {
  return buildRecallCandidates({
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
    startDraftNote: vi.fn(),
    openCrossRefGap: vi.fn(),
    handleRecallCompleted: vi.fn(),
    searchGap: null,
    markNote: null,
    handleOpenMarkNote: vi.fn(),
    reflectThread: null,
    handleOpenReflectThread: vi.fn(),
    ...overrides,
  } as never);
}

const passageConnection = {
  passageKey: 'psalms-62',
  displayRef: 'Psalms 62',
  bookOrder: 19,
  noteCount: 4,
  notes: [{ id: 'note_1', title: 'A note' }],
};

const kinds = (out: ReturnType<typeof buildRecallCandidates>) => out.map((o) => o.kind);

describe('the passage card', () => {
  it('is there when Review is not asking about it', () => {
    expect(kinds(build({ passageConnection }))).toContain('passage');
    expect(kinds(build({ passageConnection, activeReviewReferences: new Set(['romans 8:15']) }))).toContain(
      'passage',
    );
  });

  it('steps aside for a verse inside it that Review has taken up', () => {
    const out = build({ passageConnection, activeReviewReferences: new Set(['psalms 62:5']) });
    expect(kinds(out)).not.toContain('passage');
  });

  it('reads as an extension of study rather than a drill', () => {
    const card = build({ passageConnection }).find((o) => o.kind === 'passage');
    expect(card?.eyebrow).toBe('Worth reading again');
  });
});

describe('the highlight card', () => {
  it('is there when Review is not asking about its passage', () => {
    expect(kinds(build({ spotlightHighlight: highlight('John 15:5') }))).toContain('highlight');
  });

  it('steps aside for the passage Review has taken up', () => {
    const out = build({
      spotlightHighlight: highlight('John 15:5'),
      activeReviewReferences: new Set(['john 15:5']),
    });
    expect(kinds(out)).not.toContain('highlight');
  });

  it('stays when it names no passage at all, since nothing can be asking about it', () => {
    const out = build({
      spotlightHighlight: highlight(null),
      activeReviewReferences: new Set(['john 15:5']),
    });
    expect(kinds(out)).toContain('highlight');
  });

  it('reads as an extension of study rather than a drill', () => {
    const card = build({ spotlightHighlight: highlight('John 15:5') }).find((o) => o.kind === 'highlight');
    expect(card?.eyebrow).toBe('Worth a second look');
  });
});

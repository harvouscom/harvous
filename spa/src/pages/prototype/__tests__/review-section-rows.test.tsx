/**
 * What the Review section shows, and to whom.
 *
 * Four audiences with four different right answers, and three of them are decisions that a
 * later change could silently reverse: a guest must see nothing at all, a free account must
 * see exactly one dismissible line, and a subscriber whose subscription has not loaded yet
 * must not be shown a paywall. That last one is the expensive bug — it puts an upgrade prompt
 * in front of a paying customer on every cold load — and it is invisible in manual testing
 * because a warm cache never reproduces it.
 *
 * The cap is asserted here rather than trusted to the server: the server already limits what
 * it sends, but the row budget is shared with the challenge continuation, and that arithmetic
 * is the client's.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const identity = { isGuest: false };
const features: Record<string, { has: boolean; ready: boolean }> = {
  review: { has: true, ready: true },
  challenges: { has: true, ready: true },
};
const inbox = {
  data: undefined as
    | undefined
    | {
        items: unknown[];
        hasMore: boolean;
        coldStart?: { ready: number; needed: number; opensAt: string | null } | null;
      },
};
const challenges = { data: undefined as undefined | { challenges: unknown[] } };
const sample = { data: undefined as undefined | { sample: unknown } };
/** The shape `buildReviewSample` returns: a reference plus the cloze the card renders. */
const sampleView = {
  reference: 'John 15:5',
  source: 'yours',
  cloze: { segments: ['I am the vine, you are the ', '.'], blankLengths: [8] },
  blankCount: 1,
};

vi.mock('../../../hooks/useHarvousIdentity', () => ({
  useHarvousIdentity: () => identity,
}));
vi.mock('../../../hooks/useHasFeature', () => ({
  useHasFeature: (key: string) => features[key] ?? { has: false, ready: true },
}));
const allItems = { data: undefined as undefined | { items: unknown[] } };
/*
 * The counted shape, fetched on every load — where the built one below is not.
 *
 * This is the split that took `/api/review/items` off Home's first paint: the section reads
 * counts from here and only asks the server to build questions when a fold is opened. The two
 * lists have identical membership by construction (same drop rules, server side), so a test can
 * hand them the same rows.
 */
const summaryItems = { data: undefined as undefined | { items: unknown[] } };
vi.mock('../../../hooks/queries/useReview', () => ({
  useReviewInbox: () => inbox,
  // Fetched only once the reader unfolds the section.
  useReviewItems: () => allItems,
  useReviewItemsSummary: () => summaryItems,
  // The sample is for an account without the feature; these rows all have it.
  useReviewSample: (opts: { enabled: boolean }) => ({
    data: opts?.enabled === false ? undefined : sample.data,
    isPending: false,
  }),
  reviewSampleDayKey: () => '2026-09-03',
}));
vi.mock('../../../hooks/queries/useChallenges', () => ({
  useChallenges: () => challenges,
  // The section reads the shared Home list — active *and* paused — and filters it itself.
  useHomeChallenges: () => challenges,
}));
vi.mock('../../../hooks/mutations/useReviewMutations', () => ({
  useDeferReview: () => ({ mutate: vi.fn(), isPending: false }),
  useSetReviewStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useAnswerReviewSample: () => ({ mutate: vi.fn(), isPending: false }),
}));
const navigate = vi.fn();
const openReviewDock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));
vi.mock('../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ openReviewDock }),
}));

const PrototypeReviewSection = (await import('../PrototypeReviewSection')).default;
const { REVIEW_PLUS_TITLE, REVIEW_SECTION_TITLE } = await import('../proto-review-copy');

function reviewItem(id: string, prompt: string, task = 'Pick a passage you cited') {
  return {
    id,
    kind: 'note',
    prompt,
    task,
    promptKey: 'note.passage',
    recallState: 'fragile',
    status: 'active',
    origin: 'user',
    dueAt: new Date().toISOString(),
    reviewCount: 1,
    ladderStep: 1,
    noteTitle: 'Adoption, not slavery',
    secondaryNoteTitle: null,
    scriptureReference: 'Romans 8:15',
    noteId: 'note_1',
    challengeId: null,
    sourceLabel: null as string | null,
    sourceAt: null as string | null,
  };
}

function challenge(id: string) {
  return {
    id,
    templateKey: 'strengthen_thread',
    title: 'Strengthen Covenant',
    status: 'active',
    steps: [],
    currentStepIndex: 1,
    resolvedSteps: 1,
    totalSteps: 5,
    sourceNoteId: 'note_9',
    sourceSecondaryNoteId: null,
    scriptureReference: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

beforeEach(() => {
  navigate.mockClear();
  openReviewDock.mockClear();
  identity.isGuest = false;
  features.review = { has: true, ready: true };
  features.challenges = { has: true, ready: true };
  inbox.data = { items: [], hasMore: false };
  allItems.data = undefined;
  summaryItems.data = undefined;
  challenges.data = { challenges: [] };
  sample.data = undefined;
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('who sees the Review section', () => {
  it('shows a guest nothing at all', () => {
    identity.isGuest = true;
    inbox.data = { items: [reviewItem('r1', 'What did you observe?')], hasMore: false };
    const { container } = render(<PrototypeReviewSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a free account one line, with the Plus badge', () => {
    features.review = { has: false, ready: true };
    features.challenges = { has: false, ready: true };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('Plus')).toBeInTheDocument();
    expect(screen.getByText(/Return to your study/)).toBeInTheDocument();
  });

  it('shows nothing while the subscription is still loading', () => {
    // The expensive bug: a subscriber must never be flashed a paywall on a cold load.
    features.review = { has: false, ready: false };
    features.challenges = { has: false, ready: false };
    const { container } = render(<PrototypeReviewSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a subscriber with an empty queue nothing, rather than an empty state', () => {
    const { container } = render(<PrototypeReviewSection />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('what it shows a subscriber', () => {
  it('leads with what is being reviewed, and puts the doing underneath', () => {
    /*
     * The inverse of what this asserted before. The question used to be the title, which left a
     * shelf of rows all asking things with no visible subject; Home has always read the other
     * way round, and Review now matches it. The full instruction is in the dock.
     */
    inbox.data = {
      items: [reviewItem('r1', 'Pick a passage you cited in Adoption, not slavery.')],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('Adoption, not slavery')).toBeInTheDocument();
    expect(screen.getByText(/Pick a passage you cited/)).toBeInTheDocument();
    expect(
      screen.queryByText('Pick a passage you cited in Adoption, not slavery.'),
    ).not.toBeInTheDocument();
  });

  it('names only the kind of thing on a rung whose answer is the subject', () => {
    // "Pick the note this line is from" — printing the note's name would answer it on the row.
    inbox.data = {
      items: [
        {
          ...reviewItem('r1', 'Pick the note this line is from.'),
          promptKey: 'note.recognize',
          ladderStep: 0,
        },
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('One of your notes')).toBeInTheDocument();
    expect(screen.queryByText('Adoption, not slavery')).not.toBeInTheDocument();
  });

  it('shows one note and one passage closed, whatever the queue is made of', () => {
    /*
     * Not "the first two". Three notes in a row would crowd the verse out entirely, and the two
     * halves of the feature are the point — a thing you wrote, and a thing you read.
     */
    inbox.data = {
      items: [
        reviewItem('a', 'Question a', 'Task a'),
        reviewItem('b', 'Question b', 'Task b'),
        { ...reviewItem('c', 'Question c', 'Task c'), kind: 'verse' },
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    const tasks = screen.queryAllByText(/^Task /).map((n) => n.textContent);
    expect(tasks).toEqual(['Task a', 'Task c']);
  });

  it('treats a highlight as a passage and a Thread as a note', () => {
    inbox.data = {
      items: [
        { ...reviewItem('a', 'Question a', 'Task a'), kind: 'thread' },
        { ...reviewItem('b', 'Question b', 'Task b'), kind: 'highlight' },
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    expect(screen.queryAllByText(/^Task /).length).toBe(2);
  });

  it('leaves room for the challenge continuation beside them', () => {
    inbox.data = {
      items: ['a', 'b', 'c', 'd'].map((id) => reviewItem(id, `Question ${id}`, `Task ${id}`)),
      hasMore: true,
    };
    challenges.data = { challenges: [challenge('c1')] };
    render(<PrototypeReviewSection />);
    /* Two rows closed, never more than two (#114). All four are notes, so there is no passage to
       pair one with and the fallback picks two different exercises instead — which is still two,
       leaving the challenge its line. This asserted one back when a no-passage set collapsed to a
       single row. */
    expect(screen.queryAllByText(/^Task /).length).toBe(2);
    expect(screen.getByText('Strengthen Covenant')).toBeInTheDocument();
  });

  /*
   * The fold names what pressing it will actually open (#112) — `items.length` minus the rows
   * already on screen, both of which the closed section is holding. It does not need the built
   * list, which is only fetched on expand.
   *
   * This pair used to encode the older rule, where a closed section could not count at all and
   * said "See all", and then a version that counted every due row off the summary. Both printed
   * a number that did not match what opening produced, which is the failure #112 named.
   */
  it('names how many rows the fold will open, from what it already has', () => {
    // `allItems` stays undefined (reset in beforeEach): nothing is expanded, so the server was
    // never asked to build a question, and the count is right anyway.
    inbox.data = {
      items: ['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
    };
    render(<PrototypeReviewSection />);
    // Three due, two shown closed — one more to open.
    expect(screen.getByText('1 more')).toBeInTheDocument();
  });

  it('does not count rows the fold will not open', () => {
    // Both due rows are already on screen, so opening reveals nothing and there is no fold —
    // even though the summary knows about a third. Counting the summary here said "1 more" and
    // opened onto the same two rows.
    inbox.data = { items: ['a', 'b'].map((id) => reviewItem(id, `Question ${id}`)), hasMore: false };
    summaryItems.data = { items: ['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)) };
    render(<PrototypeReviewSection />);
    expect(screen.queryByText(/\d+ more/)).not.toBeInTheDocument();
    expect(screen.queryByText('See all')).not.toBeInTheDocument();
  });

  it('says where a challenge is as a position, never as a count of what is left', () => {
    challenges.data = { challenges: [challenge('c1')] };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
    expect(screen.queryByText(/remaining|left|overdue/i)).not.toBeInTheDocument();
  });

  it('leaves a paused challenge where the reader put it', () => {
    /*
     * The list this reads is shared with the Strengthen row, which needs paused ones to know
     * what not to offer again — so paused rows arrive here too and are filtered out. Showing
     * one would hand back, as a thing in progress, the exact path the reader set down.
     */
    challenges.data = { challenges: [{ ...challenge('c1'), status: 'paused' }] };
    render(<PrototypeReviewSection />);
    expect(screen.queryByText('Strengthen Covenant')).not.toBeInTheDocument();
  });

  it('never renders a count of what it is not showing', () => {
    inbox.data = {
      items: ['a', 'b', 'c', 'd', 'e'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true
    };
    const { container } = render(<PrototypeReviewSection />);
    // The named failure mode: an escalating badge like "27 due".
    expect(container.textContent).not.toMatch(/\d+\s*(due|waiting|remaining|overdue)/i);
  });

  it('says where a row came from, so the queue reads as their own study', () => {
    const item = reviewItem('r1', 'What comes next?');
    item.sourceLabel = 'Highlighted while reading John 15:5';
    inbox.data = { items: [item], hasMore: false };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(/Highlighted while reading John 15:5/)).toBeInTheDocument();
  });

  it('never offers to start reviewing: the engine fills the queue', () => {
    inbox.data = { items: [], hasMore: false };
    const { container } = render(<PrototypeReviewSection />);
    expect(container.textContent ?? '').not.toMatch(/Start reviewing/);
  });
});

describe('opening a question', () => {
  it('opens the dock where you are, rather than navigating to a session page', () => {
    /*
     * The whole point of the redesign: a question about a note is answered beside your study,
     * not on a page you have to leave it for. If this ever navigates again, Review has quietly
     * become a destination a second time.
     */
    inbox.data = {
      items: [reviewItem('r1', 'Pick a passage you cited in Adoption.', 'Pick a passage you cited')],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    // The row's title is the subject now; tapping it is what opens the dock.
    screen.getByText('Adoption, not slavery').click();
    expect(openReviewDock).toHaveBeenCalledWith('r1');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('the framing line', () => {
  it('takes the slot provenance would have, when the app has something to say', () => {
    /*
     * One slot, not two. A row reading "Pick a passage you cited · Cited in 3 of your notes ·
     * Marked Romans 1:7 in a note · Forming" is a sentence nobody finishes. Framing is preferred
     * because it is about the reader; provenance is what is left when there is nothing to say.
     */
    inbox.data = {
      items: [
        {
          ...reviewItem('r1', 'Pick a passage you cited in Adoption, not slavery.'),
          sourceLabel: 'Marked Romans 8:15 in a note',
          framing: { template: 'cited', args: { n: 3 } },
        },
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(/Cited in 3 of your notes\./)).toBeInTheDocument();
    expect(screen.queryByText(/Marked Romans 8:15 in a note/)).not.toBeInTheDocument();
  });

  it('falls back to provenance rather than to nothing', () => {
    inbox.data = {
      items: [
        {
          ...reviewItem('r1', 'Pick a passage you cited in Adoption, not slavery.'),
          sourceLabel: 'Marked Romans 8:15 in a note',
          framing: null,
        },
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(/Marked Romans 8:15 in a note/)).toBeInTheDocument();
  });
});

/**
 * The three ways Review can be empty, and which of them says anything.
 *
 * Nothing due today stays silent on purpose — the day's record is below and is better company
 * than a row announcing a rest. Never having started is different: the engine holds an account
 * back until it has a few days of the reader's own study, and a section that renders nothing at
 * all in the meantime cannot be told from a broken one. It was reported as broken three times by
 * someone in exactly that state.
 */
describe('when there is nothing to review', () => {
  it('says nothing at all when the engine is running and today is simply clear', () => {
    // The long-standing stance, and the one this must not overturn.
    inbox.data = { items: [], hasMore: false, coldStart: null };
    const { container } = render(<PrototypeReviewSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains itself when the engine has not started yet', () => {
    inbox.data = { items: [], hasMore: false, coldStart: { ready: 0, needed: 5, opensAt: null } };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('Nothing to review yet')).toBeInTheDocument();
    expect(screen.getByText(/Reviews come from your own study/)).toBeInTheDocument();
  });

  it('gives no date when waiting alone will not start it', () => {
    /*
     * `opensAt: null` is the server saying age is not what is holding this account back — the
     * other two gates want more study, and neither passes with time. This is the real shape of
     * the account that prompted the work: seventeen non-chapter nodes, none of them ready.
     */
    inbox.data = { items: [], hasMore: false, coldStart: { ready: 0, needed: 5, opensAt: null } };
    render(<PrototypeReviewSection />);
    expect(screen.queryByText(/should arrive/)).not.toBeInTheDocument();
  });

  it('gives the date when waiting is all it takes', () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    inbox.data = {
      items: [],
      hasMore: false,
      coldStart: { ready: 2, needed: 5, opensAt: inThreeDays },
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(/should arrive/)).toBeInTheDocument();
  });

  it('shows rows rather than the empty state once there are any', () => {
    inbox.data = {
      items: [reviewItem('r1', 'What did you observe?')],
      hasMore: false,
      coldStart: null,
    };
    render(<PrototypeReviewSection />);
    expect(screen.queryByText('Nothing to review yet')).not.toBeInTheDocument();
  });
});

/**
 * The free account's two controls, and the fact that they are two.
 *
 * They shared one flag once: dismissing the upgrade row deleted the sample with it, taking the
 * try away along with the advertisement. Splitting them fixed that and left the mirror-image
 * gap — the sample's own "Not now" was still wired to the upsell's flag, so it hid the row and
 * the question came back the next morning. Neither control did what its own label said.
 */
describe('what a free account is offered', () => {
  const asFree = () => {
    features.review = { has: false, ready: true };
    features.challenges = { has: false, ready: true };
  };

  it('offers the question and the upgrade row', () => {
    asFree();
    sample.data = { sample: sampleView };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(REVIEW_PLUS_TITLE)).toBeInTheDocument();
  });

  it('keeps the question when only the upgrade row is dismissed', () => {
    /*
     * The reason the two flags exist. Hiding an offer is not asking to be shown less of the
     * product, and the sample is the one real thing a free reader can do.
     */
    asFree();
    sample.data = { sample: sampleView };
    window.localStorage.setItem('harvous-prototype-review-plus-dismissed', '1');
    render(<PrototypeReviewSection />);
    expect(screen.queryByText(REVIEW_PLUS_TITLE)).not.toBeInTheDocument();
    // The section is still here for the question rather than collapsing with the row.
    expect(screen.getByText(REVIEW_SECTION_TITLE)).toBeInTheDocument();
  });

  it('stops asking once the question itself is dismissed', () => {
    asFree();
    sample.data = { sample: sampleView };
    window.localStorage.setItem('harvous-prototype-review-sample-dismissed', '1');
    render(<PrototypeReviewSection />);
    // The upsell is untouched by the question's dismissal — still the other half of the split.
    expect(screen.getByText(REVIEW_PLUS_TITLE)).toBeInTheDocument();
  });

  it('shows nothing at all once both have been put away', () => {
    asFree();
    sample.data = { sample: sampleView };
    window.localStorage.setItem('harvous-prototype-review-plus-dismissed', '1');
    window.localStorage.setItem('harvous-prototype-review-sample-dismissed', '1');
    const { container } = render(<PrototypeReviewSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a guest nothing, with or without a sample', () => {
    // No account to attach an upgrade to, so the offer would be asking them to buy before
    // they can sign in.
    asFree();
    identity.isGuest = true;
    sample.data = { sample: sampleView };
    const { container } = render(<PrototypeReviewSection />);
    expect(container).toBeEmptyDOMElement();
  });
});

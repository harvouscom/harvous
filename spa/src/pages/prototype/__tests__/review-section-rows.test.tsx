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
import { fireEvent, render, screen } from '@testing-library/react';

const identity = { isGuest: false };
/** Connected to an active church — Review is free for its questions (roadmap §B). */
const church = { connected: false };
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
        /** How far through today's sitting — see `ReviewInboxResponse`. */
        today?: { answered: number; goal: number } | null;
        coldStart?: { ready: number; needed: number; opensAt: string | null } | null;
      },
};
const challenges = { data: undefined as undefined | { challenges: unknown[] } };
const sample = { data: undefined as undefined | { sample: unknown } };
/** The shape `buildReviewSample` returns: a reference plus the cloze the card renders. */
const sampleView = {
  reference: 'John 15:5',
  source: 'yours',
  available: ['blanks'],
  exercise: {
    kind: 'blanks',
    cloze: { segments: ['I am the vine, you are the ', '.'], blankLengths: [8] },
    blankCount: 1,
  },
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
const session = { data: undefined as undefined | { items: unknown[] } };
vi.mock('../../../hooks/queries/useReview', () => ({
  // Plus from the feature flag; these tests do not connect anyone to a church.
  useReviewAccessLevel: () =>
    identity.isGuest
      ? 'none'
      : (features.review ?? { has: false }).has
        ? 'full'
        : church.connected
          ? 'church'
          : 'none',
  useReviewInbox: () => inbox,
  // Fetched only once the reader unfolds the section.
  useReviewItems: () => allItems,
  useReviewItemsSummary: () => summaryItems,
  // The sitting the dock will ask — the card's question is its first that is also on the shelf.
  useReviewSession: () => session,
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
  session.data = undefined;
  identity.isGuest = false;
  church.connected = false;
  (inbox as { isSettled?: boolean }).isSettled = true;
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
  it('leads each row with what is being reviewed, and puts the doing underneath', () => {
    /*
     * The question used to be the title, which left a shelf of rows all asking things with no
     * visible subject; Home reads the other way round, and Review matches it. Rows only appear
     * once the fold is open — closed, the deck shows the sitting card alone.
     */
    inbox.data = {
      items: [
        reviewItem('head', 'What did you notice first?'),
        reviewItem('r1', 'Pick a passage you cited in Adoption, not slavery.'),
      ],
      hasMore: false,
    };
    const { container } = render(<PrototypeReviewSection />);
    fireEvent.click(screen.getByText('See all'));
    const rowText = [...container.querySelectorAll('.proto-list-panel__row')]
      .map((row) => row.textContent ?? '')
      .join(' ');
    expect(rowText).toContain('Adoption, not slavery');
    expect(rowText).toMatch(/Pick a passage you cited/);
    expect(rowText).not.toContain('Pick a passage you cited in Adoption, not slavery.');
  });

  it('asks the question the dock will open, not just the shelf’s first', () => {
    inbox.data = {
      items: [reviewItem('a', 'Question a'), reviewItem('b', 'Question b')],
      hasMore: false,
    };
    session.data = { items: [reviewItem('b', 'Question b, as the dock asks it'), reviewItem('a', 'Question a')] };
    const { container } = render(<PrototypeReviewSection />);
    expect(container.querySelector('.proto-review-sitting__prompt')?.textContent).toBe(
      'Question b, as the dock asks it',
    );
    screen.getByRole('button', { name: 'Begin' }).click();
    expect(openReviewDock).toHaveBeenCalledWith('b');
  });

  it('asks the next question on the card, under what it is about', () => {
    inbox.data = {
      items: [reviewItem('r1', 'Pick a passage you cited in Adoption, not slavery.')],
      hasMore: false,
    };
    const { container } = render(<PrototypeReviewSection />);
    const card = container.querySelector('.proto-review-sitting')!;
    expect(card.querySelector('.proto-review-sitting__eyebrow')?.textContent).toBe(
      'Adoption, not slavery',
    );
    expect(card.querySelector('.proto-review-sitting__prompt')?.textContent).toBe(
      'Pick a passage you cited in Adoption, not slavery.',
    );
  });

  it('names the note on a Takeaway question, whose answer is not the note', () => {
    // No note rung has the note as its answer since "Which note" was retired, so the row names it.
    inbox.data = {
      items: [
        {
          ...reviewItem('r1', 'What did you take from Adoption, not slavery?'),
          promptKey: 'note.takeaway',
          ladderStep: 2,
        },
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('Adoption, not slavery')).toBeInTheDocument();
    expect(screen.queryByText('One of your notes')).not.toBeInTheDocument();
  });

  it('lists nothing under the card closed: the rest of today is the deck behind it', () => {
    /*
     * The two rows under the card were the same promise as the card — there is more after this
     * one — said twice. The deck's edges say it now: one per question still to come, at most two.
     */
    inbox.data = {
      items: ['head', 'a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`, `Task ${id}`)),
      hasMore: false,
    };
    const { container } = render(<PrototypeReviewSection />);
    expect(screen.queryAllByText(/^Task /)).toHaveLength(0);
    expect(container.querySelector('.proto-deck')?.getAttribute('data-peek')).toBe('2');
  });

  it('peeks only as deep as the sitting goes', () => {
    inbox.data = {
      items: ['head', 'a'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: false,
    };
    const { container } = render(<PrototypeReviewSection />);
    expect(container.querySelector('.proto-deck')?.getAttribute('data-peek')).toBe('1');
  });

  it('leaves a challenge in progress to Pick up', () => {
    inbox.data = {
      items: ['a', 'b'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: false,
    };
    challenges.data = { challenges: [challenge('c1')] };
    render(<PrototypeReviewSection />);
    expect(screen.queryByText('Strengthen Covenant')).not.toBeInTheDocument();
  });

  /*
   * The fold counts the day, not the pile.
   *
   * It used to name how many rows pressing it would open, which was `min(8, rows) - 2` — and
   * could not move, because the inbox refilled to eight on every read including with the items
   * just answered. Progress through a sitting instead: finite, and it ends.
   */
  it('says how far through today the reader is', () => {
    inbox.data = {
      items: ['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
      today: { answered: 2, goal: 5 },
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('2 of 5 today')).toBeInTheDocument();
  });

  it('climbs as questions are answered', () => {
    inbox.data = {
      items: ['a', 'b'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: false,
      today: { answered: 3, goal: 5 },
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('3 of 5 today')).toBeInTheDocument();
  });

  it('labels the fold "See all", and says the day once, on the card', () => {
    /* The progress moved from the fold's label to the card, which outlives the fold; the lane
       never carries two things saying the same number. */
    inbox.data = {
      items: ['a', 'b', 'c', 'd'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
      today: { answered: 1, goal: 4 },
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('See all')).toBeInTheDocument();
    expect(screen.getAllByText('1 of 4 today')).toHaveLength(1);
  });

  it('says the day is finished rather than rendering nothing at all', () => {
    /* The state the shelf could never reach: a sitting that refilled itself had no end, and
       an empty one returned null rather than saying so. */
    inbox.data = { items: [], hasMore: false, today: { answered: 5, goal: 5 } };
    render(<PrototypeReviewSection />);
    expect(screen.getByText("That's today's sitting")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Begin|Keep going/ })).not.toBeInTheDocument();
  });

  it('does not offer "See all" when everything due is already on screen', () => {
    /* One question, on the card, and something coming back later: the fold opens only the later
       one, so it says so rather than promising more questions that are not there. */
    inbox.data = {
      items: ['a'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: false,
    };
    summaryItems.data = {
      items: [
        ...['a'].map((id) => reviewItem(id, `Question ${id}`)),
        { ...reviewItem('later', 'Later'), dueAt: new Date(Date.now() + 86_400_000).toISOString() },
      ],
    };
    render(<PrototypeReviewSection />);
    expect(screen.queryByText('See all')).not.toBeInTheDocument();
    expect(screen.getByText('Coming back later')).toBeInTheDocument();
  });

  it('names what is behind the fold once today is done', () => {
    inbox.data = { items: [], hasMore: false, today: { answered: 5, goal: 5 } };
    summaryItems.data = {
      items: [
        { ...reviewItem('later', 'Later'), dueAt: new Date(Date.now() + 86_400_000).toISOString() },
      ],
    };
    render(<PrototypeReviewSection />);
    // The card says the day is done, and says the count once; the fold names what it opens.
    expect(screen.getByText("That's today's sitting")).toBeInTheDocument();
    expect(screen.getAllByText('5 of 5 today')).toHaveLength(1);
    expect(screen.getByText('Coming back later')).toBeInTheDocument();
  });

  it('offers one fold, not a stack of them', () => {
    /* Three bars — "N more", "N coming back later", "N set aside" — under two rows of study. */
    inbox.data = {
      items: ['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
      today: { answered: 1, goal: 4 },
    };
    summaryItems.data = {
      items: [
        ...['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)),
        { ...reviewItem('later', 'Later'), dueAt: new Date(Date.now() + 86_400_000).toISOString() },
      ],
    };
    const { container } = render(<PrototypeReviewSection />);
    expect(container.querySelectorAll('.proto-feed-part__more')).toHaveLength(1);
  });

  it('keeps the later groups inside the fold rather than beside it', () => {
    inbox.data = {
      items: ['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
      today: { answered: 0, goal: 3 },
    };
    const { container } = render(<PrototypeReviewSection />);
    expect(container.querySelectorAll('.proto-review-section__subhead')).toHaveLength(0);
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
      items: [
        { ...reviewItem('head', 'What did you notice first?'), noteTitle: 'Grace upon grace' },
        reviewItem('r1', 'Pick a passage you cited in Adoption.', 'Pick a passage you cited'),
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    // The row's title is the subject now; tapping it is what opens the dock.
    fireEvent.click(screen.getByText('See all'));
    screen.getByText('Adoption, not slavery').click();
    expect(openReviewDock).toHaveBeenCalledWith('r1');
    // And Begin opens the card's own question.
    screen.getByRole('button', { name: 'Begin' }).click();
    expect(openReviewDock).toHaveBeenLastCalledWith('head');
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

describe('a church reader without Plus', () => {
  beforeEach(() => {
    features.review = { has: false, ready: true };
    features.challenges = { has: false, ready: true };
    church.connected = true;
  });

  it('sees their church’s questions, and one quiet offer for their own study', () => {
    inbox.data = {
      items: [
        {
          ...reviewItem('r1', 'Who did Jesus call first?', 'Answer your church’s question'),
          kind: 'church',
          promptKey: 'church.choice',
          origin: 'church',
          noteId: null,
          noteTitle: null,
          scriptureReference: null,
        },
      ],
      hasMore: false,
    };
    render(<PrototypeReviewSection />);
    // Their church's question is the card's: asked in full.
    expect(screen.getByText('Who did Jesus call first?')).toBeInTheDocument();
    expect(screen.getByText('Review your own study too')).toBeInTheDocument();
    expect(screen.getByText('Plus')).toBeInTheDocument();
  });

  it('before their church has given them anything, sees what any free reader sees', () => {
    inbox.data = { items: [], hasMore: false };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(/Return to your study/)).toBeInTheDocument();
    expect(screen.queryByText('Review your own study too')).not.toBeInTheDocument();
  });
});

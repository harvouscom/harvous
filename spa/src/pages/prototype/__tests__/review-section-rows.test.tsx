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
  data: undefined as undefined | { items: unknown[]; hasMore: boolean },
};
const challenges = { data: undefined as undefined | { challenges: unknown[] } };

vi.mock('../../../hooks/useHarvousIdentity', () => ({
  useHarvousIdentity: () => identity,
}));
vi.mock('../../../hooks/useHasFeature', () => ({
  useHasFeature: (key: string) => features[key] ?? { has: false, ready: true },
}));
const allItems = { data: undefined as undefined | { items: unknown[] } };
vi.mock('../../../hooks/queries/useReview', () => ({
  useReviewInbox: () => inbox,
  // Fetched only once the reader unfolds the section.
  useReviewItems: () => allItems,
}));
vi.mock('../../../hooks/queries/useChallenges', () => ({
  useChallenges: () => challenges,
}));
vi.mock('../../../hooks/mutations/useReviewMutations', () => ({
  useDeferReview: () => ({ mutate: vi.fn(), isPending: false }),
  useSetReviewStatus: () => ({ mutate: vi.fn(), isPending: false }),
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
  challenges.data = { challenges: [] };
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
    // All four are notes, so only one qualifies for the closed state.
    expect(screen.queryAllByText(/^Task /).length).toBe(1);
    expect(screen.getByText('Strengthen Covenant')).toBeInTheDocument();
  });

  it('will not guess how many are folded away before it knows', () => {
    // The inbox reports `hasMore` as a boolean on purpose, so a closed section cannot count.
    // Guessing printed "1 more" over two items.
    inbox.data = {
      items: ['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
    };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('See all')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ more/)).not.toBeInTheDocument();
  });

  it('counts them once the full list is in hand', () => {
    inbox.data = { items: ['a', 'b'].map((id) => reviewItem(id, `Question ${id}`)), hasMore: false };
    allItems.data = { items: ['a', 'b', 'c'].map((id) => reviewItem(id, `Question ${id}`)) };
    render(<PrototypeReviewSection />);
    expect(screen.getByText('2 more')).toBeInTheDocument();
  });

  it('says where a challenge is as a position, never as a count of what is left', () => {
    challenges.data = { challenges: [challenge('c1')] };
    render(<PrototypeReviewSection />);
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
    expect(screen.queryByText(/remaining|left|overdue/i)).not.toBeInTheDocument();
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

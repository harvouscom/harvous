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
vi.mock('../../../hooks/queries/useReview', () => ({
  useReviewInbox: () => inbox,
}));
vi.mock('../../../hooks/queries/useChallenges', () => ({
  useChallenges: () => challenges,
  // The section reads the shared Home list — active *and* paused — and filters it itself.
  useHomeChallenges: () => challenges,
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

function reviewItem(id: string, prompt: string) {
  return {
    id,
    kind: 'note',
    prompt,
    promptKey: 'note.observe',
    recallState: 'fragile',
    status: 'active',
    origin: 'user',
    dueAt: new Date().toISOString(),
    reviewCount: 1,
    ladderStep: 0,
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
  it('renders the questions themselves, not the note titles', () => {
    inbox.data = {
      items: [reviewItem('r1', 'Before opening it, what did you observe in Romans 8:15?')],
      hasMore: false
    };
    render(<PrototypeReviewSection />);
    expect(
      screen.getByText('Before opening it, what did you observe in Romans 8:15?'),
    ).toBeInTheDocument();
  });

  it('never shows more than three rows of work', () => {
    inbox.data = {
      items: ['a', 'b', 'c', 'd', 'e'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true
    };
    render(<PrototypeReviewSection />);
    const questions = screen.queryAllByText(/^Question /);
    expect(questions.length).toBeLessThanOrEqual(3);
  });

  it('gives up a review row for the challenge continuation, keeping the cap', () => {
    inbox.data = {
      items: ['a', 'b', 'c', 'd'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true
    };
    challenges.data = { challenges: [challenge('c1')] };
    render(<PrototypeReviewSection />);
    expect(screen.queryAllByText(/^Question /).length).toBe(2);
    expect(screen.getByText('Strengthen Covenant')).toBeInTheDocument();
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
      items: [reviewItem('r1', 'What did you observe?')],
      hasMore: false
    };
    render(<PrototypeReviewSection />);
    screen.getByText('What did you observe?').click();
    expect(openReviewDock).toHaveBeenCalledWith('r1');
    expect(navigate).not.toHaveBeenCalled();
  });
});

/**
 * What the Study Inbox shows, and to whom.
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
  data: undefined as undefined | { items: unknown[]; hasMore: boolean; canSeed: boolean },
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
}));
vi.mock('../../../hooks/mutations/useReviewMutations', () => ({
  useDeferReview: () => ({ mutate: vi.fn(), isPending: false }),
  useSetReviewStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useSeedReviews: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

const PrototypeStudyInbox = (await import('../PrototypeStudyInbox')).default;

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
  identity.isGuest = false;
  features.review = { has: true, ready: true };
  features.challenges = { has: true, ready: true };
  inbox.data = { items: [], hasMore: false, canSeed: false };
  challenges.data = { challenges: [] };
});

describe('who sees the Study Inbox', () => {
  it('shows a guest nothing at all', () => {
    identity.isGuest = true;
    inbox.data = { items: [reviewItem('r1', 'What did you observe?')], hasMore: false, canSeed: false };
    const { container } = render(<PrototypeStudyInbox />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a free account one line, with the Plus badge', () => {
    features.review = { has: false, ready: true };
    features.challenges = { has: false, ready: true };
    render(<PrototypeStudyInbox />);
    expect(screen.getByText('Plus')).toBeInTheDocument();
    expect(screen.getByText(/Return to your study/)).toBeInTheDocument();
  });

  it('shows nothing while the subscription is still loading', () => {
    // The expensive bug: a subscriber must never be flashed a paywall on a cold load.
    features.review = { has: false, ready: false };
    features.challenges = { has: false, ready: false };
    const { container } = render(<PrototypeStudyInbox />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a subscriber with an empty queue nothing, rather than an empty state', () => {
    const { container } = render(<PrototypeStudyInbox />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('what it shows a subscriber', () => {
  it('renders the questions themselves, not the note titles', () => {
    inbox.data = {
      items: [reviewItem('r1', 'Before opening it, what did you observe in Romans 8:15?')],
      hasMore: false,
      canSeed: false,
    };
    render(<PrototypeStudyInbox />);
    expect(
      screen.getByText('Before opening it, what did you observe in Romans 8:15?'),
    ).toBeInTheDocument();
  });

  it('never shows more than three rows of work', () => {
    inbox.data = {
      items: ['a', 'b', 'c', 'd', 'e'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
      canSeed: false,
    };
    render(<PrototypeStudyInbox />);
    const questions = screen.queryAllByText(/^Question /);
    expect(questions.length).toBeLessThanOrEqual(3);
  });

  it('gives up a review row for the challenge continuation, keeping the cap', () => {
    inbox.data = {
      items: ['a', 'b', 'c', 'd'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
      canSeed: false,
    };
    challenges.data = { challenges: [challenge('c1')] };
    render(<PrototypeStudyInbox />);
    expect(screen.queryAllByText(/^Question /).length).toBe(2);
    expect(screen.getByText('Strengthen Covenant')).toBeInTheDocument();
  });

  it('says where a challenge is as a position, never as a count of what is left', () => {
    challenges.data = { challenges: [challenge('c1')] };
    render(<PrototypeStudyInbox />);
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
    expect(screen.queryByText(/remaining|left|overdue/i)).not.toBeInTheDocument();
  });

  it('never renders a count of what it is not showing', () => {
    inbox.data = {
      items: ['a', 'b', 'c', 'd', 'e'].map((id) => reviewItem(id, `Question ${id}`)),
      hasMore: true,
      canSeed: false,
    };
    const { container } = render(<PrototypeStudyInbox />);
    // The named failure mode: an escalating badge like "27 due".
    expect(container.textContent).not.toMatch(/\d+\s*(due|waiting|remaining|overdue)/i);
  });

  it('offers the cold-start seed only when the server says it is worth it', () => {
    inbox.data = { items: [], hasMore: false, canSeed: true };
    render(<PrototypeStudyInbox />);
    expect(screen.getByText('Start reviewing')).toBeInTheDocument();
  });
});

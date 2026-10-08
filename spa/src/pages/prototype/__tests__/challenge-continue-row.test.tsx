/**
 * The challenge in progress, as one row in Pick up: where you are, never how much is left.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const identity = { isGuest: false };
const challenges = { data: undefined as undefined | { challenges: unknown[] } };
const navigate = vi.fn();
vi.mock('../../../hooks/useHarvousIdentity', () => ({ useHarvousIdentity: () => identity }));
vi.mock('../../../hooks/queries/useChallenges', () => ({ useHomeChallenges: () => challenges }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

const PrototypeChallengeContinueRow = (await import('../PrototypeChallengeContinueRow')).default;

function challenge(status: string) {
  return { id: 'c1', title: 'Strengthen Covenant', status, currentStepIndex: 1, totalSteps: 5 };
}

beforeEach(() => {
  identity.isGuest = false;
  challenges.data = { challenges: [] };
  navigate.mockClear();
});

describe('PrototypeChallengeContinueRow', () => {
  it('says where a challenge is as a position, never as a count of what is left', () => {
    challenges.data = { challenges: [challenge('active')] };
    render(<PrototypeChallengeContinueRow />);
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
    expect(screen.queryByText(/remaining|left|overdue/i)).not.toBeInTheDocument();
  });

  it('leaves a paused challenge where the reader put it', () => {
    challenges.data = { challenges: [challenge('paused')] };
    const { container } = render(<PrototypeChallengeContinueRow />);
    expect(container.textContent).toBe('');
  });

  it('shows a guest nothing', () => {
    identity.isGuest = true;
    challenges.data = { challenges: [challenge('active')] };
    const { container } = render(<PrototypeChallengeContinueRow />);
    expect(container.textContent).toBe('');
  });

  it('opens the challenge', () => {
    challenges.data = { challenges: [challenge('active')] };
    render(<PrototypeChallengeContinueRow />);
    screen.getByText('Strengthen Covenant').click();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

/**
 * The card's two answers both put it away for good, on the account — and the button also does
 * what it says.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { emptyOnboardingState, type OnboardingState } from '@/utils/onboarding-state';

let state: OnboardingState = emptyOnboardingState();
const updates: ((s: OnboardingState) => OnboardingState)[] = [];
const navigate = vi.fn();

vi.mock('../../useOnboardingState', () => ({
  useOnboardingState: () => ({ state, ready: true }),
}));
vi.mock('../../../../lib/proto-onboarding-sync', () => ({
  updateOnboardingState: (fn: (s: OnboardingState) => OnboardingState) => {
    updates.push(fn);
    state = fn(state);
  },
}));
vi.mock('../../../../hooks/useHarvousIdentity', () => ({ useHarvousIdentity: () => ({ isGuest: false }) }));
vi.mock('../../../../hooks/useHasFeature', () => ({ useHasFeature: () => ({ has: false, ready: true }) }));
vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ isMobileSidebar: true, inspectorOpen: false }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/utils/sounds', () => ({ playSound: vi.fn() }));

let legalDue: string[] = [];
const acknowledge = vi.fn();
vi.mock('../../../../hooks/queries/useLegalStatus', () => ({
  useLegalStatus: () => ({ data: { due: legalDue }, isFetched: true }),
  useAcknowledgeLegal: () => ({ mutate: acknowledge }),
}));
const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);

type Notice = { id: string; title: string; body: string; actionLabel: string; act: () => void; dismiss: () => void };
let notices: Notice[] = [];
vi.mock('../use-notice-items', () => ({
  useNoticeItems: () => ({ items: notices, founderLetterOpen: false, closeFounderLetter: () => {} }),
}));
vi.mock('../../PrototypeFounderLetterSheet', () => ({ default: () => null }));
let accountCreatedAt: number | undefined = Date.parse('2026-01-01T00:00:00Z');
vi.mock('../use-account-created-at', () => ({
  NEW_ACCOUNT_MS: 14 * 24 * 60 * 60 * 1000,
  useAccountCreatedAt: () => ({ ready: true, createdAt: accountCreatedAt }),
}));

/* A fixed "now", inside the Today callout's shelf life, so the suite does not rot with the calendar. */
const NOW = Date.parse('2026-10-10T12:00:00Z');

function notice(id: string): Notice {
  return { id, title: `Notice ${id}`, body: 'body', actionLabel: `Open ${id}`, act: vi.fn(), dismiss: vi.fn() };
}

const { PrototypeFeatureCalloutInline } = await import('../PrototypeFeatureCallout');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  accountCreatedAt = Date.parse('2026-01-01T00:00:00Z');
  state = emptyOnboardingState();
  updates.length = 0;
  navigate.mockClear();
  legalDue = [];
  notices = [];
  acknowledge.mockClear();
  openWindow.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('feature callout', () => {
  it('shows the current callout as a labelled card', () => {
    render(<PrototypeFeatureCalloutInline />);
    expect(screen.getByRole('dialog', { name: 'Today, tidied' })).toBeTruthy();
  });

  it('puts it away for good from the ×', () => {
    render(<PrototypeFeatureCalloutInline />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(state.calloutsSeen?.['today-tabs-2026-10']).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('puts it away and does its job from the button', () => {
    render(<PrototypeFeatureCalloutInline />);
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(state.calloutsSeen?.['today-tabs-2026-10']).toBeTruthy();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('shows nothing once it has been seen on any device', () => {
    state = { ...emptyOnboardingState(), calloutsSeen: { 'today-tabs-2026-10': '2026-10-01T00:00:00Z' } };
    const { container } = render(<PrototypeFeatureCalloutInline />);
    expect(container.textContent).toBe('');
  });

  it('puts the legal notice ahead of any feature callout', () => {
    legalDue = ['privacy'];
    render(<PrototypeFeatureCalloutInline />);
    expect(screen.getByRole('dialog', { name: 'We’ve updated our Privacy Policy' })).toBeTruthy();
  });

  it('records the acknowledgment from the ×, not a seen flag', () => {
    legalDue = ['privacy', 'terms'];
    render(<PrototypeFeatureCalloutInline />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(acknowledge).toHaveBeenCalledWith({ documents: ['privacy', 'terms'], surface: 'notice' });
    expect(state.calloutsSeen).toBeUndefined();
  });

  it('opens what changed and records the acknowledgment from the button', () => {
    legalDue = ['terms'];
    render(<PrototypeFeatureCalloutInline />);
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(acknowledge).toHaveBeenCalledWith({ documents: ['terms'], surface: 'notice' });
    expect(openWindow).toHaveBeenCalledWith('https://harvous.com/legal/changes/', '_blank', 'noopener,noreferrer');
  });

  it('stacks a notice behind the callout, and opens to show both', () => {
    notices = [notice('whats-new')];
    render(<PrototypeFeatureCalloutInline />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
  });

  it('holds two cards at most; the rest wait behind them', () => {
    notices = [notice('whats-new'), notice('import'), notice('founder-letter')];
    render(<PrototypeFeatureCalloutInline />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(screen.queryByText('Notice import')).toBeNull();
  });

  it('puts one away from its own ×, or every card showing at once — not the ones waiting', () => {
    const a = notice('whats-new');
    const b = notice('import');
    const waiting = notice('founder-letter');
    notices = [a, b, waiting];
    state = { ...emptyOnboardingState(), calloutsSeen: { 'today-tabs-2026-10': '2026-10-01T00:00:00Z' } };
    render(<PrototypeFeatureCalloutInline />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2' }));
    const dialogs = screen.getAllByRole('dialog');
    fireEvent.click(within(dialogs[0]!).getByRole('button', { name: 'Dismiss' }));
    expect(a.dismiss).toHaveBeenCalledTimes(1);
    expect(b.dismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));
    expect(b.dismiss).toHaveBeenCalledTimes(1);
    expect(waiting.dismiss).not.toHaveBeenCalled();
  });

  it('does not slide a new card in within a day of one being put away', () => {
    state = { ...emptyOnboardingState(), calloutsSeen: { 'notice:import': new Date(NOW - 60_000).toISOString() } };
    notices = [notice('founder-letter')];
    const { container, unmount } = render(<PrototypeFeatureCalloutInline />);
    expect(container.textContent).toBe('');
    unmount();
    /* A card that was already on screen keeps its place through the quiet day. */
    localStorage.setItem('harvous-callout-stack-shown', JSON.stringify(['founder-letter']));
    render(<PrototypeFeatureCalloutInline />);
    expect(screen.getByRole('dialog', { name: 'Notice founder-letter' })).toBeTruthy();
  });

  it('does not announce a change to an account created after it shipped', () => {
    accountCreatedAt = Date.parse('2026-10-09T00:00:00Z');
    const { container } = render(<PrototypeFeatureCalloutInline />);
    expect(container.textContent).toBe('');
  });

  it('shows a notice on its own when there is no callout', () => {
    state = { ...emptyOnboardingState(), calloutsSeen: { 'today-tabs-2026-10': '2026-10-01T00:00:00Z' } };
    const n = notice('founder-letter');
    notices = [n];
    render(<PrototypeFeatureCalloutInline />);
    fireEvent.click(screen.getByRole('button', { name: 'Open founder-letter' }));
    expect(n.act).toHaveBeenCalledTimes(1);
  });
});

/**
 * The card's two answers both put it away for good, on the account — and the button also does
 * what it says.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

const { PrototypeFeatureCalloutInline } = await import('../PrototypeFeatureCallout');

beforeEach(() => {
  state = emptyOnboardingState();
  updates.length = 0;
  navigate.mockClear();
  legalDue = [];
  acknowledge.mockClear();
  openWindow.mockClear();
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
});

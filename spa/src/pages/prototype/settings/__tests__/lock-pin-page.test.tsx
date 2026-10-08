/**
 * Settings → Lock PIN: the padlock shows the state, the facts are rows rather than paragraphs,
 * and the way in names the menu by its real glyph.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let cachedProfile: { hasLockPinSet?: boolean } | null = { hasLockPinSet: true };
vi.mock('@/utils/profile-cache', () => ({
  getCachedProfileData: () => cachedProfile,
  updateCachedProfileData: vi.fn(),
}));
vi.mock('@/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/utils/note-unlock-state', () => ({ lockAllNotes: vi.fn() }));

const PrototypeLockPinPage = (await import('../PrototypeLockPinPage')).default;

describe('Settings → Lock PIN', () => {
  it('shuts the padlock when a PIN is set', () => {
    cachedProfile = { hasLockPinSet: true };
    const { container } = render(<PrototypeLockPinPage />);
    expect(screen.getByText('Lock PIN is on')).toBeTruthy();
    expect(container.querySelector('.proto-lock-glyph')?.getAttribute('data-state')).toBe('closed');
  });

  it('opens it, and asks for one, when none is set', () => {
    cachedProfile = { hasLockPinSet: false };
    const { container } = render(<PrototypeLockPinPage />);
    expect(screen.getByText('Set a lock PIN')).toBeTruthy();
    expect(container.querySelector('.proto-lock-glyph')?.getAttribute('data-state')).toBe('open');
  });

  it('states the facts once each, as rows', () => {
    cachedProfile = { hasLockPinSet: false };
    render(<PrototypeLockPinPage />);
    expect(screen.getByText('One PIN opens every locked note')).toBeTruthy();
    expect(screen.getByText('Locks again after 5 idle minutes.')).toBeTruthy();
    expect(screen.getByText('Kept out of search, Review and sharing')).toBeTruthy();
    // The recovery warning is a row here, so the panel's own hint stays out of the way.
    expect(screen.getAllByText(/can.t be recovered/i)).toHaveLength(1);
  });

  it('names the note menu by its vertical glyph, not a horizontal ellipsis', () => {
    cachedProfile = { hasLockPinSet: true };
    const { container } = render(<PrototypeLockPinPage />);
    const howto = container.querySelector('.proto-lock-pin-settings__howto');
    expect(howto?.textContent).not.toContain('⋯');
    expect(howto?.querySelector('svg')).not.toBeNull();
  });
});

/**
 * Settings → Sounds: three named choices, kept on this device, and a way to hear one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const playSound = vi.fn();
const warmSounds = vi.fn();
vi.mock('@/utils/sounds', () => ({ playSound, warmSounds }));
vi.mock('@/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { resetSoundPreferenceForTests, readSoundPreference } = await import('@/utils/sound-prefs');
const PrototypeSoundsPage = (await import('../PrototypeSoundsPage')).default;

// jsdom has no layout; the menu measures its trigger and scrolls its chosen row into view. A
// 0×0 box at the top reads as a trigger scrolled out of view, and the menu closes as it opens.
Element.prototype.scrollIntoView = vi.fn();
vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
  top: 20,
  bottom: 50,
  left: 20,
  right: 140,
  width: 120,
  height: 30,
  x: 20,
  y: 20,
  toJSON: () => ({}),
} as DOMRect);
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

beforeEach(() => {
  localStorage.clear();
  resetSoundPreferenceForTests();
  playSound.mockClear();
  warmSounds.mockClear();
});

describe('the Sounds page', () => {
  it('starts on Everywhere, and says what that means', () => {
    render(<PrototypeSoundsPage />);
    expect(screen.getByRole('button', { name: /When to play sounds/ })).toHaveTextContent('Everywhere');
    expect(screen.getByText('Reviews, things you finish, and moving around the app.')).toBeInTheDocument();
  });

  it('loads the synth even with sounds off, so Hear it plays inside its own tap', () => {
    render(<PrototypeSoundsPage />);
    expect(warmSounds).toHaveBeenCalledWith({ force: true });
  });

  it('lets you hear a right answer whatever the choice', () => {
    render(<PrototypeSoundsPage />);
    fireEvent.click(screen.getByText('Hear it'));
    expect(playSound).toHaveBeenCalledWith('review.right', { force: true });
  });

  it('keeps the choice on this device', () => {
    render(<PrototypeSoundsPage />);
    fireEvent.click(screen.getByRole('button', { name: /When to play sounds/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Moments only/ }));
    expect(readSoundPreference()).toBe('moments');
    expect(screen.getByText('Reviews and things you finish.')).toBeInTheDocument();
  });
});

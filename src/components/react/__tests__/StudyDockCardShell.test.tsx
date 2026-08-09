import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import StudyDockCardShell from '../StudyDockCardShell';

/**
 * Below 420px the shell folds `headerActions` into a `…` overflow menu. That was swallowing the
 * controls people reach for every time they open a card — the reference dock's Save ✓, the
 * scripture dock's passage toggles — turning a one-tap action into a hunt. `headerPrimaryActions`
 * is the slot that stays inline at every width.
 */
function stubViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      return {
        matches: max ? width <= Number(max[1]) : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
}

function renderShell() {
  return render(
    <StudyDockCardShell
      accentColor="#000"
      expanded
      onToggleExpanded={() => {}}
      onDismiss={() => {}}
      ariaLabel="Test dock"
      headerIcon={<span />}
      headerTitle={<span>Psalms 62:8</span>}
      headerPrimaryActions={<button type="button">Save reference</button>}
      headerActions={<button type="button">Change accent</button>}
    />,
  );
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('StudyDockCardShell header action slots', () => {
  describe('on a phone-width viewport', () => {
    beforeAll(() => stubViewportWidth(390));

    it('keeps primary actions inline while folding the rest into the overflow menu', () => {
      renderShell();
      // Inline, reachable in one tap.
      expect(screen.getByRole('button', { name: 'Save reference' })).toBeTruthy();
      // Folded away behind `…` until the menu is opened.
      expect(screen.queryByRole('button', { name: 'Change accent' })).toBeNull();
      expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy();
    });
  });

  describe('on a wide viewport', () => {
    beforeAll(() => stubViewportWidth(1280));

    it('renders both slots inline with no overflow menu', () => {
      renderShell();
      expect(screen.getByRole('button', { name: 'Save reference' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Change accent' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    });
  });
});

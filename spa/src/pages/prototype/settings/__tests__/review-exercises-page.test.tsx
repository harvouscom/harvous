/**
 * Settings → Review exercises, rendered.
 *
 * This page had no test of any kind, and it is the page whose whole job is to be honest about
 * which preferences the engine actually respects — the four always-asked families are *derived*
 * from the ladders, so a hand-written list here would be the exact lie the page exists to avoid.
 * Rendering is the only way to check that what is shown comes from the derivation.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

const post = vi.fn(() => Promise.resolve({}));
const profile: { data: { reviewExerciseSettings?: string | null } | undefined } = { data: undefined };

vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ userId: 'user_1' }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../../../../lib/api', () => ({ api: { post: (...args: unknown[]) => post(...args) } }));
vi.mock('../../../../hooks/queries/useProfile', () => ({
  useProfile: () => profile,
  profileQueryKey: (id: string) => ['profile', id],
}));
vi.mock('@/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { ALWAYS_ON_FAMILIES } = await import('@/utils/review-exercise-settings');
const { REVIEW_EXERCISE_FAMILIES, REVIEW_EXERCISE_FAMILY_ORDER } = await import(
  '@/utils/review-exercise-families'
);
const PrototypeReviewExercisesPage = (await import('../PrototypeReviewExercisesPage')).default;

const offeredIds = REVIEW_EXERCISE_FAMILY_ORDER.filter(
  (id) => !(ALWAYS_ON_FAMILIES as readonly string[]).includes(id),
);

describe('review exercises settings', () => {
  beforeEach(() => {
    /* `shouldAdvanceTime` so React 19's scheduler still runs: with the clock fully frozen a
       click sets state and the re-render never flushes, and the menu never opens. */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    post.mockClear();
    profile.data = { reviewExerciseSettings: null };
    /*
     * What the picker needs from a browser, and jsdom has none of — the same three stubs
     * `ProtoSelectMenu.test.tsx` installs. The box matters most: jsdom lays nothing out, so
     * every rect is 0×0 at the origin, which the menu reads as a trigger scrolled out of view
     * and closes itself on the frame it opens.
     */
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
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leads with what is always asked, named from the derivation', () => {
    const { container } = render(<PrototypeReviewExercisesPage />);
    const summary = screen.getByText('Always asked');
    expect(summary).toBeTruthy();

    /* Every always-on family is named in the one row, and none of them has a row of its own. */
    const rows = container.querySelectorAll('.proto-exercise-row');
    const rowText = Array.from(rows).map((row) => row.textContent ?? '');
    for (const id of ALWAYS_ON_FAMILIES) {
      const label = REVIEW_EXERCISE_FAMILIES[id].label;
      expect(container.textContent).toContain(label);
      expect(rowText.some((text) => text.startsWith(label))).toBe(false);
    }
  });

  it('comes before the families you can lean on', () => {
    const { container } = render(<PrototypeReviewExercisesPage />);
    const text = container.textContent ?? '';
    const firstOffered = REVIEW_EXERCISE_FAMILIES[offeredIds[0]].label;
    expect(text.indexOf('Always asked')).toBeLessThan(text.indexOf(firstOffered));
  });

  it('gives every offered family one control, reading its current setting', () => {
    const { container } = render(<PrototypeReviewExercisesPage />);
    const triggers = container.querySelectorAll('.proto-exercise-choice');
    expect(triggers).toHaveLength(offeredIds.length);
    for (const trigger of Array.from(triggers)) {
      expect(trigger.textContent).toContain('Normal');
    }
  });

  it('shows a stored choice rather than the default', () => {
    profile.data = {
      reviewExerciseSettings: JSON.stringify({ version: 2, emphasis: { [offeredIds[0]]: 'less' } }),
    };
    const { container } = render(<PrototypeReviewExercisesPage />);
    const first = container.querySelector('.proto-exercise-choice');
    expect(first?.textContent).toContain('Less');
    /* A choice away from Normal is marked, so leanings can be found again on a page of defaults. */
    expect(first?.className).toContain('proto-exercise-choice--set');
  });

  it('saves one edit for a run of taps', async () => {
    /* Real timers here: the menu is a portal opened by a click, and React 19's scheduler does
       not flush that re-render against a frozen clock. The debounce is waited out for real. */
    vi.useRealTimers();
    const { container } = render(<PrototypeReviewExercisesPage />);
    const trigger = container.querySelector<HTMLButtonElement>('.proto-exercise-choice')!;

    await act(async () => {
      fireEvent.click(trigger);
    });
    // eslint-disable-next-line no-console
    /* The menu is portaled to the body; its rows are `menuitemradio`s carrying a label span. */
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const less = rows.find((row) => row.textContent?.includes('Less'));
    expect(less).toBeTruthy();
    await act(async () => {
      less!.click();
    });

    /* Debounced: a run of taps is one edit, so nothing has gone yet. */
    expect(post).not.toHaveBeenCalled();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(post).toHaveBeenCalledWith('/api/user/review-exercise-settings', {
      reviewExerciseSettings: { emphasis: { [offeredIds[0]]: 'less' } },
    });
  });
});

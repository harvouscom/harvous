import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import HighlightDockWeb from '../HighlightDockWeb';

vi.mock('../../../../spa/src/lib/guest-gate', () => ({ offerGuestAccount: vi.fn() }));

/**
 * On a phone the highlight card folds its header extras into `…`. The colour dot used to fold
 * with them, and from in there it could not work at all (its palette closed the menu under the
 * tap). It now stays inline at every width; only Remove folds away.
 */
function stubPhoneWidth() {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      return {
        matches: max ? 390 <= Number(max[1]) : false,
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

describe('HighlightDockWeb on a phone-width screen', () => {
  beforeAll(() => {
    stubPhoneWidth();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));
  });

  it('changes the colour in two taps, with Remove still behind the overflow menu', () => {
    const onAccentChange = vi.fn();
    render(
      <HighlightDockWeb
        accent="warmAmber"
        excerpt="grace and mercy"
        entryKind="miniNote"
        studyThreadEntryId="study_1"
        sourceNoteId="note_1"
        expanded
        onExpandedChange={() => {}}
        onAccentChange={onAccentChange}
        onRemove={() => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Remove highlight')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Accent color/ }));
    const sky = screen.getByRole('button', { name: 'Sky' });
    fireEvent.touchStart(sky);
    fireEvent.click(sky);
    expect(onAccentChange).toHaveBeenCalledWith('skyBlue');
  });
});

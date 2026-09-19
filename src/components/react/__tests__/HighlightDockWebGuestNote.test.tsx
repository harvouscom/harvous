import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HighlightDockWeb, { type HighlightDockWebProps } from '../HighlightDockWeb';

const { offerGuestAccount } = vi.hoisted(() => ({ offerGuestAccount: vi.fn() }));
vi.mock('../../../../spa/src/lib/guest-gate', () => ({ offerGuestAccount }));

/**
 * A guest's highlight inside their own note has no row — the mark in the note body is all of
 * it — so a title or a note typed into this card had nowhere to go and vanished when the card
 * closed. The fields now answer a press with the account offer, and the parts that edit the
 * mark itself keep working.
 */
function renderDock(overrides: Partial<HighlightDockWebProps> = {}) {
  const props: HighlightDockWebProps = {
    accent: 'warmAmber',
    excerpt: 'grace and mercy',
    entryKind: 'miniNote',
    studyThreadEntryId: null,
    sourceNoteId: null,
    annotationNeedsAccount: true,
    onAccentChange: () => {},
    onRemove: () => {},
    onDone: () => {},
    ...overrides,
  };
  return render(<HighlightDockWeb {...props} />);
}

const miniNote = () => screen.getByLabelText('Highlight note') as HTMLTextAreaElement;
const title = () => screen.getByLabelText('Highlight title') as HTMLInputElement;

describe("HighlightDockWeb on a guest's note highlight", () => {
  beforeEach(() => {
    offerGuestAccount.mockClear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));
  });

  it('offers an account when the note field is pressed, and keeps nothing typed', () => {
    const onMiniNoteChange = vi.fn();
    renderDock({ onMiniNoteChange });

    fireEvent.focus(miniNote());
    fireEvent.change(miniNote(), { target: { value: 'a thought with nowhere to go' } });

    expect(offerGuestAccount).toHaveBeenCalledWith('Adding a note to this highlight');
    expect(miniNote().readOnly).toBe(true);
    expect(onMiniNoteChange).not.toHaveBeenCalled();
  });

  it('offers an account when the title is pressed', () => {
    renderDock();
    fireEvent.focus(title());
    expect(offerGuestAccount).toHaveBeenCalledWith('Naming this highlight');
    expect(title().readOnly).toBe(true);
  });

  it('keeps the controls that edit the mark itself', () => {
    const onRemove = vi.fn();
    renderDock({ onRemove });
    fireEvent.click(screen.getByLabelText('Remove highlight'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('declines an armed autofocus rather than offering an account nobody asked for', () => {
    const onMiniNoteFocused = vi.fn();
    renderDock({ autoFocusMiniNote: true, onMiniNoteFocused });
    expect(document.activeElement).not.toBe(miniNote());
    expect(offerGuestAccount).not.toHaveBeenCalled();
    expect(onMiniNoteFocused).toHaveBeenCalledTimes(1);
  });

  it("leaves a member's card writable and quiet", () => {
    renderDock({ annotationNeedsAccount: false });
    fireEvent.focus(miniNote());
    expect(miniNote().readOnly).toBe(false);
    expect(offerGuestAccount).not.toHaveBeenCalled();
  });
});

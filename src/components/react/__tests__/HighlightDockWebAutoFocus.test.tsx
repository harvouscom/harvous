import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HighlightDockWeb, { type HighlightDockWebProps } from '../HighlightDockWeb';

/**
 * A Home "Add a thought" suggestion opens this card *and* asks you to write in it. Landing with
 * the note field on screen but unfocused left the reader to go find the one part of the card the
 * suggestion was about — see `autoFocusMiniNote`.
 */
function renderDock(overrides: Partial<HighlightDockWebProps> = {}) {
  const props: HighlightDockWebProps = {
    accent: 'warmAmber',
    excerpt: 'For God so loved the world',
    entryKind: 'miniNote',
    studyThreadEntryId: 'st_1',
    // No source note, so the card never reaches for a remote thread while under test.
    sourceNoteId: null,
    onAccentChange: () => {},
    onRemove: () => {},
    onDone: () => {},
    ...overrides,
  };
  return render(<HighlightDockWeb {...props} />);
}

function miniNote() {
  return screen.getByLabelText('Highlight note') as HTMLTextAreaElement;
}

describe('HighlightDockWeb autoFocusMiniNote', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));
  });

  it('puts the caret at the end of the note, so an existing thought is added to', async () => {
    const onMiniNoteFocused = vi.fn();
    renderDock({
      miniNoteBody: 'A first thought',
      autoFocusMiniNote: true,
      onMiniNoteFocused,
    });

    await waitFor(() => expect(document.activeElement).toBe(miniNote()));
    const field = miniNote();
    expect(field.selectionStart).toBe('A first thought'.length);
    expect(field.selectionEnd).toBe('A first thought'.length);
    await waitFor(() => expect(onMiniNoteFocused).toHaveBeenCalledTimes(1));
  });

  it('leaves focus alone when the card is not armed', async () => {
    renderDock({ miniNoteBody: 'A first thought' });
    // Give the effect's frame a chance to run before asserting nothing happened.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(document.activeElement).not.toBe(miniNote());
  });

  it('does not steal focus into another member’s read-only card, but still disarms', async () => {
    const onMiniNoteFocused = vi.fn();
    renderDock({
      miniNoteBody: 'Their thought',
      readOnly: true,
      autoFocusMiniNote: true,
      onMiniNoteFocused,
    });

    await waitFor(() => expect(onMiniNoteFocused).toHaveBeenCalledTimes(1));
    expect(document.activeElement).not.toBe(miniNote());
  });

  it('opens a collapsed card before focusing it', async () => {
    const onMiniNoteFocused = vi.fn();
    const onExpandedChange = vi.fn();
    const { rerender } = renderDock({
      miniNoteBody: '',
      expanded: false,
      onExpandedChange,
      autoFocusMiniNote: true,
      onMiniNoteFocused,
    });

    // A collapsed card has no textarea in the tree: the first pass only asks for the expand.
    await waitFor(() => expect(onExpandedChange).toHaveBeenCalledWith(true));
    expect(onMiniNoteFocused).not.toHaveBeenCalled();

    rerender(
      <HighlightDockWeb
        accent="warmAmber"
        excerpt="For God so loved the world"
        entryKind="miniNote"
        studyThreadEntryId="st_1"
        sourceNoteId={null}
        miniNoteBody=""
        expanded
        onExpandedChange={onExpandedChange}
        autoFocusMiniNote
        onMiniNoteFocused={onMiniNoteFocused}
        onAccentChange={() => {}}
        onRemove={() => {}}
        onDone={() => {}}
      />,
    );

    await waitFor(() => expect(document.activeElement).toBe(miniNote()));
    expect(onMiniNoteFocused).toHaveBeenCalledTimes(1);
  });
});

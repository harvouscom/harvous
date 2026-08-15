import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrototypePaperStack from '../PrototypePaperStack';
import { buildRevisitCardStackOrigin } from '../paper-stack-origins';
import type { PaperStackState } from '../../../layouts/proto-shell-context';

/**
 * The edge carries two rules that are easy to break by accident and invisible in a diff:
 * which edge gets a dismiss, and what a parked note is called.
 */

// The base for a reader origin mounts the whole reading pane; these tests are about the
// edge, and a Home origin's base is a plain card, so nothing else needs standing up.
const origin = buildRevisitCardStackOrigin({ title: 'The first book', meta: 'Genesis' });

function renderStack(stack: PaperStackState, onDismiss = vi.fn()) {
  render(
    <PrototypePaperStack
      stack={stack}
      onFlipDown={vi.fn()}
      onFlipUp={vi.fn()}
      onDismiss={onDismiss}
    >
      <p>sheet</p>
    </PrototypePaperStack>,
  );
  return onDismiss;
}

describe('paper stack edge', () => {
  it('offers a dismiss on the origin edge', () => {
    renderStack({ origin, noteId: 'note_1', open: true });
    expect(screen.getByLabelText('Stop showing Worth another look behind this')).toBeTruthy();
  });

  /**
   * The one that matters. Dismissing an origin puts down a breadcrumb; the parked edge
   * belongs to a mounted note holding a live draft, and a control that reads the same in
   * both places would throw that draft away on a click meant to tidy up.
   */
  it('offers no dismiss on a parked note, whose sheet is still holding a draft', () => {
    renderStack({ origin, noteId: 'note_1', open: false });
    expect(screen.queryByLabelText(/^Stop showing/)).toBeNull();
  });

  it('calls a parked note by its title', () => {
    renderStack({ origin, noteId: 'note_1', noteTitle: 'On patience', open: false });
    expect(screen.getByLabelText('Bring On patience back up')).toBeTruthy();
  });

  // Same word note rows, search and the mention picker use — not a second name invented
  // for the edge, and not "Your note", which named the pane instead of the note.
  it('falls back to the app-wide name for a note with no title yet', () => {
    renderStack({ origin, noteId: 'note_1', open: false });
    expect(screen.getByLabelText('Bring New Note back up')).toBeTruthy();
  });
});

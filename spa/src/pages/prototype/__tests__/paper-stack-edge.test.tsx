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
   * The parked edge carries one too.
   *
   * This test used to assert the opposite, on the reasoning that dismissing a parked note
   * could throw away a live draft. It cannot: parking requires a note id, and a compose
   * draft has none until it saves, so by the time a note can be parked it is persisted and
   * dismissing only drops the stack.
   */
  it('offers a dismiss on a parked note too', () => {
    renderStack({ origin, noteId: 'note_1', noteTitle: 'On patience', open: false });
    expect(screen.getByLabelText('Stop showing On patience behind this')).toBeTruthy();
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

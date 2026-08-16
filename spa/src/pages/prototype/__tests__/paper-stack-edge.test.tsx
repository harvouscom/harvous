import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function renderStack(
  stack: PaperStackState,
  handlers: {
    onDismiss?: () => void;
    onSuggestionNevermind?: () => void;
    onSuggestionIgnore?: () => void;
  } = {},
) {
  const onDismiss = handlers.onDismiss ?? vi.fn();
  render(
    <PrototypePaperStack
      stack={stack}
      onFlipDown={vi.fn()}
      onFlipUp={vi.fn()}
      onDismiss={onDismiss}
      onSuggestionNevermind={handlers.onSuggestionNevermind}
      onSuggestionIgnore={handlers.onSuggestionIgnore}
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

/**
 * A suggestion's edge is the one that can be answered. Everything else stacked — a chapter,
 * a note's dock, Home's own revisit card — is a place, and offering to "stop suggesting" a
 * place would be nonsense, so the extra actions must appear only with a suggestion attached.
 */
describe('suggestion edge', () => {
  const suggested = {
    ...origin,
    suggestion: { id: 'hl:7', kind: 'highlight' },
  };

  it('offers nevermind, ignore and dismiss', () => {
    const nevermind = vi.fn();
    const ignore = vi.fn();
    renderStack(
      { origin: suggested, noteId: 'note_1', open: true },
      { onSuggestionNevermind: nevermind, onSuggestionIgnore: ignore },
    );

    fireEvent.click(
      screen.getByLabelText('Nevermind — back to Worth another look and keep suggesting it'),
    );
    fireEvent.click(screen.getByLabelText('Stop suggesting Worth another look'));

    expect(nevermind).toHaveBeenCalledTimes(1);
    expect(ignore).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Stop showing Worth another look behind this')).toBeTruthy();
  });

  it('leaves an ordinary origin with only its way back and its dismiss', () => {
    renderStack({ origin, noteId: 'note_1', open: true });

    expect(screen.queryByLabelText('Stop suggesting Worth another look')).toBeNull();
    expect(screen.getByLabelText('Show Worth another look')).toBeTruthy();
  });
});

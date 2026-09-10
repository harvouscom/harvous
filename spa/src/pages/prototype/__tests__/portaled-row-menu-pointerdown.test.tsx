/**
 * A portaled row menu must survive the pointer sequence a real press actually makes.
 *
 * Both of these menus render into `document.body` and dismiss via `useDismissOnOutside`, which
 * listens for a capture-phase `pointerdown` on `window` and asks `el.contains(target)`. Both
 * passed that hook the *trigger* rather than the portaled card — and a node in `document.body`
 * is not a descendant of the trigger. So a real press ran: pointerdown → "outside" → close →
 * portal unmounts → the `click` never lands on anything. Every action in both menus was dead.
 *
 * The existing suites missed it because `fireEvent.click` dispatches `click` alone. Nothing had
 * ever sent `pointerdown` at these menus, which is the one event that breaks them — so the
 * tests exercised a sequence no browser produces. These fire the real order.
 *
 * Kept apart from `recall-row-answers.test.tsx` on purpose: that file is about which wire each
 * answer is on, this one is about whether the answer is reachable at all.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import PrototypeReviewRow, { reviewRowActions } from '../PrototypeReviewRow';
import { REVIEW_MORE_COPY, REVIEW_REMOVE_COPY } from '../proto-review-copy';

/** The sequence a browser sends on a press, in order. `fireEvent.click` sends only the last. */
function pressLikeABrowser(element: HTMLElement) {
  fireEvent.pointerDown(element, { bubbles: true });
  fireEvent.mouseDown(element, { bubbles: true });
  fireEvent.pointerUp(element, { bubbles: true });
  fireEvent.mouseUp(element, { bubbles: true });
  fireEvent.click(element, { bubbles: true });
}

function renderRow(handlers: {
  onDefer?: () => void;
  onPause?: () => void;
  onRemove?: () => void;
} = {}) {
  const onDefer = handlers.onDefer ?? vi.fn();
  const onPause = handlers.onPause ?? vi.fn();
  const onRemove = handlers.onRemove ?? vi.fn();
  render(
    <PrototypeReviewRow
      icon="note-sticky"
      title="The vine and the branches"
      meta={['Write it from memory']}
      onOpen={vi.fn()}
      actions={reviewRowActions({ onDefer, onPause, onRemove })}
    />,
  );
  return { onDefer, onPause, onRemove };
}

describe('a review row’s overflow menu', () => {
  const openMenu = () => {
    const trigger = screen.getByLabelText(`${REVIEW_MORE_COPY} — The vine and the branches`);
    pressLikeABrowser(trigger);
    return trigger;
  };

  it('stays open when the trigger itself is pressed', () => {
    /* The trigger is "outside" the portaled card, so without an `ignoreSelector` exemption its
       own pointerdown would dismiss and its onClick would immediately toggle it back — leaving
       a menu that can be opened but never closed by the control that opened it. */
    renderRow();
    openMenu();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('runs the action when a menu item is pressed, not just clicked', () => {
    const { onRemove } = renderRow();
    openMenu();
    /* By role and accessible name, not by visible text: the menu shows icon blocks, whose
       visible word is a shortening ("Remove") of the full sentence that names the action. */
    pressLikeABrowser(screen.getByRole('menuitem', { name: REVIEW_REMOVE_COPY }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('closes again on the second press of the trigger', () => {
    renderRow();
    const trigger = openMenu();
    pressLikeABrowser(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('dismisses when something genuinely outside is pressed', () => {
    const { onRemove } = renderRow();
    openMenu();
    fireEvent.pointerDown(document.body, { bubbles: true });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onRemove).not.toHaveBeenCalled();
  });
});

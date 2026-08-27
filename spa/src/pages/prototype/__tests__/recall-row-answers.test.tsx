/**
 * The two answers on a shelf row, and which wire each one is on.
 *
 * A component test rather than a screenshot, because the thing that has to be true is not
 * how the row looks — it is that "Not interested" reaches the permanent path and "Not now"
 * does not. Those two were byte-identical in effect for months while looking entirely
 * different on screen, so appearance is precisely the evidence that would not have caught it.
 */
import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const posted: { action: string; opportunityId: string }[] = [];

/** Every row posts an `impression` on mount; these tests are about the answers. */
const answers = () => posted.filter((e) => e.action !== 'impression');

vi.mock('../proto-recall-events', () => ({
  recordRecallOpportunityEvent: (input: { action: string; opportunityId: string }) => {
    posted.push({ action: input.action, opportunityId: input.opportunityId });
  },
}));

vi.mock('../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ stackNote: vi.fn() }),
}));

const PrototypeRecallCarousel = (await import('../PrototypeRecallCarousel')).default;
const { RECALL_DISMISS_COPY, RECALL_MORE_COPY, RECALL_SNOOZE_COPY } = await import(
  '../proto-recall-copy'
);

const op = {
  id: 'hl:7',
  kind: 'highlight' as const,
  // Selection and ordering happen upstream; the shelf is presentational, so any score does.
  score: 1,
  eyebrow: 'Worth another look',
  title: 'The vine and the branches',
  meta: '5d ago',
  iconName: 'note-sticky' as const,
  onOpen: () => true,
};

function renderShelf(handlers: { onSnooze?: () => void; onDismiss?: () => void } = {}) {
  const onSnooze = handlers.onSnooze ?? vi.fn();
  const onDismiss = handlers.onDismiss ?? vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PrototypeRecallCarousel
        opportunities={[op]}
        onSnooze={onSnooze}
        onDismiss={onDismiss}
        onOpened={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onSnooze, onDismiss };
}

describe('a suggestion row', () => {
  beforeEach(() => {
    posted.length = 0;
  });

  /*
   * One deferral, and it names no window — the length is the store's decision, from this
   * card's own history. A row that passed a number here would be picking for it.
   */
  it('sends "Remind me later" down the snooze path, carrying no window', () => {
    const { onSnooze, onDismiss } = renderShelf();

    fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));
    fireEvent.click(screen.getByText(RECALL_SNOOZE_COPY.label));

    expect(onSnooze).toHaveBeenCalledWith('hl:7');
    expect(onDismiss).not.toHaveBeenCalled();
    expect(answers()).toEqual([{ action: 'snooze', opportunityId: 'hl:7' }]);
  });

  /**
   * Both behind the one overflow, and both *named* there.
   *
   * Deferral used to be a bare ✕ on the row, one tap, with only the permanent answer in the
   * menu — permanence costing a moment's deliberation. What that traded away is the thing this
   * asserts: a ✕ on a suggestion cannot say which of the two answers it means, and they differ
   * by forever. Reading the choice is worth the extra tap.
   */
  it('keeps both answers behind the overflow, and names them there', () => {
    renderShelf();

    expect(screen.queryByText(RECALL_SNOOZE_COPY.label)).toBeNull();
    expect(screen.queryByText(RECALL_DISMISS_COPY.label)).toBeNull();

    fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));

    expect(screen.getByText(RECALL_SNOOZE_COPY.label)).toBeTruthy();
    expect(screen.getByText(RECALL_DISMISS_COPY.label)).toBeTruthy();
  });

  /** Deferral first, permanent last — the answer that cannot be undone sits furthest away. */
  it('lists deferral above the permanent answer', () => {
    renderShelf();
    fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));

    const labels = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.trim());

    expect(labels).toEqual([RECALL_SNOOZE_COPY.label, RECALL_DISMISS_COPY.label]);
  });

  it('sends "Not interested" down the permanent path, not the snooze one', () => {
    const { onSnooze, onDismiss } = renderShelf();

    fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));
    fireEvent.click(screen.getByText(RECALL_DISMISS_COPY.label));

    expect(onDismiss).toHaveBeenCalledWith('hl:7');
    expect(onSnooze).not.toHaveBeenCalled();
    // The action name is the whole contract with the server; a `snooze` here is the old bug.
    expect(answers()).toEqual([{ action: 'dismissed', opportunityId: 'hl:7' }]);
  });

  it.each([RECALL_SNOOZE_COPY.label, RECALL_DISMISS_COPY.label])(
    'closes the menu after answering %s, so the row is not left mid-decision',
    (label) => {
      renderShelf();

      fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));
      fireEvent.click(screen.getByText(label));

      expect(screen.queryByText(label)).toBeNull();
    },
  );

  /**
   * Reachable for every kind, which is the other half of why both answers moved onto the row.
   * The breadcrumb edge that used to hold the permanent one is never built for `arc`,
   * `subject`, `crossref` or `connectNotes` — they resolve in the sidebar and stack nothing —
   * so for those four there was no way to say "never" at all.
   */
  it.each(['arc', 'subject', 'crossref', 'connectNotes'] as const)(
    'offers both answers on a %s row, which gets no breadcrumb edge',
    (kind) => {
      const onDismiss = vi.fn();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <PrototypeRecallCarousel
            opportunities={[{ ...op, id: `${kind}:1`, kind }]}
            onSnooze={vi.fn()}
            onDismiss={onDismiss}
            onOpened={vi.fn()}
          />
        </QueryClientProvider>,
      );

      fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));
      fireEvent.click(screen.getByText(RECALL_DISMISS_COPY.label));

      expect(onDismiss).toHaveBeenCalledWith(`${kind}:1`);
    },
  );
});

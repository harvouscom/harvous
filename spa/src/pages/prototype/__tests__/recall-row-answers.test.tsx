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

  it('keeps deferral one tap, on the visible control', () => {
    const { onSnooze, onDismiss } = renderShelf();

    fireEvent.click(screen.getByLabelText(RECALL_SNOOZE_COPY.ariaFor(op.title)));

    expect(onSnooze).toHaveBeenCalledWith('hl:7');
    expect(onDismiss).not.toHaveBeenCalled();
    expect(answers()).toEqual([{ action: 'snooze', opportunityId: 'hl:7' }]);
  });

  /**
   * The asymmetry is deliberate: permanence should cost a moment's deliberation, and neither
   * mis-tap should be expensive. Hitting the ✕ costs three weeks; hitting the overflow costs
   * a menu you can close.
   */
  it('hides the permanent answer behind the overflow', () => {
    renderShelf();

    expect(screen.queryByText(RECALL_DISMISS_COPY.label)).toBeNull();

    fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));

    expect(screen.getByText(RECALL_DISMISS_COPY.label)).toBeTruthy();
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

  it('closes the menu after answering, so the row is not left mid-decision', () => {
    renderShelf();

    fireEvent.click(screen.getByLabelText(RECALL_MORE_COPY.ariaFor(op.title)));
    fireEvent.click(screen.getByText(RECALL_DISMISS_COPY.label));

    expect(screen.queryByText(RECALL_DISMISS_COPY.label)).toBeNull();
  });

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

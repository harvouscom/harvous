import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import PrototypeRecallStateChip from '../PrototypeRecallStateChip';
import { RECALL_STATE_LABELS, type RecallState } from '@/utils/review-item-kinds';

const renderMark = (state: RecallState) => {
  const { container } = render(
    <PrototypeRecallStateChip state={state} label={RECALL_STATE_LABELS[state]} />,
  );
  return container.querySelector('.proto-recall-mark') as HTMLElement;
};

describe('the recall mark still says what it used to say', () => {
  /*
   * The mark replaced two words, and nothing failed when the words disappeared — no test read
   * them. This is that test: whatever the mark looks like, it has to keep carrying the sentence
   * for someone listening rather than looking.
   */
  it('keeps the label as its accessible name', () => {
    render(<PrototypeRecallStateChip state="durable" label={RECALL_STATE_LABELS.durable} />);
    expect(screen.getByRole('img', { name: 'You have this' })).toBeTruthy();
  });

  it('shows no visible text of its own', () => {
    expect(renderMark('fragile').textContent).toBe('');
  });
});

describe('three levels, because the copy makes three distinctions', () => {
  it('draws fragile and forming identically, as their shared label does', () => {
    // Two states, one sentence, one fill. A bar over all five would expose a split the words hide.
    expect(renderMark('fragile').dataset.hold).toBe('learning');
    expect(renderMark('forming').dataset.hold).toBe('learning');
    expect(RECALL_STATE_LABELS.fragile).toBe(RECALL_STATE_LABELS.forming);
  });

  it('draws durable as held', () => {
    expect(renderMark('durable').dataset.hold).toBe('held');
  });

  it('gives slipping its own step rather than a low one', () => {
    // A fall from holding, not an early rung — see the component's note.
    expect(renderMark('slipping').dataset.hold).toBe('slipped');
  });

  it('keeps the raw state, which is the only thing telling fragile from forming', () => {
    expect(renderMark('fragile').dataset.state).toBe('fragile');
    expect(renderMark('forming').dataset.state).toBe('forming');
  });

  it('always draws three segments, whatever the state', () => {
    for (const state of ['fragile', 'forming', 'durable', 'slipping'] as RecallState[]) {
      expect(renderMark(state).querySelectorAll('.proto-recall-mark__seg')).toHaveLength(3);
    }
  });
});

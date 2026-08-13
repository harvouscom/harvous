import { describe, expect, it } from 'vitest';
import { sequenceStepFor } from '../../../hooks/queries/useThreadNotes';
import { sequenceStepLabel } from '../../../hooks/queries/useSpaceGroupThreads';

function thread(overrides: Partial<Parameters<typeof sequenceStepLabel>[0]> = {}) {
  return {
    mode: 'sequence',
    sequenceCurrentIndex: 3,
    sequenceTotal: 8,
    ...overrides,
  };
}

describe('sequenceStepLabel', () => {
  it('says where the group is', () => {
    expect(sequenceStepLabel(thread())).toBe('Step 3 of 8');
  });

  it('says nothing for a collection Thread — the note count still speaks', () => {
    expect(sequenceStepLabel(thread({ mode: 'collection' }))).toBeNull();
  });

  it('says nothing for a plan with no steps in it yet', () => {
    expect(sequenceStepLabel(thread({ sequenceTotal: 0, sequenceCurrentIndex: 0 }))).toBeNull();
  });

  it('falls back to the size of the plan when no step is current', () => {
    expect(sequenceStepLabel(thread({ sequenceCurrentIndex: 0 }))).toBe('8 steps');
  });
});

describe('sequenceStepFor', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('numbers steps from one and marks the current one', () => {
    expect(sequenceStepFor('b', order, 'b')).toEqual({
      stepNumber: 2,
      isCurrent: true,
      isAhead: false,
    });
  });

  it('marks later steps as ahead — dimmed, not withheld', () => {
    expect(sequenceStepFor('d', order, 'b').isAhead).toBe(true);
  });

  it('does not mark steps the group has already passed', () => {
    expect(sequenceStepFor('a', order, 'b').isAhead).toBe(false);
  });

  it('treats nothing as ahead when no step is current', () => {
    expect(sequenceStepFor('d', order, null).isAhead).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  canManageSpaceThreadStructure,
  parseSequenceNoteIds,
  resolveSequenceState,
  withOpenedStep,
} from '../thread-sequence';

function space(overrides: Partial<{ type: string; userId: string; orgId: string | null }> = {}) {
  return {
    type: 'shared',
    userId: 'owner-1',
    orgId: 'org_1',
    ...overrides,
  } as any;
}

describe('parseSequenceNoteIds', () => {
  it('reads a stored list, and survives anything that is not one', () => {
    expect(parseSequenceNoteIds('["a","b"]')).toEqual(['a', 'b']);
    expect(parseSequenceNoteIds(null)).toEqual([]);
    expect(parseSequenceNoteIds('not json')).toEqual([]);
    expect(parseSequenceNoteIds('{"a":1}')).toEqual([]);
    expect(parseSequenceNoteIds('["a",42,null,""]')).toEqual(['a']);
  });

  it('keeps the first position of a duplicated id, so "step 3" stays unambiguous', () => {
    expect(parseSequenceNoteIds('["a","b","a","c"]')).toEqual(['a', 'b', 'c']);
  });
});

describe('resolveSequenceState', () => {
  it('holds the authored order and derives the step number from the pointer', () => {
    const state = resolveSequenceState(
      { sequenceNoteIds: '["c","a","b"]', sequenceCurrentNoteId: 'a' },
      ['a', 'b', 'c'],
    );

    expect(state.orderedNoteIds).toEqual(['c', 'a', 'b']);
    expect(state.currentNoteId).toBe('a');
    expect(state.currentIndex).toBe(2);
    expect(state.total).toBe(3);
    expect(state.needsRewrite).toBe(false);
  });

  it('drops ids whose notes have left the Thread', () => {
    const state = resolveSequenceState(
      { sequenceNoteIds: '["a","gone","b"]', sequenceCurrentNoteId: 'b' },
      ['a', 'b'],
    );

    expect(state.orderedNoteIds).toEqual(['a', 'b']);
    expect(state.currentIndex).toBe(2);
    expect(state.needsRewrite).toBe(true);
  });

  it('heals a pointer at a note that is gone by falling back to the first step', () => {
    const state = resolveSequenceState(
      { sequenceNoteIds: '["a","b"]', sequenceCurrentNoteId: 'gone' },
      ['a', 'b'],
    );

    expect(state.currentNoteId).toBe('a');
    expect(state.currentIndex).toBe(1);
    expect(state.needsRewrite).toBe(true);
  });

  it('appends notes attached by paths that know nothing about sequences', () => {
    const state = resolveSequenceState(
      { sequenceNoteIds: '["a"]', sequenceCurrentNoteId: 'a' },
      ['a', 'newly-attached'],
    );

    expect(state.orderedNoteIds).toEqual(['a', 'newly-attached']);
    expect(state.total).toBe(2);
    expect(state.needsRewrite).toBe(true);
  });

  it('reports an empty sequence rather than a phantom step 1 of 0', () => {
    const state = resolveSequenceState({ sequenceNoteIds: '[]', sequenceCurrentNoteId: null }, []);

    expect(state.currentNoteId).toBeNull();
    expect(state.currentIndex).toBe(0);
    expect(state.total).toBe(0);
  });

  it('orders a Thread that has notes but no stored order at all', () => {
    const state = resolveSequenceState({ sequenceNoteIds: null, sequenceCurrentNoteId: null }, [
      'a',
      'b',
    ]);

    expect(state.orderedNoteIds).toEqual(['a', 'b']);
    expect(state.currentNoteId).toBe('a');
    expect(state.needsRewrite).toBe(true);
  });
});

describe('canManageSpaceThreadStructure', () => {
  it('lets the canonical owner manage, whatever their membership row says', () => {
    expect(canManageSpaceThreadStructure(space(), 'member', 'owner-1')).toBe(true);
  });

  it('lets a leader manage — the room outlives the staff member who made it', () => {
    expect(canManageSpaceThreadStructure(space(), 'leader', 'someone-else')).toBe(true);
  });

  it('refuses a plain member', () => {
    expect(canManageSpaceThreadStructure(space(), 'member', 'someone-else')).toBe(false);
  });

  it('refuses ministry channels while they are read-only in the pilot', () => {
    expect(canManageSpaceThreadStructure(space({ type: 'public' }), 'leader', 'owner-1')).toBe(false);
    expect(canManageSpaceThreadStructure(space({ type: 'public' }), 'owner', 'owner-1')).toBe(false);
  });

  it('keeps a personal space to its owner — a private reading plan has no leaders', () => {
    const personal = space({ type: 'personal', orgId: null });
    expect(canManageSpaceThreadStructure(personal, 'owner', 'owner-1')).toBe(true);
    expect(canManageSpaceThreadStructure(personal, 'leader', 'someone-else')).toBe(false);
  });

  it('refuses a missing space rather than assuming', () => {
    expect(canManageSpaceThreadStructure(null, 'owner', 'owner-1')).toBe(false);
  });
});

describe('withOpenedStep', () => {
  it('records a step the first time it is opened', () => {
    expect(withOpenedStep(null, 'a')).toEqual(['a']);
    expect(withOpenedStep('["a"]', 'b')).toEqual(['a', 'b']);
  });

  it('counts a person once however many times they reopen a step', () => {
    expect(withOpenedStep('["a","b"]', 'a')).toEqual(['a', 'b']);
  });

  it('survives a row whose JSON has gone bad rather than losing the person', () => {
    expect(withOpenedStep('not json', 'a')).toEqual(['a']);
  });
});

/**
 * The load-bearing case is not "selected first" — it is "and nothing else moved". A picker
 * that quietly reshuffled the rest would be worse than the problem it fixes.
 */
import { describe, expect, it } from 'vitest';
import { hoistArrivedSelection } from '../add-notes-ordering';

const pool = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
  { id: 'e' },
];
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).join('');

describe('hoistArrivedSelection', () => {
  it('lifts the arriving selection to the top', () => {
    expect(ids(hoistArrivedSelection(pool, new Set(['c', 'e'])))).toBe('ceabd');
  });

  it('keeps the pool order inside both groups', () => {
    /* `c` before `e` because the pool had it that way, and `a b d` likewise — the sort says
       nothing about two rows on the same side of the line. */
    expect(ids(hoistArrivedSelection(pool, new Set(['e', 'c'])))).toBe('ceabd');
  });

  it('changes nothing when nothing arrived selected', () => {
    expect(ids(hoistArrivedSelection(pool, new Set()))).toBe('abcde');
  });

  it('changes nothing when the arriving selection is already on top', () => {
    expect(ids(hoistArrivedSelection(pool, new Set(['a', 'b'])))).toBe('abcde');
  });

  it('ignores ids the pool does not hold', () => {
    /* The prefill can name a note the current scope filters out — a folder-filed note in the
       "Unsorted" scope, say. That is a row to not find, not a row to invent. */
    expect(ids(hoistArrivedSelection(pool, new Set(['zz', 'd'])))).toBe('dabce');
  });

  it('never mutates the pool it was given', () => {
    const original = [...pool];
    hoistArrivedSelection(pool, new Set(['e']));
    expect(pool).toEqual(original);
  });

  it('returns a copy even on the empty-selection path', () => {
    const out = hoistArrivedSelection(pool, new Set());
    expect(out).not.toBe(pool);
    expect(out).toEqual(pool);
  });
});

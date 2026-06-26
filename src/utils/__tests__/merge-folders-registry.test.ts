import { describe, expect, it } from 'vitest';
import { mergeFoldersWithRegistry } from '../../../spa/src/pages/prototype/sidebar-universal-search';

describe('mergeFoldersWithRegistry', () => {
  it('adds empty registry labels not present in note-derived buckets', () => {
    const merged = mergeFoldersWithRegistry(
      [
        { name: 'Romans', count: 2 },
        { name: null, count: 1 },
      ],
      ['Epistles', 'Romans'],
    );
    expect(merged).toEqual([
      { name: 'Epistles', count: 0 },
      { name: 'Romans', count: 2 },
      { name: null, count: 1 },
    ]);
  });

  it('returns note buckets unchanged when registry is empty', () => {
    const fromNotes = [{ name: 'Paul', count: 1 }];
    expect(mergeFoldersWithRegistry(fromNotes, [])).toEqual(fromNotes);
  });
});

/**
 * What a bulk destructive promises, and that the button and its confirm promise the same.
 *
 * The bug this pins is a real one that shipped: two of these confirms removed a *label* —
 * a folder, a Thread — while calling the button "Delete". That is the one word a confirm
 * has to get right, because it is the word someone reads before agreeing to something they
 * cannot take back. Folders and Threads take "Remove" and say what survives; only notes and
 * highlights genuinely delete.
 */
import { describe, expect, it } from 'vitest';
import { bulkDestructiveCopy } from '../proto-destructive-copy';
import { destructiveVerbFor } from '../../../lib/prototype-commands';

describe('the verb', () => {
  it('is Remove where the thing removed is a label or a connection', () => {
    expect(destructiveVerbFor('folder')).toBe('Remove');
    expect(destructiveVerbFor('thread')).toBe('Remove');
    expect(destructiveVerbFor('sharedThread')).toBe('Remove');
  });

  it('is Delete only where content really goes', () => {
    expect(destructiveVerbFor('note')).toBe('Delete');
    expect(destructiveVerbFor('highlight')).toBe('Delete');
  });

  it('is the same word in the confirm as on the button that raised it', () => {
    // One table feeds both; this is the assertion that keeps it one table.
    for (const kind of ['note', 'highlight', 'folder', 'thread'] as const) {
      expect(bulkDestructiveCopy(kind, 2).confirmLabel).toBe(destructiveVerbFor(kind));
    }
  });
});

describe('what it says will survive', () => {
  it('tells you the notes stay, for the two kinds where they do', () => {
    expect(bulkDestructiveCopy('folder', 3).description).toContain('notes in them stay');
    expect(bulkDestructiveCopy('thread', 3).description).toContain('notes in them stay');
  });

  it('promises nothing of the sort for a note, which really is unrecoverable', () => {
    expect(bulkDestructiveCopy('note', 1).description).toContain('can’t be undone');
  });
});

describe('counting', () => {
  it('agrees with itself about plurals', () => {
    expect(bulkDestructiveCopy('folder', 1).title).toBe('Remove 1 folder?');
    expect(bulkDestructiveCopy('folder', 4).title).toBe('Remove 4 folders?');
    expect(bulkDestructiveCopy('thread', 1).title).toBe('Remove 1 Thread?');
    expect(bulkDestructiveCopy('highlight', 2).title).toBe('Delete 2 highlights?');
  });
});

import { describe, expect, it } from 'vitest';
import {
  availablePrototypeCommands,
  commandNoun,
  FOLDER_FANOUT_CAP,
  MIN_BULK_THREAD_NOTES,
  prototypeCommandById,
  PROTOTYPE_COMMANDS,
  PROTOTYPE_COMMAND_BY_VERB,
  type CommandContext,
} from '../prototype-commands';
import type { NoteRowCapabilityInput } from '../note-row-capabilities';

const ownInHome: NoteRowCapabilityInput = {
  isOwnNote: true,
  isScopedSharedSpace: false,
  viewerIsSpaceOwner: false,
};
const ownInSpace: NoteRowCapabilityInput = {
  isOwnNote: true,
  isScopedSharedSpace: true,
  viewerIsSpaceOwner: false,
};
const foreignAsMember: NoteRowCapabilityInput = {
  isOwnNote: false,
  isScopedSharedSpace: true,
  viewerIsSpaceOwner: false,
};

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  const rows = overrides.rows ?? [ownInHome];
  return {
    kind: 'note',
    ids: overrides.ids ?? rows.map((_, i) => `note_${i}`),
    rows,
    fromSelection: true,
    isScopedSharedSpace: false,
    ...overrides,
  };
}

function idsOf(context: CommandContext): string[] {
  return availablePrototypeCommands(context).map((c) => c.id);
}

describe('availablePrototypeCommands', () => {
  it('offers the My Home set for one own note', () => {
    expect(idsOf(ctx({ rows: [ownInHome], ids: ['a'], fromSelection: false }))).toEqual([
      'organize.folder',
      'organize.pin',
      'organize.share',
      'organize.delete',
    ]);
  });

  it('offers nothing when there is no target', () => {
    expect(idsOf(ctx({ rows: [], ids: [] }))).toEqual([]);
  });

  it('offers nothing when rows and ids disagree', () => {
    // A row scrolled out of the loaded page — acting would half-apply the batch.
    expect(idsOf(ctx({ rows: [ownInHome], ids: ['a', 'b'] }))).toEqual([]);
  });

  describe('all-or-nothing gating', () => {
    it('withholds organize and delete when one row in the batch is foreign', () => {
      const available = idsOf(
        ctx({
          rows: [ownInSpace, foreignAsMember],
          ids: ['a', 'b'],
          isScopedSharedSpace: true,
        }),
      );
      expect(available).not.toContain('organize.folder');
      expect(available).not.toContain('organize.delete');
    });

    it('never offers delete inside a shared space, even for your own note', () => {
      expect(
        idsOf(ctx({ rows: [ownInSpace], ids: ['a'], isScopedSharedSpace: true })),
      ).not.toContain('organize.delete');
    });

    it('offers remove-from-space only inside a space', () => {
      expect(
        idsOf(ctx({ rows: [ownInSpace], ids: ['a'], isScopedSharedSpace: true })),
      ).toContain('organize.removeFromSpace');
      expect(idsOf(ctx({ rows: [ownInHome], ids: ['a'] }))).not.toContain(
        'organize.removeFromSpace',
      );
    });
  });

  describe('size floors and ceilings', () => {
    it('needs two notes before a Thread is offered', () => {
      const rows = Array.from({ length: MIN_BULK_THREAD_NOTES - 1 }, () => ownInHome);
      expect(idsOf(ctx({ rows, ids: rows.map((_, i) => `n${i}`) }))).not.toContain(
        'organize.thread',
      );

      const enough = Array.from({ length: MIN_BULK_THREAD_NOTES }, () => ownInHome);
      expect(idsOf(ctx({ rows: enough, ids: enough.map((_, i) => `n${i}`) }))).toContain(
        'organize.thread',
      );
    });

    it('never offers a Thread from a merely focused row', () => {
      const rows = [ownInHome, ownInHome];
      expect(
        idsOf(ctx({ rows, ids: ['a', 'b'], fromSelection: false })),
      ).not.toContain('organize.thread');
    });

    it('stops offering the folder verb past the fan-out cap', () => {
      const atCap = Array.from({ length: FOLDER_FANOUT_CAP }, () => ownInHome);
      expect(idsOf(ctx({ rows: atCap, ids: atCap.map((_, i) => `n${i}`) }))).toContain(
        'organize.folder',
      );

      const overCap = Array.from({ length: FOLDER_FANOUT_CAP + 1 }, () => ownInHome);
      expect(idsOf(ctx({ rows: overCap, ids: overCap.map((_, i) => `n${i}`) }))).not.toContain(
        'organize.folder',
      );
    });

    it('pins one note but not a batch of them', () => {
      expect(idsOf(ctx({ rows: [ownInHome], ids: ['a'] }))).toContain('organize.pin');

      const two = [ownInHome, ownInHome];
      expect(idsOf(ctx({ rows: two, ids: ['a', 'b'] }))).not.toContain('organize.pin');
    });
  });
});

describe('labels', () => {
  const folder = prototypeCommandById('organize.folder')!;

  it('counts what a standing selection holds', () => {
    const two = [ownInHome, ownInHome];
    expect(folder.label(ctx({ rows: two, ids: ['a', 'b'] }))).toBe('Move 2 notes to a folder…');
  });

  it('says nothing about a count for a merely focused row', () => {
    expect(folder.label(ctx({ rows: [ownInHome], ids: ['a'], fromSelection: false }))).toBe(
      'Move to a folder…',
    );
  });

  it('singularises a selection of one', () => {
    expect(folder.label(ctx({ rows: [ownInHome], ids: ['a'] }))).toBe('Move 1 note to a folder…');
  });
});

describe('commandNoun', () => {
  it('keeps the capital on the product noun', () => {
    expect(commandNoun('thread', 1)).toBe('Thread');
    expect(commandNoun('thread', 3)).toBe('Threads');
  });

  it('pluralises the ordinary ones', () => {
    expect(commandNoun('note', 1)).toBe('note');
    expect(commandNoun('highlight', 2)).toBe('highlights');
  });
});

describe('chord table', () => {
  it('points every verb at a command that exists', () => {
    for (const id of Object.values(PROTOTYPE_COMMAND_BY_VERB)) {
      expect(prototypeCommandById(id)).toBeDefined();
    }
  });

  /* The settings reference is generated from `keys`, so a chord that fires but prints
     nothing would be undiscoverable — and one printed twice would be a lie about one. */
  it('gives each chorded command a unique chord', () => {
    const chords = PROTOTYPE_COMMANDS.filter((c) => c.keys).map((c) => c.keys);
    expect(new Set(chords).size).toBe(chords.length);
  });

  it('gives every verb in the chord table a printable chord', () => {
    for (const id of Object.values(PROTOTYPE_COMMAND_BY_VERB)) {
      expect(prototypeCommandById(id)?.keys).toBeTruthy();
    }
  });
});

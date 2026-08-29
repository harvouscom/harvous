/**
 * Which organize verbs a query is asking for.
 *
 * The palette showed all of them unconditionally because its field did nothing else. This
 * field also searches six kinds, so the filtering is what keeps six verbs from sitting
 * above the results for someone who typed "grace".
 */
import { describe, expect, it } from 'vitest';
import { matchPrototypeCommands } from '../library-command-matches';
import { availablePrototypeCommands, type CommandContext } from '../../../../lib/prototype-commands';

/**
 * A context with a standing selection — which is what actually reaches the panel, since
 * the sidebar's selection is shell state and survives the panel opening over it.
 */
const CTX: CommandContext = {
  kind: 'note',
  ids: ['n1', 'n2'],
  rows: [
    { isOwnNote: true, isScopedSharedSpace: false, viewerIsSpaceOwner: true },
    { isOwnNote: true, isScopedSharedSpace: false, viewerIsSpaceOwner: true },
  ],
  fromSelection: true,
  isScopedSharedSpace: false,
};

describe('matchPrototypeCommands', () => {
  it('offers nothing without a context', () => {
    // No selection and no focused row means a verb would have no object, and offering
    // one that cannot act is worse than offering none.
    expect(matchPrototypeCommands(null, 'move')).toEqual([]);
    expect(matchPrototypeCommands(null, '')).toEqual([]);
  });

  it('offers everything available on an empty query', () => {
    // With a row standing and nothing typed, showing what you could do to it — chords
    // included — is the whole reason the palette existed.
    const all = availablePrototypeCommands(CTX);
    expect(matchPrototypeCommands(CTX, '')).toHaveLength(all.length);
    expect(all.length).toBeGreaterThan(0);
  });

  it('treats whitespace as empty', () => {
    expect(matchPrototypeCommands(CTX, '   ')).toHaveLength(
      availablePrototypeCommands(CTX).length,
    );
  });

  it('narrows to the verbs a query names', () => {
    const matched = matchPrototypeCommands(CTX, 'folder');
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.length).toBeLessThan(availablePrototypeCommands(CTX).length);
    expect(matched.some((c) => c.referenceLabel.toLowerCase().includes('folder'))).toBe(true);
  });

  it('matches a partial word, the way the rest of the surface does', () => {
    // "delet" finding a verb and "grac" finding a note should behave alike rather than
    // being two different ideas of what counts as a match.
    expect(matchPrototypeCommands(CTX, 'delet').length).toBeGreaterThan(0);
  });

  it('offers nothing for a query that names no verb', () => {
    expect(matchPrototypeCommands(CTX, 'zzzznotaverb')).toEqual([]);
  });

  it('never returns a command that is not available in this context', () => {
    const available = new Set(availablePrototypeCommands(CTX).map((c) => c.id));
    for (const command of matchPrototypeCommands(CTX, '')) {
      expect(available.has(command.id)).toBe(true);
    }
  });
});

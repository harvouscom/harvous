/**
 * The toolbar chip's label.
 *
 * There is one answer now, which is the whole point — the chip used to name the note's
 * folder or the chapter being read, and a centred control that changes width on every
 * navigation is a control that never sits still. These guard the sameness rather than the
 * variety: if a mode ever starts answering differently again, that was a decision someone
 * should have to make deliberately.
 */
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_CHIP_NEUTRAL_LABEL,
  resolveLibraryChipDisplay,
  type LibraryChipMode,
} from '../library-chip-display';

const MODES: LibraryChipMode[] = ['activity', 'note', 'reader'];

describe('resolveLibraryChipDisplay', () => {
  it('says Search, whatever you are looking at', () => {
    for (const mode of MODES) {
      expect(resolveLibraryChipDisplay({ mode }).label).toBe(LIBRARY_CHIP_NEUTRAL_LABEL);
    }
  });

  it('wears the magnifying glass in every mode', () => {
    // The glyph says the same thing to anyone who does not read the word, so it cannot
    // vary while the word does not.
    for (const mode of MODES) {
      expect(resolveLibraryChipDisplay({ mode }).icon).toBe('search');
    }
  });

  it('names the action, not the room', () => {
    for (const mode of MODES) {
      expect(resolveLibraryChipDisplay({ mode }).ariaLabel).toBe('Open search');
    }
  });

  it('is identical across modes, field for field', () => {
    // Stronger than checking each field: this fails if any future branch reintroduces a
    // per-mode difference at all, including one nobody thought to assert on.
    const [first, ...rest] = MODES.map((mode) => resolveLibraryChipDisplay({ mode }));
    for (const other of rest) expect(other).toEqual(first);
  });

  it('never returns an empty label — the chip does not unmount', () => {
    for (const mode of MODES) {
      const chip = resolveLibraryChipDisplay({ mode });
      expect(chip.label.length).toBeGreaterThan(0);
      expect(chip.ariaLabel.length).toBeGreaterThan(0);
    }
  });
});

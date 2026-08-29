/**
 * The toolbar's center chip — the door into the search panel.
 *
 * It says "Search" in every mode. It used to name the note's folder or the chapter you were
 * reading, which duplicated what the inspector and the reader already showed and made a
 * centred control change width on every navigation. See `library-chip-display`.
 *
 * It replaced a note-only folder chip that unmounted on every other surface. Two things
 * changed with it, and both matter:
 *
 *   - It renders on all three shell modes, including where there is no note and no
 *     `canOrganize` permission. The chip is navigation now, not an editor, so a
 *     read-only viewer in a shared space still gets a way to browse. Editing which
 *     folders a note belongs to moved inside the panel, where the permission is checked.
 *   - It never unmounts. `.proto-toolbar-center` is absolutely centered, so a chip that
 *     came and went would make the toolbar twitch on every note load; `resolveLibraryChipDisplay`
 *     always returns a label for exactly this reason.
 *
 * While the panel is open the chip is hidden rather than removed — the morph animates
 * the panel out of the chip's box, and the toolbar must not reflow underneath it.
 */
import { useRef } from 'react';
import Icon from '@/components/react/Icon';
import { PROTO_TOOLBAR_FOLDER_CHIP_ICON_SIZE } from './proto-toolbar-tokens';
import {
  resolveLibraryChipDisplay,
  type LibraryChipMode,
} from '@/utils/library-chip-display';
import type { LibraryChipRect } from './library-panel/library-chip-rect';

export const LIBRARY_PANEL_DOM_ID = 'proto-library-panel';

/**
 * Where the panel morphs from.
 *
 * The whole box, not just its size: the FLIP has to undo the chip's position as well as
 * its dimensions, and the panel hangs below the toolbar while the chip sits inside it.
 * Re-exported from the store so there is one definition rather than two that agree today.
 */
export type { LibraryChipRect } from './library-panel/library-chip-rect';

export default function PrototypeLibraryChip({
  mode,
  panelOpen,
  onOpen,
}: {
  mode: LibraryChipMode;
  /** True while the panel is open or morphing out — the chip holds its box, hidden. */
  panelOpen: boolean;
  onOpen: (rect: LibraryChipRect | null) => void;
}) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const display = resolveLibraryChipDisplay({ mode });

  return (
    <button
      ref={chipRef}
      type="button"
      className={`proto-toolbar-folder-chip proto-library-chip${panelOpen ? ' proto-library-chip--hidden' : ''}`}
      title={display.ariaLabel}
      aria-label={display.ariaLabel}
      /* A region, not a dialog — so this is expanded/controls, not haspopup. */
      aria-expanded={panelOpen}
      aria-controls={LIBRARY_PANEL_DOM_ID}
      onClick={() => {
        const rect = chipRef.current?.getBoundingClientRect();
        onOpen(
          rect ? { width: rect.width, height: rect.height, top: rect.top, left: rect.left } : null,
        );
      }}
    >
      <Icon
        name="magnifying-glass"
        size={PROTO_TOOLBAR_FOLDER_CHIP_ICON_SIZE}
        className="proto-toolbar-folder-chip__icon"
        aria-hidden
      />
      <span className="proto-toolbar-folder-chip__labels">
        <span className="proto-toolbar-folder-chip__label">{display.label}</span>
      </span>
    </button>
  );
}

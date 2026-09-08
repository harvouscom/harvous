import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeReviewDock from './PrototypeReviewDock';

/**
 * Shell-level editor chrome — a single full-width bar (grid row 3) that spans the
 * whole app shell. The floating sidebar card sits in front of it (higher z-index),
 * so the bar reads as passing behind the sidebar; toolbar content is inset to the
 * paper left/right edges via --proto-format-toolbar-paper-inset and
 * --proto-format-toolbar-paper-right-inset (study-dock-layout.ts).
 *
 * Study docks (scripture / highlight / reference) all portal into the single carousel host
 * inside `.proto-shell__study-dock-layer` above this bar — full shell width so docks pass
 * behind the sidebar; editor-column centering uses --proto-study-dock-center-offset.
 *
 * Mounted on every route now, where it used to appear only on note and reader paths. The
 * Review dock has to be able to follow you onto Activity, and it belongs in this band rather
 * than in a second floating layer of its own — the band already knows how to lift for the
 * format bar, how to get out of the way of the keyboard, and how to centre on the paper.
 *
 * The bottom bar keeps the old condition as `bottomBarActive`: a format toolbar on Activity
 * would be chrome for an editor that is not there, and it must still go down with a stacked
 * note sheet, where it would otherwise hover over Scripture and cover the way back up.
 * Mounting costs nothing when inactive — the layer is absolutely positioned and takes no grid
 * height, which the reader route already proved by mounting this without the note-chrome row.
 */
export default function PrototypeEditorChromeBar({
  bottomBarActive = true,
}: {
  bottomBarActive?: boolean;
}) {
  const {
    editorChromeMode,
    setFormatToolbarHostEl,
    setStudyDockCarouselHostEl,
  } = useProtoShell();

  // Off a note or the reader there is no editor to wear chrome for, so the bar reports itself
  // hidden and the layer keeps its plain (unlifted) position.
  const mode = bottomBarActive ? editorChromeMode : 'hidden';
  const collapsed = mode === 'hidden' || mode === 'noteActions';

  return (
    <div className="proto-shell__editor-chrome-row" data-mode={mode}>
      <div className="proto-shell__study-dock-layer" aria-live="polite">
        {/* Before the carousel, so on a note the question sits above the note's own docks
            rather than being pushed off the end of a row it does not belong to. */}
        <div className="proto-shell__study-dock-layer__slot proto-shell__study-dock-layer__slot--review">
          <PrototypeReviewDock />
        </div>
        <div ref={setStudyDockCarouselHostEl} className="proto-shell__study-dock-layer__slot" />
      </div>
      <div
        className="proto-editor-bottom-bar"
        data-mode={mode}
        style={collapsed ? { height: 0, overflow: 'hidden', borderTop: 'none' } : undefined}
      >
        <div
          ref={setFormatToolbarHostEl}
          className="proto-editor-bottom-bar__format"
          style={{
            display: mode === 'format' || mode === 'selection' ? 'flex' : 'none',
          }}
        />
      </div>
    </div>
  );
}

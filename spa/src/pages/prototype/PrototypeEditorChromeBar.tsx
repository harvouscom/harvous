import { useProtoShell } from '../../layouts/proto-shell-context';

/**
 * Shell-level editor chrome — a single full-width bar (grid row 3) that spans the
 * whole app shell. The floating sidebar card sits in front of it (higher z-index),
 * so the bar reads as passing behind the sidebar; toolbar content is offset right
 * (see prototype-shell.css) so the controls clear the sidebar.
 *
 * Study docks (scripture / highlight / reference) all portal into the single carousel host
 * inside `.proto-shell__study-dock-layer` above this bar — full shell width so docks pass
 * behind the sidebar; editor-column centering uses --proto-study-dock-center-offset.
 */
export default function PrototypeEditorChromeBar() {
  const {
    editorChromeMode,
    setFormatToolbarHostEl,
    setStudyDockCarouselHostEl,
  } = useProtoShell();

  const collapsed = editorChromeMode === 'hidden' || editorChromeMode === 'noteActions';

  return (
    <div className="proto-shell__editor-chrome-row" data-mode={editorChromeMode}>
      <div className="proto-shell__study-dock-layer" aria-live="polite">
        <div ref={setStudyDockCarouselHostEl} className="proto-shell__study-dock-layer__slot" />
      </div>
      <div
        className="proto-editor-bottom-bar"
        data-mode={editorChromeMode}
        style={collapsed ? { height: 0, overflow: 'hidden', borderTop: 'none' } : undefined}
      >
        <div
          ref={setFormatToolbarHostEl}
          className="proto-editor-bottom-bar__format"
          style={{ display: editorChromeMode === 'format' ? 'flex' : 'none' }}
        />
      </div>
    </div>
  );
}

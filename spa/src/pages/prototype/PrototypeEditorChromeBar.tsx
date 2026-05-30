import { useProtoShell } from '../../layouts/proto-shell-context';

/**
 * Shell-level editor chrome — a single full-width bar (grid row 3) that spans the
 * whole app shell. The floating sidebar card sits in front of it (higher z-index),
 * so the bar reads as passing behind the sidebar; toolbar content is offset right
 * (see prototype-shell.css) so the controls clear the sidebar.
 */
export default function PrototypeEditorChromeBar() {
  const {
    editorChromeMode,
    setFormatToolbarHostEl,
    setScriptureChromeHostEl,
    setHighlightChromeHostEl,
    setReferenceChromeHostEl,
  } = useProtoShell();

  const collapsed = editorChromeMode === 'hidden' || editorChromeMode === 'noteActions';

  return (
    <div className="proto-shell__editor-chrome-row" data-mode={editorChromeMode}>
      <div
        className="proto-editor-bottom-bar"
        data-mode={editorChromeMode}
        style={collapsed ? { height: 0, overflow: 'hidden', borderTop: 'none' } : undefined}
      >
        <div
          ref={setHighlightChromeHostEl}
          className="proto-editor-bottom-bar__highlight"
          style={{ display: editorChromeMode === 'highlight' ? 'block' : 'none' }}
        />
        <div
          ref={setScriptureChromeHostEl}
          className="proto-editor-bottom-bar__scripture"
          style={{ display: editorChromeMode === 'scripture' ? 'block' : 'none' }}
        />
        <div
          ref={setReferenceChromeHostEl}
          className="proto-editor-bottom-bar__reference"
          style={{ display: editorChromeMode === 'reference' ? 'block' : 'none' }}
        />
        <div
          ref={setFormatToolbarHostEl}
          className="proto-editor-bottom-bar__format"
          style={{ display: editorChromeMode === 'format' ? 'flex' : 'none' }}
        />
      </div>
    </div>
  );
}

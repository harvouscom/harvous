import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeStandaloneScripturePassagePane from './PrototypeStandaloneScripturePassagePane';
import PrototypeEditorEmptyState from './PrototypeEditorEmptyState';

export default function PrototypeHomePage() {
  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();
  const { standaloneScripturePassage, dismissStandaloneScripturePassage } = useProtoShell();

  if (!navReady) {
    return (
      <div className="proto-main-pane proto-main-empty">
        <p className="proto-caption">Loading…</p>
      </div>
    );
  }

  if (!homeSpaceId) {
    return (
      <div className="proto-main-pane proto-main-empty">
        <p className="proto-caption">Loading My Home…</p>
      </div>
    );
  }

  if (standaloneScripturePassage) {
    return (
      <PrototypeMainPaneShell>
        <PrototypeStandaloneScripturePassagePane
          state={standaloneScripturePassage}
          onDone={dismissStandaloneScripturePassage}
        />
      </PrototypeMainPaneShell>
    );
  }

  return (
    <PrototypeMainPaneShell>
      <PrototypeEditorEmptyState />
    </PrototypeMainPaneShell>
  );
}

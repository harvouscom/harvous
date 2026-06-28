import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeStandaloneScripturePassagePane from './PrototypeStandaloneScripturePassagePane';
import PrototypeEditorEmptyState from './PrototypeEditorEmptyState';
import PrototypeInstallWebAppCard from './PrototypeInstallWebAppCard';

export default function PrototypeHomePage() {
  const { standaloneScripturePassage, dismissStandaloneScripturePassage } = useProtoShell();

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
      <PrototypeInstallWebAppCard />
      <PrototypeEditorEmptyState />
    </PrototypeMainPaneShell>
  );
}

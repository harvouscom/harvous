import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeEditorEmptyState from './PrototypeEditorEmptyState';
import PrototypeInstallWebAppCard from './PrototypeInstallWebAppCard';

export default function PrototypeHomePage() {
  return (
    <PrototypeMainPaneShell>
      <PrototypeInstallWebAppCard />
      <PrototypeEditorEmptyState />
    </PrototypeMainPaneShell>
  );
}

import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeInstallWebAppCard from './PrototypeInstallWebAppCard';
import PrototypeStudyFeedPage from './PrototypeStudyFeedPage';

/**
 * The main pane on `/`.
 *
 * Was an empty state — the pane stood vacant until a note was opened, because Home lived in
 * the sidebar. Activity takes the canvas instead: opening the app now shows what has been
 * happening in someone's study rather than an invitation to go find it.
 *
 * Composing on `/` still renders the hosted editor instead of this, in the layout — see
 * `hostNoteInLayout` in SimplifiedPrototypeLayout.
 */
export default function PrototypeHomePage() {
  return (
    <PrototypeMainPaneShell>
      <PrototypeInstallWebAppCard />
      <PrototypeStudyFeedPage />
    </PrototypeMainPaneShell>
  );
}

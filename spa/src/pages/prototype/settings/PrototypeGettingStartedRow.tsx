/**
 * The way back into the getting-started checklist after it has been put away.
 *
 * It lives under Get Support rather than Appearance because it is a help affordance, not a
 * look: someone who wants it back wants to be shown around again, and that is what this
 * category is for.
 *
 * The row states what it is rather than only offering an action, because the interesting
 * case is the one where there is nothing to do — dismissed, still showing, or genuinely
 * finished are three different answers, and a single greyed-out button would give the same
 * silence to all three.
 */
import { useOnboardingState } from '../useOnboardingState';
import { SettingsGroup, SettingsRow } from './SettingsShell';

export default function PrototypeGettingStartedRow() {
  const { ready, visible, canRestore, restoreAll, progress } = useOnboardingState();

  /* Nothing trustworthy to describe yet — better to render no row than a wrong one. */
  if (!ready) return null;

  const finished = !visible && !canRestore;

  return (
    <SettingsGroup>
      <SettingsRow
        label="Getting started"
        sublabel={
          canRestore
            ? 'Bring the checklist back to the top of Activity.'
            : visible
              ? 'Showing at the top of Activity.'
              : 'You have finished every step.'
        }
        value={finished ? 'Done' : `${progress.done} of ${progress.total}`}
        trailing={canRestore ? 'chevron' : 'none'}
        onClick={canRestore ? restoreAll : undefined}
        disabled={!canRestore}
      />
    </SettingsGroup>
  );
}

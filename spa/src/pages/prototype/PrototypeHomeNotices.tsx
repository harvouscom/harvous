/**
 * Notes from Harvous itself, above the day's sheet: what's new, an offer to bring notes over
 * from another app, and the founder's letter.
 *
 * These lived in the Suggestions deck, shuffled in among things about the reader's own study —
 * a recall prompt, a Thread worth strengthening — where "What's new in Harvous" sat behind a
 * pager as card 9 of 10. They are not suggestions about your study; they are the app talking
 * about itself, so they sit outside the paper on the canvas, with the install and reminders
 * cards, as one quiet panel. Each row still decides for itself whether to show and keeps its
 * own ×; with all three put away the panel is gone (`:has()` in CSS).
 */
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeSettingsDataRouteTo } from '@/lib/prototype-path';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeWhatsNewPill from './PrototypeWhatsNewPill';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import { useDismissibleImportPrompt } from './use-dismissible-import-prompt';
import { onboardingOwnsOffer } from './onboarding-visible-steps';
import { useOnboardingState } from './useOnboardingState';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';

/**
 * The one pointer anyone gets to the fact that importing exists at all, shown to every account:
 * the people likeliest to have a shelf of notes elsewhere are the ones who have been here
 * longest. So the dismissal is the whole design — saying no is permanent and account-wide,
 * because whether you have notes to bring across is a fact about you. Steps aside while the
 * getting-started checklist is making the same offer.
 */
function ImportNotesRow() {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const { state: onboardingState } = useOnboardingState();
  const { dismissed, ready, dismiss } = useDismissibleImportPrompt();
  if (isGuest || !ready || dismissed || onboardingOwnsOffer(onboardingState, 'import', isGuest)) return null;
  return (
    <PrototypeHomeRow
      icon="cloud-arrow-up"
      title="Bring your notes from another app"
      meta={['Markdown, Word, Evernote, or a folder of files']}
      onClick={() => void navigate({ to: prototypeSettingsDataRouteTo() })}
      trailing={
        <button
          type="button"
          className="proto-side-panel__action-btn"
          aria-label="Hide this"
          onClick={(event) => {
            event.stopPropagation();
            dismiss();
          }}
        >
          <Icon name="xmark" size={12} aria-hidden />
        </button>
      }
    />
  );
}

export default function PrototypeHomeNotices() {
  return (
    <section className="proto-home-notices" aria-label="From Harvous">
      <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-home-notices__panel">
        {/* News first: it changes, and the two below it have been true for a while. */}
        <PrototypeWhatsNewPill />
        <ImportNotesRow />
        <PrototypeFounderLetterPill />
      </div>
    </section>
  );
}

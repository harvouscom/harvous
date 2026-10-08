/**
 * Harvous's own notices — what's new, bringing notes over from another app, the founder's letter
 * — as items for the callout stack.
 *
 * They were rows in a panel above the day's sheet (and before that, cards deep in Suggestions).
 * They are the app talking about itself, which is exactly what the callout card is for, so they
 * stack with it in the window's corner rather than taking room on the page.
 *
 * Each keeps the rule it already had, so nothing about *when* one shows has changed:
 * - What's new — once per release, put away per device (`useDismissibleRelease`). Opening it does
 *   not put it away; the × does.
 * - Import — until said no to, account-wide; steps aside while the checklist makes the offer.
 * - Founder's letter — until put away (`useDismissibleFlag`). Opening reads the letter.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { appVersion } from '@/utils/app-version';
import { prototypeSettingsDataRouteTo } from '@/lib/prototype-path';
import { useReleaseNotesUrl } from '../../../hooks/useReleaseNotesUrl';
import { useHarvousIdentity } from '../../../hooks/useHarvousIdentity';
import {
  PROTO_FOUNDER_LETTER_DISMISSED_KEY,
  PROTO_FOUNDER_LETTER_PREVIEW_KEY,
  PROTO_WHATS_NEW_DISMISSED_KEY,
  PROTO_WHATS_NEW_PREVIEW_KEY,
} from '../../../layouts/proto-session-keys';
import { useDismissibleFlag, useDismissibleRelease } from '../useDismissibleFlag';
import { useDismissibleImportPrompt } from '../use-dismissible-import-prompt';
import { onboardingOwnsOffer } from '../onboarding-visible-steps';
import { useOnboardingState } from '../useOnboardingState';
import { opensWelcomeSheet } from '../PrototypeWhatsNewPill';
import { openWelcome3 } from '../welcome3-bridge';
import type { CalloutStackItem } from './callout-stack-item';

export function useNoticeItems(): {
  items: CalloutStackItem[];
  founderLetterOpen: boolean;
  closeFounderLetter: () => void;
} {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const { state: onboardingState } = useOnboardingState();

  const version = appVersion();
  const releaseNotesUrl = useReleaseNotesUrl(version);
  const [whatsNewVisible, dismissWhatsNew] = useDismissibleRelease(PROTO_WHATS_NEW_DISMISSED_KEY, version, {
    previewKey: PROTO_WHATS_NEW_PREVIEW_KEY,
  });
  const showsWelcomeSheet = opensWelcomeSheet(version);
  const openWhatsNew = useCallback(() => {
    if (showsWelcomeSheet) openWelcome3();
    else window.open(releaseNotesUrl, '_blank', 'noopener,noreferrer');
  }, [releaseNotesUrl, showsWelcomeSheet]);

  const importPrompt = useDismissibleImportPrompt();
  const importVisible =
    !isGuest &&
    importPrompt.ready &&
    !importPrompt.dismissed &&
    !onboardingOwnsOffer(onboardingState, 'import', isGuest);

  const [letterVisible, dismissLetter] = useDismissibleFlag(PROTO_FOUNDER_LETTER_DISMISSED_KEY, {
    previewKey: PROTO_FOUNDER_LETTER_PREVIEW_KEY,
  });
  const [founderLetterOpen, setFounderLetterOpen] = useState(false);

  const items: CalloutStackItem[] = [];
  if (whatsNewVisible) {
    items.push({
      id: 'whats-new',
      illustration: 'whats-new',
      title: 'What’s new in Harvous',
      body: 'See what changed in this release.',
      actionLabel: showsWelcomeSheet ? 'Take a look' : 'Read the notes',
      act: openWhatsNew,
      dismiss: dismissWhatsNew,
    });
  }
  if (importVisible) {
    items.push({
      id: 'import',
      illustration: 'import',
      title: 'Bring your notes from another app',
      body: 'Markdown, Word, Evernote, or a folder of files.',
      actionLabel: 'Import notes',
      act: () => void navigate({ to: prototypeSettingsDataRouteTo() }),
      dismiss: importPrompt.dismiss,
    });
  }
  if (letterVisible) {
    items.push({
      id: 'founder-letter',
      illustration: 'letter',
      title: 'Why I made Harvous',
      body: 'A letter from the founder.',
      actionLabel: 'Read the letter',
      act: () => setFounderLetterOpen(true),
      dismiss: () => {
        setFounderLetterOpen(false);
        dismissLetter();
      },
    });
  }

  return { items, founderLetterOpen, closeFounderLetter: () => setFounderLetterOpen(false) };
}

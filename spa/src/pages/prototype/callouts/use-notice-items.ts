/**
 * Harvous's own notices — what's new, bringing notes over from another app, the founder's letter
 * — as items for the callout stack.
 *
 * They were rows in a panel above the day's sheet (and before that, cards deep in Suggestions).
 * They are the app talking about itself, which is exactly what the callout card is for, so they
 * stack with it in the window's corner rather than taking room on the page.
 *
 * When each shows:
 * - What's new — once per release, for accounts that had the app before it. Put away on the
 *   account (`whats-new@<release>` in the seen record) as well as the device, so it does not come
 *   back on every new browser. Not for accounts younger than two weeks, who are being introduced
 *   to the app rather than told what changed in it, and not while a feature callout already speaks
 *   for the release (`releaseHasCallout`). Opening it does not put it away; the × does.
 * - Import — until said no to, account-wide; steps aside while the checklist makes the offer.
 * - Founder's letter — until put away, on the account as well as the device. Opening reads it.
 *
 * Every × is also written into the account's seen record (`notice:<id>` for the last two), which
 * gives the corner one clock: the quiet day after a card is put away counts every kind of card,
 * not only feature callouts. See `callout-stack-admission.ts`.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { appVersion } from '@/utils/app-version';
import { markCalloutSeen } from '@/utils/onboarding-state';
import { releaseMarkerFor } from '@/utils/release-marker';
import { updateOnboardingState } from '../../../lib/proto-onboarding-sync';
import { useHasFeature } from '../../../hooks/useHasFeature';
import { prototypeSettingsDataRouteTo } from '@/lib/prototype-path';
import { useReleaseNotesUrl } from '../../../hooks/useReleaseNotesUrl';
import { useHarvousIdentity } from '../../../hooks/useHarvousIdentity';
import {
  PROTO_FOUNDER_LETTER_DISMISSED_KEY,
  PROTO_FOUNDER_LETTER_PREVIEW_KEY,
  PROTO_WHATS_NEW_DISMISSED_KEY,
  PROTO_WHATS_NEW_PREVIEW_KEY,
} from '../../../layouts/proto-session-keys';
import { readDismissFlag, useDismissibleFlag, useDismissibleRelease } from '../useDismissibleFlag';
import { useDismissibleImportPrompt } from '../use-dismissible-import-prompt';
import { onboardingOwnsOffer } from '../onboarding-visible-steps';
import { useOnboardingState } from '../useOnboardingState';
import { opensWelcomeSheet } from '../PrototypeWhatsNewPill';
import { openWelcome3 } from '../welcome3-bridge';
import type { CalloutStackItem } from './callout-stack-item';
import { CALLOUTS, releaseHasCallout } from './callout-registry';
import { NEW_ACCOUNT_MS, useAccountCreatedAt } from './use-account-created-at';

/** Write a put-away into the account's seen record, which is also the corner's quiet clock. */
function recordSeen(id: string): void {
  updateOnboardingState((current) => markCalloutSeen(current, id, new Date().toISOString()));
}

export function useNoticeItems(): {
  items: CalloutStackItem[];
  founderLetterOpen: boolean;
  closeFounderLetter: () => void;
} {
  const navigate = useNavigate();
  const { isGuest } = useHarvousIdentity();
  const { state: onboardingState, ready: onboardingReady } = useOnboardingState();
  const seen = onboardingState.calloutsSeen ?? {};
  const account = useAccountCreatedAt();
  const plus = useHasFeature('review');

  const version = appVersion();
  const releaseNotesUrl = useReleaseNotesUrl(version);
  const releaseKey = `whats-new@${releaseMarkerFor(version) ?? ''}`;
  const now = Date.now();
  const whatsNewEligible =
    onboardingReady &&
    account.ready &&
    !isGuest &&
    account.createdAt !== undefined &&
    now - account.createdAt >= NEW_ACCOUNT_MS &&
    !seen[releaseKey] &&
    !releaseHasCallout(CALLOUTS, {
      isGuest,
      isPlus: plus.has,
      appVersion: version,
      now,
      accountCreatedAt: account.createdAt,
    });
  const [whatsNewVisible, dismissWhatsNewHere] = useDismissibleRelease(PROTO_WHATS_NEW_DISMISSED_KEY, version, {
    previewKey: PROTO_WHATS_NEW_PREVIEW_KEY,
    /* The dev preview forces the card back past these rules too, or it could never be checked. */
    eligible: whatsNewEligible || (import.meta.env.DEV && readDismissFlag(PROTO_WHATS_NEW_PREVIEW_KEY)),
  });
  const dismissWhatsNew = useCallback(() => {
    dismissWhatsNewHere();
    recordSeen(releaseKey);
  }, [dismissWhatsNewHere, releaseKey]);
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

  const [letterVisible, dismissLetterHere] = useDismissibleFlag(PROTO_FOUNDER_LETTER_DISMISSED_KEY, {
    previewKey: PROTO_FOUNDER_LETTER_PREVIEW_KEY,
    eligible:
      (onboardingReady && !seen['notice:founder-letter']) ||
      (import.meta.env.DEV && readDismissFlag(PROTO_FOUNDER_LETTER_PREVIEW_KEY)),
  });
  const dismissLetter = useCallback(() => {
    dismissLetterHere();
    recordSeen('notice:founder-letter');
  }, [dismissLetterHere]);
  const [founderLetterOpen, setFounderLetterOpen] = useState(false);

  const items: CalloutStackItem[] = [];
  if (whatsNewVisible) {
    items.push({
      /* Per release, so last release's card having been on screen says nothing about this one. */
      id: releaseKey,
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
      dismiss: () => {
        importPrompt.dismiss();
        recordSeen('notice:import');
      },
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

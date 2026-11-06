/**
 * Decides whether the Harvous 3 welcome belongs on screen, and remembers the answer.
 *
 * Split from the sheet the way `PrototypeFounderLetterPill` is split from its sheet: the
 * eligibility rules live here (`welcome3-gate.ts`), and the sheet stays a thing that can be
 * rendered on demand — by the design gallery, which has no interest in any account.
 *
 * ## Two ways in
 *
 * It shows itself once, to an account that has not used 3.0 yet (see `shouldAutoShowWelcome3`).
 * After that the what's-new row can ask for it back, and that request is honoured for anyone —
 * someone who deliberately pressed a row saying "what's new in Harvous" should get the answer.
 * The automatic showing is the part that needs a gate; a press is its own justification.
 *
 * ## Remembered on the account
 *
 * Closing writes `welcome@3` into the account's seen record as well as this browser, so it
 * never comes back on the phone after being closed on the laptop. A browser that put it away
 * before the account key existed backfills it.
 */
import {
  PROTO_WELCOME_3_DISMISSED_KEY,
  PROTO_WELCOME_3_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useCallback, useEffect, useState } from 'react';
import { markCalloutSeen } from '@/utils/onboarding-state';
import { updateOnboardingState } from '../../lib/proto-onboarding-sync';
import PrototypeWelcome3Sheet from './PrototypeWelcome3Sheet';
import { readDismissFlag, writeDismissFlag } from './useDismissibleFlag';
import { onWelcome3OpenRequest } from './welcome3-bridge';
import { useOnboardingState } from './useOnboardingState';
import { useAccountCreatedAt } from './callouts/use-account-created-at';
import { WELCOME_3_SEEN_KEY, shouldAutoShowWelcome3 } from './welcome3-gate';

function recordWelcomeSeen(): void {
  updateOnboardingState((current) => markCalloutSeen(current, WELCOME_3_SEEN_KEY, new Date().toISOString()));
}

type Props = {
  /** Signed in, and not a guest. Guests have no 2.0 to be welcomed from. */
  enabled: boolean;
};

export default function PrototypeWelcome3({ enabled }: Props) {
  const { state, hydrated, accountHadState } = useOnboardingState();
  const account = useAccountCreatedAt();
  const seen = state.calloutsSeen;

  /* Decided once per session, from the account's first answer: the same session goes on to
     write its own onboarding state, and the sheet must not vanish under the reader when it does. */
  const [shownItself, setShownItself] = useState(false);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    if (decided) return;
    /* The dev preview forces it past every rule, guests included, or it could never be checked. */
    if (import.meta.env.DEV && readDismissFlag(PROTO_WELCOME_3_PREVIEW_KEY)) {
      setDecided(true);
      setShownItself(true);
      return;
    }
    if (!enabled || !hydrated || !account.ready) return;
    setDecided(true);
    const dismissedOnDevice = readDismissFlag(PROTO_WELCOME_3_DISMISSED_KEY);
    /* Put away here before the account remembered it: tell the account, so other devices agree. */
    if (dismissedOnDevice && !seen?.[WELCOME_3_SEEN_KEY]) recordWelcomeSeen();
    setShownItself(
      shouldAutoShowWelcome3({
        signedIn: enabled,
        hydrated,
        accountHadState,
        accountCreatedAt: account.createdAt,
        seen,
        dismissedOnDevice,
      }),
    );
  }, [decided, enabled, hydrated, account.ready, account.createdAt, accountHadState, seen]);

  const [askedFor, setAskedFor] = useState(false);
  useEffect(() => onWelcome3OpenRequest(() => setAskedFor(true)), []);

  /* Closing always records it, even when the sheet was asked for rather than offered: having
     read it by hand is still having read it. */
  const close = useCallback(() => {
    setAskedFor(false);
    setShownItself(false);
    writeDismissFlag(PROTO_WELCOME_3_DISMISSED_KEY);
    recordWelcomeSeen();
  }, []);

  return <PrototypeWelcome3Sheet open={shownItself || askedFor} onDismiss={close} />;
}

/**
 * Where reminders are offered to a reader who is past the getting-started checklist.
 *
 * The checklist has a "Turn on reminders" row of its own, and while that row is up this card
 * stands down — see `onboardingOwnsOffer`. Two versions of the same question on one screen is
 * worse than either. This is the surface that catches everyone else: accounts that finished
 * the tour, dismissed it, or were established before it existed.
 *
 * A pre-prompt, not a permission prompt. Browsers give a site exactly one chance to ask, and
 * a "denied" is permanent until someone goes into site settings — so the real
 * `Notification.requestPermission` is only ever raised from a tap on this card's button,
 * where the reader has already been told what they are agreeing to. Asking on load would
 * spend that one chance on someone who has not yet decided they want the app.
 *
 * Shown only after the reader has written a note, for the same reason: a nudge to come back
 * means nothing to someone with nothing to come back to.
 */
import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import {
  PROTO_PUSH_REMINDERS_DISMISSED_KEY,
  PROTO_PUSH_REMINDERS_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import type { PushSupport } from '../../lib/push-reminders';
import { markOnboardingStep } from '../../lib/proto-onboarding-sync';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { onboardingOwnsOffer } from './onboarding-visible-steps';
import { useOnboardingState } from './useOnboardingState';
import { useDismissibleFlag } from './useDismissibleFlag';

export default function PrototypeRemindersCard() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const { state: onboarding, hydrated } = useOnboardingState();
  const { isGuest } = useHarvousIdentity();

  // Support is a live browser read, so it resolves in an effect rather than during render —
  // the card must never flash in for someone already subscribed.
  useEffect(() => {
    let cancelled = false;
    void import('../../lib/push-reminders').then((mod) => {
      if (!cancelled) setSupport(mod.getPushSupport());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Read from the store rather than a one-shot snapshot, so the card can appear the moment
   * the checklist retires. Taken once at mount it would stay hidden for the rest of the
   * session for exactly the reader who had just become its audience.
   */
  const wroteANote = onboarding.steps.note.done === true;
  const eligible =
    support === 'default' &&
    hydrated &&
    wroteANote &&
    !onboardingOwnsOffer(onboarding, 'reminders', isGuest);

  const [visible, dismiss] = useDismissibleFlag(PROTO_PUSH_REMINDERS_DISMISSED_KEY, {
    previewKey: PROTO_PUSH_REMINDERS_PREVIEW_KEY,
    eligible,
  });

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const mod = await import('../../lib/push-reminders');
      const result = await mod.enablePushReminders();
      if (result.ok) {
        // The checklist counts this even when the offer came from here, so restoring the
        // tour later does not present a row for something already switched on.
        markOnboardingStep('reminders');
        toast.success('Reminders are on. Sunday morning and midweek.');
        dismiss();
      } else if (result.support === 'denied') {
        toast.error('Notifications are blocked for Harvous in this browser.');
        dismiss();
      } else if (result.error) {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-install-web-app-card"
      role="region"
      aria-label="Turn on Sunday and midweek reminders"
    >
      <button type="button" className="proto-daily-passage-pill__dismiss" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="xmark" size={10} aria-hidden />
        <span>Not now</span>
      </button>

      <p className="proto-install-web-app-card__heading">
        Want a nudge Sunday morning?
        <br />
        And once midweek.
      </p>

      <button
        type="button"
        className="proto-install-web-app-card__learn"
        aria-label="Turn on Sunday and midweek reminders"
        disabled={busy}
        onClick={() => void enable()}
      >
        {busy ? 'Turning on…' : 'Turn on reminders'}
        <Icon name="caret-right" size={10} aria-hidden />
      </button>
    </div>
  );
}

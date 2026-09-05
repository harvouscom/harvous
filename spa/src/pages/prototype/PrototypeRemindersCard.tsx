/**
 * The one place reminders are ever offered outside Settings.
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
import { getOnboardingSnapshot } from '../../lib/proto-onboarding-sync';
import { useDismissibleFlag } from './useDismissibleFlag';

export default function PrototypeRemindersCard() {
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);

  // Support and checklist state are both live browser reads, so they resolve in an effect
  // rather than during render — the card must never flash in for someone already subscribed.
  useEffect(() => {
    let cancelled = false;
    void import('../../lib/push-reminders').then((mod) => {
      if (cancelled) return;
      const snapshot = getOnboardingSnapshot();
      const wroteANote = snapshot.state?.steps?.note?.done === true;
      setEligible(mod.getPushSupport() === 'default' && snapshot.hydrated && wroteANote);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

/**
 * Whether the reader has put the Review upsell away.
 *
 * Device-local, like the onboarding day marker and the what's-new dismissal next to it. An
 * upsell dismissal is a presentation detail of one device rather than a fact about the
 * account, and syncing it would mean a laptop deciding what a phone shows. It also must not
 * ride the account's own sync rails: those merge by taking the larger value, and there is no
 * sensible merge for "I do not want to see this".
 *
 * Deliberately permanent rather than a snooze. The row says one thing, and someone who has
 * read it and said no has answered the question — asking again next week is what makes a
 * paywall feel like a nag rather than an offer.
 */
import { useCallback, useState } from 'react';

export const PROTO_REVIEW_PLUS_DISMISSED_KEY = 'harvous-prototype-review-plus-dismissed';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PROTO_REVIEW_PLUS_DISMISSED_KEY) === '1';
  } catch {
    // Private mode, or site data blocked. Showing the row is the safe answer: the reader can
    // dismiss it again, whereas hiding it forever on a storage error hides a paid feature.
    return false;
  }
}

export function useDismissiblePlusPrompt() {
  const [dismissed, setDismissed] = useState(read);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(PROTO_REVIEW_PLUS_DISMISSED_KEY, '1');
    } catch {
      // The state above still hides it for this session, which is the part the reader asked for.
    }
  }, []);

  return { dismissed, dismiss };
}

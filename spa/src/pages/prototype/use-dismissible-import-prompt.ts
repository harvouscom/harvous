/**
 * Whether the reader has put the import offer away.
 *
 * Account-synced, via the `import` step of the getting-started state. It began device-local, in
 * `localStorage`, alongside the Review upsell and the what's-new dismissal — and that was wrong
 * here in a way it is not wrong for those. Dismissing this is a decision about the reader's
 * *library*, not about this browser: someone who has nothing to bring across has nothing to bring
 * across on their phone either, and making them say so again on every device is the nagging the
 * dismissal exists to stop.
 *
 * It rides the onboarding state rather than a column of its own because the checklist already
 * carries an `import` row, already syncs, and already merges monotonically — `dismissed` only
 * ever goes false → true, so two devices in any order converge. A separate flag would have been a
 * second answer to one question, and the two could disagree.
 *
 * That shared home fixes something as a side effect: dismissing the import row *inside* the
 * checklist used to hand the offer straight to the standalone row on Home, so saying no once got
 * you asked again. One record, one answer, both places.
 *
 * Permanent rather than a snooze. Someone who read the row and said no has answered the question.
 */
import { useEffect } from 'react';

import { useOnboardingState } from './useOnboardingState';

/**
 * The device-local flag this used to be.
 *
 * Still read once, so an account that dismissed the row before the move stays dismissed — then
 * cleared, because the account's copy is the answer from that point on. Kept rather than dropped
 * because the alternative is every existing reader meeting a row they already said no to.
 */
export const PROTO_IMPORT_PROMPT_DISMISSED_KEY = 'harvous-prototype-import-prompt-dismissed';

function readLegacy(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY) === '1';
  } catch {
    // Private mode, or site data blocked. Nothing to migrate; the account is the record now.
    return false;
  }
}

function clearLegacy(): void {
  try {
    window.localStorage.removeItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY);
  } catch {
    // Nothing to do. The account has the dismissal, which is the copy that matters.
  }
}

export function useDismissibleImportPrompt() {
  const { state, ready, dismissStep } = useOnboardingState();
  const step = state.steps.import;
  const dismissed = step.dismissed || step.done;

  useEffect(() => {
    // Only once the account's own copy has arrived: pushing a device flag before then would be
    // guessing at what the account already says. The merge is monotonic, so this can only ever
    // add a dismissal the reader really made.
    if (!ready || dismissed) return;
    if (!readLegacy()) return;
    dismissStep('import');
    clearLegacy();
  }, [ready, dismissed, dismissStep]);

  return {
    dismissed,
    /** False until the account's copy has arrived, so the row cannot flash and then vanish. */
    ready,
    dismiss: () => dismissStep('import'),
  };
}

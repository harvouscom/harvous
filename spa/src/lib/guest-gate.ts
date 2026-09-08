/**
 * What to do when a guest asks for something that needs an account.
 *
 * Guest mode's rule is that nothing the visitor does inside the app interrupts them — no timed
 * prompt, no modal after the third highlight. This is not an exception to that rule: they
 * pressed the button. Answering a request is the one moment an offer is not an interruption,
 * and it is also the only moment the offer is specific — "notes need an account" lands where a
 * standing banner asking the same thing does not.
 *
 * A toast rather than a dialog, because the sanctioned pattern for ephemeral feedback here is
 * the floating toast (`PrototypeBanner` is deprecated, and a scrim over the reader for a button
 * that did nothing would be a bigger interruption than the thing it is explaining).
 */
import { showPrototypeFeedbackToast } from '@/utils/prototype-feedback-toast';
import { guestSignUpHref, leaveForSignUp } from './guest-signup';

/**
 * @param what The thing they just tried, as a sentence subject — "Writing notes", "Search".
 */
export function offerGuestAccount(what: string): void {
  showPrototypeFeedbackToast(`${what} needs a free account`, 'info', {
    action: {
      label: 'Create one',
      onAction: () => {
        leaveForSignUp();
        window.location.href = guestSignUpHref();
      },
    },
  });
}

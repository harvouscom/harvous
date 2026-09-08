/**
 * The one moment guest mode speaks up on its own: on the way out.
 *
 * Nothing a guest does *inside* the app prompts them — no timer, no nag after the third
 * highlight, no modal between them and a verse. That rule is what makes the mode worth having,
 * and it leaves exactly one honest opening: leaving. Someone with a hand on the tab is the only
 * person for whom "this is saved on this device only" is news they can still act on.
 *
 * **What is actually detectable, and what is not.** `beforeunload` cannot render anything — it
 * can only raise the browser's own "Leave site?" dialog, and here that dialog would be a lie:
 * IndexedDB survives a tab close, so nothing is lost by leaving. What loses the work is a
 * different browser, a cleared cache, a phone. So this watches the two things that *can* carry
 * a real sentence:
 *
 * - **Exit intent** — the pointer leaving the top edge, heading for the tab bar or the address
 *   bar. Mouse only; on a touchscreen there is no such gesture and inventing one would fire on
 *   ordinary scrolling.
 * - **Arm on hide** — a tab switch sets a flag, and the prompt is waiting when they come back.
 *   This is the honest version of "detect the tab closing": we cannot speak during unload, but
 *   we can be there on return.
 *
 * Once per visit, and only for someone who has actually made something.
 *
 * **A toast, not a dialog.** The first build of this used `ProtoConfirmDialog` and it rendered
 * a red trash button next to the invitation, because that primitive is for destructive
 * confirmations and says so in its own markup. Past the wrong icon, a dialog was the wrong
 * shape anyway: it takes focus and demands an answer from someone whose hand is already on the
 * tab. A persistent toast with one action says the same sentence, and looking away is a valid
 * reply to it.
 */
import { useEffect } from 'react';
import { PROTO_GUEST_EXIT_PROMPT_KEY } from '../layouts/proto-session-keys';
import { guestStoreCounts } from '../lib/guest-store';
import { guestSignUpHref, isLeavingForSignUp, leaveForSignUp } from '../lib/guest-signup';
import { showPrototypeFeedbackToast } from '@/utils/prototype-feedback-toast';

/** Their actual work, counted — "1 highlight" is about them; "your data" is about software. */
function madeSoFar(): string {
  const { notes, highlights } = guestStoreCounts();
  const parts: string[] = [];
  if (highlights > 0) parts.push(`${highlights} highlight${highlights === 1 ? '' : 's'}`);
  if (notes > 0) parts.push(`${notes} note${notes === 1 ? '' : 's'}`);
  return parts.join(' and ');
}

function alreadyAsked(): boolean {
  try {
    return sessionStorage.getItem(PROTO_GUEST_EXIT_PROMPT_KEY) === '1';
  } catch {
    /* private mode — better to ask nobody than to ask on every pointer twitch */
    return true;
  }
}

function markAsked(): void {
  try {
    sessionStorage.setItem(PROTO_GUEST_EXIT_PROMPT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function useGuestExitPrompt(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    /** Every path in agrees on these, so a guest can never be asked twice or asked for nothing. */
    function shouldAsk(): boolean {
      if (alreadyAsked()) return false;
      // Leaving because they said yes — asking again on the way to the signup page is absurd.
      if (isLeavingForSignUp()) return false;
      return guestStoreCounts().total > 0;
    }

    function ask() {
      if (!shouldAsk()) return;
      markAsked();
      const made = madeSoFar();
      const plural = made.includes(' and ');
      showPrototypeFeedbackToast(
        `${made} ${plural ? 'are' : 'is'} saved on this device only`,
        'info',
        {
          // Persistent: they are on their way out, and a message that vanishes in four seconds
          // is one they will not be looking at.
          persistent: true,
          action: {
            label: 'Keep it',
            onAction: () => {
              leaveForSignUp();
              window.location.href = guestSignUpHref();
            },
          },
        },
      );
    }

    /*
     * `relatedTarget === null` is the browser saying the pointer went somewhere that is not the
     * document at all — browser chrome, or off the window. Paired with a y at or above the top
     * edge, that is the tab strip and the address bar, and nothing else.
     */
    function onMouseOut(event: MouseEvent) {
      if (event.relatedTarget !== null) return;
      if (event.clientY > 0) return;
      ask();
    }

    let armed = false;
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        // Do not ask now — nothing renders in a hidden tab, and the ask would be spent unseen.
        armed = shouldAsk();
        return;
      }
      if (armed) {
        armed = false;
        ask();
      }
    }

    const finePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    if (finePointer) document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}

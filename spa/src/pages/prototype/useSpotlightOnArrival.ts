/**
 * The other half of `requestSpotlight`: play the glow once, on arrival.
 *
 * A checklist row that says "highlight a verse" and then drops you into a chapter has done
 * only half its job — the reader looks the same as it always does, and the thing it was
 * pointing at is one affordance among thirty. The glow says *that one*.
 *
 * Deliberately cheap: no portal, no overlay, no measuring. The target keeps a
 * `data-proto-spotlight` attribute, this adds a class for one animation, and the class comes
 * off on `animationend`. Nothing is left behind for the rest of the session, and a screen
 * nobody was sent to pays a `sessionStorage.getItem` on mount.
 */
import { useEffect } from 'react';
import { PROTO_SPOTLIGHT_KEY } from '../../layouts/proto-session-keys';

export const SPOTLIGHT_CLASS = 'proto-spotlight-glow';

function takeRequestedSpotlight(): string | null {
  try {
    const value = sessionStorage.getItem(PROTO_SPOTLIGHT_KEY);
    if (value) sessionStorage.removeItem(PROTO_SPOTLIGHT_KEY);
    return value;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Glow a target that is already on screen, scrolling it into view first.
 *
 * The same gesture as the arrival path, minus the trip — a checklist row pointing at
 * something further down the very page it lives on has nowhere to send anyone.
 */
export function spotlightNow(target: string): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>(`[data-proto-spotlight="${CSS.escape(target)}"]`);
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'nearest',
  });
  if (prefersReducedMotion()) return;
  const clear = () => el.classList.remove(SPOTLIGHT_CLASS);
  // Restart cleanly if the row is tapped twice — an animation class that is already on the
  // element does not replay just by being set again.
  el.classList.remove(SPOTLIGHT_CLASS);
  void el.offsetWidth;
  el.classList.add(SPOTLIGHT_CLASS);
  el.addEventListener('animationend', clear, { once: true });
}

/**
 * Glow the element carrying `data-proto-spotlight="<target>"`, if this navigation asked for it.
 *
 * `enabled` lets a caller wait for the content the target lives in — sending someone to a
 * chapter that has not rendered yet would consume the request and glow nothing.
 */
export function useSpotlightOnArrival(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const target = takeRequestedSpotlight();
    if (!target) return;
    // The request is consumed either way — a glow that cannot find its element is over, not
    // pending. Leaving it would fire on some unrelated screen later.
    if (prefersReducedMotion()) return;

    const el = document.querySelector<HTMLElement>(`[data-proto-spotlight="${CSS.escape(target)}"]`);
    if (!el) return;

    const clear = () => el.classList.remove(SPOTLIGHT_CLASS);
    el.classList.add(SPOTLIGHT_CLASS);
    el.addEventListener('animationend', clear, { once: true });
    return () => {
      el.removeEventListener('animationend', clear);
      clear();
    };
  }, [enabled]);
}

/**
 * A scan that was started but has no photo yet — kept so the app can pick it back up.
 *
 * Two ways a photo goes missing between "or scan a page" and the sheet:
 *
 *  - An installed iPhone PWA can be reloaded by iOS while the camera is up (memory pressure),
 *    and a photo taken through the browser is never saved to the camera roll — so it is gone,
 *    and the reader comes back to an app that has forgotten they were scanning.
 *  - The reader would rather use the Camera app itself, and leaves to do so.
 *
 * Either way the scan is remembered here (localStorage, so it outlives a reload; thirty minutes,
 * so it does not outlive the moment) and the app offers "Add the photo you just took" when the
 * reader is back. Choosing a photo, cancelling the picker, or "Not now" clears it.
 *
 * When to *say* so differs by route (`shouldOfferResume`). The Camera-app route is a promise to
 * come back, so it is offered at once. A scan started from the chooser is only offered after the
 * app has been reloaded — that is the failure it exists for. In the same session the chooser is
 * either still open or was cancelled, and iOS Safari sends no `cancel` event when the camera is
 * dismissed (seen in the iOS 26 Simulator), so "Add the photo you just took" would be a claim
 * about a photo that was never taken.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'harvous.scan.pending';
const HINT_KEY = 'harvous.scan.cameraAppHintSeen';
const TTL_MS = 30 * 60 * 1000;

type Pending = { startedAt: number; via: 'picker' | 'camera-app' };

let pending: Pending | null = read();
/** The pending scan came back from storage — the app was reloaded while it was outstanding. */
let restored = Boolean(pending);
/** A blank note is on screen and will show the waiting prompt itself. */
let blankNoteOffers = 0;
const listeners = new Set<() => void>();

function read(): Pending | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Pending;
    if (!value?.startedAt || Date.now() - value.startedAt > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function emit() {
  snapshot = { pending, blankNoteOffers, restored };
  listeners.forEach((listener) => listener());
}

let snapshot = { pending, blankNoteOffers, restored };

/** Whether "Add the photo you just took" is true enough to say now — see the file comment. */
export function shouldOfferResume(state: { pending: Pending | null; restored: boolean }): boolean {
  return Boolean(state.pending) && (state.pending!.via === 'camera-app' || state.restored);
}

export function markScanPending(via: Pending['via']): void {
  pending = { startedAt: Date.now(), via };
  restored = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    /* private mode: the in-memory copy still covers leaving and coming back */
  }
  emit();
}

export function clearScanPending(): void {
  if (!pending) return;
  pending = null;
  restored = false;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Re-read on return to the app: another tab, or the expiry, may have changed it. */
export function refreshScanPending(): void {
  const next = read();
  if (next?.startedAt === pending?.startedAt) return;
  pending = next;
  emit();
}

export function registerBlankNoteOffer(): () => void {
  blankNoteOffers += 1;
  emit();
  return () => {
    blankNoteOffers -= 1;
    emit();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current state, outside React — what `useScanPending` subscribes to. */
export function getScanPendingSnapshot() {
  return snapshot;
}

export function useScanPending() {
  return useSyncExternalStore(subscribe, getScanPendingSnapshot, getScanPendingSnapshot);
}

/**
 * iPhone and iPad, where the browser's own camera cannot hand back to the photo library and an
 * installed app can be reloaded while it is up — the one place the Camera-app route is worth
 * offering in words.
 */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

/** The Camera-app line is said until the reader has finished one scan. */
export function cameraAppHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markCameraAppHintSeen(): void {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}

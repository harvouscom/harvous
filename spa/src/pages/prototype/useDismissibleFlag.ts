/**
 * One-time Home chrome: shown until it is put away, remembered on this device.
 *
 * The founder letter and the install card each grew their own copy of this — same
 * `readFlag`/`writeFlag` pair, same dev-preview escape hatch, written twice. The onboarding
 * dock would have made it three times.
 *
 * Device-local on purpose, for now. A cross-device version of "I dismissed this" is exactly
 * what `UserMetadata.onboardingState` does for the checklist; these two are cheap enough
 * that reappearing on a new browser is a shrug rather than a bug.
 */
import { releaseMarkerFor } from '@/utils/release-marker';
import { useCallback, useEffect, useState } from 'react';

export function readDismissFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeDismissFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export interface DismissibleFlagOptions {
  /** Dev-only key that forces the surface back for UI testing. */
  previewKey?: string;
  /**
   * Extra condition for showing at all — an install card that is already installed, a
   * mobile-only card on a desktop. Re-checked whenever it changes.
   */
  eligible?: boolean;
}

/**
 * `[visible, dismiss]` for a one-time surface.
 *
 * Visibility resolves in an effect rather than during render so the first paint is always
 * "not shown": reading localStorage while rendering would make the card flash in and out
 * for anyone who had dismissed it.
 */
export function useDismissibleFlag(
  dismissedKey: string,
  { previewKey, eligible = true }: DismissibleFlagOptions = {},
): [boolean, () => void] {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!eligible) {
      setVisible(false);
      return;
    }
    if (import.meta.env.DEV && previewKey && readDismissFlag(previewKey)) {
      setVisible(true);
      return;
    }
    setVisible(!readDismissFlag(dismissedKey));
  }, [dismissedKey, previewKey, eligible]);

  const dismiss = useCallback(() => {
    writeDismissFlag(dismissedKey);
    setVisible(false);
  }, [dismissedKey]);

  return [visible, dismiss];
}

function readDismissedMarker(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * `[visible, dismiss]` for a notice that returns when there is something new to say.
 *
 * `useDismissibleFlag` above stores yes-or-no, which is right for the founder letter and the
 * install card: each is one message, said once. A "what's new" notice is a *channel*, with
 * something different to say after every release, so a boolean would turn the first dismissal
 * into an unsubscribe from every future one. Storing which release was dismissed keeps the
 * gesture meaning what the reader meant by it: not this one, rather than none of them.
 *
 * Callers pass the raw version and `releaseMarkerFor` decides what counts as a change, because
 * that judgement belongs with the storage rather than at each call site.
 *
 * Invisible when there is no version to compare — a build with no `__APP_VERSION__` cannot
 * honestly claim to have news, and showing an undismissable notice would be worse than
 * showing none.
 */
export function useDismissibleRelease(
  dismissedKey: string,
  version: string | undefined | null,
  { previewKey, eligible = true }: DismissibleFlagOptions = {},
): [boolean, () => void] {
  const marker = releaseMarkerFor(version);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!eligible || !marker) {
      setVisible(false);
      return;
    }
    if (import.meta.env.DEV && previewKey && readDismissFlag(previewKey)) {
      setVisible(true);
      return;
    }
    setVisible(readDismissedMarker(dismissedKey) !== marker);
  }, [dismissedKey, previewKey, eligible, marker]);

  const dismiss = useCallback(() => {
    if (!marker) return;
    try {
      localStorage.setItem(dismissedKey, marker);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, [dismissedKey, marker]);

  return [visible, dismiss];
}

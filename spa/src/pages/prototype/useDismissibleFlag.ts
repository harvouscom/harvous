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

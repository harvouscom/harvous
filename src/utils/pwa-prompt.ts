/**
 * PWA install prompt: when to show and storage keys.
 * Only run when !isPWA() (caller must check).
 */

export const PWA_PROMPT_FROM_JOIN_KEY = 'harvous_show_pwa_prompt_from_join';
export const PWA_PROMPT_LAST_DISMISSED_KEY = 'harvous_pwa_prompt_last_dismissed';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type PwaPromptReason = 'from_join' | 'first_visit' | 'reminder';

export interface PwaPromptResult {
  show: boolean;
  reason?: PwaPromptReason;
}

/**
 * Returns whether to show the PWA install prompt and the reason.
 * Call only when !isPWA().
 */
export function shouldShowPwaPrompt(): PwaPromptResult {
  try {
    if (sessionStorage.getItem(PWA_PROMPT_FROM_JOIN_KEY) === '1') {
      return { show: true, reason: 'from_join' };
    }
    const lastDismissed = localStorage.getItem(PWA_PROMPT_LAST_DISMISSED_KEY);
    if (!lastDismissed) {
      return { show: true, reason: 'first_visit' };
    }
    const parsed = Date.parse(lastDismissed);
    if (Number.isNaN(parsed)) return { show: false };
    if (Date.now() - parsed >= THIRTY_DAYS_MS) {
      return { show: true, reason: 'reminder' };
    }
    return { show: false };
  } catch {
    return { show: false };
  }
}

export function setPwaPromptLastDismissed(): void {
  try {
    localStorage.setItem(PWA_PROMPT_LAST_DISMISSED_KEY, new Date().toISOString());
  } catch (_) {}
}

export function clearPwaPromptFromJoinFlag(): void {
  try {
    sessionStorage.removeItem(PWA_PROMPT_FROM_JOIN_KEY);
  } catch (_) {}
}

/**
 * Returns true if the device is considered mobile (phone or tablet).
 * Used to show the PWA install toast only on mobile, not desktop.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (ua.userAgentData?.mobile === true) return true;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

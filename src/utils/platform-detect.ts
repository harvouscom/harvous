export type InstallPlatform = 'ios' | 'android' | 'other';

/**
 * iPhone, iPod, or iPad — including iPadOS, which reports a desktop Mac user agent
 * ("Macintosh") and is told apart only by having a touch screen. Every `/iPhone|iPad/`
 * check missed iPads, so the installed-PWA fixes, sheet insets and iOS install
 * instructions never reached them.
 */
export function isAppleTouchUserAgent(ua: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isAppleTouchUserAgent(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

/** Platform for PWA install instructions — iOS takes precedence when both match (rare). */
export function getInstallPlatform(): InstallPlatform {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'other';
}

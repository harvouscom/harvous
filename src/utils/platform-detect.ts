export type InstallPlatform = 'ios' | 'android' | 'other';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
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

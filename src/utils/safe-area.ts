/**
 * iOS PWA: env(safe-area-inset-top) is unreliable in CSS (0 or bogus large values).
 * Reading padding-top via getComputedStyle on a probe matches what WebKit actually applies.
 * See https://bugs.webkit.org/show_bug.cgi?id=274773
 */

export function getSafeAreaTopPx(): number {
  if (typeof document === 'undefined') return 0;

  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);';
  document.documentElement.appendChild(el);
  let v = parseFloat(getComputedStyle(el).paddingTop) || 0;
  document.documentElement.removeChild(el);

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches);

  if (isIOS && isStandalone && (v <= 0 || v >= 64)) {
    const h = window.screen.height;
    v = h >= 852 ? 59 : h >= 812 ? 47 : 20;
  } else if (v >= 64) {
    v = Math.min(v, 59);
  }

  return v;
}

export function syncSafeAreaTopCssVar(): void {
  document.documentElement.style.setProperty('--safe-area-top', `${getSafeAreaTopPx()}px`);
}

export function subscribeSafeAreaTopCssVar(): () => void {
  const handler = () => syncSafeAreaTopCssVar();
  window.addEventListener('resize', handler);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handler);
  }
  return () => {
    window.removeEventListener('resize', handler);
    window.visualViewport?.removeEventListener('resize', handler);
  };
}

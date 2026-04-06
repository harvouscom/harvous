/**
 * Sheet / modal scrim top inset for iOS standalone PWA.
 *
 * Contract: scrims align to the bottom edge of the **system status bar** only
 * (we do not add the 64px mobile nav height on top of safe-area). WebKit often
 * reports env(safe-area-inset-top) as 0 in installed PWAs; we read the same
 * env via a padding probe and fall back to screen-size heuristics when needed.
 *
 * @see docs/troubleshooting/IOS_PWA_SHEET_OVERLAY_SAFE_AREA.md
 */

const MOBILE_MQ = '(max-width: 1159px)';

function isIosPwa(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('ios-pwa');
}

function isMobileLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches;
}

let probeEl: HTMLDivElement | null = null;

function getSafeAreaTopProbeEl(): HTMLDivElement {
  if (!probeEl) {
    probeEl = document.createElement('div');
    probeEl.setAttribute('aria-hidden', 'true');
    probeEl.style.cssText =
      'position:absolute;left:-9999px;top:0;width:1px;height:1px;padding:0;margin:0;border:0;overflow:hidden;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px);';
    document.body.appendChild(probeEl);
  }
  return probeEl;
}

/** Read safe-area top via computed padding (more reliable than getBoundingClientRect on fixed + env). */
export function readSafeAreaInsetTopPx(): number {
  const el = getSafeAreaTopProbeEl();
  return parseFloat(window.getComputedStyle(el).paddingTop) || 0;
}

/** When the probe matches env() and env is wrong, use rough bands for common iPhones. */
function heuristicIosPwaInsetTopPx(): number {
  const minDim = Math.min(window.screen.width, window.screen.height);
  const maxDim = Math.max(window.screen.width, window.screen.height);
  if (minDim >= 393 && maxDim >= 852) return 59;
  if (minDim >= 375 && maxDim >= 812) return 47;
  return 20;
}

function updateLayoutSheetBackdropVisibility(): void {
  const root = document.getElementById('layout-root');
  const backdrop = root?.querySelector('.layout-root-sheet-backdrop');
  if (!(backdrop instanceof HTMLElement)) return;

  const open = !!document.querySelector('.sheet-overlay[data-state="open"]');
  const show = isIosPwa() && isMobileLayout() && open;
  backdrop.classList.toggle('layout-root-sheet-backdrop--visible', show);
}

export function syncSheetOverlayTopCssVar(): void {
  if (!isIosPwa()) {
    document.documentElement.style.removeProperty('--sheet-overlay-top');
    updateLayoutSheetBackdropVisibility();
    return;
  }

  const probe = readSafeAreaInsetTopPx();
  const px = probe > 0 && probe < 64 ? probe : heuristicIosPwaInsetTopPx();
  document.documentElement.style.setProperty('--sheet-overlay-top', `${px}px`);
  updateLayoutSheetBackdropVisibility();
}

export function subscribeSheetOverlayInset(): () => void {
  const run = () => syncSheetOverlayTopCssVar();
  run();

  const vv = window.visualViewport;
  vv?.addEventListener('resize', run);
  vv?.addEventListener('scroll', run);
  window.addEventListener('orientationchange', run);
  window.addEventListener('resize', run);

  const mq = window.matchMedia(MOBILE_MQ);
  mq.addEventListener('change', run);

  const mo = new MutationObserver(run);
  mo.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state'],
  });

  return () => {
    vv?.removeEventListener('resize', run);
    vv?.removeEventListener('scroll', run);
    window.removeEventListener('orientationchange', run);
    window.removeEventListener('resize', run);
    mq.removeEventListener('change', run);
    mo.disconnect();
    document.documentElement.style.removeProperty('--sheet-overlay-top');
    const root = document.getElementById('layout-root');
    const backdrop = root?.querySelector('.layout-root-sheet-backdrop');
    if (backdrop instanceof HTMLElement) {
      backdrop.classList.remove('layout-root-sheet-backdrop--visible');
    }
  };
}

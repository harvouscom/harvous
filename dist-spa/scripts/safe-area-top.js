/**
 * Runs before React. Sets --safe-area-top using getComputedStyle (padding probe).
 * Duplicates logic in src/utils/safe-area.ts — keep in sync when changing heuristics.
 */
(function () {
  function getPx() {
    var el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);';
    document.documentElement.appendChild(el);
    var v = parseFloat(window.getComputedStyle(el).paddingTop) || 0;
    document.documentElement.removeChild(el);
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    var isIOS = /iPhone|iPad|iPod/.test(ua);
    var standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
    if (isIOS && standalone && (v <= 0 || v >= 64)) {
      var h = window.screen.height;
      v = h >= 852 ? 59 : h >= 812 ? 47 : 20;
    } else if (v >= 64) {
      v = Math.min(v, 59);
    }
    return v;
  }
  function sync() {
    document.documentElement.style.setProperty('--safe-area-top', getPx() + 'px');
  }
  sync();
  window.addEventListener('resize', sync);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', sync);
  }
})();

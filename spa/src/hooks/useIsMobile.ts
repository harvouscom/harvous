import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 1159px)';

/**
 * Returns true when viewport width is in the mobile range (≤1159px).
 * Matches layout.css and the AppLayout mobile layout breakpoint.
 *
 * This is CLASSIC's breakpoint, and it is not the prototype's.
 *
 * The prototype shell, the note-route keyboard layout, and every adaptive sheet use 899px
 * (`MOBILE_MQ` in `layouts/proto-shell-context.tsx`). The two disagree across a 260px band,
 * which is exactly where a mixed-breakpoint surface goes wrong: the shell still calls itself
 * desktop while a component asking here has already switched to mobile. For anything in
 * `pages/prototype/`, read `isMobileSidebar` from `useProtoShell()` — and for sheet-vs-popover
 * specifically, `useSheetPresentation()`, which pairs it with pointer type.
 *
 * Currently unreferenced; kept for Classic surfaces that still measure against 1159px.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_BREAKPOINT).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handle = () => setIsMobile(mql.matches);
    mql.addEventListener('change', handle);
    return () => mql.removeEventListener('change', handle);
  }, []);

  return isMobile;
}

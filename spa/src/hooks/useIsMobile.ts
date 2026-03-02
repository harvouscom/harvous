import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = '(max-width: 1159px)';

/**
 * Returns true when viewport width is in the mobile range (≤1159px).
 * Matches layout.css and AppLayout mobile layout breakpoint.
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

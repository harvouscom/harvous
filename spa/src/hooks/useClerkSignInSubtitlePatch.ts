import { useEffect } from 'react';

/** Classic sign-in only: Clerk CDN subtitle copy varies by environment. */
export function useClerkSignInSubtitlePatch(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const target = "Enter your email and we'll get you signed in.";
    const patch = () => {
      const el = document.querySelector('.cl-headerSubtitle');
      if (el && el.textContent !== target) el.textContent = target;
    };
    const observer = new MutationObserver(patch);
    observer.observe(document.body, { childList: true, subtree: true });
    patch();
    return () => observer.disconnect();
  }, [enabled]);
}

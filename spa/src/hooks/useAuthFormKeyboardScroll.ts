import { useEffect } from 'react';

function isAuthFormInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && !!el.closest('.harvous-auth-form');
}

function scrollAuthInputIntoView() {
  const el = document.activeElement;
  if (!isAuthFormInput(el)) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
  });
}

/** Keeps auth form inputs reachable when the mobile keyboard overlays the page. */
export function useAuthFormKeyboardScroll() {
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (!isAuthFormInput(e.target)) return;
      scrollAuthInputIntoView();
    };

    const onViewportChange = () => {
      scrollAuthInputIntoView();
    };

    document.addEventListener('focusin', onFocusIn);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', onViewportChange);
    viewport?.addEventListener('scroll', onViewportChange);

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      viewport?.removeEventListener('resize', onViewportChange);
      viewport?.removeEventListener('scroll', onViewportChange);
    };
  }, []);
}

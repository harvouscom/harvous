import React, { useState, useEffect, useRef } from 'react';
import { toast } from '@/utils/toast';

interface CreateNoteButtonProps {
  className?: string;
}

const SPACER_ATTR = 'data-cta-spacer';

export default function CreateNoteButton({ className = '' }: CreateNoteButtonProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isNewNotePanelOpen, setIsNewNotePanelOpen] = useState(false);
  const [noteLimitReached, setNoteLimitReached] = useState(false);
  const [noteLimit, setNoteLimit] = useState(200);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEditModeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsEditMode(detail?.editing === true);
    };
    window.addEventListener('contentEditModeChange', handleEditModeChange);
    return () => window.removeEventListener('contentEditModeChange', handleEditModeChange);
  }, []);

  useEffect(() => {
    const isDesktop = () => window.matchMedia('(min-width: 1160px)').matches;

    // Check localStorage on mount so state survives navigation
    if (isDesktop() && localStorage.getItem('showNewNotePanel') === 'true') {
      setIsNewNotePanelOpen(true);
    }

    const handleOpen = () => { if (isDesktop()) setIsNewNotePanelOpen(true); };
    const handleClose = () => setIsNewNotePanelOpen(false);
    window.addEventListener('openNewNotePanel', handleOpen);
    window.addEventListener('closeNewNotePanel', handleClose);
    window.addEventListener('closeAllPanels', handleClose);
    return () => {
      window.removeEventListener('openNewNotePanel', handleOpen);
      window.removeEventListener('closeNewNotePanel', handleClose);
      window.removeEventListener('closeAllPanels', handleClose);
    };
  }, []);

  // Inject a spacer inside the card's content area so the last item
  // can scroll above this floating button. Remove when button is hidden.
  useEffect(() => {
    if (isEditMode || isNewNotePanelOpen) return;
    const btn = btnRef.current;
    if (!btn) return;
    const body = btn.closest('.main-column__body') || btn.closest('.mobile-main__body');
    if (!body) return;
    const target =
      body.querySelector('.card-stack__inner-content') ||
      body.querySelector('.main-column__scroll');
    if (!target) return;
    if (target.querySelector(`[${SPACER_ATTR}]`)) return;
    const spacer = document.createElement('div');
    spacer.setAttribute(SPACER_ATTR, '');
    spacer.style.height = '68px';
    spacer.style.flexShrink = '0';
    spacer.style.pointerEvents = 'none';
    target.appendChild(spacer);
    return () => { spacer.remove(); };
  }, [isEditMode, isNewNotePanelOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/subscription/status', { credentials: 'include', cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const limit = data.limit ?? 200;
        const atLimit = !data.hasUnlimited && (data.currentCount ?? 0) >= limit;
        setNoteLimit(limit);
        setNoteLimitReached(atLimit);
      } catch {
        if (!cancelled) {
          setNoteLimitReached(false);
          setNoteLimit(200);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleClick = () => {
    if (noteLimitReached) {
      toast.warning(`You've used all ${noteLimit.toLocaleString()} notes. Upgrade for unlimited.`);
      return;
    }
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
  };

  if (isEditMode || isNewNotePanelOpen) {
    return null;
  }

  return (
    <button
      ref={btnRef}
      type="button"
      className={`btn btn--lg btn--primary create-note-button ${className}`}
      onClick={handleClick}
      aria-label="Add a note"
    >
      <div className="btn__content">Add a note</div>
      <div className="btn__shadow-overlay" />
    </button>
  );
}

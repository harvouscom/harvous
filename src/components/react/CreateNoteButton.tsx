import React, { useState, useEffect, useRef } from 'react';
import { toast } from '@/utils/toast';

interface CreateNoteButtonProps {
  className?: string;
  /** When set (e.g. on space page), click opens Add to Space panel instead of New Note panel */
  addToSpaceSpaceId?: string | null;
}

const SPACER_ATTR = 'data-cta-spacer';

export default function CreateNoteButton({ className = '', addToSpaceSpaceId = null }: CreateNoteButtonProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isNewNotePanelOpen, setIsNewNotePanelOpen] = useState(false);
  const [isAddToSpacePanelOpen, setIsAddToSpacePanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteLimitReached, setNoteLimitReached] = useState(false);
  const [noteLimit, setNoteLimit] = useState(200);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    const handleAddToSpaceOpen = () => setIsAddToSpacePanelOpen(true);
    const handleAddToSpaceClose = () => setIsAddToSpacePanelOpen(false);
    const handleCloseAll = () => {
      setIsNewNotePanelOpen(false);
      setIsAddToSpacePanelOpen(false);
    };
    window.addEventListener('openNewNotePanel', handleOpen);
    window.addEventListener('closeNewNotePanel', handleClose);
    window.addEventListener('openAddToSpacePanel', handleAddToSpaceOpen);
    window.addEventListener('closeAddToSpacePanel', handleAddToSpaceClose);
    window.addEventListener('closeAllPanels', handleCloseAll);
    return () => {
      window.removeEventListener('openNewNotePanel', handleOpen);
      window.removeEventListener('closeNewNotePanel', handleClose);
      window.removeEventListener('openAddToSpacePanel', handleAddToSpaceOpen);
      window.removeEventListener('closeAddToSpacePanel', handleAddToSpaceClose);
      window.removeEventListener('closeAllPanels', handleCloseAll);
    };
  }, []);

  // Close CTA menu when other menus open or when clicking outside / Escape
  useEffect(() => {
    if (!addToSpaceSpaceId) return;
    const handleCloseMoreMenu = () => setMenuOpen(false);
    window.addEventListener('closeMoreMenu', handleCloseMoreMenu);
    return () => window.removeEventListener('closeMoreMenu', handleCloseMoreMenu);
  }, [addToSpaceSpaceId]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  // Inject a spacer inside the card's content area so the last item
  // can scroll above this floating button. Remove when button is hidden.
  // MutationObserver fallback handles SPA where Outlet content mounts after this effect runs.
  useEffect(() => {
    if (isEditMode || isNewNotePanelOpen || isAddToSpacePanelOpen) return;
    const btn = btnRef.current;
    if (!btn) return;
    const body = btn.closest('.main-column__body') || btn.closest('.mobile-main__body');
    if (!body) return;

    let spacer: HTMLDivElement | null = null;
    let observer: MutationObserver | null = null;

    const inject = () => {
      // Only inject into card content so spacer sits at bottom (reserve space above CTA).
      // Do not fall back to .main-column__scroll — that would prepend the spacer and create a 64px gap above the card.
      const target = body.querySelector('.card-stack__inner-content');
      if (!target) return false;
      // Do not inject into empty or loading card (e.g. SpacePage loading state). Only inject when real content exists.
      if (!target.querySelector('.content-tabs') && !target.querySelector(`[${SPACER_ATTR}]`)) return false;
      if (target.querySelector(`[${SPACER_ATTR}]`)) return true;
      spacer = document.createElement('div');
      spacer.setAttribute(SPACER_ATTR, '');
      spacer.style.height = '64px';
      spacer.style.flexShrink = '0';
      spacer.style.pointerEvents = 'none';
      target.appendChild(spacer);
      return true;
    };

    if (!inject()) {
      observer = new MutationObserver(() => {
        if (inject() && observer) {
          observer.disconnect();
          observer = null;
        }
      });
      observer.observe(body, { childList: true, subtree: true });
    }

    return () => {
      spacer?.remove();
      observer?.disconnect();
    };
  }, [isEditMode, isNewNotePanelOpen, isAddToSpacePanelOpen]);

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
    if (addToSpaceSpaceId) {
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
      setMenuOpen(true);
      return;
    }
    if (noteLimitReached) {
      toast.warning(`You've used all ${noteLimit.toLocaleString()} notes. Upgrade for unlimited.`);
      return;
    }
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
  };

  const handleAddNote = () => {
    if (noteLimitReached) {
      toast.warning(`You've used all ${noteLimit.toLocaleString()} notes. Upgrade for unlimited.`);
      return;
    }
    setMenuOpen(false);
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
  };

  const handleAddToSpace = () => {
    if (!addToSpaceSpaceId) return;
    setMenuOpen(false);
    window.dispatchEvent(new CustomEvent('openAddToSpacePanel', { detail: { spaceId: addToSpaceSpaceId } }));
  };

  if (isEditMode || isNewNotePanelOpen || isAddToSpacePanelOpen) {
    return null;
  }

  return (
    <div ref={wrapperRef} className={`create-note-button-wrapper ${className}`.trim()}>
      {addToSpaceSpaceId && menuOpen && (
        <div
          className="create-note-button-menu-container"
          style={{ position: 'absolute', bottom: 'calc(100% + 12px)', left: 0, right: 0 }}
        >
          <div
            className="menu create-note-button-menu menu-enter"
            role="menu"
            aria-label="Add options"
          >
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={handleAddNote}
            >
              <span className="menu-item__label">Add a note</span>
            </button>
            <div className="menu-separator" />
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={handleAddToSpace}
            >
              <span className="menu-item__label">Add to space</span>
            </button>
          </div>
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        className={`btn btn--lg ${addToSpaceSpaceId && menuOpen ? 'btn--secondary' : 'btn--primary'} create-note-button${addToSpaceSpaceId && menuOpen ? ' create-note-button--menu-open' : ''}`}
        onClick={handleClick}
        onMouseDown={(e) => {
          if (addToSpaceSpaceId && menuOpen) e.stopPropagation();
        }}
        aria-label={addToSpaceSpaceId && menuOpen ? 'Close' : 'Add a note'}
        aria-expanded={addToSpaceSpaceId ? menuOpen : undefined}
        aria-haspopup={addToSpaceSpaceId ? 'menu' : undefined}
      >
        <div className="btn__content">{addToSpaceSpaceId && menuOpen ? 'Close' : 'Add a note'}</div>
        <div className="btn__shadow-overlay" />
      </button>
    </div>
  );
}

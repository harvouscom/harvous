import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import { safeGetItem } from '@/utils/safe-storage';
import { idToUrl } from '@/utils/url-helpers';
import { setSelectedSpaceId } from './selectedSpace';

interface SpaceLike {
  id: string;
  title: string;
}

interface SpaceSwitcherDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
  spaces: SpaceLike[];
  currentSpaceId?: string | null;
}

const SpaceSwitcherDropdown: React.FC<SpaceSwitcherDropdownProps> = ({
  isOpen,
  onClose,
  anchorRect,
  spaces,
  currentSpaceId = null,
}) => {
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const closedSpaceIds = useMemo(() => {
    if (typeof window === 'undefined' || !isOpen) return new Set<string>();
    try {
      const stored = safeGetItem('harvous-closed-navigation-items');
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
      return new Set<string>(ids);
    } catch {
      return new Set<string>();
    }
  }, [isOpen]);

  const items = useMemo(() => {
    const spaceItems = spaces
      .filter((s) => !closedSpaceIds.has(s.id))
      .map((s) => ({ id: s.id, title: s.title, href: idToUrl(s.id) }));
    return [{ id: 'home', title: 'My Home', href: '/' }, ...spaceItems];
  }, [spaces, closedSpaceIds]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const handlePointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      // Ignore clicks on the space switcher toggle button itself
      const targetEl = target as unknown as HTMLElement;
      if (targetEl?.closest?.('.space-switcher-anchor__toggle')) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined' || !anchorRect) {
    return null;
  }

  const width = Math.max(260, anchorRect.width);
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 16);
  // Align dropdown with the button's left edge, but keep it within viewport.
  const left = Math.max(16, Math.min(anchorRect.left, window.innerWidth - width - 16));

  return (
    <>
      {createPortal(
        <div
          ref={dropdownRef}
          className="space-switcher-dropdown"
          style={{
            position: 'fixed',
            top,
            left,
            width,
            // Ensure it renders above all app chrome (toasts use 999999)
            zIndex: 1000000,
          }}
          role="dialog"
          aria-label="Switch space"
        >
          <div className="space-switcher-dropdown__panel">
            <div className="space-switcher-dropdown__scroll">
            {items.map((item) => {
              const isHome = item.id === 'home';
              const isActive = isHome ? !currentSpaceId : item.id === currentSpaceId;

              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`space-switcher-dropdown__item ${isActive ? 'is-active' : ''}`}
                  onClick={() => onClose()}
                >
                  <span className="space-switcher-dropdown__label">{item.title}</span>
                  <span className="space-switcher-dropdown__icon-slot" aria-hidden="true">
                    {isActive ? (
                      <span className="space-switcher-dropdown__check" aria-hidden="true">
                        <Icon name="check" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                      </span>
                    ) : null}
                    {!isHome ? (
                      <button
                        type="button"
                        className="space-switcher-dropdown__close-btn"
                        aria-label={`Close ${item.title}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // Switch to Home if they closed the selected space
                          if (currentSpaceId === item.id) {
                            setSelectedSpaceId(null);
                            try {
                              import('app-navigate')
                                .then(({ navigate }) => navigate('/', { history: 'replace' }))
                                .catch(() => (window.location.href = '/'));
                            } catch {
                              window.location.href = '/';
                            }
                          }

                          try {
                            (window as any).removeFromNavigationHistory?.(item.id);
                          } catch {
                            // ignore
                          }

                          onClose();
                        }}
                      >
                        <Icon name="xmark" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                      </button>
                    ) : null}
                  </span>
                </a>
              );
            })}
            </div>
            <div className="space-switcher-dropdown__footer">
              <div className="space-switcher-dropdown__divider" />
              <a
                href="/new-space"
                className="space-switcher-dropdown__item space-switcher-dropdown__new-space"
                onClick={() => onClose()}
              >
                <span className="space-switcher-dropdown__label">New Space</span>
                <span className="space-switcher-dropdown__check" aria-hidden="true">
                  <Icon name="plus" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                </span>
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </>
  );
};

export default SpaceSwitcherDropdown;


import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';

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

  const items = useMemo(() => {
    const spaceItems = spaces.map((s) => ({ id: s.id, title: s.title, href: `/${s.id}` }));
    return [{ id: 'home', title: 'My Home', href: '/' }, ...spaceItems];
  }, [spaces]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
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
    window.addEventListener('touchstart', handlePointerDown);
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

  return createPortal(
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
              {isActive && (
                <span className="space-switcher-dropdown__check" aria-hidden="true">
                  <Icon name="check" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                </span>
              )}
            </a>
          );
        })}

        <div className="space-switcher-dropdown__divider" />
        <a href="/new-space" className="space-switcher-dropdown__item space-switcher-dropdown__new-space" onClick={() => onClose()}>
          <span className="space-switcher-dropdown__label">New Space</span>
          <span className="space-switcher-dropdown__check" aria-hidden="true">
            <Icon name="plus" size={16} style={{ color: 'var(--color-deep-grey)' }} />
          </span>
        </a>
      </div>
    </div>,
    document.body,
  );
};

export default SpaceSwitcherDropdown;


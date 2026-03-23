import React, { useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface DrawerProps {
  id?: string;
  title?: string;
  className?: string;
  children: ReactNode;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Drawer({
  id = "drawer",
  title = "Drawer",
  className = "",
  children,
  isOpen: externalIsOpen,
  onClose
}: DrawerProps) {
  const [isOpen, setIsOpen] = useState(externalIsOpen || false);

  // Listen for custom events if no external control
  useEffect(() => {
    if (externalIsOpen === undefined) {
      const handleShow = (event: CustomEvent) => {
        if (event.detail && event.detail.drawer === id) {
          setIsOpen(true);
        }
      };

      const handleHide = () => {
        setIsOpen(false);
      };

      window.addEventListener('show-drawer' as any, handleShow);
      window.addEventListener('hide-drawer' as any, handleHide);

      return () => {
        window.removeEventListener('show-drawer' as any, handleShow);
        window.removeEventListener('hide-drawer' as any, handleHide);
      };
    }
  }, [id, externalIsOpen]);

  // Sync external control
  useEffect(() => {
    if (externalIsOpen !== undefined) {
      setIsOpen(externalIsOpen);
    }
  }, [externalIsOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup on unmount
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      id={id}
      className={`drawer-overlay ${className} ${isOpen ? 'drawer-overlay--open' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className="drawer-inner">
        <div className="drawer-slide">
          <div className={`drawer-panel ${isOpen ? '' : 'drawer-panel--closed'}`}>
            <div className="drawer-body">
              <div className="drawer-header">
                <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                  <h2 className="text-subtitle" style={{ color: 'var(--color-deep-grey)' }}>{title}</h2>
                  <div className="flex-row" style={{ marginLeft: '0.75rem', height: '1.75rem', gap: 0 }}>
                    <button
                      onClick={handleClose}
                      className="close-icon"
                      style={{ color: 'var(--color-pebble-grey)' }}
                    >
                      <span className="sr-only">Close panel</span>
                      <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="drawer-content">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

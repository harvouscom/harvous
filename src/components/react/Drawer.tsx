import React, { useState, useEffect, ReactNode } from 'react';

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
      className={`fixed inset-0 z-50 overflow-hidden ${className} ${isOpen ? 'animate-fade-in' : 'animate-fade-out'}`}
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
          <div className={`pointer-events-auto w-screen max-w-md transform transition-transform duration-500 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl">
              <div className="px-4 sm:px-6">
                <div className="flex items-start justify-between">
                  <h2 className="text-lg font-medium text-gray-900">{title}</h2>
                  <div className="ml-3 flex h-7 items-center">
                    <button
                      onClick={handleClose}
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                      <span className="sr-only">Close panel</span>
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="relative mt-6 flex-1 px-4 sm:px-6">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .animate-fade-in {
          animation: fade-in 300ms ease-out;
        }
        .animate-fade-out {
          animation: fade-out 200ms ease-in;
        }
      `}</style>
    </div>
  );
}

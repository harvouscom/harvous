import { useEffect, useRef, useState, useCallback } from 'react';
import { Toaster, toast } from 'sonner';

export default function ToastProvider() {
  const portalInitialized = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Check if we're on mobile (same breakpoint as rest of codebase)
  // Also check for small screens (< 800px) for special toast styling
  const checkViewport = useCallback(() => {
    const width = window.innerWidth;
    setIsMobile(width < 1160);
    setIsSmallScreen(width < 800);
  }, []);

  // Check viewport on mount and resize
  useEffect(() => {
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, [checkViewport]);

  useEffect(() => {
    if (portalInitialized.current) return;
    
    // Force portal creation immediately - don't wait
    // Use an invisible toast to ensure portal is created without visual flash
    const initId = toast.success('', { 
      duration: 0, // Don't auto-dismiss
      icon: null,
      style: {
        opacity: 0,
        pointerEvents: 'none',
        position: 'fixed',
        left: '-9999px',
        top: '-9999px',
      },
    });
    portalInitialized.current = true;
    
    // Clean up immediately
    setTimeout(() => {
      toast.dismiss(initId);
    }, 50);
  }, []);

  // Base styles for all screen sizes
  const baseStyle = {
    backgroundColor: 'rgb(255, 255, 255)',
    background: 'linear-gradient(168.707deg, rgba(255, 255, 255, 1.0) 11.711%, rgb(248, 248, 248) 71.325%)',
    color: 'var(--color-deep-grey)',
    fontFamily: '"Reddit Sans", system-ui, -apple-system, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    borderRadius: '12px',
    boxShadow: '0px 7px 16px 0px rgba(0, 0, 0, 0.1), 0px 30px 30px 0px rgba(0, 0, 0, 0.09), 0px 67px 40px 0px rgba(0, 0, 0, 0.05), 0px 119px 47px 0px rgba(0, 0, 0, 0.01), 0px 185px 52px 0px rgba(0, 0, 0, 0)',
    padding: '16px 20px',
    textAlign: 'center',
    minWidth: '280px',
  };

  // Apply small screen specific styles
  const toastStyle = isSmallScreen
    ? {
        ...baseStyle,
        bottom: '48px',
        width: '90vw',
        minWidth: 'auto', // Remove minWidth constraint for small screens to allow 90% width
      }
    : baseStyle;

  return (
    <>
      <Toaster
        position={isMobile ? "bottom-center" : "bottom-right"}
        toastOptions={{
          duration: 1600,
          style: toastStyle,
          classNames: {
            toast: 'rounded-xl toast-center-text',
            title: 'font-semibold text-[16px] text-center',
          },
        }}
      />
      <style>{`
        /* Style Sonner action buttons to match btn btn--sm btn--primary design */
        [data-sonner-toaster] button[data-button],
        [data-sonner-toaster] [data-button],
        [data-sonner-toast] button[data-button],
        [data-sonner-toast] button[data-action] {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: var(--color-bold-blue) !important;
          color: white !important;
          border-radius: 1rem !important;
          padding: 0.75rem 1rem 1rem !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 39px !important;
          border: none !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: transform 0.3s, box-shadow 0.3s !important;
          will-change: transform, box-shadow !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
          margin-top: 8px !important;
        }
        
        [data-sonner-toaster] button[data-button] *,
        [data-sonner-toaster] [data-button] *,
        [data-sonner-toast] button[data-button] *,
        [data-sonner-toast] button[data-action] * {
          color: white !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
        }
        
        [data-sonner-toaster] button[data-button]:hover,
        [data-sonner-toaster] [data-button]:hover,
        [data-sonner-toast] button[data-button]:hover,
        [data-sonner-toast] button[data-action]:hover {
          background-color: var(--color-bold-blue) !important;
        }
        
        [data-sonner-toaster] button[data-button]:active,
        [data-sonner-toaster] [data-button]:active,
        [data-sonner-toast] button[data-button]:active,
        [data-sonner-toast] button[data-action]:active {
          transform: scale(0.98) !important;
          background-color: var(--color-navy) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }
      `}</style>
    </>
  );
}

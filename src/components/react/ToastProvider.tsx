import { useEffect, useRef, useState, useCallback } from 'react';
import { Toaster, toast } from 'sonner';

export default function ToastProvider() {
  const portalInitialized = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if we're on mobile (same breakpoint as rest of codebase)
  const checkMobile = useCallback(() => {
    const mobile = window.innerWidth < 1160;
    setIsMobile(mobile);
  }, []);

  // Check mobile on mount and resize
  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

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

  return (
    <Toaster
      position={isMobile ? "top-center" : "top-right"}
      toastOptions={{
        duration: 5000,
        style: {
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
          ...(isMobile ? {} : { minWidth: '280px' }),
        },
        classNames: {
          toast: 'rounded-xl toast-center-text',
          title: 'font-semibold text-[16px] text-center',
        },
      }}
    />
  );
}

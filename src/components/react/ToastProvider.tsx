import { useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';

export default function ToastProvider() {
  const portalInitialized = useRef(false);

  useEffect(() => {
    if (portalInitialized.current) return;
    
    // Force portal creation immediately - don't wait
    // Use a visible but very short toast to ensure portal is created
    const initId = toast.success('', { 
      duration: 100,
    });
    portalInitialized.current = true;
    
    // Clean up immediately
    setTimeout(() => {
      toast.dismiss(initId);
    }, 150);
  }, []);

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 5000,
        style: {
          background: 'linear-gradient(168.707deg, rgba(255, 255, 255, 0.8) 11.711%, rgb(248, 248, 248) 71.325%)',
          color: 'var(--color-deep-grey)',
          fontFamily: '"Reddit Sans", system-ui, -apple-system, sans-serif',
          fontSize: '16px',
          fontWeight: '600',
          borderRadius: '12px',
          boxShadow: '0px 7px 16px 0px rgba(0, 0, 0, 0.1), 0px 30px 30px 0px rgba(0, 0, 0, 0.09), 0px 67px 40px 0px rgba(0, 0, 0, 0.05), 0px 119px 47px 0px rgba(0, 0, 0, 0.01), 0px 185px 52px 0px rgba(0, 0, 0, 0)',
          padding: '16px 20px',
        },
        classNames: {
          toast: 'rounded-xl',
          title: 'font-semibold text-[16px]',
        },
      }}
    />
  );
}

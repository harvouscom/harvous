import { toast as sonnerToast } from 'sonner';
import { useEffect } from 'react';
import { Outlet } from '@tanstack/react-router';

export default function AuthLayout() {
  useEffect(() => {
    sonnerToast.dismiss();
  }, []);

  return (
    <div className="empty-layout">
      <Outlet />
    </div>
  );
}

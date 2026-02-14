import { Outlet } from '@tanstack/react-router';

export default function AuthLayout() {
  return (
    <div className="empty-layout">
      <Outlet />
    </div>
  );
}

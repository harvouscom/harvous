import { Outlet } from '@tanstack/react-router';

export default function PrototypeSpaceLayout() {
  return (
    <div className="proto-main-pane proto-theme" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Outlet />
    </div>
  );
}

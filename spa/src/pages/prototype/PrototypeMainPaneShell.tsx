import type { ReactNode } from 'react';

/** Matches former `PrototypeSpaceLayout` wrapping for inbox + note main cell. */
export default function PrototypeMainPaneShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="proto-main-pane proto-theme"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {children}
    </div>
  );
}

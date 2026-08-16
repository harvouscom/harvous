import type { ReactNode } from 'react';

/** Matches former `PrototypeSpaceLayout` wrapping for inbox + note main cell. */
export default function PrototypeMainPaneShell({
  children,
  className,
}: {
  children: ReactNode;
  /** Extra classes on the pane root — e.g. the reader's docked-inspector marker. */
  className?: string;
}) {
  return (
    <div
      className={`proto-main-pane proto-theme${className ? ` ${className}` : ''}`}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {children}
    </div>
  );
}

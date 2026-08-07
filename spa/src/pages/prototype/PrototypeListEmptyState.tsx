import type { ReactNode } from 'react';
import Icon from '@/components/react/Icon';

interface PrototypeListEmptyStateProps {
  iconName: string;
  title: string;
  description?: ReactNode;
  /**
   * The one thing to do about the emptiness, inside the stack rather than
   * beside it. A caller that renders its own button as a sibling gets a
   * left-aligned control under a centred column, and has to keep a heading
   * around to hang it off — which is how the same label ends up on screen
   * twice.
   */
  action?: ReactNode;
}

/** Sidebar list empty state — compact HarvousEmptyStateView (.compact) parity. */
export default function PrototypeListEmptyState({
  iconName,
  title,
  description,
  action,
}: PrototypeListEmptyStateProps) {
  return (
    <div className="proto-list-empty-state" role="status">
      <Icon name={iconName} size={28} className="proto-list-empty-state__icon" aria-hidden />
      <h2 className="proto-list-empty-state__title">{title}</h2>
      {description ? <div className="proto-list-empty-state__description">{description}</div> : null}
      {action ? <div className="proto-list-empty-state__action">{action}</div> : null}
    </div>
  );
}

/** Search/filter no-match — magnifying glass + title only. */
export function PrototypeListNoMatchEmptyState({ title }: { title: string }) {
  return <PrototypeListEmptyState iconName="magnifying-glass" title={title} />;
}

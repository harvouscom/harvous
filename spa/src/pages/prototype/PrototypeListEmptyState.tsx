import type { ReactNode } from 'react';
import Icon from '@/components/react/Icon';

interface PrototypeListEmptyStateProps {
  iconName: string;
  title: string;
  description?: ReactNode;
}

/** Sidebar list empty state — compact HarvousEmptyStateView (.compact) parity. */
export default function PrototypeListEmptyState({ iconName, title, description }: PrototypeListEmptyStateProps) {
  return (
    <div className="proto-list-empty-state" role="status">
      <Icon name={iconName} size={28} className="proto-list-empty-state__icon" aria-hidden />
      <h2 className="proto-list-empty-state__title">{title}</h2>
      {description ? <div className="proto-list-empty-state__description">{description}</div> : null}
    </div>
  );
}

/** Search/filter no-match — magnifying glass + title only. */
export function PrototypeListNoMatchEmptyState({ title }: { title: string }) {
  return <PrototypeListEmptyState iconName="magnifying-glass" title={title} />;
}

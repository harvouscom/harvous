import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';

export type PaneEmptyStateAction = {
  label: string;
  onClick: () => void;
};

type Props = {
  icon?: IconName;
  /** Replaces the default top icon (e.g. route-error card with exclamation + detail). */
  leading?: ReactNode;
  title: string;
  description: ReactNode;
  footnote?: ReactNode;
  action?: PaneEmptyStateAction;
  secondaryAction?: PaneEmptyStateAction;
  tertiaryAction?: PaneEmptyStateAction;
  role?: 'status' | 'alert';
  className?: string;
};

/** Centered main-pane empty or error state — shared by home, admin, route errors, and 404. */
export default function PrototypePaneEmptyState({
  icon,
  leading,
  title,
  description,
  footnote,
  action,
  secondaryAction,
  tertiaryAction,
  role = 'status',
  className,
}: Props) {
  const rootClassName = ['proto-editor-empty-state', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} role={role}>
      {leading ? (
        <div className="proto-editor-empty-state__leading">{leading}</div>
      ) : icon ? (
        <Icon name={icon} size={40} className="proto-editor-empty-state__icon" aria-hidden />
      ) : null}
      <h2 className="proto-editor-empty-state__title">{title}</h2>
      <div className="proto-editor-empty-state__description">
        {typeof description === 'string' ? (
          <p className="proto-editor-empty-state__line">{description}</p>
        ) : (
          description
        )}
      </div>
      {footnote ? <div className="proto-editor-empty-state__footnote">{footnote}</div> : null}
      {action || secondaryAction || tertiaryAction ? (
        <div className="proto-pane-empty-state__actions">
          {action ? (
            <button type="button" className="proto-settings-btn" onClick={action.onClick}>
              {action.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          ) : null}
          {tertiaryAction ? (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              onClick={tertiaryAction.onClick}
            >
              {tertiaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';

export type PrototypeBannerTone = 'info' | 'warning' | 'destructive' | 'success';

type Props = {
  tone?: PrototypeBannerTone;
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  trailing?: ReactNode;
  role?: 'status' | 'alert';
  className?: string;
};

const DEFAULT_ICONS: Record<PrototypeBannerTone, IconName> = {
  info: 'circle-info',
  warning: 'circle-exclamation',
  destructive: 'circle-xmark',
  success: 'circle-check',
};

const TONE_ICON_COLOR: Record<PrototypeBannerTone, string> = {
  info: 'var(--pds-info)',
  warning: 'var(--pds-warning)',
  destructive: 'var(--pds-destructive)',
  success: 'var(--pds-success)',
};

/**
 * @deprecated Not the product feedback pattern.
 * - Ephemeral feedback → floating toasts (`showPrototypeFeedbackToast` / `.proto-update-toast`)
 * - Persistent in-context chrome → dedicated inline rows (e.g. `PrototypeSharedNoteReadOnlyBanner`),
 *   inspector muted/error states, empty states, or `ProtoConfirmDialog`
 * Kept temporarily for any residual imports; do not use in new UI.
 */
export default function PrototypeBanner({
  tone = 'info',
  title,
  description,
  icon,
  action,
  trailing,
  role = tone === 'destructive' ? 'alert' : 'status',
  className,
}: Props) {
  const classes = ['pds-banner', className].filter(Boolean).join(' ');
  const iconName = icon ?? DEFAULT_ICONS[tone];

  return (
    <div className={classes} data-tone={tone} role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'}>
      <div className="pds-banner__body">
        <Icon
          name={iconName}
          size={13}
          className="pds-banner__icon"
          style={{ color: TONE_ICON_COLOR[tone] }}
        />
        <div className="pds-banner__copy">
          <div className="pds-banner__title">{title}</div>
          {description ? <div className="pds-banner__description">{description}</div> : null}
        </div>
        {trailing}
      </div>
      {action ? <div className="pds-banner__action">{action}</div> : null}
    </div>
  );
}

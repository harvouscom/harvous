import type { ReactNode } from 'react';
import Icon from '@/components/react/Icon';

/**
 * Shared chrome for prototype Settings pages — minimal PDS style. A centered
 * column with an optional title heading inside the settings modal detail pane
 * or sheet body.
 */
export function SettingsShell({
  title,
  children,
  /** Full detail-pane width; carousel and other edge-to-edge sections sit outside inset padding. */
  appearanceLayout = false,
}: {
  title?: string;
  children: ReactNode;
  appearanceLayout?: boolean;
}) {
  return (
    <div
      className={
        appearanceLayout
          ? 'proto-settings__content proto-settings__content--appearance'
          : 'proto-settings__content'
      }
      style={
        appearanceLayout
          ? { width: '100%', padding: '24px 0 64px' }
          : { maxWidth: 480, width: '100%', margin: '0 auto', padding: '24px 20px 64px' }
      }
    >
      {title ? (
        <h1 className="proto-title-md" style={{ margin: '0 0 20px' }}>{title}</h1>
      ) : null}
      {children}
    </div>
  );
}

/** A tappable settings list row: label (+ optional sublabel) on the left, value/chevron on the right. */
export function SettingsRow({
  label,
  sublabel,
  value,
  onClick,
  destructive = false,
  trailing = 'chevron',
}: {
  label: string;
  sublabel?: string;
  value?: string;
  onClick?: () => void;
  destructive?: boolean;
  trailing?: 'chevron' | 'none';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={destructive ? 'proto-note-row proto-note-row--destructive' : 'proto-note-row'}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 12px',
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        color: destructive ? 'var(--pds-destructive)' : 'var(--pds-text-primary)',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span className="pds-list-title" style={{ display: 'block', color: destructive ? 'var(--pds-destructive)' : 'var(--pds-text-primary)' }}>{label}</span>
        {sublabel ? (
          <span className="pds-list-preview" style={{ display: 'block', marginTop: 2, color: 'var(--pds-text-secondary)' }}>
            {sublabel}
          </span>
        ) : null}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {value ? (
          <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>{value}</span>
        ) : null}
        {trailing === 'chevron' ? (
          <span style={{ display: 'flex', color: 'var(--pds-text-tertiary)' }} aria-hidden>
            <Icon name="chevron-right" size={12} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** A labeled group of rows with a hairline-separated container. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '0.5px solid var(--pds-border)',
        borderRadius: 'var(--pds-radius-menu)',
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

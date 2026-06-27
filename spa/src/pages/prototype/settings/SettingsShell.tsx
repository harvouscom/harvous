import { useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';

/** One-line intro under the settings nav/sheet header — matches My Church tone and typography. */
export function SettingsIntro({ children }: { children: ReactNode }) {
  return (
    <p className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 20px' }}>
      {children}
    </p>
  );
}

/**
 * Shared chrome for prototype Settings pages — minimal PDS style. A centered
 * column inside the settings modal detail pane or sheet body. Category titles
 * live in the settings nav (desktop) or sheet header (mobile), not here.
 */
export function SettingsShell({
  children,
  /** Full detail-pane width; carousel and other edge-to-edge sections sit outside inset padding. */
  appearanceLayout = false,
}: {
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
      {children}
    </div>
  );
}

/**
 * Sub-screen chrome for drill-down pages inside a settings category (e.g. the
 * Account hub → Edit profile / Emails / Password / Security). Renders an in-pane
 * back header so it works in both the wide two-pane modal and the mobile sheet,
 * where the sheet's own back button jumps straight to the settings list.
 */
export function SettingsSubScreen({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', padding: '16px 20px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px' }}>
        <button
          type="button"
          onClick={onBack}
          className="proto-toolbar-icon-btn"
          aria-label="Back to account"
          style={{ marginLeft: -6 }}
        >
          <Icon name="caret-left" size={18} />
        </button>
        <h1 className="pds-list-title" style={{ margin: 0 }}>{title}</h1>
      </div>
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
    >
      <span className="proto-settings-list-row__main">
        <span className="pds-list-title" style={{ display: 'block', color: destructive ? 'var(--pds-destructive)' : 'var(--pds-text-primary)' }}>{label}</span>
        {sublabel ? (
          <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
            {sublabel}
          </span>
        ) : null}
      </span>
      <span className="proto-settings-list-row__trailing">
        {value ? (
          <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>{value}</span>
        ) : null}
        {trailing === 'chevron' ? (
          <span style={{ display: 'flex', color: 'var(--pds-text-tertiary)' }} aria-hidden>
            <Icon name="caret-right" size={12} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Value on the left, pill copy button on the right — used for email, share links, etc. */
export function SettingsCopyRow({
  value,
  copyValue,
  href,
  hrefTarget,
  title,
  mono = false,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  copyErrorMessage = 'Could not copy',
  disabled = false,
  layout = 'default',
}: {
  value: string;
  copyValue?: string;
  href?: string;
  hrefTarget?: '_blank' | '_self';
  title?: string;
  mono?: boolean;
  copyLabel?: string;
  copiedLabel?: string;
  copyErrorMessage?: string;
  disabled?: boolean;
  /** `field` — URL + copy in one rounded control (sharing cards). */
  layout?: 'default' | 'field';
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(copyValue ?? value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error(copyErrorMessage);
    }
  };

  const valueClassName = `proto-copy-row__value${mono ? ' proto-copy-row__value--mono' : ''}`;

  return (
    <div className={`proto-copy-row${layout === 'field' ? ' proto-copy-row--field' : ''}`}>
      {href ? (
        <a
          className={valueClassName}
          href={href}
          target={hrefTarget}
          rel={hrefTarget === '_blank' ? 'noopener noreferrer' : undefined}
          title={title ?? value}
        >
          {value}
        </a>
      ) : (
        <span className={valueClassName} title={title ?? value}>
          {value}
        </span>
      )}
      <button
        type="button"
        className="proto-copy-row__copy"
        onClick={handleCopy}
        disabled={disabled}
        aria-label={copied ? copiedLabel : copyLabel}
      >
        {copied ? (
          <>
            <Icon name="check" size={14} aria-hidden />
            {copiedLabel}
          </>
        ) : (
          <>
            <Icon name="copy" size={14} aria-hidden />
            {copyLabel}
          </>
        )}
      </button>
    </div>
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

import { useState, type ReactNode } from 'react';
import Icon, { type IconName } from '@/components/react/Icon';
import { toast } from '@/utils/toast';

/**
 * Optional intro under the settings header. Prefer omitting when the nav title
 * already explains the page — keep only for non-obvious behavior (e.g. PIN, Shift hints).
 *
 * Two rendered lines maximum, measured at the narrowest width the page renders at (the
 * mobile settings sheet, ~335px), not at desktop — copy that fits the modal often wraps to
 * three there. Not enforced with a line clamp on purpose: a clamp would
 * silently truncate the third line, and copy nobody can read is worse than copy that is too
 * long. Write to the limit instead — anything that will not fit belongs in a row's sublabel
 * or the footnote under the groups, both of which have room.
 */
export function SettingsIntro({ children }: { children: ReactNode }) {
  return (
    <p
      className="pds-subheadline"
      style={{
        color: 'var(--pds-text-secondary)',
        margin: '0 0 20px',
        textWrap: 'pretty',
      }}
    >
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
  /** Column flex + min-height 100% so children can use margin-top: auto (e.g. footer callouts). */
  fillHeight = false,
  /**
   * A roomier column, still inset. For panes holding a working surface rather than
   * a list of rows — the import workspace's file rows carry a name, size, progress
   * bar, status chip and two buttons, which 480px can't seat.
   */
  wide = false,
}: {
  children: ReactNode;
  appearanceLayout?: boolean;
  fillHeight?: boolean;
  wide?: boolean;
}) {
  const className = [
    'proto-settings__content',
    appearanceLayout ? 'proto-settings__content--appearance' : null,
    fillHeight ? 'proto-settings__content--fill-height' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={
        appearanceLayout
          ? { width: '100%', padding: '24px 0 64px' }
          : { maxWidth: wide ? 640 : 480, width: '100%', margin: '0 auto', padding: '24px 20px 64px' }
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
  badge,
  leadingIcon,
  leadingClassName,
  leadingNode,
  onClick,
  destructive = false,
  disabled = false,
  trailing = 'chevron',
}: {
  label: string;
  sublabel?: string;
  value?: string;
  /** Pill next to the title (e.g. "Coming soon", "Active"). */
  badge?: string;
  /**
   * Optional leading icon tile (pricing-style block), e.g. add-on rows. The glyph is always
   * neutral — there was a `leadingAccent` prop for tinting it, used only by gallery scenes and
   * never by a real screen, and the coloured glyph it produced was ruled the wrong look. Use
   * `leadingNode` for a tile that genuinely carries colour (a Shared Space's own accent), or
   * `leadingClassName` for a branded one-off like the Plus glyph.
   */
  leadingIcon?: IconName;
  /** Extra class on the leading tile (e.g. branded Plus swatch). */
  leadingClassName?: string;
  /**
   * Leading slot rendered as-is, for tiles that genuinely carry their own colour and theme —
   * a Shared Space icon has a per-space accent with light/dark handling behind it. This is the
   * supported way to get colour into the slot; `leadingIcon` is always neutral. Wins over it.
   */
  leadingNode?: ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  trailing?: 'chevron' | 'none';
}) {
  const interactive = typeof onClick === 'function' && !disabled;
  const className = [
    'proto-note-row',
    destructive ? 'proto-note-row--destructive' : null,
    disabled ? 'proto-note-row--disabled' : null,
    !interactive ? 'proto-note-row--static' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      {leadingNode ? (
        <span
          className={['proto-settings-list-row__leading', 'proto-settings-list-row__leading--bare', leadingClassName]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        >
          {leadingNode}
        </span>
      ) : leadingIcon ? (
        <span
          className={['proto-settings-list-row__leading', leadingClassName].filter(Boolean).join(' ')}
          aria-hidden
        >
          <Icon name={leadingIcon} size={20} />
        </span>
      ) : null}
      <span className="proto-settings-list-row__main">
        <span
          className="proto-settings-list-row__title-row"
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <span
            className="pds-list-title"
            style={{ color: destructive ? 'var(--pds-destructive)' : 'var(--pds-text-primary)' }}
          >
            {label}
          </span>
          {badge ? <span className="proto-thread-review__badge">{badge}</span> : null}
        </span>
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
    </>
  );

  if (!interactive) {
    return (
      <div className={className} role="group">
        {body}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {body}
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

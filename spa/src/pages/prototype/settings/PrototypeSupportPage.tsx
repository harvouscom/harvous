import { SettingsShell, SettingsGroup, SettingsRow } from './SettingsShell';

const SUPPORT_EMAIL = 'derek@harvous.com';

function appVersion(): string {
  const v = (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
  return v ? `Version ${v}` : '';
}

export default function PrototypeSupportPage() {
  const version = appVersion();
  return (
    <SettingsShell title="Get Support">
      <p className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 16px', padding: '0 12px' }}>
        Questions, bugs, or ideas? We'd love to hear from you.
      </p>
      <SettingsGroup>
        <SettingsRow
          label="Reach out to support"
          trailing="none"
          onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Reach out to support')}`; }}
        />
        <SettingsRow
          label="Submit feedback"
          trailing="none"
          onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Submit feedback')}`; }}
        />
      </SettingsGroup>
      {version ? (
        <p className="pds-footnote" style={{ color: 'var(--pds-text-tertiary)', padding: '8px 12px 0' }}>{version}</p>
      ) : null}
    </SettingsShell>
  );
}

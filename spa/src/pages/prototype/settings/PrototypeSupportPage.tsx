import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

const SUPPORT_EMAIL = 'derek@harvous.com';

function appVersion(): string {
  const v = (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
  return v ? `Version ${v}` : '';
}

export default function PrototypeSupportPage() {
  const version = appVersion();
  return (
    <SettingsShell>
      <SettingsIntro>Get help or contact us.</SettingsIntro>
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

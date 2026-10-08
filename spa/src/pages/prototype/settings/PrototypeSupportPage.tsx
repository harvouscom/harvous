import { consumeSupportOpenedFromError } from '@/utils/support-error-handoff';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';
import { LEGAL } from '@/utils/legal-versions';
import PrototypeSupportForm from './PrototypeSupportForm';
import PrototypeGettingStartedRow from './PrototypeGettingStartedRow';

export default function PrototypeSupportPage() {
  const initialTopic = consumeSupportOpenedFromError() ? 'Bug' : undefined;

  return (
    <SettingsShell>
      <PrototypeGettingStartedRow />
      <PrototypeSupportForm initialTopic={initialTopic} />
      {/* The documents themselves live on harvous.com; the date is the version this build
          knows as current (src/utils/legal-versions.ts). */}
      <SettingsGroup>
        <SettingsRow
          label={LEGAL.privacy.name}
          sublabel={`Updated ${LEGAL.privacy.label}`}
          leadingIcon="user-shield"
          onClick={() => window.open(LEGAL.privacy.url, '_blank', 'noopener,noreferrer')}
        />
        <SettingsRow
          label={LEGAL.terms.name}
          sublabel={`Updated ${LEGAL.terms.label}`}
          leadingIcon="file-lines"
          onClick={() => window.open(LEGAL.terms.url, '_blank', 'noopener,noreferrer')}
        />
      </SettingsGroup>
    </SettingsShell>
  );
}

import { consumeSupportOpenedFromError } from '@/utils/support-error-handoff';
import { SettingsShell } from './SettingsShell';
import PrototypeSupportForm from './PrototypeSupportForm';
import PrototypeGettingStartedRow from './PrototypeGettingStartedRow';

export default function PrototypeSupportPage() {
  const initialTopic = consumeSupportOpenedFromError() ? 'Bug' : undefined;

  return (
    <SettingsShell>
      <PrototypeGettingStartedRow />
      <PrototypeSupportForm initialTopic={initialTopic} />
    </SettingsShell>
  );
}

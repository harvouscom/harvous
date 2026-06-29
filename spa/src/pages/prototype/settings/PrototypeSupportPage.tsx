import { consumeSupportOpenedFromError } from '@/utils/support-error-handoff';
import { SettingsShell } from './SettingsShell';
import PrototypeSupportForm from './PrototypeSupportForm';

export default function PrototypeSupportPage() {
  const initialTopic = consumeSupportOpenedFromError() ? 'Bug' : undefined;

  return (
    <SettingsShell>
      <PrototypeSupportForm initialTopic={initialTopic} />
    </SettingsShell>
  );
}

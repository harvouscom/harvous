import LockPinPanel from '@/components/react/LockPinPanel';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';

export default function PrototypeLockPinPage() {
  return (
    <SettingsShell>
      <SettingsIntro>
        One PIN for your whole account — the same four digits lock and unlock every protected note. Your PIN is
        never stored in plain text.
      </SettingsIntro>
      <SettingsGroup>
        <div className="proto-lock-pin-settings__body">
          <LockPinPanel appearance="prototype" inline />
        </div>
      </SettingsGroup>
    </SettingsShell>
  );
}

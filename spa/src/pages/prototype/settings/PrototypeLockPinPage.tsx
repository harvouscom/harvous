import LockPinPanel from '@/components/react/LockPinPanel';
import { SettingsGroup, SettingsShell } from './SettingsShell';

export default function PrototypeLockPinPage() {
  return (
    <SettingsShell title="Lock PIN">
      <p className="proto-lock-pin-settings__intro">
        One PIN for your whole account — the same four digits lock and unlock every protected note. Your PIN is
        never stored in plain text.
      </p>
      <SettingsGroup>
        <div className="proto-lock-pin-settings__body">
          <LockPinPanel appearance="prototype" inline />
        </div>
      </SettingsGroup>
    </SettingsShell>
  );
}

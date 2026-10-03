import LockPinPanel from '@/components/react/LockPinPanel';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';

export default function PrototypeLockPinPage() {
  return (
    <SettingsShell>
      <SettingsIntro>
        One PIN for your whole account — the same four digits lock and unlock every locked note, and one entry
        keeps them open for a few minutes. Locked notes are encrypted on this device before they are saved, so
        there’s no way to recover a forgotten PIN.
      </SettingsIntro>
      <SettingsIntro>
        Lock a note from its ⋯ menu. Locked notes stay private: they can’t be shared, they don’t appear in search
        or Review, and connected AI apps see only their titles.
      </SettingsIntro>
      <SettingsGroup>
        <div className="proto-lock-pin-settings__body">
          <LockPinPanel appearance="prototype" inline />
        </div>
      </SettingsGroup>
    </SettingsShell>
  );
}

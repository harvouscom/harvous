/**
 * Settings → Lock PIN.
 *
 * The PIN itself first, under a padlock that shows whether one is set; then what a PIN does, as
 * four short rows with a glyph each, rather than the two paragraphs this page used to open on.
 * The facts are the same ones — one PIN for every note, the idle window, what a locked note stays
 * out of, and that a forgotten PIN is gone for good — in a shape that can be read at a glance.
 *
 * The way in is named with the menu's real glyph. The copy said "⋯", a horizontal ellipsis,
 * while the note's menu button is the vertical one, so the instruction pointed at a button that
 * does not exist.
 */
import Icon from '@/components/react/Icon';
import LockPinPanel from '@/components/react/LockPinPanel';
import { SettingsGroup, SettingsRow, SettingsShell } from './SettingsShell';

export default function PrototypeLockPinPage() {
  return (
    <SettingsShell>
      <SettingsGroup>
        <div className="proto-lock-pin-settings__body">
          <LockPinPanel appearance="prototype" inline />
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow leadingIcon="key" label="One PIN opens every locked note" trailing="none" />
        <SettingsRow
          leadingIcon="clock"
          label="Stays unlocked while you work"
          sublabel="Locks again after 5 idle minutes."
          trailing="none"
        />
        <SettingsRow
          leadingIcon="eye-slash"
          label="Kept out of search, Review and sharing"
          sublabel="Connected AI apps see only the title."
          trailing="none"
        />
        <SettingsRow
          leadingIcon="circle-exclamation"
          label="A forgotten PIN can’t be recovered"
          sublabel="Notes are encrypted on this device before they’re saved."
          trailing="none"
        />
      </SettingsGroup>

      <p className="pds-caption proto-lock-pin-settings__howto">
        Lock a note from its{' '}
        <Icon name="ellipsis-vertical" size={13} className="proto-lock-pin-settings__howto-icon" />{' '}
        menu.
      </p>
    </SettingsShell>
  );
}

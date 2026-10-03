/**
 * Settings → Sounds.
 *
 * One choice, three names — Everywhere, Moments only, Off — rather than a switch, because the
 * two kinds of sound are worth separating: a reader who likes the chord on a right answer can
 * still find a panel's breath too much. Never a volume slider; the device has one.
 *
 * Kept on this device only (see `sound-prefs.ts`), and the page says so, because a reader who
 * turns sounds off on their laptop will otherwise expect their phone to have gone quiet too.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  SOUND_PREFERENCES,
  getSoundPreferenceServerSnapshot,
  getSoundPreferenceSnapshot,
  subscribeSoundPreference,
  writeSoundPreference,
  type SoundPreference,
} from '@/utils/sound-prefs';
import { playSound, warmSounds } from '@/utils/sounds';
import ProtoSelectMenu from '../ProtoSelectMenu';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

export default function PrototypeSoundsPage() {
  const preference = useSyncExternalStore(
    subscribeSoundPreference,
    getSoundPreferenceSnapshot,
    getSoundPreferenceServerSnapshot,
  );
  const current = SOUND_PREFERENCES.find((p) => p.id === preference) ?? SOUND_PREFERENCES[0];

  /* Loaded even while sounds are off, so "Hear it" plays inside its own tap — Safari only starts
     audio inside a gesture, and a sound that waited on a download would arrive outside one. */
  useEffect(() => {
    warmSounds({ force: true });
  }, []);

  return (
    <SettingsShell>
      <SettingsIntro>
        A soft sound when you answer a review or finish something, and quieter ones as you move
        around.
      </SettingsIntro>

      <SettingsGroup>
        <div className="proto-note-row proto-note-row--static">
          <span className="proto-settings-list-row__main">
            <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>
              Sounds
            </span>
            <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
              {current.description}
            </span>
          </span>
          <span className="proto-settings-list-row__trailing">
            <ProtoSelectMenu<SoundPreference>
              label="When to play sounds"
              value={preference}
              options={SOUND_PREFERENCES.map((p) => ({ value: p.id, label: p.label }))}
              onChange={writeSoundPreference}
              menuWidth={180}
            />
          </span>
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label="Hear it"
          sublabel="What a right answer in Review sounds like."
          leadingIcon="volume-low"
          trailing="none"
          onClick={() => playSound('review.right', { force: true })}
        />
      </SettingsGroup>

      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '4px 2px 0' }}>
        Saved on this device only. Sounds follow the silent switch and play under any music.
      </p>
    </SettingsShell>
  );
}

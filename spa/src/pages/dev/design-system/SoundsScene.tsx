/**
 * Every interface sound, one button each, so the palette can be auditioned and tuned in
 * `src/utils/sounds.ts` without hunting for the surface that plays it.
 *
 * Grouped by voice: paper for pages, press for docks, mech for panels and modals, the shared
 * ticks, and the moments. Each button plays with `force`, which overrides the Sounds setting but
 * none of the other rules — the click itself is the gesture an interface sound needs, which is
 * why the listeners are started on mount rather than inside the first click.
 */
import { useEffect } from 'react';
import { PrototypeSectionHeader } from '../../prototype/design-system';
import { SOUND_CUES, playSound, warmSounds, type SoundMoment } from '@/utils/sounds';

const GROUPS: { title: string; caption: string; match: (moment: SoundMoment) => boolean }[] = [
  {
    title: 'Pages (paper)',
    caption: 'Default theme. A note over the page, compose, stack flips, chapter turns, space switch.',
    match: (m) => m === 'nav.open' || m === 'nav.close' || m === 'nav.forward' || m === 'nav.back',
  },
  {
    title: 'Docks (press)',
    caption: 'The Review dock and the study dock cards.',
    match: (m) => m.startsWith('dock.'),
  },
  {
    title: 'Panels (mech)',
    caption: 'Sheets, toolbar popovers, Settings, the Library panel — and drills inside them.',
    match: (m) => m.startsWith('panel.') || m === 'nav.drillIn' || m === 'nav.drillOut',
  },
  {
    title: 'Ticks',
    caption: 'A choice from a list, a switch. Shared by every voice.',
    match: (m) => m === 'nav.select' || m === 'nav.toggle',
  },
  {
    title: 'Moments',
    caption: 'Outcomes and completions. Heard on Moments only as well as Everywhere.',
    match: (m) => SOUND_CUES[m].class === 'moment',
  },
];

const MOMENTS = Object.keys(SOUND_CUES) as SoundMoment[];

function describeCue(moment: SoundMoment): string {
  const cue = SOUND_CUES[moment];
  return [cue.sound, cue.theme ?? 'default', cue.direction, cue.emphasis, cue.priority != null ? `p${cue.priority}` : null]
    .filter(Boolean)
    .join(' · ');
}

export default function SoundsScene() {
  useEffect(() => {
    warmSounds({ force: true });
  }, []);

  return (
    <div className="pds-gallery-stack">
      <p className="pds-caption">
        Plays through the Sounds setting, including Off. Palette lives in <code>src/utils/sounds.ts</code>.
      </p>
      {GROUPS.map((group) => (
        <div key={group.title} className="pds-gallery-stack">
          <PrototypeSectionHeader>{group.title}</PrototypeSectionHeader>
          <p className="pds-caption">{group.caption}</p>
          <div className="pds-gallery-stack pds-gallery-stack--narrow">
            {MOMENTS.filter(group.match).map((moment) => (
              <button
                key={moment}
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                data-sound-moment={moment}
                onClick={() => {
                  warmSounds({ force: true });
                  playSound(moment, { force: true });
                }}
              >
                {moment}
                <span className="pds-footnote"> — {describeCue(moment)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

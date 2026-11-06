/**
 * Today's passage at phone width, under each of the day's four skies, each on its own day
 * sheet so it sits on the paper it sits on at home. A short Psalm, and a long Gospel so the
 * fold shows too. KJV text, which is public domain.
 */
import type { CSSProperties } from 'react';
import './todays-passage-textures.css';
import { ProtoShellProvider } from '../../../layouts/proto-shell-context';
import PrototypeDailyPassageCard from '../../prototype/PrototypeDailyPassageCard';
import type { HomeSky } from '@/utils/prototype-home-trends';
import type { VotdToday } from '../../../lib/votd-today';

const PSALM: VotdToday = {
  reference: 'Psalms 18:30-31',
  translation: 'KJV',
  textHtml:
    '<sup class="verse-num">30</sup>As for God, his way is perfect: the word of the LORD is tried: he is a buckler to all those that trust in him. <sup class="verse-num">31</sup>For who is God save the LORD? or who is a rock save our God?',
  actedToday: false,
};

const GOSPEL: VotdToday = {
  reference: 'John 1:1-9',
  translation: 'KJV',
  textHtml:
    '<sup class="verse-num">1</sup>In the beginning was the Word, and the Word was with God, and the Word was God. <sup class="verse-num">2</sup>The same was in the beginning with God. <sup class="verse-num">3</sup>All things were made by him; and without him was not any thing made that was made. <sup class="verse-num">4</sup>In him was life; and the life was the light of men. <sup class="verse-num">5</sup>And the light shineth in darkness; and the darkness comprehended it not.',
  actedToday: false,
  readings: {
    title: 'Fixture Sunday',
    items: [{ slot: 'gospel', label: 'Gospel', citation: 'John 1:1-9', reference: 'John 1:1-9' }],
  },
};

/** A canvas, the way the appearance sync sets it on `<html>`. */
const canvas = (bg: string, image?: string): CSSProperties =>
  ({
    '--pds-canvas-bg': bg,
    ...(image ? { '--pds-canvas-image': `url("${image}")` } : {}),
  }) as CSSProperties;

const SKY_CANVAS = canvas('#d7eaff');
const BREEZE = canvas('#e4eef4', '/images/prototype-backgrounds/light/ai_bg_053.webp');

/* Nov 2026: texture explorations beside the shipping sky (todays-passage-textures.css). */
const SPECIMENS: { label: string; sky: HomeSky; votd: VotdToday; texture?: string; style?: CSSProperties }[] = [
  { label: 'Now: sky (evening)', sky: 'evening', votd: PSALM },
  { label: '6. Sky under glass (evening)', sky: 'evening', votd: PSALM, texture: 'sky-glass' },
  { label: '6. Sky under glass (day)', sky: 'day', votd: PSALM, texture: 'sky-glass' },
  { label: '6. Sky under glass (night)', sky: 'night', votd: PSALM, texture: 'sky-glass' },
  { label: '7. Sky band through glass (evening)', sky: 'evening', votd: PSALM, texture: 'sky-band' },
  { label: '8. Your sky: Paper canvas (evening)', sky: 'evening', votd: PSALM, texture: 'sky-canvas' },
  { label: '8. Your sky: Sky canvas (evening)', sky: 'evening', votd: PSALM, texture: 'sky-canvas', style: SKY_CANVAS },
  { label: '8. Your sky: Peach canvas (evening)', sky: 'evening', votd: PSALM, texture: 'sky-canvas', style: canvas('#ffe1d1') },
  { label: '1. Paper grain', sky: 'day', votd: PSALM, texture: 'grain' },
  { label: '2. Deep glass (Paper canvas)', sky: 'day', votd: PSALM, texture: 'glass' },
  { label: '2. Deep glass (Sky canvas)', sky: 'day', votd: PSALM, texture: 'glass', style: SKY_CANVAS },
  { label: '2. Deep glass (Breeze wallpaper)', sky: 'day', votd: PSALM, texture: 'glass', style: BREEZE },
  { label: '3. Ruled ground', sky: 'day', votd: PSALM, texture: 'ruled' },
  { label: '4. Bookcloth (Paper canvas)', sky: 'day', votd: PSALM, texture: 'cloth' },
  { label: '4. Bookcloth (Sky canvas)', sky: 'day', votd: PSALM, texture: 'cloth', style: SKY_CANVAS },
  { label: '5. Fore-edge', sky: 'day', votd: PSALM, texture: 'edge' },
  { label: 'Sky, a long Gospel', sky: 'day', votd: GOSPEL },
];

export default function TodaysPassageScene() {
  return (
    <ProtoShellProvider>
      <div className="proto-theme" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        {SPECIMENS.map((s) => (
          <section
            key={s.label}
            data-specimen={s.label}
            data-passage-texture={s.texture}
            style={{ width: 361, display: 'grid', gap: 8, ...s.style }}
          >
            <p className="pds-caption">{s.label}</p>
            <article className="proto-feed-sheet" style={{ flex: 'none' }}>
              <div
                className="proto-feed-sheet__body"
                style={{ overflow: 'visible', maskImage: 'none', WebkitMaskImage: 'none', paddingBottom: 20 }}
              >
                <div className="proto-feed-today">
                  <PrototypeDailyPassageCard homeSpaceId="fixture-space" notes={[]} votd={s.votd} sky={s.sky} />
                </div>
              </div>
            </article>
          </section>
        ))}
      </div>
    </ProtoShellProvider>
  );
}

/**
 * Today's passage at phone width, as the epigraph, each on its own day
 * sheet so it sits on the paper it sits on at home. A short Psalm, and a long Gospel so the
 * fold shows too. KJV text, which is public domain.
 */
import { ProtoShellProvider } from '../../../layouts/proto-shell-context';
import PrototypeDailyPassageCard from '../../prototype/PrototypeDailyPassageCard';
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

const SPECIMENS: { label: string; votd: VotdToday }[] = [
  { label: 'A Psalm', votd: PSALM },
  { label: 'A long Gospel', votd: GOSPEL },
];

export default function TodaysPassageScene() {
  return (
    <ProtoShellProvider>
      <div className="proto-theme" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        {SPECIMENS.map((s) => (
          <section key={s.label} data-specimen={s.label} style={{ width: 361, display: 'grid', gap: 8 }}>
            <p className="pds-caption">{s.label}</p>
            <article className="proto-feed-sheet" style={{ flex: 'none' }}>
              <div
                className="proto-feed-sheet__body"
                style={{ overflow: 'visible', maskImage: 'none', WebkitMaskImage: 'none', paddingBottom: 20 }}
              >
                <div className="proto-feed-today">
                  <PrototypeDailyPassageCard homeSpaceId="fixture-space" notes={[]} votd={s.votd} />
                </div>
              </div>
            </article>
          </section>
        ))}
      </div>
    </ProtoShellProvider>
  );
}

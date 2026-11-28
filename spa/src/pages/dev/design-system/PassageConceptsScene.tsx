/**
 * Exploration only (Nov 2026): four directions for Today's passage beside the current card, each
 * on a phone-width day sheet with the greeting above and a Pick up row below, so it is judged in
 * its place on Home rather than alone. Static mocks built from the app's own classes and tokens.
 */
import Icon from '@/components/react/Icon';
import { ProtoShellProvider } from '../../../layouts/proto-shell-context';
import PrototypeDailyPassageCard from '../../prototype/PrototypeDailyPassageCard';
import PrototypeHomeRow from '../../prototype/PrototypeHomeRow';
import type { VotdToday } from '../../../lib/votd-today';

const PSALM: VotdToday = {
  reference: 'Psalms 18:30-31',
  translation: 'KJV',
  textHtml:
    '<sup class="verse-num">30</sup>As for God, his way is perfect: the word of the LORD is tried: he is a buckler to all those that trust in him. <sup class="verse-num">31</sup>For who is God save the LORD? or who is a rock save our God?',
  actedToday: false,
};

const CSS = `
.pc-sheet { width: 361px; }
.pc-sheet .proto-feed-sheet__body { overflow: visible; mask-image: none; -webkit-mask-image: none; padding-bottom: 20px; }
.pc-hello { margin: 4px 4px 0; font-size: 22px; font-weight: 600; color: var(--pds-text-primary); line-height: 1.25; }
.pc-hello span { color: var(--pds-text-tertiary); font-weight: 500; }
.pc-tabs { display: flex; gap: 6px; padding: 0 4px; }
.pc-tab { font-size: 13px; font-weight: 500; padding: 6px 12px; border-radius: 999px; color: var(--pds-text-secondary); }
.pc-tab[data-on] { background: var(--pds-bg-subtle); color: var(--pds-text-primary); }
.pc-label { font-size: 12px; font-weight: 600; letter-spacing: .02em; color: var(--pds-text-tertiary); }
.pc-words { margin: 0; font-family: var(--pds-font-reading); font-size: 19px; line-height: 1.55; color: var(--pds-text-primary); text-wrap: pretty; }
.pc-words sup { font-family: var(--pds-font-body); font-size: 11px; font-weight: 600; color: var(--pds-text-tertiary); margin-inline-end: .25em; }
.pc-ref { font-size: 15px; font-weight: 600; color: var(--pds-text-primary); }
.pc-trans { font-size: 11px; font-weight: 600; color: var(--pds-text-tertiary); letter-spacing: .04em; }
.pc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 999px; border: 0; background: var(--pds-bg-subtle); color: var(--pds-text-primary); font: 500 14px var(--pds-font-body); }
.pc-quiet { background: none; border: 0; padding: 0; font: 500 13px var(--pds-font-body); color: var(--pds-text-tertiary); }
.pc-x { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 999px; border: 0; background: none; color: var(--pds-text-tertiary); flex: none; }

/* A: Signed epigraph */
.pc-a { padding: 20px 20px 16px; display: grid; gap: 14px; }
.pc-a__sig { display: flex; align-items: baseline; gap: 8px; color: var(--pds-text-secondary); }
.pc-a__dash { color: var(--pds-text-tertiary); }
.pc-a__foot { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-top: 14px; border-top: 1px solid var(--pds-border-soft); }
.pc-a__top { display: flex; justify-content: space-between; align-items: center; margin: -4px -6px -6px 0; }

/* B: On the page */
.pc-b { display: grid; gap: 12px; padding: 4px 6px 8px; }
.pc-b__rule { width: 28px; height: 3px; border-radius: 2px; background: var(--pds-accent); opacity: .8; }
.pc-b .pc-words { font-size: 22px; line-height: 1.45; letter-spacing: -.005em; }
.pc-b__foot { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.pc-b__link { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; padding: 0; font: 600 14px var(--pds-font-body); color: var(--pds-text-primary); }

/* C: Respond */
.pc-c { display: grid; gap: 12px; padding: 8px 8px 8px; }
.pc-c__head { display: flex; align-items: center; gap: 10px; padding: 4px 4px 0 6px; }
.pc-c__tile { width: 30px; height: 30px; border-radius: 9px; background: var(--pds-bg-subtle); display: inline-flex; align-items: center; justify-content: center; color: var(--pds-text-secondary); flex: none; }
.pc-c__headtext { flex: 1; min-width: 0; display: grid; }
.pc-c__meta { font-size: 12px; color: var(--pds-text-tertiary); }
.pc-c .pc-words { padding: 0 12px; }
.pc-c__compose { display: flex; gap: 6px; align-items: center; }
.pc-c__compose .proto-feed-compose { color: var(--pds-text-tertiary); font: 400 15px var(--pds-font-body); background: var(--pds-bg-subtle); border: 0; border-radius: 999px; }
.pc-c__round { width: 48px; height: 48px; border-radius: 999px; padding: 0; flex: none; }

/* D: Daily rhythm */
.pc-d { padding: 16px 18px 14px; display: grid; gap: 14px; }
.pc-d__week { display: flex; align-items: center; justify-content: space-between; }
.pc-d__days { display: flex; gap: 6px; }
.pc-d__day { display: grid; justify-items: center; gap: 4px; font-size: 10px; font-weight: 600; color: var(--pds-text-tertiary); }
.pc-d__dot { width: 8px; height: 8px; border-radius: 999px; background: var(--pds-bg-subtle); box-shadow: inset 0 0 0 1px var(--pds-border-soft); }
.pc-d__dot[data-done] { background: var(--pds-accent); box-shadow: none; }
.pc-d__day[data-today] { color: var(--pds-text-primary); }
.pc-d__day[data-today] .pc-d__dot { box-shadow: 0 0 0 2px var(--pds-bg-page), 0 0 0 3.5px var(--pds-accent); background: var(--pds-bg-page); }
.pc-d__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pc-d__acts { display: flex; gap: 6px; }
`;

const Words = () => (
  <p className="pc-words">
    <sup>30</sup>As for God, his way is perfect: the word of the LORD is tried: he is a buckler to all those that
    trust in him. <sup>31</sup>For who is God save the LORD? or who is a rock save our God?
  </p>
);

function Home({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section data-specimen={title} style={{ display: 'grid', gap: 8, width: 361, alignContent: 'start' }}>
      <p className="pds-caption" style={{ fontWeight: 600, color: 'var(--pds-text-primary)' }}>{title}</p>
      <p className="pds-caption" style={{ minHeight: 54 }}>{note}</p>
      <article className="proto-feed-sheet pc-sheet" style={{ flex: 'none' }}>
        <div className="proto-feed-sheet__body">
          <div className="proto-feed-today">
            <p className="pc-hello">Good morning, Derek. <span>Saturday, Nov 28</span></p>
            {children}
            <div className="pc-tabs">
              <span className="pc-tab" data-on>Pick up</span>
              <span className="pc-tab">Review</span>
              <span className="pc-tab">Suggestions</span>
            </div>
            <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel">
              <PrototypeHomeRow icon="book-open" title="Romans 8" meta={['Continue reading', 'ESV']} />
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

const Panel = ({ children, className }: { children: React.ReactNode; className: string }) => (
  <div className={`proto-glass-surface proto-glass-surface--panel proto-list-panel ${className}`}>{children}</div>
);

export default function PassageConceptsScene() {
  return (
    <ProtoShellProvider>
      <style>{CSS}</style>
      <div className="proto-theme" style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-start' }}>
        <Home title="Now" note="The epigraph as it ships: hung quote mark, signature line, two unlabeled icon buttons.">
          <PrototypeDailyPassageCard homeSpaceId="fixture-space" notes={[]} votd={PSALM} />
        </Home>

        <Home
          title="A · Signed epigraph"
          note="Keep words-first, finish it: a real signature under the words, two labeled buttons on their own row, the × in a small header."
        >
          <Panel className="pc-a">
            <div className="pc-a__top">
              <span className="pc-label">Today’s passage</span>
              <button className="pc-x" aria-label="Not today"><Icon name="xmark" size={12} /></button>
            </div>
            <Words />
            <div className="pc-a__sig">
              <span className="pc-a__dash">—</span>
              <span className="pc-ref">Psalm 18:30–31</span>
              <span className="pc-trans">KJV</span>
            </div>
            <div className="pc-a__foot">
              <button className="pc-btn"><Icon name="book-open" size={14} />Read chapter</button>
              <button className="pc-btn"><Icon name="pen-to-square" size={14} />Write a note</button>
            </div>
          </Panel>
        </Home>

        <Home
          title="B · On the page"
          note="No card at all. The passage is the next line of the greeting, set large on the day’s sheet; the panels below start where the day’s tasks start."
        >
          <div className="pc-b">
            <div className="pc-b__rule" />
            <Words />
            <div className="pc-b__foot">
              <span className="pc-ref" style={{ color: 'var(--pds-text-secondary)' }}>
                Psalm 18:30–31 <span className="pc-trans">KJV</span>
              </span>
            </div>
            <div className="pc-b__foot">
              <button className="pc-b__link"><Icon name="book-open" size={14} />Read</button>
              <button className="pc-b__link"><Icon name="pen-to-square" size={14} />Write</button>
              <button className="pc-quiet" style={{ marginInlineStart: 'auto' }}>Not today</button>
            </div>
          </div>
        </Home>

        <Home
          title="C · Respond"
          note="Shaped like a Home row on top (tile, reference, ×), and it ends in the feed’s own writing field: the invitation is to write, the reader is one tap beside it."
        >
          <Panel className="pc-c">
            <div className="pc-c__head">
              <span className="pc-c__tile"><Icon name="book-open" size={14} /></span>
              <span className="pc-c__headtext">
                <span className="pc-ref">Psalm 18:30–31</span>
                <span className="pc-c__meta">Today’s passage · KJV</span>
              </span>
              <button className="pc-x" aria-label="Not today"><Icon name="xmark" size={12} /></button>
            </div>
            <Words />
            <div className="pc-c__compose">
              <button className="proto-feed-compose">
                <Icon name="pen-to-square" size={16} />
                <span>What stands out to you?</span>
              </button>
            </div>
          </Panel>
        </Home>

        <Home
          title="D · Daily rhythm"
          note="Gives the card a reason to be new each day: the week’s seven passages as marks (filled when you read or wrote), today ringed. Needs a small API addition."
        >
          <Panel className="pc-d">
            <div className="pc-d__week">
              <span className="pc-label">Today’s passage</span>
              <div className="pc-d__days" aria-label="This week: 4 of 6 days">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <span key={i} className="pc-d__day" data-today={i === 6 ? '' : undefined}>
                    <span className="pc-d__dot" data-done={[0, 1, 3, 4].includes(i) ? '' : undefined} />
                    {d}
                  </span>
                ))}
              </div>
            </div>
            <Words />
            <div className="pc-d__foot">
              <span className="pc-ref">Psalm 18:30–31 <span className="pc-trans">KJV</span></span>
              <div className="pc-d__acts">
                <button className="pc-btn" style={{ width: 40, padding: 0 }} aria-label="Read"><Icon name="book-open" size={14} /></button>
                <button className="pc-btn"><Icon name="pen-to-square" size={14} />Write</button>
              </div>
            </div>
          </Panel>
        </Home>
      </div>
    </ProtoShellProvider>
  );
}

/**
 * The picture at the top of a feature callout — a small, faithful slice of the thing being
 * announced, set on one of Harvous's own canvas images.
 *
 * Built from markup rather than a screenshot so it stays crisp, follows light and dark through
 * tokens, and never shows anyone's real notes. The pieces are the app's: the paper sheet, the
 * tab chips, the deck row with its subject glyph, the import screen's fan of files, the
 * founder's signature. Body copy is soft
 * bars; only labels a person would recognise at a glance are real words.
 *
 * The backdrops are small crops of the canvas presets (`public/images/callouts/`, made from
 * `public/images/prototype-backgrounds/`), a few KB each. Two exceptions: What's new wears the
 * Welcome 3 sheet's ruled ground and traced "3", because that is the release it opens; Import
 * keeps the plain panel, where the Settings fan gathers and spreads on a slow loop.
 *
 * One part of each scene settles in after the card arrives, and holds still for reduced motion.
 */
import Icon from '@/components/react/Icon';
import Harvous3Numeral from '../Harvous3Numeral';
import ImportSourceFan from '../import/ImportSourceFan';

export type CalloutIllustrationKey = 'today-tabs' | 'legal' | 'whats-new' | 'import' | 'letter' | 'family' | 'my-bible';

/** A line of body copy: a rounded bar. */
function Bar({ w, strong = false }: { w: number; strong?: boolean }) {
  return <span className={strong ? 'proto-callout-art__bar proto-callout-art__bar--strong' : 'proto-callout-art__bar'} style={{ width: w }} />;
}

function TodayTabs() {
  return (
    <div className="proto-callout-art__sheet">
      <div className="proto-callout-art__head">
        <b>Today</b>
        <span>October 8</span>
      </div>
      <div className="proto-callout-art__chips">
        <span className="proto-callout-art__chip proto-callout-art__chip--on">Pick up</span>
        <span className="proto-callout-art__chip">Review</span>
        <span className="proto-callout-art__chip">Suggestions</span>
      </div>
      <div className="proto-callout-art__deck proto-callout-art__front">
        <div className="proto-callout-art__row">
          <span className="proto-callout-art__glyph">
            <Icon name="pen-to-square" size={9} aria-hidden />
          </span>
          <span className="proto-callout-art__row-text">
            <b>October 4, 2026</b>
            <span>Pick up where you left off · 4d ago</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Legal() {
  return (
    <div className="proto-callout-art__sheet proto-callout-art__sheet--narrow">
      <div className="proto-callout-art__title">Privacy Policy</div>
      <div className="proto-callout-art__meta">Updated October 8, 2026</div>
      <div className="proto-callout-art__lines">
        <Bar w={112} />
        <Bar w={96} />
        <Bar w={104} />
        <Bar w={72} />
      </div>
      <span className="proto-callout-art__badge proto-callout-art__front">
        <Icon name="check" size={11} aria-hidden />
      </span>
    </div>
  );
}

/** The release itself: the Welcome 3 ground and numeral, at callout size. */
function WhatsNew() {
  return (
    <>
      <div className="proto-welcome3__grid" aria-hidden="true" />
      <Harvous3Numeral className="proto-callout-art__numeral" />
    </>
  );
}

/** Notes from elsewhere: the Settings import screen's own fan of files, at callout size. */
function Import() {
  return (
    <div className="proto-callout-art__fan proto-callout-art__front">
      <ImportSourceFan />
    </div>
  );
}

/** The founder's letter: a sheet of writing, signed in Derek's hand as the letter itself is. */
function Letter() {
  return (
    <div className="proto-callout-art__sheet proto-callout-art__sheet--narrow proto-callout-art__sheet--letter">
      <div className="proto-callout-art__lines">
        <Bar w={118} />
        <Bar w={108} />
        <Bar w={114} />
        <Bar w={84} />
      </div>
      <img
        className="proto-callout-art__signature proto-callout-art__front"
        src="/derek-signiture.png"
        alt=""
        width={112}
        height={28}
      />
    </div>
  );
}

/**
 * Family: the household's sheet — its name and who's in it — with a child's progress card in
 * front. Counts and books only, as the real card shows; never a note.
 */
function Family() {
  return (
    <div className="proto-callout-art__sheet">
      <div className="proto-callout-art__head">
        <b>Johnson family</b>
        <span>4 people</span>
      </div>
      <div className="proto-callout-art__people">
        {['D', 'S', 'K', 'R'].map((initial, i) => (
          <span key={initial} className={`proto-callout-art__person proto-callout-art__person--${i}`}>
            {initial}
          </span>
        ))}
      </div>
      <div className="proto-callout-art__deck proto-callout-art__front">
        <div className="proto-callout-art__row">
          <span className="proto-callout-art__glyph">
            <Icon name="book-open" size={9} aria-hidden />
          </span>
          <span className="proto-callout-art__row-text">
            <b>Kit · 11 chapters read</b>
            <span>Psalms, Mark, Romans</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * My Bible: the Home card's shelf — a spine per book, Genesis to Revelation, filled by how much
 * of each you have been in. Heights are fixed and made up; no one's real map.
 */
const SHELF = [
  2, 7, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 1, 2, 1, 3, 1, 8, 2, 3, 5, 2, 0, 0, 6, 0, 2, 1, 3, 3, 3, 0, 0, 0,
  0, 1,
];

function MyBible() {
  return (
    <div className="proto-callout-art__sheet proto-callout-art__sheet--wide">
      <div className="proto-callout-art__head">
        <b>My Bible</b>
      </div>
      <div className="proto-callout-art__meta">You’ve been in 34 books.</div>
      <div className="proto-callout-art__shelf proto-callout-art__front">
        {SHELF.map((fill, i) => (
          <span
            key={i}
            className={fill >= 6 ? 'proto-callout-art__spine proto-callout-art__spine--deep' : 'proto-callout-art__spine'}
          >
            {fill > 0 ? <span style={{ height: `${Math.min(100, fill * 16)}%` }} /> : null}
          </span>
        ))}
      </div>
      <div className="proto-callout-art__ends">
        <span>Genesis</span>
        <span>Revelation</span>
      </div>
    </div>
  );
}

export default function CalloutIllustration({ name }: { name: CalloutIllustrationKey }) {
  return (
    <div className={`proto-callout-art proto-callout-art--${name}`} aria-hidden="true">
      {name === 'legal' ? (
        <Legal />
      ) : name === 'whats-new' ? (
        <WhatsNew />
      ) : name === 'import' ? (
        <Import />
      ) : name === 'letter' ? (
        <Letter />
      ) : name === 'family' ? (
        <Family />
      ) : name === 'my-bible' ? (
        <MyBible />
      ) : (
        <TodayTabs />
      )}
    </div>
  );
}

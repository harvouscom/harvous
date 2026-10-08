/**
 * The picture at the top of a feature callout — a small, faithful slice of the thing being
 * announced, set on one of Harvous's own canvas images.
 *
 * Built from markup rather than a screenshot so it stays crisp, follows light and dark through
 * tokens, and never shows anyone's real notes. The pieces are the app's: the paper sheet, the
 * tab chips, the deck row with its subject glyph, the font the text is set in. Body copy is soft
 * bars; only labels a person would recognise at a glance are real words.
 *
 * The backdrops are small crops of the canvas presets (`public/images/callouts/`, made from
 * `public/images/prototype-backgrounds/`), a few KB each. What's new is the exception: it wears
 * the Welcome 3 sheet's ruled ground and traced "3", because that is the release it opens.
 *
 * One part of each scene settles in after the card arrives, and holds still for reduced motion.
 */
import Icon from '@/components/react/Icon';
import Harvous3Numeral from '../Harvous3Numeral';

export type CalloutIllustrationKey = 'today-tabs' | 'legal' | 'whats-new' | 'import' | 'letter';

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

/** Notes from elsewhere landing as notes here: a file tile in front of a list of rows. */
function Import() {
  return (
    <>
      <div className="proto-callout-art__sheet proto-callout-art__sheet--right">
        <div className="proto-callout-art__title">Imported</div>
        {['Sermon notes', 'Romans study', 'Prayer list'].map((t) => (
          <div key={t} className="proto-callout-art__row proto-callout-art__row--flat">
            <span className="proto-callout-art__glyph">
              <Icon name="note-sticky" size={9} aria-hidden />
            </span>
            <span className="proto-callout-art__row-text">
              <b>{t}</b>
            </span>
          </div>
        ))}
      </div>
      <div className="proto-callout-art__files proto-callout-art__front">
        <span className="proto-callout-art__file proto-callout-art__file--behind">.docx</span>
        <span className="proto-callout-art__file">.md</span>
      </div>
    </>
  );
}

/** The founder's letter: a sheet in the reading serif, signed with a face. */
function Letter() {
  return (
    <div className="proto-callout-art__sheet proto-callout-art__sheet--narrow proto-callout-art__sheet--letter">
      <div className="proto-callout-art__salutation">Dear friend,</div>
      <div className="proto-callout-art__lines">
        <Bar w={118} />
        <Bar w={108} />
        <Bar w={114} />
      </div>
      <div className="proto-callout-art__sign proto-callout-art__front">
        <picture>
          <source srcSet="/derek-avatar.webp" type="image/webp" />
          <img src="/derek-avatar.jpeg" alt="" width={16} height={16} />
        </picture>
        <span>Derek</span>
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
      ) : (
        <TodayTabs />
      )}
    </div>
  );
}

/**
 * "Your Bible" on Home — the shelf, and a door into the map.
 *
 * Its own panel under the Today band rather than a card in one of its decks. The decks hold
 * offers, one at a time, and this is not an offer: it is a standing picture of where you have
 * been, with nothing to accept or dismiss. A deck card is also one row high, and a shelf needs
 * the width.
 *
 * Absent until there is something on it. An empty shelf on a new account would be a picture
 * of everything you have not done, which is the reading-tracker posture the North Star rules
 * out.
 */
import Icon from '@/components/react/Icon';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import type { BibleCoverage } from '@/utils/bible-coverage';
import ProtoCanonShelf from './ProtoCanonShelf';
import { shelfSentence } from './bible-map-copy';

export default function PrototypeHomeBibleShelfCard({ coverage }: { coverage: BibleCoverage | undefined }) {
  const { openExpandedSidebar } = useProtoShell();
  const sentence = coverage ? shelfSentence(coverage.books) : null;
  if (!coverage || !sentence) return null;

  return (
    <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-bible-shelf-card">
      <button
        type="button"
        className="proto-bible-shelf-card__button"
        aria-label={`Your Bible. ${sentence} Open the map.`}
        // The opener is the focused element, which is how the panel knows to grow out of it.
        onClick={() => openExpandedSidebar('bible-map')}
      >
        <span className="proto-bible-shelf-card__head">
          <span className="proto-bible-shelf-card__title">Your Bible</span>
          <span className="proto-bible-shelf-card__expand" aria-hidden="true">
            <Icon name="up-right-and-down-left-from-center" size={12} />
          </span>
        </span>
        <span className="proto-bible-shelf-card__sentence">{sentence}</span>
        <ProtoCanonShelf coverage={coverage} />
        <span className="proto-bible-shelf-card__ends" aria-hidden="true">
          <span>Genesis</span>
          <span>Revelation</span>
        </span>
      </button>
    </div>
  );
}

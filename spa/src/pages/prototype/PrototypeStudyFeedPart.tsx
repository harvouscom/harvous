/**
 * One part of a day — this morning, this afternoon, this evening — as a section.
 *
 * The anatomy is Home's: a quiet eyebrow over a glass panel of hairline-separated rows
 * (`PrototypeHomeSection` / `PrototypeHomeRow`). "Several things, held together" is a shape
 * this app already has, and Activity is where the work starts, so it should look like the
 * surface people already know rather than a fifth invention.
 *
 * What varies inside the panel is weight, not layout. Something made — written, or
 * highlighted — keeps its words on the sheet. Somewhere you merely went is a row and nothing
 * more. That difference is what lets a day be read as a shape before it is read as a list.
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import type { StudyFeedItem, StudyFeedPartGroup } from '@/utils/study-feed-items';
import {
  studyFeedCardTitle,
  studyFeedClockTime,
  studyFeedIsSubstance,
  studyFeedItemIcon,
  studyFeedRowCopy,
} from './study-feed-presentation';

/**
 * Rows shown before a section folds the rest away.
 *
 * A sheet is a page, and a page that runs to three screens is a scroll with a border. Four
 * is enough to show what a part of a day was like, and the count on the control says how
 * much more there is — nothing is hidden without saying so.
 */
const SECTION_PREVIEW_ROWS = 4;

/** Something made: the words stay on the sheet. */
function Substance({ item, onOpen }: { item: StudyFeedItem; onOpen: () => void }) {
  if (item.kind === 'highlight-note' || item.kind === 'highlight-scripture') {
    const source = item.reference ?? item.noteTitle?.trim();
    return (
      <button
        type="button"
        className="proto-feed-said"
        onClick={onOpen}
        data-feed-accent={item.accent}
      >
        <span className="proto-feed-said__quote">“{item.excerpt}”</span>
        <span className="proto-feed-said__foot">
          {source ? <span>{source}</span> : <span />}
          <span className="proto-feed-said__time">{studyFeedClockTime(item.at)}</span>
        </span>
      </button>
    );
  }

  const snippet = 'snippet' in item ? item.snippet : '';
  /*
   * Someone else's note says whose and where; your own says neither. On your own sheet
   * "you, in My Home" is every line's answer, and printing it turns the attribution into
   * furniture — the absence of a byline is what makes a byline mean something.
   */
  const shared = item.kind === 'space-note' || item.kind === 'church-note' ? item : null;

  return (
    <button type="button" className="proto-feed-said proto-feed-said--wrote" onClick={onOpen}>
      <span className="proto-feed-said__head">
        <span className="proto-feed-said__title">{studyFeedCardTitle(item)}</span>
        <span className="proto-feed-said__time">{studyFeedClockTime(item.at)}</span>
      </span>
      {snippet ? <span className="proto-feed-said__body">{snippet}</span> : null}
      {shared ? (
        <span className="proto-feed-said__by">
          <span className="proto-feed-said__author">{shared.actor.displayName}</span>
          <span aria-hidden>·</span>
          <span>{shared.space.title}</span>
          {shared.isNewSinceVisit ? <span className="proto-feed-said__new">New</span> : null}
        </span>
      ) : null}
    </button>
  );
}

/** Somewhere you went: a row, in the anatomy the rest of the app uses for exactly that. */
function Movement({ item, onOpen }: { item: StudyFeedItem; onOpen: () => void }) {
  const { title, verb, detail } = studyFeedRowCopy(item);

  return (
    <PrototypeHomeRow
      icon={studyFeedItemIcon(item)}
      title={title}
      meta={[verb, detail]}
      onClick={onOpen}
      chevron={false}
      trailing={<span className="proto-feed-said__time">{studyFeedClockTime(item.at)}</span>}
    />
  );
}

export default function PrototypeStudyFeedPart({
  group,
  onOpen,
}: {
  group: StudyFeedPartGroup;
  onOpen: (item: StudyFeedItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? group.items : group.items.slice(0, SECTION_PREVIEW_ROWS);
  const folded = group.items.length - shown.length;

  return (
    <section className="proto-feed-part">
      <p className="proto-caption proto-feed-part__eyebrow">{group.label}</p>
      <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-feed-part__panel">
        {shown.map((item) => (
          <div
            className={
              studyFeedIsSubstance(item) ? 'proto-feed-part__said' : 'proto-feed-part__row'
            }
            key={item.id}
            data-feed-item-id={item.id}
          >
            {studyFeedIsSubstance(item) ? (
              <Substance item={item} onOpen={() => onOpen(item)} />
            ) : (
              <Movement item={item} onOpen={() => onOpen(item)} />
            )}
          </div>
        ))}
        {folded > 0 ? (
          <button type="button" className="proto-feed-part__more" onClick={() => setExpanded(true)}>
            <span>{`${folded} more`}</span>
            <Icon name="caret-down" size={10} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

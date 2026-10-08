/**
 * The Scripture a scan found, as a strip of cards — one per reference, grouped as the page's.
 *
 * Shaped after the Discover catalog's cards (harvous.com/discover): a tinted stage with the
 * artifact standing on it, then a kicker, a title and the words underneath. Here the artifact
 * is the page you photographed, and then each verse — set in the translation its pill will
 * carry, so choosing a translation shows you the words you are choosing rather than a code.
 * The page itself (photo and text) is a separate section of the sheet: checking the verses
 * and correcting the words are different jobs.
 *
 * It is the review, not decoration over it: every choice about a reference is made on its
 * card. One column, in the order the page cites them: a horizontal strip was tried, and a list
 * you work down is easier to check than a carousel you have to remember to swipe.
 */
import { useEffect, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { getCachedVersePeek, getVersePeek } from '@/utils/verse-peek';
import ProtoSelectMenu, { type ProtoSelectOption } from '../ProtoSelectMenu';
import { scanReferenceCardId } from './ScanPageText';

/** The verse in this translation, as it will read — fetched on the card, cached for the session. */
function VerseStage({ reference, translation }: { reference: string; translation: string }) {
  const [text, setText] = useState<string | null>(() => getCachedVersePeek(reference, translation));
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    setText(getCachedVersePeek(reference, translation));
    setMissing(false);
    void getVersePeek(reference, translation).then((peek) => {
      if (!live) return;
      if (peek) setText(peek);
      else setMissing(true);
    });
    return () => {
      live = false;
    };
  }, [reference, translation]);

  return (
    <div className="proto-scan-card__sheet proto-scan-card__sheet--verse">
      {text ? (
        <p className="proto-scan-card__verse">{text}</p>
      ) : missing ? (
        <p className="proto-scan-card__verse proto-scan-card__verse--missing">
          Not in the {getTranslationAbbreviationDisplay(translation)}.
        </p>
      ) : (
        <span className="proto-scan-card__lines" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      )}
    </div>
  );
}

function Card({
  index,
  kicker,
  title,
  stage,
  footer,
  dimmed,
  full,
  id,
  check,
}: {
  index: number;
  kicker: string;
  title: string;
  stage: ReactNode;
  footer?: ReactNode;
  dimmed?: boolean;
  /** The only card: it takes the strip's width, and its controls sit beside its name. */
  full?: boolean;
  id?: string;
  /** The scan guessed at this one: how it read it, and the way to the photo to check. */
  check?: ReactNode;
}) {
  return (
    <li
      id={id}
      className={`proto-scan-card${dimmed ? ' proto-scan-card--dimmed' : ''}${full ? ' proto-scan-card--full' : ''}${
        check ? ' proto-scan-card--check' : ''
      }`}
      // Each lands a beat after the last, the way the import rows arrive.
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="proto-scan-card__stage">{stage}</div>
      <div className="proto-scan-card__words">
        <div className="proto-scan-card__name">
          <span className="proto-scan-card__kicker">{kicker}</span>
          <span className="proto-scan-card__title">{title}</span>
          {check}
        </div>
        {footer ? <div className="proto-scan-card__footer">{footer}</div> : null}
      </div>
    </li>
  );
}

export type ScanStripReference = {
  key: string;
  text: string;
  translation: string;
  /** Why this translation: printed beside it, the reader's default, or their pick here. */
  source: 'printed' | 'default' | 'chosen';
  occurrences: number;
  excluded: boolean;
  /** How the scan read it when that took a guess ("Jn. 3;l6"); null when read cleanly. */
  readAs: string | null;
};

export type ScanStripPassage = {
  reference: string;
  translation: string;
  text: string;
  ambiguous: boolean;
  options: ProtoSelectOption<string>[];
};

/* The kicker says where the translation came from; the menu under it says which one, so
   the code is never printed twice on one card. */
const SOURCE_LABEL: Record<ScanStripReference['source'], string> = {
  printed: 'Printed on the page',
  default: 'Your default',
  chosen: 'Your pick',
};

export default function ScanStrip({
  placeholders,
  references,
  passage,
  translationOptions,
  onTranslationChange,
  onToggleExcluded,
  onPassageTranslationChange,
  onSeePage,
}: {
  /** Cards still to come — shown while reading so the strip does not grow under the reader. */
  placeholders: number;
  references: ScanStripReference[];
  passage: ScanStripPassage | null;
  translationOptions: ProtoSelectOption<string>[];
  onTranslationChange: (key: string, translation: string) => void;
  onToggleExcluded: (key: string) => void;
  onPassageTranslationChange: (translation: string) => void;
  /** Open the whole photo, to check a reference against it. */
  onSeePage: () => void;
}) {
  let index = 0;
  const single = (passage ? 1 : references.length) + placeholders === 1;
  return (
    <ul className="proto-scan-strip" aria-label="Scripture on this page">
      {passage ? (
        <Card
          index={index++}
          full={single}
          kicker={passage.ambiguous ? 'Which is on your page?' : 'Matched to the page'}
          title={passage.reference}
          stage={
            <div className="proto-scan-card__sheet proto-scan-card__sheet--verse">
              <p className="proto-scan-card__verse">{passage.text}</p>
            </div>
          }
          footer={
            <ProtoSelectMenu
              label={`Translation for ${passage.reference}`}
              className="proto-scan-card__translation"
              value={passage.translation}
              options={passage.options}
              onChange={onPassageTranslationChange}
            />
          }
        />
      ) : null}

      {!passage
        ? references.map((ref) => (
            <Card
              key={ref.key}
              index={index++}
              full={single}
              id={scanReferenceCardId(ref.key)}
              dimmed={ref.excluded}
              check={
                ref.readAs && !ref.excluded ? (
                  <button type="button" className="proto-scan-card__check" onClick={onSeePage}>
                    <span className="proto-scan-card__check-dot" aria-hidden />
                    <span className="proto-scan-card__check-text">
                      Read as “{ref.readAs}”
                      <u>Check the photo</u>
                    </span>
                  </button>
                ) : undefined
              }
              kicker={
                ref.excluded
                  ? 'Kept as plain text'
                  : `${SOURCE_LABEL[ref.source]}${ref.occurrences > 1 ? ` · cited ${ref.occurrences}×` : ''}`
              }
              title={ref.text}
              stage={<VerseStage reference={ref.text} translation={ref.translation} />}
              footer={
                <>
                  {!ref.excluded ? (
                    <ProtoSelectMenu
                      label={`Translation for ${ref.text}`}
                      className="proto-scan-card__translation"
                      value={ref.translation}
                      options={translationOptions}
                      onChange={(value) => onTranslationChange(ref.key, value)}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="proto-side-panel__action-btn proto-scan-card__toggle"
                    aria-label={ref.excluded ? `Make ${ref.text} a pill again` : `Keep ${ref.text} as plain text`}
                    title={ref.excluded ? 'Make it a pill again' : 'Keep as plain text'}
                    onClick={() => onToggleExcluded(ref.key)}
                  >
                    <Icon name={ref.excluded ? 'arrow-rotate-left' : 'xmark'} size={12} />
                  </button>
                </>
              }
            />
          ))
        : null}

      {Array.from({ length: placeholders }, (_, i) => (
        <li key={`placeholder-${i}`} className="proto-scan-card proto-scan-card--placeholder" aria-hidden>
          <div className="proto-scan-card__stage">
            <div className="proto-scan-card__sheet">
              <span className="proto-scan-card__lines">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
          <div className="proto-scan-card__words">
            <span className="proto-scan-card__bar proto-scan-card__bar--short" />
            <span className="proto-scan-card__bar" />
          </div>
        </li>
      ))}
    </ul>
  );
}

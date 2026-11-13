/**
 * Verse stickers in the Harvous Bible reader: the die-cut mark in the right margin, and the
 * sheet of stickers the verse's action bar turns into when you choose Sticker.
 *
 * The same stickers as a child's My Bible (`shared/verse-stickers.ts`), so a notebook that moves
 * into a teen's own account keeps them. A child's take the notebook cover's colour; here each
 * sticker carries its own from the Thread palette, as on the notebook move page.
 */
import type { CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import {
  verseStickerLabel,
  verseStickerTilt,
  verseStickerTilts,
  verseStickerTones,
  verseStickers,
  type VerseSticker,
} from '../../../../shared/verse-stickers';
import ChildCoverSymbol from './ChildCoverSymbol';
import '../../styles/reader-verse-stickers.css';

export type PlacedSticker = { verse: number; sticker: VerseSticker; top: number };

/**
 * The margin layer. Positions are measured by the pane (a verse in prose layout has no box of
 * its own to sit beside), so this only draws. `aria-hidden`: each verse already says it has a
 * sticker in its own accessible name, so the marks would only be heard twice.
 */
export function ReaderStickerMargin({ placed, chapter, fresh }: { placed: PlacedSticker[]; chapter: number; fresh: number | null }) {
  if (!placed.length) return null;
  return (
    <div className="pds-reader__stickers" aria-hidden>
      {placed.map(({ verse, sticker, top }) => (
        <span
          key={`${verse}:${sticker}`}
          className="pds-reader-sticker"
          data-tone={verseStickerTones[sticker]}
          data-fresh={fresh === verse ? 'true' : undefined}
          style={{ top, '--sticker-tilt': `${verseStickerTilt(verse, chapter)}deg` } as CSSProperties}
        >
          <ChildCoverSymbol symbol={sticker} size={13} />
        </span>
      ))}
    </div>
  );
}

/**
 * What the action bar becomes after Sticker: back to the actions, which verse it's for, the
 * sheet, and Remove when there's one on already. Picking one sticks it on and closes the bar.
 */
export function ReaderStickerSheet({
  reference,
  current,
  onBack,
  onPick,
}: {
  reference: string;
  current: VerseSticker | null;
  onBack: () => void;
  onPick: (sticker: VerseSticker | null) => void;
}) {
  return (
    <>
      <div className="pds-reader-stickers__head">
        <button
          type="button"
          className="pds-native-selection-bar__btn"
          title="Back to actions"
          aria-label="Back to actions"
          onClick={onBack}
        >
          <Icon name="caret-left" size={16} aria-hidden />
        </button>
        <span className="pds-native-selection-bar__rule" aria-hidden />
        <span className="pds-reader-stickers__title pds-caption">{reference}</span>
        {current ? (
          <button
            type="button"
            className="pds-native-selection-bar__btn"
            title={`Remove the sticker from ${reference}`}
            aria-label={`Remove the ${verseStickerLabel(current)} sticker from ${reference}`}
            onClick={() => onPick(null)}
          >
            <Icon name="xmark" size={14} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="pds-reader-stickers__grid" role="group" aria-label={`Stickers for ${reference}`}>
        {verseStickers.map((sticker, index) => {
          const selected = current === sticker;
          return (
            <button
              key={sticker}
              type="button"
              className="pds-reader-stickers__option"
              title={verseStickerLabel(sticker)}
              aria-label={`${verseStickerLabel(sticker)} sticker`}
              aria-pressed={selected}
              onClick={() => onPick(sticker)}
            >
              <span
                className={`pds-reader-sticker pds-reader-sticker--option${selected ? ' proto-ink-on-accent' : ''}`}
                data-tone={verseStickerTones[sticker]}
                style={{ '--sticker-tilt': `${verseStickerTilts[index % verseStickerTilts.length]}deg` } as CSSProperties}
                aria-hidden
              >
                <ChildCoverSymbol symbol={sticker} size={15} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

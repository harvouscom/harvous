/**
 * Verse stickers in the Harvous Bible reader: the die-cut mark in the right margin, and the
 * sheet of stickers the verse's action bar turns into when you choose Sticker.
 *
 * The same stickers as a child's My Bible (`shared/verse-stickers.ts`), so a notebook that moves
 * into a teen's own account keeps them. A child's take the notebook cover's colour; here each
 * sticker carries its own from the Thread palette, as on the notebook move page.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import scaleBalancedSvg from '@fortawesome/fontawesome-free/svgs/solid/scale-balanced.svg?raw';
import scrollSvg from '@fortawesome/fontawesome-free/svgs/solid/scroll.svg?raw';
import fireSvg from '@fortawesome/fontawesome-free/svgs/solid/fire-flame-curved.svg?raw';
import dropletSvg from '@fortawesome/fontawesome-free/svgs/solid/droplet.svg?raw';
import breadSvg from '@fortawesome/fontawesome-free/svgs/solid/bread-slice.svg?raw';
import cupSvg from '@fortawesome/fontawesome-free/svgs/solid/wine-glass.svg?raw';
import keySvg from '@fortawesome/fontawesome-free/svgs/solid/key.svg?raw';
import shieldSvg from '@fortawesome/fontawesome-free/svgs/solid/shield-halved.svg?raw';
import mountainSvg from '@fortawesome/fontawesome-free/svgs/solid/mountain.svg?raw';
import roadSvg from '@fortawesome/fontawesome-free/svgs/solid/road.svg?raw';
import treeSvg from '@fortawesome/fontawesome-free/svgs/solid/tree.svg?raw';
import churchSvg from '@fortawesome/fontawesome-free/svgs/solid/church.svg?raw';
import handshakeSvg from '@fortawesome/fontawesome-free/svgs/solid/handshake.svg?raw';
import mercySvg from '@fortawesome/fontawesome-free/svgs/solid/hand-holding-heart.svg?raw';
import hourglassSvg from '@fortawesome/fontawesome-free/svgs/solid/hourglass-half.svg?raw';
import lightbulbSvg from '@fortawesome/fontawesome-free/svgs/solid/lightbulb.svg?raw';
import questionSvg from '@fortawesome/fontawesome-free/svgs/solid/question.svg?raw';
import cloudRainSvg from '@fortawesome/fontawesome-free/svgs/solid/cloud-rain.svg?raw';
import {
  readerOnlyStickers,
  verseStickerLabel,
  verseStickerTilt,
  verseStickerTilts,
  verseStickerTones,
  verseStickers,
  type ReaderOnlySticker,
  type ReaderSticker,
} from '../../../../shared/verse-stickers';
import ChildCoverSymbol from './ChildCoverSymbol';
import '../../styles/reader-verse-stickers.css';

export type PlacedSticker = { verse: number; sticker: ReaderSticker; top: number };

/** The grown-up themes' glyphs. Here, not in `Icon`, for the reason `ChildCoverSymbol` gives. */
const themeGlyphs: Record<ReaderOnlySticker, string> = {
  'scale-balanced': scaleBalancedSvg, scroll: scrollSvg, 'fire-flame-curved': fireSvg, droplet: dropletSvg,
  'bread-slice': breadSvg, 'wine-glass': cupSvg, key: keySvg, 'shield-halved': shieldSvg, mountain: mountainSvg,
  road: roadSvg, tree: treeSvg, church: churchSvg, handshake: handshakeSvg, 'hand-holding-heart': mercySvg,
  'hourglass-half': hourglassSvg, lightbulb: lightbulbSvg, question: questionSvg, 'cloud-rain': cloudRainSvg,
};
const themeMarkup = new Map<string, { __html: string }>();

function StickerGlyph({ sticker, size }: { sticker: ReaderSticker; size: number }) {
  const raw = (themeGlyphs as Record<string, string>)[sticker];
  if (!raw) return <ChildCoverSymbol symbol={sticker as typeof verseStickers[number]} size={size} />;
  const key = `${sticker}|${size}`;
  let html = themeMarkup.get(key);
  if (!html) {
    // A stable object per glyph and size, so React doesn't re-apply innerHTML every render.
    html = { __html: safeRenderHtml(raw.replace(/<svg\s+/, `<svg fill="currentColor" width="${size}" height="${size}" style="display:block;overflow:visible" `)) };
    themeMarkup.set(key, html);
  }
  return <span style={{ display: 'inline-flex', width: size, height: size }} dangerouslySetInnerHTML={html} />;
}

/**
 * The margin layer. Positions are measured by the pane (a verse in prose layout has no box of
 * its own to sit beside), so this only draws them. With `onOpen` each sticker is a button that
 * opens the sheet for its own verse, which is where you change it or take it off; without it
 * (no account to keep a change in) they are marks only, and `aria-hidden`, because each verse
 * already says it has a sticker in its own accessible name.
 */
export function ReaderStickerMargin({
  placed,
  chapter,
  fresh,
  onOpen,
}: {
  placed: PlacedSticker[];
  chapter: number;
  fresh: number | null;
  onOpen?: (verse: number) => void;
}) {
  if (!placed.length) return null;
  return (
    <div className="pds-reader__stickers" aria-hidden={onOpen ? undefined : true}>
      {placed.map(({ verse, sticker, top }) => {
        const props = {
          className: 'pds-reader-sticker',
          'data-tone': verseStickerTones[sticker],
          'data-fresh': fresh === verse ? 'true' : undefined,
          style: { top, '--sticker-tilt': `${verseStickerTilt(verse, chapter)}deg` } as CSSProperties,
        };
        return onOpen ? (
          <button
            key={`${verse}:${sticker}`}
            type="button"
            {...props}
            aria-label={`Sticker on verse ${verse}: ${verseStickerLabel(sticker).toLowerCase()}. Change or remove`}
            title="Change or remove sticker"
            onClick={() => onOpen(verse)}
          >
            <StickerGlyph sticker={sticker} size={13} />
          </button>
        ) : (
          <span key={`${verse}:${sticker}`} {...props}>
            <StickerGlyph sticker={sticker} size={13} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * What the action bar becomes after Sticker: back to the actions, which verse it's for, the
 * sheet, and Remove sticker under it when there's one on already. Picking one sticks it on and
 * closes the bar; picking the one already on takes it off, as Remove does.
 */
export function ReaderStickerSheet({
  reference,
  current,
  onBack,
  onPick,
  autoFocus = false,
}: {
  reference: string;
  current: ReaderSticker | null;
  onBack: () => void;
  onPick: (sticker: ReaderSticker | null) => void;
  /** Move focus into the sheet on open (the chosen sticker, else the first), as when it was
   *  opened from the margin rather than from the bar's own Sticker button. */
  autoFocus?: boolean;
}) {
  const groups = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    // Two lookups, not one selector list: a list matches in document order, not by preference.
    const root = groups.current;
    (
      root?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
      root?.querySelector<HTMLButtonElement>('.pds-reader-stickers__option')
    )?.focus();
    // Mount only: the sheet is remounted for each verse it opens on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const option = (sticker: ReaderSticker, index: number) => {
    const selected = current === sticker;
    return (
      <button
        key={sticker}
        type="button"
        className="pds-reader-stickers__option"
        title={selected ? `Remove the ${verseStickerLabel(sticker).toLowerCase()} sticker` : verseStickerLabel(sticker)}
        aria-label={`${verseStickerLabel(sticker)} sticker`}
        aria-pressed={selected}
        // The chosen one toggles off, so tapping it again can't re-stick (and re-announce) it.
        onClick={() => onPick(selected ? null : sticker)}
      >
        <span
          className={`pds-reader-sticker pds-reader-sticker--option${selected ? ' proto-ink-on-accent' : ''}`}
          data-tone={verseStickerTones[sticker]}
          style={{ '--sticker-tilt': `${verseStickerTilts[index % verseStickerTilts.length]}deg` } as CSSProperties}
          aria-hidden
        >
          <StickerGlyph sticker={sticker} size={15} />
        </span>
      </button>
    );
  };
  return (
    // `display: contents`: the bar lays these out as its own rows; the wrapper is only a scope.
    <div ref={groups} className="pds-reader-stickers">
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
      </div>
      {/* Themes first (the deeper things a verse is about), then the pictures child notebooks
          share. Two labelled groups, so the sheet reads as two kinds rather than one long grid. */}
      <div className="pds-reader-stickers__group" role="group" aria-label={`Theme stickers for ${reference}`}>
        <p className="pds-reader-stickers__label pds-footnote" aria-hidden>Themes</p>
        <div className="pds-reader-stickers__grid">{readerOnlyStickers.map(option)}</div>
      </div>
      <div className="pds-reader-stickers__group" role="group" aria-label={`Picture stickers for ${reference}`}>
        <p className="pds-reader-stickers__label pds-footnote" aria-hidden>Pictures</p>
        <div className="pds-reader-stickers__grid">{verseStickers.map(option)}</div>
      </div>
      {current ? (
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary pds-reader-stickers__remove"
          aria-label={`Remove the ${verseStickerLabel(current).toLowerCase()} sticker from ${reference}`}
          onClick={() => onPick(null)}
        >
          <Icon name="xmark" size={13} aria-hidden /> Remove sticker
        </button>
      ) : null}
    </div>
  );
}

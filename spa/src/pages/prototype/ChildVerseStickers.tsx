import { useEffect, useRef, type CSSProperties } from 'react';
import Icon from '@/components/react/Icon';
import { verseStickerLabel, verseStickers, type VerseSticker } from '../../../../shared/child-verse-stickers';
import ChildCoverSymbol from './ChildCoverSymbol';
import '../../styles/child-verse-stickers.css';

// The same hand-placed angles as the cover studio's sticker sheet. Picked from the verse, not at
// random, so a sticker sits at the same angle every time the chapter opens.
const tilts = [-6, 4, -3, 7, -5, 3, -7, 5, -2];
const tiltFor = (verse: number, chapter: number) => tilts[(verse * 7 + chapter) % tilts.length];

/** The sticker stuck in the verse's right margin, the lane mirroring the left gutter. */
export function VerseStickerMark({ sticker, verse, chapter, fresh }: { sticker: VerseSticker; verse: number; chapter: number; fresh: boolean }) {
  return <span className="pds-kids-verse-sticker" role="img" aria-label={`${verseStickerLabel(sticker)} sticker`}
    data-fresh={fresh || undefined} style={{ '--kids-tilt': `${tiltFor(verse, chapter)}deg` } as CSSProperties}>
    <ChildCoverSymbol symbol={sticker} size={16} />
  </span>;
}

/** A small sheet of die-cut stickers under the verse's actions. Tapping one sticks it on. */
export function VerseStickerPicker({ current, reference, onPick, onClose }: {
  current: VerseSticker | null; reference: string; onPick: (sticker: VerseSticker | null) => void; onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], button')?.focus();
  }, []);
  return <div ref={sheet} className="pds-kids-bible__verse-extra pds-kids-verse-stickers" role="group" aria-label={`Stickers for ${reference}`}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <div className="pds-kids-verse-stickers__sheet">
      {verseStickers.map((sticker, index) => <button key={sticker} type="button" className="pds-kids-verse-stickers__option"
        aria-label={`${verseStickerLabel(sticker)} sticker`} aria-pressed={current === sticker}
        style={{ '--kids-tilt': `${tilts[index % tilts.length]}deg` } as CSSProperties}
        onClick={() => onPick(sticker)}>
        <span aria-hidden="true"><ChildCoverSymbol symbol={sticker} size={18} /></span>
      </button>)}
    </div>
    {current && <button type="button" className="proto-settings-btn proto-settings-btn--secondary pds-kids-verse-stickers__remove" onClick={() => onPick(null)}>
      <Icon name="xmark" size={13} aria-hidden /> Take it off
    </button>}
  </div>;
}

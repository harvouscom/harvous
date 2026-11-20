/**
 * The kids' desk: a soft gradient tinted by the notebook's cover colour, with die-cut stickers
 * around it. The same scene as harvous.com's child notebooks page and the notebook move page.
 * Used behind the signed-out page and the first-open "Make it yours" welcome, so the two feel
 * like one place. It fills its positioned parent and sits behind its content.
 */
import type { CSSProperties } from 'react';
import ChildCoverSymbol from '../prototype/ChildCoverSymbol';
import '../../styles/kids-desk.css';

type Tone = 'blue' | 'green' | 'purple' | 'pink' | 'orange' | 'yellow';
export type DeskSticker = { symbol: 'rainbow' | 'fish' | 'sun' | 'heart' | 'star' | 'dove'; tone: Tone; top: string; left: string; tilt: number };

/** Six stickers around the edges of a full page. */
export const PAGE_STICKERS: DeskSticker[] = [
  { symbol: 'rainbow', tone: 'pink', top: '9%', left: '9%', tilt: -10 },
  { symbol: 'sun', tone: 'yellow', top: '6%', left: '82%', tilt: 12 },
  { symbol: 'fish', tone: 'blue', top: '34%', left: '4%', tilt: 8 },
  { symbol: 'heart', tone: 'orange', top: '30%', left: '90%', tilt: -7 },
  { symbol: 'star', tone: 'purple', top: '76%', left: '7%', tilt: -12 },
  { symbol: 'dove', tone: 'green', top: '80%', left: '86%', tilt: 6 },
];

export default function ChildDesk({ stickers = PAGE_STICKERS, className }: { stickers?: DeskSticker[]; className?: string }) {
  return (
    <div className={className ? `kids-desk ${className}` : 'kids-desk'} aria-hidden="true">
      {stickers.map(sticker => (
        <span key={sticker.symbol} className="kids-desk__sticker" data-tone={sticker.tone}
          style={{ top: sticker.top, left: sticker.left, '--tilt': `${sticker.tilt}deg` } as CSSProperties}>
          <ChildCoverSymbol symbol={sticker.symbol} size={20} />
        </span>
      ))}
    </div>
  );
}

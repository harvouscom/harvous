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
/** `size` scales the sticker (1 is the usual 48px), so a scatter can mix big and small ones. */
export type DeskSticker = { symbol: 'rainbow' | 'fish' | 'sun' | 'heart' | 'star' | 'dove'; tone: Tone; top: string; left: string; tilt: number; size?: number };

/** Six stickers around the edges of a full page, mixed sizes and tilts so they don't line up. */
export const PAGE_STICKERS: DeskSticker[] = [
  { symbol: 'rainbow', tone: 'pink', top: '8%', left: '10%', tilt: -14, size: 1.2 },
  { symbol: 'sun', tone: 'yellow', top: '14%', left: '84%', tilt: 16, size: 0.85 },
  { symbol: 'fish', tone: 'blue', top: '41%', left: '5%', tilt: 6, size: 0.75 },
  { symbol: 'heart', tone: 'orange', top: '27%', left: '89%', tilt: -5, size: 1.1 },
  { symbol: 'star', tone: 'purple', top: '82%', left: '13%', tilt: 11, size: 0.9 },
  { symbol: 'dove', tone: 'green', top: '74%', left: '83%', tilt: -9, size: 1.15 },
];

export default function ChildDesk({ stickers = PAGE_STICKERS, className }: { stickers?: DeskSticker[]; className?: string }) {
  return (
    <div className={className ? `kids-desk ${className}` : 'kids-desk'} aria-hidden="true">
      {stickers.map(sticker => (
        <span key={sticker.symbol} className="kids-desk__sticker" data-tone={sticker.tone}
          style={{ top: sticker.top, left: sticker.left, '--tilt': `${sticker.tilt}deg`, '--size': sticker.size ?? 1 } as CSSProperties}>
          <ChildCoverSymbol symbol={sticker.symbol} size={20} />
        </span>
      ))}
    </div>
  );
}

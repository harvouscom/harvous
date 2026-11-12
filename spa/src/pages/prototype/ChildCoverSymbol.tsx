import Icon, { type IconName } from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import rainbowSvg from '@fortawesome/fontawesome-free/svgs/solid/rainbow.svg?raw';
import fishSvg from '@fortawesome/fontawesome-free/svgs/solid/fish.svg?raw';
import doveSvg from '@fortawesome/fontawesome-free/svgs/solid/dove.svg?raw';
import crownSvg from '@fortawesome/fontawesome-free/svgs/solid/crown.svg?raw';
import seedlingSvg from '@fortawesome/fontawesome-free/svgs/solid/seedling.svg?raw';
import anchorSvg from '@fortawesome/fontawesome-free/svgs/solid/anchor.svg?raw';
import sailboatSvg from '@fortawesome/fontawesome-free/svgs/solid/sailboat.svg?raw';
import heartSvg from '@fortawesome/fontawesome-free/svgs/solid/heart.svg?raw';
import handsPrayingSvg from '@fortawesome/fontawesome-free/svgs/solid/hands-praying.svg?raw';
import type { coverSymbols } from '../../../../shared/child-notebook';

/**
 * The child notebook's Bible-story stickers. They live here rather than in the shared `Icon` map
 * so the adult app's initial bundle doesn't carry glyphs only the child notebook and the parent's
 * notebook list draw.
 */
const stickers: Record<string, string> = {
  rainbow: rainbowSvg, fish: fishSvg, dove: doveSvg, crown: crownSvg, seedling: seedlingSvg,
  anchor: anchorSvg, sailboat: sailboatSvg, heart: heartSvg, 'hands-praying': handsPrayingSvg
};
const markup = new Map<string, { __html: string }>();

export default function ChildCoverSymbol({ symbol, size }: { symbol: Exclude<typeof coverSymbols[number], 'initial'>; size: number }) {
  const raw = stickers[symbol];
  if (!raw) return <Icon name={symbol as IconName} size={size} />;
  const key = `${symbol}|${size}`;
  let html = markup.get(key);
  if (!html) {
    // A stable object per glyph and size, so React doesn't re-apply innerHTML every render.
    html = { __html: safeRenderHtml(raw.replace(/<svg\s+/, `<svg fill="currentColor" width="${size}" height="${size}" style="display:block;overflow:visible" `)) };
    markup.set(key, html);
  }
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, color: 'inherit' }} dangerouslySetInnerHTML={html} />;
}

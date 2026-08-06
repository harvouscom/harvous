/**
 * Icon component for rendering Font Awesome SVGs inline
 * Allows CSS styling (fill, color) unlike <img> elements
 *
 * Following 37signals #nobuild philosophy - no CDN dependency
 */
import React from 'react';
import { safeRenderHtml } from '@/utils/content-renderer';

// Font Awesome SVGs (space dropdown and shared UI) - add fill="currentColor" for color inheritance
import checkSvg from '@fortawesome/fontawesome-free/svgs/solid/check.svg?raw';
import xmarkSvg from '@fortawesome/fontawesome-free/svgs/solid/xmark.svg?raw';
import plusSvg from '@fortawesome/fontawesome-free/svgs/solid/plus.svg?raw';
import bullhornSvg from '@fortawesome/fontawesome-free/svgs/solid/bullhorn.svg?raw';
import caretDownSvg from '@fortawesome/fontawesome-free/svgs/solid/caret-down.svg?raw';
import caretUpSvg from '@fortawesome/fontawesome-free/svgs/solid/caret-up.svg?raw';
import caretLeftSvg from '@fortawesome/fontawesome-free/svgs/solid/caret-left.svg?raw';
import caretRightSvg from '@fortawesome/fontawesome-free/svgs/solid/caret-right.svg?raw';
import chevronDownSvg from '@fortawesome/fontawesome-free/svgs/solid/chevron-down.svg?raw';
import sortSvg from '@fortawesome/fontawesome-free/svgs/solid/sort.svg?raw';
import lockSvg from '@fortawesome/fontawesome-free/svgs/solid/lock.svg?raw';
import unlockSvg from '@fortawesome/fontawesome-free/svgs/solid/unlock.svg?raw';
import rightFromBracketSvg from '@fortawesome/fontawesome-free/svgs/solid/right-from-bracket.svg?raw';
import bookmarkSvg from '@fortawesome/fontawesome-free/svgs/solid/bookmark.svg?raw';
import rectangleListSvg from '@fortawesome/fontawesome-free/svgs/solid/rectangle-list.svg?raw';
import listCheckSvg from '@fortawesome/fontawesome-free/svgs/solid/list-check.svg?raw';
import arrowRotateLeftSvg from '@fortawesome/fontawesome-free/svgs/solid/arrow-rotate-left.svg?raw';
import arrowRotateRightSvg from '@fortawesome/fontawesome-free/svgs/solid/arrow-rotate-right.svg?raw';
import strikethroughSvg from '@fortawesome/fontawesome-free/svgs/solid/strikethrough.svg?raw';
import indentSvg from '@fortawesome/fontawesome-free/svgs/solid/indent.svg?raw';
import outdentSvg from '@fortawesome/fontawesome-free/svgs/solid/outdent.svg?raw';
import highlighterSvg from '@fortawesome/fontawesome-free/svgs/solid/highlighter.svg?raw';
import quoteLeftSvg from '@fortawesome/fontawesome-free/svgs/solid/quote-left.svg?raw';
import barsSvg from '@fortawesome/fontawesome-free/svgs/solid/bars.svg?raw';
import gearSvg from '@fortawesome/fontawesome-free/svgs/solid/gear.svg?raw';
import keySvg from '@fortawesome/fontawesome-free/svgs/solid/key.svg?raw';
import keyboardSvg from '@fortawesome/fontawesome-free/svgs/solid/keyboard.svg?raw';
import tableCellsSvg from '@fortawesome/fontawesome-free/svgs/solid/table-cells.svg?raw';
import tableColumnsSvg from '@fortawesome/fontawesome-free/svgs/solid/table-columns.svg?raw';
import arrowRightArrowLeftSvg from '@fortawesome/fontawesome-free/svgs/solid/arrow-right-arrow-left.svg?raw';
import arrowsLeftRightSvg from '@fortawesome/fontawesome-free/svgs/solid/arrows-left-right.svg?raw';
import arrowsTurnToDotsSvg from '@fortawesome/fontawesome-free/svgs/solid/arrows-turn-to-dots.svg?raw';
import shuffleSvg from '@fortawesome/fontawesome-free/svgs/solid/shuffle.svg?raw';
import arrowLeftSvg from '@fortawesome/fontawesome-free/svgs/solid/arrow-left.svg?raw';
import arrowRightSvg from '@fortawesome/fontawesome-free/svgs/solid/arrow-right.svg?raw';
import folderSvg from '@fortawesome/fontawesome-free/svgs/solid/folder.svg?raw';
import fileLinesSvg from '@fortawesome/fontawesome-free/svgs/solid/file-lines.svg?raw';
import noteStickySvg from '@fortawesome/fontawesome-free/svgs/solid/note-sticky.svg?raw';
import bookSvg from '@fortawesome/fontawesome-free/svgs/solid/book.svg?raw';
import paintbrushSvg from '@fortawesome/fontawesome-free/svgs/solid/paintbrush.svg?raw';
import circleUserSvg from '@fortawesome/fontawesome-free/svgs/solid/circle-user.svg?raw';
import circleXmarkSvg from '@fortawesome/fontawesome-free/svgs/solid/circle-xmark.svg?raw';
import circleCheckSvg from '@fortawesome/fontawesome-free/svgs/solid/circle-check.svg?raw';
import ellipsisVerticalSvg from '@fortawesome/fontawesome-free/svgs/solid/ellipsis-vertical.svg?raw';
import ellipsisSvg from '@fortawesome/fontawesome-free/svgs/solid/ellipsis.svg?raw';
import thumbtackSvg from '@fortawesome/fontawesome-free/svgs/solid/thumbtack.svg?raw';
import trashCanSvg from '@fortawesome/fontawesome-free/svgs/solid/trash-can.svg?raw';
import penSvg from '@fortawesome/fontawesome-free/svgs/solid/pen.svg?raw';
import linkSvg from '@fortawesome/fontawesome-free/svgs/solid/link.svg?raw';
import newspaperSvg from '@fortawesome/fontawesome-free/svgs/solid/newspaper.svg?raw';
import scrollSvg from '@fortawesome/fontawesome-free/svgs/solid/scroll.svg?raw';
import paperclipSvg from '@fortawesome/fontawesome-free/svgs/solid/paperclip.svg?raw';
import arrowUpRightFromSquareSvg from '@fortawesome/fontawesome-free/svgs/solid/arrow-up-right-from-square.svg?raw';
import imageSvg from '@fortawesome/fontawesome-free/svgs/solid/image.svg?raw';
import personSvg from '@fortawesome/fontawesome-free/svgs/solid/person.svg?raw';
import bookOpenSvg from '@fortawesome/fontawesome-free/svgs/solid/book-open.svg?raw';
import bookOpenReaderSvg from '@fortawesome/fontawesome-free/svgs/solid/book-open-reader.svg?raw';
import idCardClipSvg from '@fortawesome/fontawesome-free/svgs/solid/id-card-clip.svg?raw';
import linesLeaningSvg from '@fortawesome/fontawesome-free/svgs/solid/lines-leaning.svg?raw';
import locationDotSvg from '@fortawesome/fontawesome-free/svgs/solid/location-dot.svg?raw';
import churchSvg from '@fortawesome/fontawesome-free/svgs/solid/church.svg?raw';
import rssSvg from '@fortawesome/fontawesome-free/svgs/solid/rss.svg?raw';
import tagSvg from '@fortawesome/fontawesome-free/svgs/solid/tag.svg?raw';
import shareSvg from '@fortawesome/fontawesome-free/svgs/solid/share.svg?raw';
import circleUpSvg from '@fortawesome/fontawesome-free/svgs/solid/circle-up.svg?raw';
import chartPieSvg from '@fortawesome/fontawesome-free/svgs/solid/chart-pie.svg?raw';
import chartLineSvg from '@fortawesome/fontawesome-free/svgs/solid/chart-line.svg?raw';
import chartSimpleSvg from '@fortawesome/fontawesome-free/svgs/solid/chart-simple.svg?raw';
import calendarWeekSvg from '@fortawesome/fontawesome-free/svgs/solid/calendar-week.svg?raw';
/*
  Two keys whose original glyphs (`wifi-slash`, `horizontal-rule`) are Font
  Awesome **Pro**, and so were hand-copied SVG literals here. Replaced with the
  nearest Free equivalents so the whole set is package-sourced and nothing in
  this file is a hand-written path. Decided with Derek, Aug 2026.
*/
import plugCircleXmarkSvg from '@fortawesome/fontawesome-free/svgs/solid/plug-circle-xmark.svg?raw';
import userShieldSvg from '@fortawesome/fontawesome-free/svgs/solid/user-shield.svg?raw';
import chalkboardUserSvg from '@fortawesome/fontawesome-free/svgs/solid/chalkboard-user.svg?raw';
import idBadgeSvg from '@fortawesome/fontawesome-free/svgs/solid/id-badge.svg?raw';
import clockSvg from '@fortawesome/fontawesome-free/svgs/solid/clock.svg?raw';
import heartPulseSvg from '@fortawesome/fontawesome-free/svgs/solid/heart-pulse.svg?raw';
import envelopeSvg from '@fortawesome/fontawesome-free/svgs/solid/envelope.svg?raw';
import languageSvg from '@fortawesome/fontawesome-free/svgs/solid/language.svg?raw';
import seedlingSvg from '@fortawesome/fontawesome-free/svgs/solid/seedling.svg?raw';
import leafSvg from '@fortawesome/fontawesome-free/svgs/solid/leaf.svg?raw';
import snowflakeSvg from '@fortawesome/fontawesome-free/svgs/solid/snowflake.svg?raw';
import boldSvg from '@fortawesome/fontawesome-free/svgs/solid/bold.svg?raw';
import italicSvg from '@fortawesome/fontawesome-free/svgs/solid/italic.svg?raw';
import underlineSvg from '@fortawesome/fontawesome-free/svgs/solid/underline.svg?raw';
import headingSvg from '@fortawesome/fontawesome-free/svgs/solid/heading.svg?raw';
import listOlSvg from '@fortawesome/fontawesome-free/svgs/solid/list-ol.svg?raw';
import listSvg from '@fortawesome/fontawesome-free/svgs/solid/list.svg?raw';
import eraserSvg from '@fortawesome/fontawesome-free/svgs/solid/eraser.svg?raw';
import replySvg from '@fortawesome/fontawesome-free/svgs/solid/reply.svg?raw';
import userSvg from '@fortawesome/fontawesome-free/svgs/solid/user.svg?raw';
import userGroupSvg from '@fortawesome/fontawesome-free/svgs/solid/user-group.svg?raw';
import eyeSvg from '@fortawesome/fontawesome-free/svgs/solid/eye.svg?raw';
import pasteSvg from '@fortawesome/fontawesome-free/svgs/solid/paste.svg?raw';
import fileImageSvg from '@fortawesome/fontawesome-free/svgs/solid/file-image.svg?raw';
import upRightAndDownLeftFromCenterSvg from '@fortawesome/fontawesome-free/svgs/solid/up-right-and-down-left-from-center.svg?raw';
import arrowsLeftRightToLineSvg from '@fortawesome/fontawesome-free/svgs/solid/arrows-left-right-to-line.svg?raw';
import sunSvg from '@fortawesome/fontawesome-free/svgs/solid/sun.svg?raw';
import trophySvg from '@fortawesome/fontawesome-free/svgs/solid/trophy.svg?raw';
import layerGroupSvg from '@fortawesome/fontawesome-free/svgs/solid/layer-group.svg?raw';
import magnifyingGlassSvg from '@fortawesome/fontawesome-free/svgs/solid/magnifying-glass.svg?raw';
import wifiSvg from '@fortawesome/fontawesome-free/svgs/solid/wifi.svg?raw';
import penToSquareSvg from '@fortawesome/fontawesome-free/svgs/solid/pen-to-square.svg?raw';
import circleInfoSvg from '@fortawesome/fontawesome-free/svgs/solid/circle-info.svg?raw';
import filePdfSvg from '@fortawesome/fontawesome-free/svgs/solid/file-pdf.svg?raw';
import calendarSvg from '@fortawesome/fontawesome-free/svgs/solid/calendar.svg?raw';
import calendarCheckSvg from '@fortawesome/fontawesome-free/svgs/solid/calendar-check.svg?raw';
import circleExclamationSvg from '@fortawesome/fontawesome-free/svgs/solid/circle-exclamation.svg?raw';
import arrowsRotateSvg from '@fortawesome/fontawesome-free/svgs/solid/arrows-rotate.svg?raw';
import spinnerSvg from '@fortawesome/fontawesome-free/svgs/solid/spinner.svg?raw';
import cloudArrowUpSvg from '@fortawesome/fontawesome-free/svgs/solid/cloud-arrow-up.svg?raw';
import copySvg from '@fortawesome/fontawesome-free/svgs/solid/copy.svg?raw';
import globeSvg from '@fortawesome/fontawesome-free/svgs/solid/globe.svg?raw';
import starSvg from '@fortawesome/fontawesome-free/svgs/solid/star.svg?raw';
import circleMinusSvg from '@fortawesome/fontawesome-free/svgs/solid/circle-minus.svg?raw';
import minusSvg from '@fortawesome/fontawesome-free/svgs/solid/minus.svg?raw';
import wandMagicSparklesSvg from '@fortawesome/fontawesome-free/svgs/solid/wand-magic-sparkles.svg?raw';
import wrenchSvg from '@fortawesome/fontawesome-free/svgs/solid/wrench.svg?raw';
import rotateLeftSvg from '@fortawesome/fontawesome-free/svgs/solid/rotate-left.svg?raw';

function withCurrentColor(svg: string): string {
  return svg.includes('fill="currentColor"') ? svg : svg.replace(/<path /, '<path fill="currentColor" ');
}

/** FA icons with multiple `<path>`s: set fill on root so every path inherits `currentColor`. */
function svgRootCurrentColor(svg: string): string {
  if (svg.includes('fill="currentColor"')) return svg;
  return svg.replace(/<svg\s+/, '<svg fill="currentColor" ');
}

// SVG icons with fill="currentColor" to inherit CSS color
const icons = {
  // Toolbar icons
  plus: withCurrentColor(plusSvg),
  'arrow-rotate-left': withCurrentColor(arrowRotateLeftSvg),
  'arrow-rotate-right': withCurrentColor(arrowRotateRightSvg),
  bold: svgRootCurrentColor(boldSvg),
  italic: svgRootCurrentColor(italicSvg),
  underline: svgRootCurrentColor(underlineSvg),
  strikethrough: withCurrentColor(strikethroughSvg),
  /* Was FA Pro `horizontal-rule`; `minus` is the Free stand-in and is
     visually near-identical at toolbar size. */
  'horizontal-rule': svgRootCurrentColor(minusSvg),
  outdent: withCurrentColor(outdentSvg),
  indent: withCurrentColor(indentSvg),
  heading: svgRootCurrentColor(headingSvg),
  'list-ol': svgRootCurrentColor(listOlSvg),
  list: svgRootCurrentColor(listSvg),
  eraser: svgRootCurrentColor(eraserSvg),
  highlighter: withCurrentColor(highlighterSvg),
  'quote-left': withCurrentColor(quoteLeftSvg),
  reply: svgRootCurrentColor(replySvg),
  // Privacy selector icons
  user: svgRootCurrentColor(userSvg),
  'user-group': svgRootCurrentColor(userGroupSvg),
  megaphone: withCurrentColor(bullhornSvg),
  
  // Selection/action icons (Font Awesome)
  'eye': svgRootCurrentColor(eyeSvg),
  check: withCurrentColor(checkSvg),
  xmark: withCurrentColor(xmarkSvg),
  'trash-can': withCurrentColor(trashCanSvg),
  'pen': withCurrentColor(penSvg),
  'link': svgRootCurrentColor(linkSvg),
  image: withCurrentColor(imageSvg),
  'person': withCurrentColor(personSvg),
  'book-open': svgRootCurrentColor(bookOpenSvg),
  'book-open-reader': svgRootCurrentColor(bookOpenReaderSvg),
  'id-card-clip': svgRootCurrentColor(idCardClipSvg),
  'lines-leaning': withCurrentColor(linesLeaningSvg),
  'location-dot': svgRootCurrentColor(locationDotSvg),
  'church': svgRootCurrentColor(churchSvg),
  /** Ministry channel — followable feed (distinct from My Church / Shared Spaces). */
  rss: svgRootCurrentColor(rssSvg),
  'tag': withCurrentColor(tagSvg),
  'share': withCurrentColor(shareSvg),
  paste: svgRootCurrentColor(pasteSvg),
  // Note type icons
  bookmark: withCurrentColor(bookmarkSvg),
  'rectangle-list': withCurrentColor(rectangleListSvg),
  'list-check': withCurrentColor(listCheckSvg),
  scroll: svgRootCurrentColor(scrollSvg),
  /* Added on main by the Resource Library; kept as its package import. */
  paperclip: withCurrentColor(paperclipSvg),
  'file-image': svgRootCurrentColor(fileImageSvg),
  newspaper: svgRootCurrentColor(newspaperSvg),
  'arrow-up-right-from-square': svgRootCurrentColor(arrowUpRightFromSquareSvg),
  'up-right-and-down-left-from-center': svgRootCurrentColor(upRightAndDownLeftFromCenterSvg),
  'arrows-left-right': withCurrentColor(arrowsLeftRightSvg),
  'arrows-turn-to-dots': withCurrentColor(arrowsTurnToDotsSvg),
  shuffle: withCurrentColor(shuffleSvg),
  'arrows-left-right-to-line': svgRootCurrentColor(arrowsLeftRightToLineSvg),
  sort: withCurrentColor(sortSvg),
  
  // Achievement icons
  sun: svgRootCurrentColor(sunSvg),
  trophy: svgRootCurrentColor(trophySvg),
  // Navigation/UI icons
  bars: withCurrentColor(barsSvg),
  'ellipsis-vertical': svgRootCurrentColor(ellipsisVerticalSvg),
  ellipsis: svgRootCurrentColor(ellipsisSvg),
  thumbtack: svgRootCurrentColor(thumbtackSvg),
  gear: withCurrentColor(gearSvg),
  key: withCurrentColor(keySvg),
  keyboard: withCurrentColor(keyboardSvg),
  'circle-up': withCurrentColor(circleUpSvg),
  'table-cells': withCurrentColor(tableCellsSvg),
  'table-columns': withCurrentColor(tableColumnsSvg),
  'arrow-left': withCurrentColor(arrowLeftSvg),
  'arrow-right': withCurrentColor(arrowRightSvg),
  'arrow-right-arrow-left': withCurrentColor(arrowRightArrowLeftSvg),
  folder: withCurrentColor(folderSvg),
  'file-lines': withCurrentColor(fileLinesSvg),
  book: withCurrentColor(bookSvg),
  paintbrush: withCurrentColor(paintbrushSvg),
  'circle-user': svgRootCurrentColor(circleUserSvg),
  'circle-xmark': svgRootCurrentColor(circleXmarkSvg),
  'circle-check': svgRootCurrentColor(circleCheckSvg),

  'layer-group': svgRootCurrentColor(layerGroupSvg),
  'magnifying-glass': svgRootCurrentColor(magnifyingGlassSvg),
  wifi: svgRootCurrentColor(wifiSvg),
  // Font Awesome Solid wifi-slash (not bundled in @fortawesome/fontawesome-free SVG set); path via Iconify fa-solid:wifi-slash
  /* Was FA Pro `wifi-slash`; `plug-circle-xmark` is the Free set's
     disconnected glyph. Different shape, same meaning. */
  'wifi-slash': svgRootCurrentColor(plugCircleXmarkSvg),
  'note-sticky': withCurrentColor(noteStickySvg),
  'pen-to-square': svgRootCurrentColor(penToSquareSvg),
  'circle-info': svgRootCurrentColor(circleInfoSvg),
  'file-pdf': svgRootCurrentColor(filePdfSvg),
  'caret-down': withCurrentColor(caretDownSvg),
  'caret-up': withCurrentColor(caretUpSvg),
  'caret-left': withCurrentColor(caretLeftSvg),
  'caret-right': withCurrentColor(caretRightSvg),
  'chevron-down': withCurrentColor(chevronDownSvg),
  // Calendar icons
  calendar: svgRootCurrentColor(calendarSvg),
  'calendar-check': svgRootCurrentColor(calendarCheckSvg),
  // Sync/offline icons
  'circle-exclamation': svgRootCurrentColor(circleExclamationSvg),
  'arrows-rotate': svgRootCurrentColor(arrowsRotateSvg),
  spinner: svgRootCurrentColor(spinnerSvg),
  'cloud-arrow-up': svgRootCurrentColor(cloudArrowUpSvg),
  // Share icons
  copy: svgRootCurrentColor(copySvg),
  globe: svgRootCurrentColor(globeSvg),
  language: svgRootCurrentColor(languageSvg),
  'chart-pie': svgRootCurrentColor(chartPieSvg),
  'user-shield': svgRootCurrentColor(userShieldSvg),
  'chalkboard-user': svgRootCurrentColor(chalkboardUserSvg),
  'id-badge': svgRootCurrentColor(idBadgeSvg),
  'chart-line': svgRootCurrentColor(chartLineSvg),
  'chart-simple': svgRootCurrentColor(chartSimpleSvg),
  'calendar-week': svgRootCurrentColor(calendarWeekSvg),
  'heart-pulse': svgRootCurrentColor(heartPulseSvg),
  seedling: svgRootCurrentColor(seedlingSvg),
  leaf: svgRootCurrentColor(leafSvg),
  snowflake: svgRootCurrentColor(snowflakeSvg),
  envelope: withCurrentColor(envelopeSvg),
  clock: svgRootCurrentColor(clockSvg),
  lock: withCurrentColor(lockSvg),
  unlock: withCurrentColor(unlockSvg),
  'right-from-bracket': withCurrentColor(rightFromBracketSvg),
  star: svgRootCurrentColor(starSvg),
  'circle-minus': svgRootCurrentColor(circleMinusSvg),
  minus: svgRootCurrentColor(minusSvg),
  'wand-magic-sparkles': svgRootCurrentColor(wandMagicSparklesSvg),
  wrench: svgRootCurrentColor(wrenchSvg),
  'rotate-left': svgRootCurrentColor(rotateLeftSvg),
};

export type IconName = keyof typeof icons;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

// React 19 re-applies innerHTML whenever the `dangerouslySetInnerHTML` object
// identity changes, replacing the SVG nodes on every render — which churns the
// DOM and can suppress clicks (a press whose mousedown target gets detached
// before mouseup never fires `click`). The icon map is static, so cache one
// stable `{ __html }` object per name+size.
const markupCache = new Map<string, { __html: string }>();

function getIconMarkup(name: IconName, size: number): { __html: string } {
  const cacheKey = `${name}|${size}`;
  let markup = markupCache.get(cacheKey);
  if (!markup) {
    // Add width/height attributes to SVG to ensure proper sizing
    const sizedSvg = icons[name].replace(
      /<svg\s+/,
      `<svg width="${size}" height="${size}" style="display:block" `
    );
    // Use safe renderer to ensure content is always a valid string
    markup = { __html: safeRenderHtml(sizedSvg) };
    markupCache.set(cacheKey, markup);
  }
  return markup;
}

const Icon: React.FC<IconProps> = ({ name, size = 20, className = '', style = {} }) => {
  const svgContent = icons[name];

  if (!svgContent) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  // Ensure svgContent is a string
  if (typeof svgContent !== 'string') {
    console.error(`Icon "${name}" has invalid content type:`, typeof svgContent);
    return null;
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: 'inherit',
        ...style, // Include opacity in span style so it cascades to SVG
      }}
      dangerouslySetInnerHTML={getIconMarkup(name, size)}
    />
  );
};

export default Icon;

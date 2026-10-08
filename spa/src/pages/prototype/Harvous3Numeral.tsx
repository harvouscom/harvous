/**
 * The Harvous 3 numeral: traced, then filled, then lit by a slowly swinging light.
 *
 * Shared by the Welcome 3 sheet and the What's new callout, so both draw the same "3" the
 * `/3/` page on harvous.com does (`src/pages/3.astro` is the other copy; see the sheet's header
 * for why that one is copied rather than shared). Styling and timing live on
 * `.proto-welcome3__numeral*` in prototype-components.css.
 *
 * Gradient and glyph ids come from `useId`: the callout and the sheet can be on screen at once,
 * and two SVGs defining the same id resolve every `url(#…)` to the first — which, if that copy is
 * hidden, paints nothing at all.
 */
import { useId } from 'react';

export default function Harvous3Numeral({ className }: { className?: string }) {
  const base = useId().replace(/:/g, '');
  const grad = `${base}-grad`;
  const drift = `${base}-drift`;
  const glyph = `${base}-glyph`;
  return (
    <svg
      className={['proto-welcome3__numeral', className].filter(Boolean).join(' ')}
      viewBox="-24 -24 1054 1522"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The site's --accent-btn-bg, linear-gradient(171deg, #2bb5ff 7%, #006eff 93%),
            restated in objectBoundingBox space. Hardcoded because an SVG gradient
            cannot read a CSS one. */}
        <linearGradient id={grad} x1="0" y1="0" x2="0.16" y2="1">
          <stop offset="7%" stopColor="#2bb5ff" />
          <stop offset="93%" stopColor="#006eff" />
        </linearGradient>

        {/* The same two blues on a different axis. Cross-fading to this and back is what
            makes the light look like it is moving: SVG gradient geometry is not a CSS
            property, so it cannot be animated directly — but the opacity of a second
            copy of the glyph wearing it can be, and the blend of two smooth gradients is
            just another smooth gradient. */}
        <linearGradient id={drift} x1="0.42" y1="0.06" x2="0" y2="1">
          <stop offset="7%" stopColor="#2bb5ff" />
          <stop offset="93%" stopColor="#006eff" />
        </linearGradient>

        {/* The glyph itself, defined once and worn twice. Carries no fill of its own so each
            `use` can set one; a presentation attribute here would win over anything inherited
            and both copies would look identical. `pathLength` has to live on the geometry, and
            normalises the opening draw's dash maths. */}
        <path id={glyph} pathLength="1" d="M509 1474Q362 1474 261 1436Q161 1398 100 1337Q39 1276 14 1214Q-11 1156 9 1094Q30 1033 81 1008Q132 983 181 996Q231 1010 262 1058Q278 1092 302 1122Q327 1152 367 1170Q406 1188 471 1188Q545 1188 599 1142Q654 1096 654 1012Q654 936 598 889Q543 842 434 842H412Q361 842 327 805Q293 768 293 718Q293 668 327 631Q362 594 414 594H435Q534 594 580 552Q625 508 625 444Q625 370 582 330Q539 290 470 290Q420 290 389 302Q359 314 334 338Q310 362 291 395Q262 436 214 448Q166 462 116 439Q65 416 45 359Q25 301 55 242Q89 176 150 120Q212 64 298 32Q385 0 512 0Q703 0 825 96Q947 192 947 359Q947 468 889 552Q830 636 722 674Q849 702 927 796Q1006 889 1006 1026Q1006 1218 868 1346Q730 1474 509 1474Z" />
      </defs>

      {/* Inline styles, because the ids are per instance and a stylesheet cannot know them. */}
      <use
        className="proto-welcome3__numeral-path"
        href={`#${glyph}`}
        style={{ fill: `url(#${grad})`, stroke: `url(#${grad})` }}
      />
      {/* The same glyph again, lit from elsewhere, fading in and out over the one below. */}
      <use className="proto-welcome3__numeral-drift" href={`#${glyph}`} style={{ fill: `url(#${drift})` }} />
    </svg>
  );
}

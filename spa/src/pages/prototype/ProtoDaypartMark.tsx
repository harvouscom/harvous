/**
 * "Friday nights", with the time of day drawn beside it — a crescent and two stars that
 * twinkle, a sun rising over a line, a sun turning, a sun setting.
 *
 * The greeting's rhythm clause ("often on Friday nights") is the one part of the sentence that is
 * about *when* someone studies rather than what, and in plain words it read like every other
 * clause. A small picture of the hour makes it the sentence's quiet signature. Drawn here rather
 * than taken from the icon set: the set has no moon, and the parts that move (the stars, the
 * rays, the sun against its horizon) have to be their own elements.
 *
 * Neutral ink, never a colour of its own: the glyph is the decoration, and the app's one accent
 * is kept for things you act on. It moves for a few beats when the greeting arrives and then
 * rests — motion that never stops is a distraction on a page you read — and wakes again under
 * the pointer. Reduced motion holds it still (CSS, `.proto-daypart`).
 */
import { useId } from 'react';

export type Daypart = 'mornings' | 'afternoons' | 'evenings' | 'nights';

export function isDaypart(value: string): value is Daypart {
  return value === 'mornings' || value === 'afternoons' || value === 'evenings' || value === 'nights';
}

/** Eight short rays around (8, y), the sun's centre. */
function Rays({ cy, inner, outer }: { cy: number; inner: number; outer: number }) {
  return (
    <g className="proto-daypart__rays">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={8 + Math.cos(a) * inner}
            y1={cy + Math.sin(a) * inner}
            x2={8 + Math.cos(a) * outer}
            y2={cy + Math.sin(a) * outer}
          />
        );
      })}
    </g>
  );
}

/*
 * The rising and setting suns are clipped at the horizon, so they read as half a sun against the
 * edge of the world rather than a sun with a line through it. The clip id is per instance
 * (`useId`): a fixed id shared by two rendered copies makes the second resolve to the first's
 * clip, and if that copy sits in a hidden subtree the glyph quietly vanishes.
 */
function Glyph({ daypart, clipId }: { daypart: Daypart; clipId: string }) {
  switch (daypart) {
    case 'nights':
      return (
        <>
          <path className="proto-daypart__moon" d="M9.6 2.6a5.4 5.4 0 1 0 3.9 8.9A4.4 4.4 0 0 1 9.6 2.6z" />
          <path className="proto-daypart__star proto-daypart__star--a" d="M13.2 1.6l.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15-1.15-.45 1.15-.45z" />
          <path className="proto-daypart__star proto-daypart__star--b" d="M14.4 6.4l.3.75.75.3-.75.3-.3.75-.3-.75-.75-.3.75-.3z" />
        </>
      );
    case 'mornings':
      return (
        <>
          <clipPath id={clipId}>
            <rect x="0" y="-2" width="16" height="14.5" />
          </clipPath>
          <g className="proto-daypart__sun proto-daypart__sun--rise" clipPath={`url(#${clipId})`}>
            <circle cx="8" cy="10.5" r="3" />
            <Rays cy={10.5} inner={4.4} outer={5.9} />
          </g>
          <line className="proto-daypart__horizon" x1="1" y1="12.5" x2="15" y2="12.5" />
        </>
      );
    case 'evenings':
      return (
        <>
          <clipPath id={clipId}>
            <rect x="0" y="-2" width="16" height="14.5" />
          </clipPath>
          {/* Lower than the morning's, so the two read as going down and coming up. */}
          <g className="proto-daypart__sun proto-daypart__sun--set" clipPath={`url(#${clipId})`}>
            <circle cx="8" cy="12" r="3.2" />
            <Rays cy={12} inner={4.6} outer={5.8} />
          </g>
          <line className="proto-daypart__horizon" x1="1" y1="12.5" x2="15" y2="12.5" />
          <line className="proto-daypart__horizon proto-daypart__horizon--short" x1="4" y1="14.5" x2="12" y2="14.5" />
        </>
      );
    case 'afternoons':
    default:
      return (
        <g className="proto-daypart__sun proto-daypart__sun--turn">
          <circle cx="8" cy="8" r="2.9" />
          <Rays cy={8} inner={4.6} outer={6.3} />
        </g>
      );
  }
}

export default function ProtoDaypartMark({ day, daypart }: { day: string; daypart: Daypart }) {
  const clipId = `proto-daypart-${useId().replace(/:/g, '')}`;
  return (
    <span className="proto-daypart" data-daypart={daypart}>
      <svg
        className="proto-daypart__glyph"
        viewBox="0 0 16 16"
        width="1em"
        height="1em"
        aria-hidden
        focusable="false"
      >
        <Glyph daypart={daypart} clipId={clipId} />
      </svg>
      <span className="proto-daypart__words">
        {day} {daypart}
      </span>
    </span>
  );
}

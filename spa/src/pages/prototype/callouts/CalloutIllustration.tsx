/**
 * The picture at the top of a feature callout — a small drawing of the thing being announced,
 * in the app's own materials: a sheet of paper, lines of text as soft bars, a card stack.
 *
 * Drawn rather than screenshotted, so it is crisp at any density, follows light and dark through
 * tokens, and never shows someone else's notes. Neutral throughout; the one moving part settles
 * in once when the card arrives (CSS, `.proto-callout-art`), and holds still for reduced motion.
 */
export type CalloutIllustrationKey = 'today-tabs' | 'legal' | 'whats-new' | 'import' | 'letter';

/** A line of "text": a rounded bar. */
function Line({ x, y, w, strong = false }: { x: number; y: number; w: number; strong?: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={5}
      rx={2.5}
      className={strong ? 'proto-callout-art__ink proto-callout-art__ink--strong' : 'proto-callout-art__ink'}
    />
  );
}

function TodayTabs() {
  return (
    <>
      {/* The day sheet. */}
      <rect x="54" y="12" width="172" height="130" rx="3" className="proto-callout-art__paper" />
      <Line x={68} y={22} w={34} strong />
      <Line x={84} y={36} w={112} />
      {/* The tab group, the first one chosen. */}
      <rect x="68" y="50" width="96" height="16" rx="8" className="proto-callout-art__trough" />
      <rect x="70" y="52" width="32" height="12" rx="6" className="proto-callout-art__paper" />
      <Line x={76} y={56} w={20} strong />
      <Line x={108} y={56} w={22} />
      <Line x={136} y={56} w={22} />
      {/* The deck: one card in front, one peeking under it. */}
      <rect x="74" y="88" width="132" height="22" rx="7" className="proto-callout-art__card proto-callout-art__card--behind" />
      <g className="proto-callout-art__front">
        <rect x="68" y="72" width="144" height="26" rx="8" className="proto-callout-art__card" />
        <rect x="76" y="79" width="12" height="12" rx="4" className="proto-callout-art__trough" />
        <Line x={94} y={80} w={58} strong />
        <Line x={94} y={89} w={40} />
        <Line x={178} y={83} w={24} />
      </g>
    </>
  );
}

function Legal() {
  return (
    <>
      <rect x="90" y="14" width="100" height="128" rx="3" className="proto-callout-art__paper" />
      <Line x={104} y={26} w={44} strong />
      <Line x={104} y={42} w={72} />
      <Line x={104} y={52} w={64} />
      <Line x={104} y={62} w={70} />
      <Line x={104} y={78} w={58} />
      <Line x={104} y={88} w={68} />
      <g className="proto-callout-art__front">
        <circle cx="184" cy="98" r="16" className="proto-callout-art__card" />
        <path
          d="M176.5 98.5l5 5 9-10"
          className="proto-callout-art__check"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </>
  );
}

/** A release: a page of notes with a burst of light beside it. */
function WhatsNew() {
  return (
    <>
      <rect x="84" y="16" width="112" height="126" rx="3" className="proto-callout-art__paper" />
      <Line x={98} y={30} w={40} strong />
      <Line x={98} y={46} w={84} />
      <Line x={98} y={56} w={70} />
      <rect x="98" y="70" width="84" height="24" rx="6" className="proto-callout-art__trough" />
      <Line x={98} y={104} w={62} />
      <g className="proto-callout-art__front">
        <circle cx="200" cy="34" r="17" className="proto-callout-art__card" />
        <path
          d="M200 23l2.6 6.6 6.9 1.4-5.3 4.6 1.6 6.8L200 38.8l-5.8 3.6 1.6-6.8-5.3-4.6 6.9-1.4z"
          className="proto-callout-art__mark"
        />
      </g>
    </>
  );
}

/** Bringing notes over: two loose files sliding onto a sheet. */
function Import() {
  return (
    <>
      <rect x="110" y="34" width="112" height="108" rx="3" className="proto-callout-art__paper" />
      <Line x={124} y={48} w={44} strong />
      <Line x={124} y={64} w={84} />
      <Line x={124} y={74} w={70} />
      <Line x={124} y={84} w={78} />
      <g className="proto-callout-art__front">
        <rect x="58" y="22" width="52" height="64" rx="5" className="proto-callout-art__card proto-callout-art__card--behind" transform="rotate(-8 84 54)" />
        <rect x="70" y="30" width="52" height="64" rx="5" className="proto-callout-art__card" transform="rotate(4 96 62)" />
        <Line x={80} y={44} w={26} strong />
        <Line x={80} y={54} w={32} />
        <Line x={80} y={63} w={28} />
      </g>
    </>
  );
}

/** A letter: a folded sheet in handwriting-like lines, signed. */
function Letter() {
  return (
    <>
      <rect x="80" y="14" width="120" height="128" rx="3" className="proto-callout-art__paper" />
      <Line x={96} y={30} w={30} strong />
      <Line x={96} y={46} w={88} />
      <Line x={96} y={56} w={80} />
      <Line x={96} y={66} w={86} />
      <Line x={96} y={76} w={60} />
      <g className="proto-callout-art__front">
        <path
          d="M120 100c6-8 10-8 12 0s6 8 10 0 8-6 12 2"
          className="proto-callout-art__check"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </>
  );
}

export default function CalloutIllustration({ name }: { name: CalloutIllustrationKey }) {
  return (
    <svg className="proto-callout-art" viewBox="0 0 280 124" preserveAspectRatio="xMidYMax meet" aria-hidden focusable="false">
      {name === 'legal' ? (
        <Legal />
      ) : name === 'whats-new' ? (
        <WhatsNew />
      ) : name === 'import' ? (
        <Import />
      ) : name === 'letter' ? (
        <Letter />
      ) : (
        <TodayTabs />
      )}
    </svg>
  );
}

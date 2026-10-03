/**
 * A padlock whose shackle actually moves — the one piece of motion the lock flows have.
 * `closed` drops the shackle into the body; `open` lifts it and swings it clear. The
 * transition lives in CSS (`.proto-lock-glyph`), which also turns it off for reduced motion.
 *
 * Drawn here rather than taken from the icon set because the icon is one path: the shackle
 * has to be its own element to move.
 */
export default function AnimatedLockGlyph({
  state,
  size = 22,
}: {
  state: 'open' | 'closed';
  size?: number;
}) {
  return (
    <svg
      className="proto-lock-glyph"
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        className="proto-lock-glyph__shackle"
        d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect className="proto-lock-glyph__body" x="4.5" y="10.5" width="15" height="11" rx="3" fill="currentColor" />
    </svg>
  );
}

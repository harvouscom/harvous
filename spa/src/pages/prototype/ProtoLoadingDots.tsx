/**
 * The shell's three-dot loading indicator.
 *
 * The dots (`.load-more-indicator`) predate this and are hand-rolled as three spans at
 * several call sites. Pulling the markup into one place means a row waiting on the server
 * looks the same wherever it appears — the destination menu was reaching for a spinning
 * FontAwesome glyph, which was a second loading vocabulary for the same wait.
 *
 * The dots are always `aria-hidden`: they are decoration, and three pulsing spans inside a
 * live region is noise, not an announcement. What gets announced is `label`, in a wrapping
 * status region — so pass it wherever the dots are the only thing on screen, and leave it
 * off inline, where the surrounding text already says what is loading and one live region
 * per row would make a screen reader read every one of them.
 */
export default function ProtoLoadingDots({ label }: { label?: string }) {
  const dots = (
    <span className="load-more-indicator" aria-hidden="true">
      <span className="load-more-indicator__dot" />
      <span className="load-more-indicator__dot" />
      <span className="load-more-indicator__dot" />
    </span>
  );

  if (!label) return dots;

  return (
    <span role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {dots}
    </span>
  );
}

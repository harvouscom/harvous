/**
 * The words read off the page, with every reference marked where it sits.
 *
 * The page and its Scripture are two sections of the sheet, but they are one thing: each card
 * below came from a place in this text. A plain text box hid that, and left the reader to work
 * out which references to doubt. Here each reference is marked in place; one the scan had to
 * guess at is underlined for checking, and pressing any mark brings its card into view.
 *
 * Correcting is a separate, deliberate mode ("Edit"), because a field that is always live
 * cannot also show the marks.
 */
import type { OcrParagraph } from '@/utils/ocr/ocr-scripture';

export function scanReferenceCardId(key: string): string {
  return `proto-scan-ref-${key.replace(/[^a-z0-9]+/gi, '-')}`;
}

/** Bring a reference's card into view and pulse it, so the eye lands on the right one. */
export function revealScanReferenceCard(key: string): void {
  const card = document.getElementById(scanReferenceCardId(key));
  if (!card) return;
  /*
   * Scroll the sheet's own body, not `scrollIntoView`: that also scrolls every ancestor,
   * including the sheet's `overflow: hidden` frame — which still scrolls when asked to — and
   * slid the whole drawer up off its footer, leaving a blank band under it.
   */
  const body = card.closest('.proto-scan__body');
  if (body instanceof HTMLElement) {
    const b = body.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (c.top < b.top || c.bottom > b.bottom) {
      const delta = c.bottom > b.bottom ? c.bottom - b.bottom + 12 : c.top - b.top - 12;
      body.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
    }
  }
  card.classList.remove('proto-scan-card--pulse');
  // Restart the animation when the same mark is pressed twice.
  void card.offsetWidth;
  card.classList.add('proto-scan-card--pulse');
}

export default function ScanPageText({
  paragraphs,
  flagged,
  excluded,
}: {
  paragraphs: OcrParagraph[];
  /** Reference keys the scan guessed at. */
  flagged: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
}) {
  return (
    <div className="proto-scan-pagetext">
      {paragraphs.map((segments, p) => (
        <p key={p}>
          {segments.map((segment, i) => {
            if (segment.kind === 'text') return <span key={i}>{segment.text}</span>;
            const words = `${segment.text}${segment.translationText}`;
            if (excluded.has(segment.key)) return <span key={i}>{words}</span>;
            const check = flagged.has(segment.key);
            return (
              <button
                key={i}
                type="button"
                className={`proto-scan-pagetext__ref${check ? ' proto-scan-pagetext__ref--check' : ''}`}
                onClick={() => revealScanReferenceCard(segment.key)}
                title={check ? 'Read with a guess — check it against the photo' : 'Show its card'}
              >
                {words}
              </button>
            );
          })}
        </p>
      ))}
    </div>
  );
}

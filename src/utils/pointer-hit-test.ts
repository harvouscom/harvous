/**
 * Whether a pointer event landed on an element, with slop for fingers.
 *
 * DOM ancestry alone is not enough for the surfaces that use this. A scripture pill, a
 * mention pill, and a typed reference suggestion are all inline spans inside a
 * contenteditable, and the handlers that own them are registered on the editor wrapper in
 * the capture phase — so `target.closest('.scripture-pill')` matches for a press that was
 * never really on the pill (an inline-block's line box is taller than its painted text).
 * Comparing coordinates against the border box is what makes it a tap on the thing.
 */

/**
 * Extra room around the border box for touch input.
 *
 * A finger's contact patch is around 8mm; an inline word carrying a dotted underline is
 * roughly a 19px-tall target. Without slop, taps that visually land on the word miss it by
 * a pixel or two and fall through to the editor, which places a caret and raises the
 * keyboard instead of opening the dock — the reported "tapping a suggestion does nothing".
 *
 * Vertical only. Inline spans sit shoulder to shoulder with their neighbours on the same
 * line, so horizontal padding would start stealing presses meant for the next word.
 */
const TOUCH_SLOP_Y = 8;

/** True for events produced by a finger — Touch events, and Pointer events that say so. */
export function isTouchPointerEvent(e: Event): boolean {
  if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) return true;
  if ('touches' in e || 'changedTouches' in e) return true;
  const pointerType = (e as PointerEvent).pointerType;
  return pointerType === 'touch' || pointerType === 'pen';
}

function pointerCoords(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
  const touchy = e as TouchEvent;
  if (touchy.touches?.length) return { x: touchy.touches[0].clientX, y: touchy.touches[0].clientY };
  if (touchy.changedTouches?.length) {
    return { x: touchy.changedTouches[0].clientX, y: touchy.changedTouches[0].clientY };
  }
  if ('clientX' in e) return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  return null;
}

/**
 * True when the event's coordinates lie inside `el`'s border box, padded vertically for touch.
 *
 * Returns true for an event carrying no coordinates at all — a keyboard-driven `click`, for
 * instance. Those did not miss the element; they never aimed at a point.
 */
export function pointerIsInsideElementRect(e: MouseEvent | TouchEvent, el: HTMLElement): boolean {
  const point = pointerCoords(e);
  if (!point) return true;
  const rect = el.getBoundingClientRect();
  const padY = isTouchPointerEvent(e) ? TOUCH_SLOP_Y : 0;
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top - padY &&
    point.y <= rect.bottom + padY
  );
}

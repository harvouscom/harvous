/**
 * Load state for a scripture passage pane.
 *
 * Previously the UI tracked a `loading` boolean plus an HTML string, and rendered the error copy
 * whenever it wasn't loading and had no HTML. That made four different situations look identical —
 * including the very first frame, before the fetch had even started, which is why users saw
 * "Could not load this passage." flash on passages that then loaded fine.
 */
export type PassageLoadState =
  /** Nothing requested yet (pane collapsed / no reference). Render nothing. */
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; html: string }
  /** Valid reference, but this translation doesn't carry those verses. Not a failure. */
  | { kind: 'unavailable'; html: string }
  /** Server answered successfully with no usable body. */
  | { kind: 'empty' }
  /** Network failure or a non-OK response — the only state that warrants a retry. */
  | { kind: 'error'; reason: 'network' | 'notFound' | 'badRequest' };

/**
 * The server returns these as SUCCESSFUL responses for references that are perfectly valid but
 * absent from the chosen translation (see `server/utils/fetch-verse-text.ts`). They must not be
 * presented as errors — the fix is to switch translation, not to retry.
 */
const TRANSLATION_UNAVAILABLE_PATTERNS = [
  /This passage is not included in the .+ translation\./i,
  /This verse is not included in the .+ translation\./i,
  /Verses \d+-\d+ are not included in the .+ translation\./i,
];

export function isTranslationUnavailableHtml(html: string): boolean {
  if (!html) return false;
  return TRANSLATION_UNAVAILABLE_PATTERNS.some((re) => re.test(html));
}

/** Map a fetch result onto the render state. */
export function passageStateFromResult(
  result: { ok: true; html: string } | { ok: false; reason: 'network' | 'notFound' | 'badRequest' },
): PassageLoadState {
  if (!result.ok) {
    return { kind: 'error', reason: result.reason };
  }
  const html = result.html?.trim() ?? '';
  if (!html) {
    return { kind: 'empty' };
  }
  if (isTranslationUnavailableHtml(html)) {
    return { kind: 'unavailable', html: result.html };
  }
  return { kind: 'loaded', html: result.html };
}

/** HTML to render, if any — `loaded` and `unavailable` both have body content. */
export function passageHtmlOf(state: PassageLoadState): string {
  return state.kind === 'loaded' || state.kind === 'unavailable' ? state.html : '';
}

export function passageErrorMessage(state: PassageLoadState): string | null {
  if (state.kind === 'empty') return 'No text was returned for this passage.';
  if (state.kind !== 'error') return null;
  switch (state.reason) {
    case 'notFound':
      return "We couldn't find that passage.";
    case 'badRequest':
      return "We couldn't read that reference.";
    default:
      return "Couldn't load this passage.";
  }
}

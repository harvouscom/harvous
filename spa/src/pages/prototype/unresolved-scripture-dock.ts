import type { PaperStackState } from '../../layouts/proto-shell-context';

/**
 * When a `scriptureRef` deep-link cannot find a matching pill in the note, the host
 * used to `landAgain` onto the reader. That is right from Home: the tap promised a
 * passage, the note does not have it, take them to the passage.
 *
 * It is wrong from the reader. The margin bar already *is* that passage. Falling
 * back to the reader is the flash: note paper for a frame, then Exodus 5 again,
 * with the chapter still stacked behind itself.
 */
export function shouldFallbackUnresolvedScriptureToReader(
  paperStack: PaperStackState | null | undefined,
): boolean {
  return paperStack?.origin.kind !== 'reader';
}

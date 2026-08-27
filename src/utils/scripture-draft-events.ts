/**
 * The editor's scripture-draft events, in a module with no editor in it.
 *
 * Lives apart from `TiptapScriptureDraft.ts` so a listener can name the event without
 * importing ProseMirror to do it. That is not hypothetical tidiness: the onboarding sync
 * layer is loaded eagerly by the prototype shell, and importing the constant from its home
 * module pulled ~1.6 KB gzipped of editor code into the initial payload for the sake of one
 * string.
 *
 * `TiptapScriptureDraft.ts` re-exports `SCRIPTURE_DRAFT_CONFIRMED_EVENT` so existing
 * importers do not have to care where it moved to.
 */

/**
 * Dispatched on the editor DOM (and bubbling) when a scripture draft becomes a real pill.
 *
 * Bubbles on purpose: listeners at the window can pick it up without being threaded through
 * the note page.
 */
export const SCRIPTURE_DRAFT_CONFIRMED_EVENT = 'scriptureDraftConfirmed';

export interface ScriptureDraftConfirmedDetail {
  /** The reference as it now reads in the pill, e.g. "John 3:16". */
  reference: string;
  /**
   * True when this pill was typed from scratch, false when it is a pill that was backspaced
   * into, edited and re-confirmed.
   *
   * Both are confirmations; only the first is someone using the feature for the first time.
   */
  isNew: boolean;
}

/**
 * Toast copy normalisation.
 *
 * Deliberately side-effect free so both toast entry points can share it: `src/utils/toast.ts`
 * assigns `window.toast` at module load, so `spa/src/App.tsx` cannot import it just to reach a
 * helper without racing its own `window.toast` assignment. Two private copies of this function
 * is what let the bug below survive in one of them.
 */

/**
 * Drop terminal punctuation only. Harvous toasts don't end in a period, but they are often two
 * sentences ("Could not save. Reload the note to pick your changes back up") — and a global
 * `/[.!]/g` strip removed the sentence break too, running the halves together on screen. It did
 * that to every multi-sentence toast in the app, not just one.
 */
export function stripToastPunctuation(message: string): string {
  return message.replace(/[.!]+\s*$/, '');
}

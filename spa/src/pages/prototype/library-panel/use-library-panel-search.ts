/**
 * The Library panel's query — held by the panel, not by the shell.
 *
 * Every other piece of the panel's view (`tab`, `drill`) lives in `proto-shell-context`,
 * because callers outside the panel name those destinations. The query does not follow it
 * there, and the reason is cost: `useProtoShell()` has around twenty consumers, so a
 * per-keystroke write to shell state would re-render the toolbar, the chip, the sidebar
 * and the note underneath once per character typed into a field none of them can see.
 *
 * Nothing is lost by keeping it local. The host only mounts while the panel is open, so
 * the query is created when browsing starts and disposed when it ends — freshness is free
 * rather than something a reset effect has to arrange. That is also why there is no
 * `querySeed` write-back: the seed is an opening condition, and once the panel is open the
 * field is the only thing that knows what is being searched.
 *
 * The debounce itself is `useDebouncedSearchState` — the same 300ms Spotlight and the
 * sidebar use, so the three fields feel like one field.
 */
import { useEffect, useRef } from 'react';
import { useDebouncedSearchState } from '../../../hooks/useDebouncedSearchState';

export type LibraryPanelSearch = {
  /** Live field value. */
  input: string;
  setInput: (value: string) => void;
  /** Settled value, for the corpora and the FTS query. */
  debounced: string;
  clear: () => void;
};

/**
 * @param querySeed The view's opening query, when whatever opened the panel knew one.
 */
export function useLibraryPanelSearch(querySeed?: string): LibraryPanelSearch {
  const { input, setInput, debounced, clear, applyImmediate } = useDebouncedSearchState();

  /*
   * The opening seed lands during the mount render rather than from an effect.
   *
   * It is a state update on this component's own state, so React applies it before it
   * paints — and the panel arrives by morphing out of the toolbar chip, so a field that
   * fills itself one frame into that animation is a visible stutter rather than an
   * invisible one. `applyImmediate` sets the debounced value too: the seed is not
   * something anybody typed, so there is nothing to wait 300ms for.
   */
  const openingSeedSpent = useRef(false);
  if (!openingSeedSpent.current) {
    openingSeedSpent.current = true;
    if (querySeed) applyImmediate(querySeed);
  }

  /*
   * A re-target while the panel is already open — a second tag chip on Activity, with the
   * panel still up from the first — changes the seed under a hook that has already
   * mounted, so the render-phase pass above will never see it. Compared against the last
   * seed rather than against `input`, so typing over a seed is not treated as a new one to
   * re-apply on the next unrelated render.
   */
  const lastSeed = useRef(querySeed);
  useEffect(() => {
    if (querySeed === lastSeed.current) return;
    lastSeed.current = querySeed;
    applyImmediate(querySeed ?? '');
  }, [querySeed, applyImmediate]);

  return { input, setInput, debounced, clear };
}

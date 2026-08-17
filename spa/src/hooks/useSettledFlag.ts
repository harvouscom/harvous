import { useEffect, useState } from 'react';

/**
 * True only once `active` has stayed true for `delay` — so brief waits never show.
 *
 * Pulled out of the Bible reader (`PrototypeBibleReaderPane.tsx`, where it first shipped to
 * gate that pane's own "Loading {book} {chapter}…" line) because a second consumer needed
 * the same grace period: `PrototypeNotePage.tsx` renders `ProtoSpaceLoading` on the very
 * first frame a note query is loading, with nothing to hold back a fast fetch that resolves
 * in a handful of milliseconds.
 */
export function useSettledFlag(active: boolean, delay: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!active) {
      setSettled(false);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), delay);
    return () => window.clearTimeout(id);
  }, [active, delay]);
  return settled;
}

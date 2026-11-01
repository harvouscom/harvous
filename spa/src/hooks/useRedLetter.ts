import { useEffect, useState } from 'react';
import type { RedLetterKit } from '@/data/red-letter';

/** Module-level so a second reader pane, or a toggle off and on, never loads it twice. */
let cached: RedLetterKit | null = null;
let pending: Promise<RedLetterKit> | null = null;

function load(): Promise<RedLetterKit> {
  pending ??= import('@/data/red-letter').then((m) => (cached = m.default));
  return pending;
}

/**
 * Which words are His, and the code that colours them — loaded the first time red letter is
 * switched on and never before. Most readers leave it off, and they should not pay for it. Null
 * until it arrives (and while the preference is off), which the reader treats as "nothing to
 * colour".
 */
export function useRedLetter(enabled: boolean): RedLetterKit | null {
  const [kit, setKit] = useState<RedLetterKit | null>(enabled ? cached : null);
  useEffect(() => {
    if (!enabled) {
      setKit(null);
      return;
    }
    if (cached) {
      setKit(cached);
      return;
    }
    let live = true;
    load()
      .then((k) => {
        if (live) setKit(k);
      })
      .catch(() => {
        // A failed chunk load leaves the page black, which is what red letter off looks like.
        pending = null;
      });
    return () => {
      live = false;
    };
  }, [enabled]);
  return kit;
}

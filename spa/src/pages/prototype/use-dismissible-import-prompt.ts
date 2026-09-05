/**
 * Whether the reader has put the import offer away.
 *
 * Device-local, like the Review upsell and the what's-new dismissal beside it. Where the
 * reasoning differs from those: this one *needs* a dismissal in a way the other Home nudges
 * do not. "Three notes need a folder" answers itself the moment you file them, so it never
 * has to be turned off. "Bring your notes from another app" has no such ending for the many
 * readers who have nothing to bring — without a way to say no, it would sit there for as long
 * as their library stayed small, which is exactly the reader least in need of being nagged.
 *
 * Permanent rather than a snooze, for the same reason as the upsell: someone who has read the
 * row and said no has answered the question. Asking again next week is what turns an offer
 * into a nag.
 */
import { useCallback, useState } from 'react';

export const PROTO_IMPORT_PROMPT_DISMISSED_KEY = 'harvous-prototype-import-prompt-dismissed';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY) === '1';
  } catch {
    // Private mode, or site data blocked. Showing the row is the safe answer — it is one row
    // the reader can dismiss again, where hiding it on a storage error hides the only pointer
    // a new reader gets to the fact that importing is possible at all.
    return false;
  }
}

export function useDismissibleImportPrompt() {
  const [dismissed, setDismissed] = useState(read);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // The state above still hides it for this session, which is what the reader asked for.
    }
  }, []);

  return { dismissed, dismiss };
}

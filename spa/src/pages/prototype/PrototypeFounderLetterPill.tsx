import { useCallback, useState } from 'react';
import PrototypeHomeRow from './PrototypeHomeRow';
import Icon from '@/components/react/Icon';
import {
  PROTO_FOUNDER_LETTER_DISMISSED_KEY,
  PROTO_FOUNDER_LETTER_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useDismissibleFlag } from './useDismissibleFlag';
import PrototypeFounderLetterSheet from './PrototypeFounderLetterSheet';

/** One-time Home pill — opens the founder letter until the user dismisses it. */
export default function PrototypeFounderLetterPill() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visible, dismissFlag] = useDismissibleFlag(PROTO_FOUNDER_LETTER_DISMISSED_KEY, {
    previewKey: PROTO_FOUNDER_LETTER_PREVIEW_KEY,
  });

  const dismiss = useCallback(() => {
    setSheetOpen(false);
    dismissFlag();
  }, [dismissFlag]);

  if (!visible) return null;

  return (
    <>
      {/* A row like the rest of its group: tap the row to read, the trailing × to put it
          away. The old pill had its own eyebrow, orb and dismiss chrome, and was the one
          thing on Home that did not look like anything else on Home.

          Stays a bare × rather than the overflow the suggestion rows use, and the difference
          is what is behind the glyph. A suggestion has answers that differ by forever, so it
          needs words; this row has one exit and no ambiguity about what dismissing it means.
          A menu holding a single item is a tap spent on a list of one. */}
      <PrototypeHomeRow
        icon="book-open"
        title="Why I made Harvous"
        meta={['From the founder']}
        aria-label="Read letter from the founder"
        onClick={() => setSheetOpen(true)}
        trailing={
          <button
            type="button"
            className="proto-side-panel__action-btn"
            aria-label="Dismiss the letter from the founder"
            title="Dismiss"
            onClick={dismiss}
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        }
      />

      <PrototypeFounderLetterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

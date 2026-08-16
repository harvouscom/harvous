import { useCallback, useEffect, useState } from 'react';
import PrototypeHomeRow from './PrototypeHomeRow';
import Icon from '@/components/react/Icon';
import {
  PROTO_FOUNDER_LETTER_DISMISSED_KEY,
  PROTO_FOUNDER_LETTER_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import PrototypeFounderLetterSheet from './PrototypeFounderLetterSheet';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

/** One-time Home pill — opens the founder letter until the user dismisses it. */
export default function PrototypeFounderLetterPill() {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV && readFlag(PROTO_FOUNDER_LETTER_PREVIEW_KEY)) {
      setVisible(true);
      return;
    }
    if (readFlag(PROTO_FOUNDER_LETTER_DISMISSED_KEY)) return;
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    writeFlag(PROTO_FOUNDER_LETTER_DISMISSED_KEY);
    setSheetOpen(false);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* A row like the rest of its group: tap the row to read, the trailing × to put it
          away. The old pill had its own eyebrow, orb and dismiss chrome, and was the one
          thing on Home that did not look like anything else on Home. */}
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
            aria-label="Dismiss"
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

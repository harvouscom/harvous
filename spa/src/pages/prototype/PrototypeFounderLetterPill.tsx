import { useCallback, useEffect, useState } from 'react';
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
      <div className="proto-founder-letter-pill proto-daily-passage-pill" role="region" aria-label="Letter from the founder">
        <button type="button" className="proto-daily-passage-pill__dismiss" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="xmark" size={10} aria-hidden />
          <span>Dismiss</span>
        </button>

        <div className="proto-daily-passage-pill__content proto-daily-passage-pill__content--no-add">
          <p className="proto-caption proto-daily-passage-pill__eyebrow">From the founder</p>
          <p className="pds-list-title proto-daily-passage-pill__reference">Why I built Harvous</p>
        </div>

        <div className="proto-daily-passage-pill__orbs">
          <button
            type="button"
            className="proto-daily-passage-pill__orb"
            aria-label="Read letter from the founder"
            onClick={() => setSheetOpen(true)}
          >
            <Icon name="book-open" size={12} />
          </button>
        </div>
      </div>

      <PrototypeFounderLetterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

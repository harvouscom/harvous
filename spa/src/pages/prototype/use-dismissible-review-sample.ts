/**
 * Whether the reader has put the daily sample question away.
 *
 * Separate from `useDismissiblePlusPrompt` on purpose, and the separation is the whole point.
 * The two used to share one flag, so dismissing the upgrade row also deleted the sample — the
 * try and the advertisement taken away by one tap on the advertisement. Hiding an offer is not
 * asking to be shown less of the product, so that was split apart.
 *
 * What the split left behind was the opposite gap: the sample's own "Not now" was wired to the
 * upsell's flag, so answering "not now" to the question hid the row instead and the question
 * came back the next morning. Neither control did what its own words said. This is the flag the
 * question's own dismissal belongs to.
 *
 * Device-local and permanent, matching the upsell beside it: an unwanted daily prompt is a
 * presentation detail of one device, there is no sensible merge for "I do not want to see this",
 * and someone who has said no has answered the question.
 */
import { useCallback, useState } from 'react';

export const PROTO_REVIEW_SAMPLE_DISMISSED_KEY = 'harvous-prototype-review-sample-dismissed';
export const PROTO_REVIEW_SAMPLE_RESULT_KEY = 'harvous-prototype-review-sample-result';

export interface ReviewSampleResult {
  day: string;
  correct: boolean;
  verseText: string;
  translation?: string;
}

export function readReviewSampleResult(day: string): ReviewSampleResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROTO_REVIEW_SAMPLE_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewSampleResult;
    if (parsed?.day !== day || typeof parsed.verseText !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeReviewSampleResult(result: ReviewSampleResult): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROTO_REVIEW_SAMPLE_RESULT_KEY, JSON.stringify(result));
  } catch {
    // Session state in the card still holds for this visit.
  }
}

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PROTO_REVIEW_SAMPLE_DISMISSED_KEY) === '1';
  } catch {
    // Private mode, or site data blocked. Showing it is the safe answer, the same way the
    // upsell beside it errs: the reader can dismiss again, where hiding on a storage error
    // silently removes the one question a free account is offered.
    return false;
  }
}

export function useDismissibleReviewSample() {
  const [dismissed, setDismissed] = useState(read);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(PROTO_REVIEW_SAMPLE_DISMISSED_KEY, '1');
    } catch {
      // The state above still hides it for this session, which is what the reader asked for.
    }
  }, []);

  return { dismissed, dismiss };
}

/**
 * One scan, start to finish: read the photo, find the Scripture in it, and — when the page is
 * mostly running text — ask whether it is a Bible passage we hold.
 *
 * The engine is imported here, inside the job, never at module scope: this file is part of
 * the scan sheet's chunk, and tesseract.js is a further chunk below that, fetched only once a
 * photo has actually been chosen.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { countProseWords, findScriptureInOcrText, type OcrScriptureResult } from '@/utils/ocr/ocr-scripture';
import {
  NO_PASSAGE,
  PASSAGE_IDENTIFY_MAX_CHARS,
  PASSAGE_IDENTIFY_MIN_WORDS,
  type PassageIdentifyResult,
} from '@/utils/ocr/passage-match';
import type { OcrProgress } from '@/utils/ocr/recognize-image-text';

export type ScanPhase = 'reading' | 'matching' | 'review' | 'failed';

export type ScanState = {
  phase: ScanPhase;
  progress: OcrProgress;
  scan: OcrScriptureResult | null;
  passage: PassageIdentifyResult;
  error: string | null;
};

const INITIAL: ScanState = {
  phase: 'reading',
  progress: { stage: 'preparing', value: 0 },
  scan: null,
  passage: NO_PASSAGE,
  error: null,
};

/** Recognition is a nicety on top of the text; a slow server must not hold the review hostage. */
const IDENTIFY_TIMEOUT_MS = 8000;

async function identifyPassage(text: string, preferredTranslation: string): Promise<PassageIdentifyResult> {
  if (countProseWords(text) < PASSAGE_IDENTIFY_MIN_WORDS) return NO_PASSAGE;
  try {
    const request = api.post<PassageIdentifyResult>('/api/scripture/identify-passage', {
      text: text.slice(0, PASSAGE_IDENTIFY_MAX_CHARS),
      preferredTranslation,
    });
    const timeout = new Promise<PassageIdentifyResult>((resolve) =>
      setTimeout(() => resolve(NO_PASSAGE), IDENTIFY_TIMEOUT_MS),
    );
    const result = await Promise.race([request, timeout]);
    return result?.match ? result : NO_PASSAGE;
  } catch {
    // Offline, rate-limited, or a server without the endpoint yet: the scan still stands.
    return NO_PASSAGE;
  }
}

export function useScanText(file: File | null, preferredTranslation: string): ScanState {
  const [state, setState] = useState<ScanState>(INITIAL);
  const jobRef = useRef(0);

  useEffect(() => {
    if (!file) return undefined;
    const job = ++jobRef.current;
    const live = () => jobRef.current === job;
    setState(INITIAL);
    let finished = false;

    void (async () => {
      try {
        const ocr = await import('@/utils/ocr/recognize-image-text');
        const { text } = await ocr.recognizeImageText(file, (progress) => {
          if (live()) setState((s) => ({ ...s, progress }));
        });
        finished = true;
        if (!live()) return;
        const scan = findScriptureInOcrText(text);
        if (!scan.text.trim()) {
          setState((s) => ({
            ...s,
            phase: 'failed',
            error: 'No words came through on that photo. Try again with the page flat and well lit.',
          }));
          return;
        }
        setState((s) => ({ ...s, phase: 'matching', scan }));
        const passage = await identifyPassage(scan.text, preferredTranslation);
        if (!live()) return;
        setState((s) => ({ ...s, phase: 'review', passage }));
      } catch {
        finished = true;
        if (!live()) return;
        setState((s) => ({
          ...s,
          phase: 'failed',
          error: 'That photo could not be read. Check your connection and try again.',
        }));
      }
    })();

    return () => {
      jobRef.current += 1;
      // Closed mid-read: stop the engine rather than let it finish a page nobody will see.
      if (!finished) void import('@/utils/ocr/recognize-image-text').then((ocr) => ocr.terminateOcr());
    };
  }, [file, preferredTranslation]);

  return state;
}

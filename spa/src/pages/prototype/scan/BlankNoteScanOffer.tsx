/**
 * "or scan a page" — the one place a camera is offered: on a new, blank note, under
 * "Start writing…".
 *
 * Scanning is occasional, so it gets no toolbar control and no mode in the Activity / Bible /
 * Note switch (which assumes three equal segments). It appears at the moment someone has
 * decided to write and may have the paper in front of them, and is gone as soon as the note
 * has anything in it. What it reads fills *this* note rather than starting another.
 *
 * Positioned against the paper under the editor's first line. The editor column fills the
 * sheet, so in flow this would sit at the foot of the page, nowhere near the caret. The paper
 * is found from this element rather than passed as a ref: a child's layout effect runs before
 * its parent's ref is attached, so a ref prop reads null on the one pass that matters.
 *
 * While a scan is waiting for its photo (the app was reloaded under the camera, or the reader
 * went to the Camera app — see scan-pending.ts) the line becomes "Add the photo you just took",
 * because that is the one thing this note is now waiting on.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import ScanTextTrigger from './ScanTextTrigger';
import '../../../styles/scan-offer.css';
import {
  cameraAppHintSeen,
  clearScanPending,
  isAppleTouchDevice,
  markScanPending,
  registerBlankNoteOffer,
  shouldOfferResume,
  useScanPending,
} from './scan-pending';

export default function BlankNoteScanOffer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const scanState = useScanPending();
  const waiting = shouldOfferResume(scanState);
  // Said in words only where the Camera-app route matters, and only until it has been used.
  const [offerCameraApp] = useState(() => isAppleTouchDevice() && !cameraAppHintSeen());

  // While this is on screen it shows the waiting prompt, so the shell's own copy stands down.
  useEffect(() => registerBlankNoteOffer(), []);

  useLayoutEffect(() => {
    const paper = rootRef.current?.closest<HTMLElement>('.proto-editor-paper');
    if (!paper) return undefined;
    const measure = () => {
      const firstLine = paper.querySelector('.ProseMirror > :first-child');
      if (!firstLine) return false;
      const p = paper.getBoundingClientRect();
      const l = firstLine.getBoundingClientRect();
      setPosition((prev) => {
        const next = { top: Math.round(l.bottom - p.top + 14), left: Math.round(l.left - p.left) };
        return prev && prev.top === next.top && prev.left === next.left ? prev : next;
      });
      return true;
    };
    const resize = new ResizeObserver(() => void measure());
    resize.observe(paper);
    // The editor mounts after the paper; wait for its first line to land, then stop watching.
    const arrival = new MutationObserver(() => {
      if (measure()) arrival.disconnect();
    });
    if (!measure()) arrival.observe(paper, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      arrival.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="proto-blank-note-scan"
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
    >
      {waiting ? (
        <div className="proto-blank-note-scan__waiting">
          <ScanTextTrigger
            className="proto-blank-note-scan__btn proto-blank-note-scan__btn--waiting"
            label="Add the photo you just took"
            target="current-note"
          >
            <Icon name="camera" size={13} aria-hidden />
            <span>Add the photo you just took</span>
          </ScanTextTrigger>
          <button type="button" className="proto-blank-note-scan__dismiss" onClick={clearScanPending}>
            Not now
          </button>
        </div>
      ) : (
        <>
          <ScanTextTrigger className="proto-blank-note-scan__btn" label="Scan a page" target="current-note">
            <Icon name="camera" size={13} aria-hidden />
            <span>or scan a page</span>
          </ScanTextTrigger>
          {offerCameraApp ? (
            <button
              type="button"
              className="proto-blank-note-scan__hint"
              onClick={() => markScanPending('camera-app')}
            >
              Prefer the Camera app? Take it there, then come back — this note will wait.
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

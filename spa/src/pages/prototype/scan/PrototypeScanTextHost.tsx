/**
 * Where a scan is carried out. Mounted by the shell, like the organize host, so "Scan a page"
 * works from anywhere it is offered without each entry point owning a sheet.
 *
 * The sheet is its own chunk, and the recognition engine a further one below it: neither is
 * fetched until a photo has been chosen.
 *
 * It also keeps the scan's place when the photo goes missing (scan-pending.ts). A blank note on
 * screen shows "Add the photo you just took" itself; anywhere else — the app came back from a
 * reload onto Activity, say — this host shows the same offer as a small card.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import Icon from '@/components/react/Icon';
import type { PrototypeComposeSeed } from '../../../layouts/proto-shell-context';
import { fillCurrentNote, listenForScanText, type ScanTarget } from './scan-text-events';
import {
  clearScanPending,
  markCameraAppHintSeen,
  refreshScanPending,
  shouldOfferResume,
  useScanPending,
} from './scan-pending';
import ScanTextTrigger from './ScanTextTrigger';
import '../../../styles/scan-offer.css';

const ScanTextSheet = lazy(() => import('./ScanTextSheet'));

/**
 * After the app is shown again, wait this long before offering to resume: returning from the
 * chooser *with* a photo also makes the page visible, and its change event lands a moment later.
 */
const RESUME_SETTLE_MS = 700;

export default function PrototypeScanTextHost() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<ScanTarget>('new-note');
  const [open, setOpen] = useState(false);
  const scanState = useScanPending();
  const { pending, blankNoteOffers } = scanState;
  /** Offer to resume only after a return to the app (or a fresh load), never the moment a scan starts. */
  const [armed, setArmed] = useState(() => Boolean(pending));

  useEffect(
    () =>
      listenForScanText((request) => {
        setFile(request.file);
        setTarget(request.target);
        setOpen(true);
        setArmed(false);
      }),
    [],
  );

  // Settled: the next scan has to be left and come back to before it is offered again.
  useEffect(() => {
    if (!pending) setArmed(false);
  }, [pending]);

  useEffect(() => {
    let timer = 0;
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refreshScanPending();
        setArmed(true);
      }, RESUME_SETTLE_MS);
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('pageshow', onReturn);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('pageshow', onReturn);
    };
  }, []);

  const close = () => {
    setOpen(false);
    // Let the sheet play its exit before the photo is dropped.
    window.setTimeout(() => setFile(null), 320);
  };

  const create = (seed: PrototypeComposeSeed) => {
    close();
    markCameraAppHintSeen();
    // Started on a blank note: that note takes the scan, as a template would fill it.
    if (target === 'current-note' && seed.contentHtml && fillCurrentNote(seed.contentHtml)) return;
    // The shell's one new-note path, so a scanned note lands where a blank one would.
    const start = () => window.dispatchEvent(new CustomEvent('prototypeShortcutNewNote', { detail: { seed } }));
    /*
     * Seeded compose is only reliable from a surface with no editor on it — which is where
     * every other seed (Today's passage, a study card) starts. Begun over a mounted note or
     * draft, the outgoing editor can report its content after the session has moved on, and
     * the new note opened blank (reproduced from a draft via Settings → Import → Scan). So
     * step back to Activity first and seed once that editor is gone.
     */
    if (!document.querySelector('.proto-editor-surface .ProseMirror')) {
      start();
      return;
    }
    window.dispatchEvent(new Event('prototypeShortcutShowHome'));
    const startedAt = performance.now();
    const waitForEditorToLeave = () => {
      const gone = !document.querySelector('.proto-editor-surface .ProseMirror');
      if (gone || performance.now() - startedAt > 1500) start();
      else requestAnimationFrame(waitForEditorToLeave);
    };
    requestAnimationFrame(waitForEditorToLeave);
  };

  const showResume = armed && shouldOfferResume(scanState) && blankNoteOffers === 0 && !file;

  return (
    <>
      {showResume ? (
        <div className="proto-scan-resume" role="status">
          <span className="proto-scan-resume__icon" aria-hidden>
            <Icon name="camera" size={14} />
          </span>
          <span className="proto-scan-resume__text">Your page scan is waiting for its photo.</span>
          <ScanTextTrigger
            className="proto-scan-resume__add proto-ink-on-accent"
            label="Add the photo you just took"
            // A blank note will take it if one is open; otherwise it starts its own.
            target="current-note"
          >
            Add photo
          </ScanTextTrigger>
          <button type="button" className="proto-scan-resume__dismiss" onClick={clearScanPending} aria-label="Not now">
            <Icon name="xmark" size={11} />
          </button>
        </div>
      ) : null}
      {file ? (
        <Suspense fallback={null}>
          <ScanTextSheet open={open} file={file} onRetake={setFile} onClose={close} onCreate={create} />
        </Suspense>
      ) : null}
    </>
  );
}

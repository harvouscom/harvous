/**
 * The whole photographed page, full screen — what the thumbnail in the scan sheet opens.
 *
 * The thumbnail is small on purpose (the sheet's work is the text and the verses), so this is
 * where the reader checks the page itself: which line a reference came from, whether the
 * scan caught the bottom of the page. Pinch to zoom is the browser's own; the image is shown
 * at its natural size inside a scroller, so nothing is resampled away.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';

export default function ScanPageViewer({ photoUrl, onClose }: { photoUrl: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Claimed here so the sheet underneath does not close with the viewer.
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="proto-scan-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="The whole page"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="proto-scan-viewer__close" onClick={onClose} aria-label="Close the page" title="Close">
        <Icon name="xmark" size={14} />
      </button>
      <img className="proto-scan-viewer__image" src={photoUrl} alt="The photographed page" />
    </div>,
    document.body,
  );
}

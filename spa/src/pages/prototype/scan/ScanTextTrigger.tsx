/**
 * A button that opens the photo chooser and starts a scan.
 *
 * The visible part is the caller's: pass the button's class and children. The file input it
 * opens is shared and lives outside React — see `openScanChooser` in scan-text-events.ts for why
 * a per-button input lost the photo on iPhone.
 *
 * No `capture` attribute. With it an iPhone goes straight to the camera and offers no way to
 * the photo library — a handout photographed last Sunday, a screenshot, or a photo taken in the
 * Camera app could not be used. Without it iOS shows Take Photo / Photo Library / Choose File
 * and Android its own chooser: one tap more, every route covered.
 */
import type { ReactNode } from 'react';
import { openScanChooser, type ScanTarget } from './scan-text-events';

export default function ScanTextTrigger({
  className,
  label,
  title,
  children,
  onBeforeOpen,
  onPicked,
  target = 'new-note',
}: {
  className: string;
  /** Accessible name — "Scan a page". */
  label: string;
  title?: string;
  children: ReactNode;
  /** Runs inside the tap, before the picker opens. */
  onBeforeOpen?: () => void;
  /** Runs once a photo has been chosen and handed to the scan host. */
  onPicked?: () => void;
  /** Fill the blank note this was offered on, or start a new one. */
  target?: ScanTarget;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={title ?? label}
      onClick={() => {
        onBeforeOpen?.();
        openScanChooser(target, onPicked);
      }}
    >
      {children}
    </button>
  );
}

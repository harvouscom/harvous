/**
 * The note PIN sheet itself — centered popover on desktop, bottom sheet on touch phones.
 * Lazy: PrototypePinPanels loads this chunk the first time a PIN is asked for, so the
 * encryption code and the panel stay out of the initial payload.
 */
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import PinEntryPanel from '@/components/react/PinEntryPanel';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import type { PinRequest } from './PrototypePinPanels';

export default function PrototypePinSheet({
  request,
  openKey,
  onClose,
}: {
  request: PinRequest | null;
  openKey: number;
  onClose: () => void;
}) {
  const open = request !== null;
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { asSheet } = useSheetPresentation();
  const showPopover = !asSheet && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopover,
      strategy: 'centered',
      topVhFraction: 0.18,
      fallbackWidth: 340,
      fallbackHeight: 320,
    },
    [openKey],
  );

  useDismissOnOutside(cardRef, onClose, open && !asSheet);

  // Keep the last request on screen through the exit animation.
  const lastRequestRef = useRef<PinRequest | null>(null);
  if (request) lastRequestRef.current = request;
  const shown = request ?? lastRequestRef.current;
  if (!shown) return null;

  const panel = (
    <PinEntryPanel
      key={openKey}
      noteId={shown.noteId}
      initialMode={shown.mode}
      noteContent={shown.noteContent}
      isEncrypted={shown.isEncrypted}
      onClose={onClose}
      appearance="prototype"
    />
  );

  if (showPopover && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop exiting={exiting} onDismiss={onClose} aria-label="Close PIN" />
        <ProtoPopoverShell
          ref={cardRef}
          className={portaledDialogShellClassName('proto-pin-sheet', exiting)}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          {panel}
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DrawerContent onOverlayClick={onClose} className="proto-pin-sheet proto-pin-sheet--drawer">
        {panel}
      </DrawerContent>
    </Drawer.Root>
  );
}

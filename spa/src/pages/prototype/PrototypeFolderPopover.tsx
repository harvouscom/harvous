/**
 * Floating folder editor popover anchored under the toolbar folder chip.
 * Same anchor/position pattern as PrototypeSharePopover.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NoteDetail } from '../../hooks/queries/useNote';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import PrototypeFolderTagEditor from './PrototypeFolderTagEditor';
import ProtoPopoverShell from './ProtoPopoverShell';
import { computeAnchoredPopoverPosition } from './proto-popover-position';
import { protoPortaledPopoverClassName } from './proto-portaled-popover-classes';

const CARD_WIDTH = 340;

interface PrototypeFolderPopoverProps {
  note: NoteDetail;
  contextSpaceId?: string | null;
  anchorRect: DOMRect | null;
  onDismiss: () => void;
  exiting?: boolean;
}

export default function PrototypeFolderPopover({
  note,
  contextSpaceId = null,
  anchorRect,
  onDismiss,
  exiting = false,
}: PrototypeFolderPopoverProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<ReturnType<typeof computeAnchoredPopoverPosition> | null>(null);

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const h = cardRef.current?.getBoundingClientRect().height ?? 320;
    setPos(computeAnchoredPopoverPosition(anchorRect, CARD_WIDTH, h));
  }, [anchorRect]);

  useDismissOnOutside(cardRef, onDismiss);

  if (!anchorRect || typeof document === 'undefined') return null;

  return createPortal(
    <ProtoPopoverShell
      ref={cardRef}
      role="dialog"
      aria-label="Edit folder"
      className={protoPortaledPopoverClassName('proto-folder-popover', {
        exiting,
        placement: pos?.placement,
        originAlign: 'center',
      })}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: CARD_WIDTH,
        zIndex: 6000,
      }}
    >
      <PrototypeFolderTagEditor
        note={note}
        contextSpaceId={contextSpaceId}
        folderOnly
      />
    </ProtoPopoverShell>,
    document.body,
  );
}

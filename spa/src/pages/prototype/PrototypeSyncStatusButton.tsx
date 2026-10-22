/**
 * The toolbar's sync glyph — there only while something is not caught up.
 *
 * Offline, saving, or failed; caught up is the normal state and says nothing, so the toolbar
 * row is the same row it always was until there is something to know. The glyph is the
 * at-a-glance answer, the card under it is the sentence. A real failure also raises a toast
 * (see `PrototypeSyncWatcher`), because a glyph alone is too easy to miss when work is at stake.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from '@/components/react/Icon';
import { useToolbarAnchoredPopover } from '../../hooks/useToolbarAnchoredPopover';
import { usePrototypeSyncSnapshot } from '../../components/PrototypeSyncStatus';
import ProtoPopoverShell from './ProtoPopoverShell';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { protoPortaledPopoverClassName } from './proto-portaled-popover-classes';
import { PROTO_TOOLBAR_ORB_ICON_SIZE, PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';
import type { PrototypeSyncChipVariant } from '../../utils/prototype-sync-chip-copy';

const CARD_WIDTH = 280;

/**
 * Saving is usually over before anyone could read it. Shown at once, the glyph would blink in
 * and out of the toolbar on every flush and nudge the row each time; held back, it only
 * appears for a save that is actually taking a while.
 */
const SAVING_REVEAL_DELAY_MS = 900;

const GLYPH: Record<Exclude<PrototypeSyncChipVariant, 'success'>, IconName> = {
  offline: 'wifi-slash',
  syncing: 'cloud-arrow-up',
  error: 'circle-exclamation',
};

export default function PrototypeSyncStatusButton() {
  const sync = usePrototypeSyncSnapshot();
  const popover = useToolbarAnchoredPopover();
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const presentation = sync?.presentation ?? null;
  const variant = presentation?.visible ? presentation.variant : null;
  const wanted = variant && variant !== 'success' ? variant : null;

  const [savingRevealed, setSavingRevealed] = useState(false);
  useEffect(() => {
    if (wanted !== 'syncing') {
      setSavingRevealed(false);
      return undefined;
    }
    const timer = setTimeout(() => setSavingRevealed(true), SAVING_REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wanted]);

  const shown = wanted === 'syncing' && !savingRevealed ? null : wanted;

  // Nothing left to explain — put the card away with the glyph rather than strand it.
  const { isOpen, dismiss } = popover;
  useEffect(() => {
    if (!shown && isOpen) dismiss();
  }, [shown, isOpen, dismiss]);

  /* Announced, not just drawn: the glyph changing is the only cue otherwise. Always mounted,
     because a live region that appears together with its text is often not read at all. */
  const announcement = (
    <span className="proto-visually-hidden" role="status" aria-live="polite">
      {shown && presentation ? presentation.label : ''}
    </span>
  );

  if (!sync || !presentation || !shown) {
    return (
      <>
        {announcement}
        {popover.isOpen && presentation ? (
          <SyncStatusPopover
            anchorRect={popover.anchorRect}
            exiting
            variant={presentation.variant}
            label={presentation.label}
            detail={presentation.detail}
            onDismiss={popover.dismiss}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {announcement}
      <button
        ref={buttonRef}
        type="button"
        className={`proto-toolbar-icon-btn proto-sync-status proto-sync-status--${shown}`}
        title={presentation.label}
        aria-label={presentation.label}
        aria-haspopup="dialog"
        aria-expanded={popover.isOpen && !popover.exiting}
        onClick={() => popover.toggleFrom(buttonRef.current)}
      >
        <Icon name={GLYPH[shown]} size={PROTO_TOOLBAR_ORB_ICON_SIZE} aria-hidden />
      </button>
      {popover.isOpen ? (
        <SyncStatusPopover
          anchorRect={popover.anchorRect}
          exiting={popover.exiting}
          variant={shown}
          label={presentation.label}
          detail={presentation.detail}
          showRetry={presentation.showRetry}
          isRetrying={sync.isRetrying}
          onRetry={sync.retry}
          onDismiss={popover.dismiss}
        />
      ) : null}
    </>
  );
}

function SyncStatusPopover({
  anchorRect,
  exiting,
  variant,
  label,
  detail,
  showRetry = false,
  isRetrying = false,
  onRetry,
  onDismiss,
}: {
  anchorRect: DOMRect | null;
  exiting: boolean;
  variant: PrototypeSyncChipVariant;
  label: string;
  detail: string;
  showRetry?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<ReturnType<typeof computeRightAnchoredPopoverPosition> | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const h = cardRef.current?.getBoundingClientRect().height ?? 120;
    setPos(computeRightAnchoredPopoverPosition(anchorRect, CARD_WIDTH, h, PROTO_TOOLBAR_POPOVER_OFFSET));
  }, [anchorRect]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (cardRef.current && target && !cardRef.current.contains(target)) onDismiss();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);

  if (!anchorRect || typeof document === 'undefined') return null;

  return createPortal(
    <ProtoPopoverShell
      ref={cardRef}
      role="dialog"
      aria-label={label}
      className={protoPortaledPopoverClassName(`proto-sync-status-popover proto-sync-status-popover--${variant}`, {
        exiting,
        placement: pos?.placement,
        originAlign: 'right',
      })}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: CARD_WIDTH }}
    >
      <p className="proto-sync-status-popover__title">{label}</p>
      <p className="proto-sync-status-popover__detail">{detail}</p>
      {showRetry && onRetry ? (
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary proto-sync-status-popover__retry"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? 'Retrying…' : 'Try again'}
        </button>
      ) : null}
    </ProtoPopoverShell>,
    document.body,
  );
}

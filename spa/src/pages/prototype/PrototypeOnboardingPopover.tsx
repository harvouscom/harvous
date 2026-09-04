/**
 * The getting-started checklist, from anywhere.
 *
 * It used to exist only at the top of Activity, which meant the one surface that explains the
 * app was the one surface you had to already know how to get back to. This is the same list in
 * the toolbar's card, on every screen, still dismissible — and still not a tour: no overlay, no
 * scrim, no arrow pointing at anything, nothing that has to be got past. It opens because
 * someone asked for it.
 *
 * Rows hand off rather than navigate. Home owns `handleOnboardingStep`, which knows that
 * "write a note" means a compose session and "revisit" means glowing the recall shelf; the
 * toolbar knows none of that and should not learn a second copy of it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import PrototypeOnboardingDock from './PrototypeOnboardingDock';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { protoPortaledPopoverClassName } from './proto-portaled-popover-classes';
import { PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';
import { requestOnboardingStep } from './onboarding-step-handoff';
import { useOnboardingState } from './useOnboardingState';
import { shownOnboardingProgress } from './onboarding-visible-steps';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';

const CARD_WIDTH = 340;

export default function PrototypeOnboardingPopover({
  anchorRect,
  onDismiss,
  exiting = false,
}: {
  anchorRect: DOMRect | null;
  onDismiss: () => void;
  exiting?: boolean;
}) {
  const navigate = useNavigate();
  const { state, dismissAll } = useOnboardingState();
  const { isGuest } = useHarvousIdentity();
  const progress = shownOnboardingProgress(state, isGuest);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<ReturnType<typeof computeRightAnchoredPopoverPosition> | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const h = cardRef.current?.getBoundingClientRect().height ?? 220;
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
      aria-label="Getting started"
      className={protoPortaledPopoverClassName('proto-onboarding-popover', {
        exiting,
        placement: pos?.placement,
        originAlign: 'right',
      })}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: CARD_WIDTH }}
    >
      <div className="proto-onboarding-popover__head">
        <p className="proto-caption proto-onboarding-popover__eyebrow">
          Getting started
          <span className="proto-onboarding-dock__count">
            {progress.done} of {progress.total}
          </span>
        </p>
        {/*
          "Put it away" rather than a plain close: closing a popover and retiring the checklist
          are different intentions, and the ✕ in the corner already means the first one.
        */}
        <button
          type="button"
          className="proto-side-panel__action-btn"
          aria-label="Dismiss getting started"
          onClick={() => {
            dismissAll();
            onDismiss();
          }}
        >
          <Icon name="xmark" size={12} aria-hidden />
        </button>
      </div>

      <PrototypeOnboardingDock
        variant="popover"
        onStepAction={(id) => {
          requestOnboardingStep(id);
          onDismiss();
          void navigate({ to: prototypeHomeRouteTo() });
        }}
      />
    </ProtoPopoverShell>,
    document.body,
  );
}

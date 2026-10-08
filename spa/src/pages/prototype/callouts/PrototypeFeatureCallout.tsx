/**
 * The feature callout card — one at a time, picked by `pickCallout`, put away for good on the
 * account when it is dismissed or acted on.
 *
 * Two placements of the same card:
 * - `corner` — desktop. Floating in the window's bottom-right, above an open dock, mounted once
 *   in the shell. It steps aside for the Harvous 3 welcome, the inspector and the keyboard.
 * - `inline` — phones. At the top of Home's Today band, in the flow of the page: a floating card
 *   on a phone would sit on top of the very thing it is pointing at.
 *
 * Exactly one of the two renders for a given layout, so the card is never on screen twice.
 *
 * Anatomy, from Claude's own callouts: a drawing of the thing, a title, one line, one button,
 * and a round × riding the top-right corner. The button is the one blue on the card — the
 * accent gradient with white text, as everywhere. Non-modal: it does not take focus, trap it, or
 * dim anything; Tab reaches it and Escape puts it away.
 */
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { appVersion } from '@/utils/app-version';
import { markCalloutSeen } from '@/utils/onboarding-state';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { updateOnboardingState } from '../../../lib/proto-onboarding-sync';
import { useHarvousIdentity } from '../../../hooks/useHarvousIdentity';
import { useHasFeature } from '../../../hooks/useHasFeature';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useProtoOverlayMotion } from '../../../hooks/useProtoOverlayMotion';
import { isAppUpdateToastHeld, subscribeAppUpdateToastHold } from '../welcome3-bridge';
import { useOnboardingState } from '../useOnboardingState';
import CalloutIllustration from './CalloutIllustration';
import { CALLOUTS, pickCallout, type Callout, type CalloutActionContext } from './callout-registry';

/** Scroll Home's Today tabs into view, once the route has rendered them. */
function scrollToTodayTabs(): void {
  let tries = 0;
  const attempt = () => {
    const el = document.querySelector('.proto-feed-tabs');
    if (el) {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    if (tries++ < 20) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

/**
 * The callout to show, if any, and the two ways to answer it.
 *
 * Renders nothing until the account's onboarding record has answered (`ready`), so a card put
 * away on another device does not flash here before the record arrives.
 */
export function useActiveCallout(): {
  callout: Callout | null;
  dismiss: () => void;
  act: () => void;
} {
  const { state, ready } = useOnboardingState();
  const { isGuest } = useHarvousIdentity();
  const plus = useHasFeature('review');
  const navigate = useNavigate();

  const callout = ready
    ? pickCallout(CALLOUTS, state.calloutsSeen, {
        isGuest,
        isPlus: plus.has,
        appVersion: appVersion(),
        now: Date.now(),
      })
    : null;

  const markSeen = useCallback((id: string) => {
    updateOnboardingState((current) => markCalloutSeen(current, id, new Date().toISOString()));
  }, []);

  const dismiss = useCallback(() => {
    if (callout) markSeen(callout.id);
  }, [callout, markSeen]);

  const act = useCallback(() => {
    if (!callout) return;
    markSeen(callout.id);
    const ctx: CalloutActionContext = {
      openHomeTabs: () => {
        void navigate({ to: prototypeHomeRouteTo() });
        scrollToTodayTabs();
      },
    };
    if ('href' in callout.action) {
      window.open(callout.action.href, '_blank', 'noopener,noreferrer');
    } else {
      callout.action.run(ctx);
    }
  }, [callout, markSeen, navigate]);

  return { callout, dismiss, act };
}

/** The card alone, for the design gallery and anything else that supplies its own answers. */
export function CalloutCard({
  callout,
  variant,
  exiting = false,
  onDismiss,
  onAct,
}: {
  callout: Callout;
  variant: 'corner' | 'inline';
  exiting?: boolean;
  onDismiss: () => void;
  onAct: () => void;
}) {
  const titleId = useId();
  return (
    <div
      className={`proto-callout proto-callout--${variant}${exiting ? ' proto-callout--exiting' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onDismiss();
        }
      }}
    >
      <button type="button" className="proto-callout__close" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="xmark" size={13} aria-hidden />
      </button>
      <div className="proto-callout__art">
        <CalloutIllustration name={callout.illustration} />
      </div>
      <p id={titleId} className="proto-callout__title">
        {callout.title}
      </p>
      <p className="proto-callout__body">{callout.body}</p>
      <button type="button" className="proto-settings-btn proto-callout__action" onClick={onAct}>
        {callout.action.label}
      </button>
    </div>
  );
}

/** Desktop: the floating card in the window's corner. Mounted once, in the shell. */
export function PrototypeFeatureCalloutCorner() {
  const { isMobileSidebar, inspectorOpen } = useProtoShell();
  const welcomeUp = useSyncExternalStore(subscribeAppUpdateToastHold, isAppUpdateToastHeld, () => false);
  const { callout, dismiss, act } = useActiveCallout();
  /*
   * The card that is leaving, kept until its exit finishes — the active callout becomes null
   * the moment it is put away, and the card would otherwise vanish rather than leave.
   */
  const [shown, setShown] = useState<Callout | null>(null);
  const open = Boolean(callout) && !isMobileSidebar && !inspectorOpen && !welcomeUp;
  useEffect(() => {
    if (open && callout) setShown(callout);
  }, [open, callout]);
  const { mounted, exiting } = useProtoOverlayMotion(open);

  if (!mounted || !shown || typeof document === 'undefined') return null;
  /* Portaled to body, so it carries `proto-theme` itself — outside the shell it would lose the
     tokens and conventions scoped there (the Harvous 3 welcome does the same). */
  return createPortal(
    <div className="proto-theme proto-callout-anchor">
      <CalloutCard callout={shown} variant="corner" exiting={exiting} onDismiss={dismiss} onAct={act} />
    </div>,
    document.body,
  );
}

/** Phones: the same card at the top of Home's Today band. */
export function PrototypeFeatureCalloutInline() {
  const { isMobileSidebar } = useProtoShell();
  const { callout, dismiss, act } = useActiveCallout();
  if (!isMobileSidebar || !callout) return null;
  return <CalloutCard callout={callout} variant="inline" onDismiss={dismiss} onAct={act} />;
}

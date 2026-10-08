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
import '../../../styles/prototype-callouts.css';
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
import CalloutIllustration, { type CalloutIllustrationKey } from './CalloutIllustration';
import PrototypeFounderLetterSheet from '../PrototypeFounderLetterSheet';
import { useNoticeItems } from './use-notice-items';
import type { CalloutStackItem } from './callout-stack-item';
import { useAcknowledgeLegal, useLegalStatus } from '../../../hooks/queries/useLegalStatus';
import { LEGAL_CHANGES_URL, legalDocumentsPhrase, type LegalDocument } from '@/utils/legal-versions';
import { CALLOUTS, pickCallout, type Callout, type CalloutActionContext } from './callout-registry';

/** The id the legal notice wears — not in the registry; it is due by the server's version check. */
export const LEGAL_NOTICE_ID = 'legal-notice';

/**
 * "We've updated our Privacy Policy" — due whenever a document has changed since this account
 * last acknowledged it, which a seen flag cannot express: the same notice must come back for
 * the next version. Outranks every feature callout.
 */
export function legalNoticeCallout(due: readonly LegalDocument[]): Callout | null {
  if (due.length === 0) return null;
  return {
    id: LEGAL_NOTICE_ID,
    title: `We’ve updated our ${legalDocumentsPhrase(due)}`,
    body:
      due.length === 2
        ? 'Clearer about what we keep, why, and what deleting your account removes.'
        : due[0] === 'privacy'
          ? 'Clearer about what we keep, why, and what deleting your account removes.'
          : 'Now covering Plus, shared spaces, Discover and connected AI apps.',
    illustration: 'legal',
    action: { label: 'Review changes', href: LEGAL_CHANGES_URL },
    audience: 'members',
    priority: 100,
  };
}

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

  const legal = useLegalStatus();
  const acknowledge = useAcknowledgeLegal();
  const legalDue = legal.data?.due ?? [];
  const legalNotice = isGuest ? null : legalNoticeCallout(legalDue);

  /* Waits for both answers — the account's seen record and its legal standing — so neither a
     put-away card nor a feature card the notice should outrank flashes up first. */
  const callout =
    ready && (isGuest || legal.isFetched)
      ? pickCallout(
          CALLOUTS,
          state.calloutsSeen,
          {
            isGuest,
            isPlus: plus.has,
            appVersion: appVersion(),
            now: Date.now(),
          },
          legalNotice ? [legalNotice] : [],
        )
      : null;

  /* Answering the legal notice, either way, is acknowledging it: the reader was shown it. */
  const markSeen = useCallback(
    (id: string) => {
      if (id === LEGAL_NOTICE_ID) {
        acknowledge.mutate({ documents: legalDue, surface: 'notice' });
        return;
      }
      updateOnboardingState((current) => markCalloutSeen(current, id, new Date().toISOString()));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acknowledge.mutate, legalDue.join(',')],
  );

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

/**
 * Everything the stack holds right now, in order: the legal notice, the one feature callout,
 * then Harvous's own notices. The founder's letter opens from here, so the host renders its sheet.
 */
function useCalloutStack() {
  const { callout, dismiss, act } = useActiveCallout();
  const notices = useNoticeItems();
  const items: CalloutStackItem[] = [];
  if (callout) {
    items.push({
      id: callout.id,
      title: callout.title,
      body: callout.body,
      illustration: callout.illustration,
      actionLabel: callout.action.label,
      act,
      dismiss,
    });
  }
  items.push(...notices.items);
  return { items, founderLetterOpen: notices.founderLetterOpen, closeFounderLetter: notices.closeFounderLetter };
}

type CardContent = {
  title: string;
  body: string;
  illustration?: CalloutIllustrationKey;
  action: { label: string };
};

/** The card alone, for the design gallery and anything else that supplies its own answers. */
export function CalloutCard({
  callout,
  variant,
  compact = false,
  exiting = false,
  onDismiss,
  onAct,
}: {
  callout: CardContent;
  variant: 'corner' | 'inline';
  /** Without the drawing — a notice, or any card in an opened stack. */
  compact?: boolean;
  exiting?: boolean;
  onDismiss: () => void;
  onAct: () => void;
}) {
  const titleId = useId();
  const art = !compact && callout.illustration;
  return (
    <div
      className={[
        'proto-callout',
        `proto-callout--${variant}`,
        art ? null : 'proto-callout--compact',
        exiting ? 'proto-callout--exiting' : null,
      ]
        .filter(Boolean)
        .join(' ')}
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
      {art ? (
        <div className="proto-callout__art">
          <CalloutIllustration name={callout.illustration!} />
        </div>
      ) : null}
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

function asContent(item: CalloutStackItem): CardContent {
  return { title: item.title, body: item.body, illustration: item.illustration, action: { label: item.actionLabel } };
}

/**
 * The cards as a stack: the first in front, the rest as edges behind it — above it in the
 * window's corner (`up`), below it at the top of Home on a phone (`down`). Opened, every card is
 * listed, each with its own ×, and "Dismiss all" puts the lot away.
 */
export function CalloutStack({
  items,
  variant,
  exiting = false,
}: {
  items: readonly CalloutStackItem[];
  variant: 'corner' | 'inline';
  exiting?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const direction = variant === 'corner' ? 'up' : 'down';
  /* Nothing left to open once there is one card. */
  useEffect(() => {
    if (items.length < 2) setOpen(false);
  }, [items.length]);
  if (items.length === 0) return null;
  const [front, ...rest] = items;

  if (open) {
    return (
      <div className={`proto-callout-stack proto-callout-stack--open`} data-direction={direction}>
        <div className="proto-callout-stack__bar">
          <button
            type="button"
            className="proto-callout-stack__text-btn"
            onClick={() => {
              for (const item of items) item.dismiss();
            }}
          >
            Dismiss all
          </button>
          <button type="button" className="proto-callout-stack__text-btn" onClick={() => setOpen(false)}>
            Show less
          </button>
        </div>
        <div className="proto-callout-stack__list">
          {items.map((item) => (
            <CalloutCard
              key={item.id}
              callout={asContent(item)}
              variant={variant}
              compact
              onDismiss={item.dismiss}
              onAct={item.act}
            />
          ))}
        </div>
      </div>
    );
  }

  const peeks = Math.min(2, rest.length);
  return (
    <div className="proto-callout-stack" data-direction={direction} data-peek={peeks}>
      {rest.length > 0 ? (
        <button
          type="button"
          className="proto-callout-stack__more"
          aria-label={`Show all ${items.length}`}
          onClick={() => setOpen(true)}
        >
          <span className="proto-callout-stack__more-label">{rest.length} more</span>
        </button>
      ) : null}
      <CalloutCard
        callout={asContent(front!)}
        variant={variant}
        exiting={exiting}
        onDismiss={front!.dismiss}
        onAct={front!.act}
      />
    </div>
  );
}

/** Desktop: the stack in the window's corner. Mounted once, in the shell. */
export function PrototypeFeatureCalloutCorner() {
  const { isMobileSidebar, inspectorOpen } = useProtoShell();
  const welcomeUp = useSyncExternalStore(subscribeAppUpdateToastHold, isAppUpdateToastHeld, () => false);
  const { items, founderLetterOpen, closeFounderLetter } = useCalloutStack();
  /*
   * The cards that are leaving, kept until their exit finishes — the list empties the moment the
   * last is put away, and the stack would otherwise vanish rather than leave.
   */
  const [shown, setShown] = useState<readonly CalloutStackItem[]>([]);
  const open = items.length > 0 && !isMobileSidebar && !inspectorOpen && !welcomeUp;
  useEffect(() => {
    if (open) setShown(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.map((item) => item.id).join(',')]);
  const { mounted, exiting } = useProtoOverlayMotion(open);

  return (
    <>
      {mounted && shown.length > 0 && typeof document !== 'undefined'
        ? /* Portaled to body, so it carries `proto-theme` itself — outside the shell it would
             lose the tokens and conventions scoped there (the Harvous 3 welcome does the same). */
          createPortal(
            <div className="proto-theme proto-callout-anchor">
              <CalloutStack items={open ? items : shown} variant="corner" exiting={exiting} />
            </div>,
            document.body,
          )
        : null}
      {!isMobileSidebar ? <PrototypeFounderLetterSheet open={founderLetterOpen} onClose={closeFounderLetter} /> : null}
    </>
  );
}

/** Phones: the same stack at the top of Home's Today band, opening downward. */
export function PrototypeFeatureCalloutInline() {
  const { isMobileSidebar } = useProtoShell();
  const { items, founderLetterOpen, closeFounderLetter } = useCalloutStack();
  if (!isMobileSidebar) return null;
  return (
    <>
      <CalloutStack items={items} variant="inline" />
      <PrototypeFounderLetterSheet open={founderLetterOpen} onClose={closeFounderLetter} />
    </>
  );
}

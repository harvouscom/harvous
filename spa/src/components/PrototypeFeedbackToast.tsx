import Icon from '@/components/react/Icon';
import {
  PROTO_FEEDBACK_TOAST_EVENT,
  type PrototypeFeedbackToastAction,
  type PrototypeFeedbackToastDetail,
} from '@/utils/prototype-feedback-toast';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import PrototypeSupportSheet from '../pages/prototype/PrototypeSupportSheet';

const AUTO_DISMISS_MS = 4000;

/**
 * Centre the toast on the reading surface, not the window.
 *
 * The toast is portaled to `document.body` and was `left: 50%`, which centres it on the
 * *viewport* — so with the sidebar open it sat visibly left of the note it was talking
 * about. Every one of these messages is about something in the main pane ("Added to
 * Family"), and a pill that drifts away from its subject reads as chrome belonging to the
 * app rather than a reply to what you just did.
 *
 * Measured rather than derived from a sidebar width: the sidebar collapses, the inspector
 * opens, and the pane is the only thing that knows the answer in all of those. Falls back
 * to the window centre wherever there is no main pane at all — the auth and public shells.
 */
function useMainPaneCenter(active: boolean): number | null {
  const [center, setCenter] = useState<number | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const pane = document.querySelector('.proto-main-pane');
    if (!pane) {
      setCenter(null);
      return undefined;
    }
    const measure = () => {
      const rect = pane.getBoundingClientRect();
      // A pane mid-transition can report zero width; the window centre is a better guess
      // than pinning the toast to the left edge.
      setCenter(rect.width > 0 ? rect.left + rect.width / 2 : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [active]);

  return center;
}

export default function PrototypeFeedbackToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<PrototypeFeedbackToastDetail['variant']>('success');
  const [action, setAction] = useState<PrototypeFeedbackToastAction | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current != null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    setMessage(null);
    setAction(null);
  }, [clearDismissTimer]);

  const show = useCallback(
    (detail: PrototypeFeedbackToastDetail) => {
      clearDismissTimer();
      const nextVariant = detail.variant ?? 'success';
      const nextPersistent = detail.persistent ?? nextVariant === 'error';
      setVariant(nextVariant);
      setMessage(detail.message);
      setAction(detail.action ?? null);
      if (!nextPersistent) {
        dismissTimerRef.current = setTimeout(() => {
          dismissTimerRef.current = null;
          setMessage(null);
          setAction(null);
        }, AUTO_DISMISS_MS);
      }
    },
    [clearDismissTimer],
  );

  const mainPaneCenter = useMainPaneCenter(message !== null);

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<PrototypeFeedbackToastDetail>).detail;
      if (!detail?.message) return;
      show(detail);
    };

    window.addEventListener(PROTO_FEEDBACK_TOAST_EVENT, onFeedback);
    return () => {
      window.removeEventListener(PROTO_FEEDBACK_TOAST_EVENT, onFeedback);
      clearDismissTimer();
    };
  }, [show, clearDismissTimer]);

  if (!message || typeof document === 'undefined') {
    return supportOpen ? (
      <PrototypeSupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} initialTopic="Bug" />
    ) : null;
  }

  const isError = variant === 'error';

  return createPortal(
    <>
      <div
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        className={`proto-update-toast proto-feedback-toast proto-feedback-toast--${variant ?? 'success'}`}
        style={
          mainPaneCenter == null
            ? undefined
            : ({ '--proto-toast-center': `${mainPaneCenter}px` } as CSSProperties)
        }
      >
        {isError ? (
          <Icon
            name="circle-exclamation"
            size={16}
            className="proto-feedback-toast__icon"
            aria-hidden
          />
        ) : null}
        <span className="proto-update-toast__label">{message}</span>
        {action ? (
          <button
            type="button"
            className="proto-update-toast__action proto-update-toast__action--secondary"
            onClick={() => {
              const run = action.onAction;
              dismiss();
              /* An action with its own handler (Undo on a destination change) runs it;
                 without one this stays the support affordance an error toast has always
                 carried. */
              if (run) run();
              else setSupportOpen(true);
            }}
          >
            {action.label}
          </button>
        ) : null}
        <button type="button" className="proto-side-panel__action-btn" aria-label="Dismiss" onClick={dismiss}>
          <Icon name="xmark" size={12} aria-hidden />
        </button>
      </div>
      <PrototypeSupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} initialTopic="Bug" />
    </>,
    document.body,
  );
}

import Icon from '@/components/react/Icon';
import {
  PROTO_FEEDBACK_TOAST_EVENT,
  type PrototypeFeedbackToastAction,
  type PrototypeFeedbackToastDetail,
} from '@/utils/prototype-feedback-toast';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PrototypeSupportSheet from '../pages/prototype/PrototypeSupportSheet';

const AUTO_DISMISS_MS = 4000;

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
              dismiss();
              setSupportOpen(true);
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

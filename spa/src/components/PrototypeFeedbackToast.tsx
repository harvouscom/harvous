import Icon from '@/components/react/Icon';
import {
  PROTO_FEEDBACK_TOAST_EVENT,
  type PrototypeFeedbackToastDetail,
} from '@/utils/prototype-feedback-toast';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const AUTO_DISMISS_MS = 4000;

export default function PrototypeFeedbackToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<PrototypeFeedbackToastDetail['variant']>('success');
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
  }, [clearDismissTimer]);

  const show = useCallback(
    (nextMessage: string, nextVariant: PrototypeFeedbackToastDetail['variant'] = 'success') => {
      clearDismissTimer();
      setVariant(nextVariant);
      setMessage(nextMessage);
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        setMessage(null);
      }, AUTO_DISMISS_MS);
    },
    [clearDismissTimer],
  );

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<PrototypeFeedbackToastDetail>).detail;
      if (!detail?.message) return;
      show(detail.message, detail.variant ?? 'success');
    };

    window.addEventListener(PROTO_FEEDBACK_TOAST_EVENT, onFeedback);
    return () => {
      window.removeEventListener(PROTO_FEEDBACK_TOAST_EVENT, onFeedback);
      clearDismissTimer();
    };
  }, [show, clearDismissTimer]);

  if (!message || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`proto-update-toast proto-feedback-toast proto-feedback-toast--${variant ?? 'success'}`}
    >
      <span className="proto-update-toast__label">{message}</span>
      <button type="button" className="proto-update-toast__dismiss" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="xmark" size={12} aria-hidden />
      </button>
    </div>,
    document.body,
  );
}

import Icon from '@/components/react/Icon';
import {
  PROTO_APP_UPDATE_EVENT,
  reloadPrototypeAfterUpdate,
  showPrototypeAppUpdateNotice,
  type PrototypeAppUpdateMode,
} from '@/utils/prototype-app-update-notice';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const INFO_AUTO_DISMISS_MS = 6000;

export default function PrototypeAppUpdateToast() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<PrototypeAppUpdateMode>('info');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    setVisible(false);
  }, [clearDismissTimer]);

  const show = useCallback(
    (nextMode: PrototypeAppUpdateMode) => {
      clearDismissTimer();
      setMode(nextMode);
      setVisible(true);

      if (nextMode === 'info') {
        dismissTimerRef.current = setTimeout(() => {
          dismissTimerRef.current = null;
          setVisible(false);
        }, INFO_AUTO_DISMISS_MS);
      }
    },
    [clearDismissTimer],
  );

  useEffect(() => {
    window.__harvousShowAppUpdateNotice = (opts) => {
      showPrototypeAppUpdateNotice(opts?.needsReload ? 'reload' : 'info');
    };

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: PrototypeAppUpdateMode }>).detail;
      show(detail?.mode === 'reload' ? 'reload' : 'info');
    };

    window.addEventListener(PROTO_APP_UPDATE_EVENT, onUpdate);
    return () => {
      delete window.__harvousShowAppUpdateNotice;
      window.removeEventListener(PROTO_APP_UPDATE_EVENT, onUpdate);
      clearDismissTimer();
    };
  }, [clearDismissTimer, show]);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div role="status" aria-live="polite" className="proto-update-toast">
      <span className="proto-update-toast__label">Harvous was updated</span>
      {mode === 'reload' ? (
        <button type="button" className="proto-update-toast__action" onClick={reloadPrototypeAfterUpdate}>
          Reload
        </button>
      ) : null}
      <button type="button" className="proto-update-toast__dismiss" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="xmark" size={12} aria-hidden />
      </button>
    </div>,
    document.body,
  );
}

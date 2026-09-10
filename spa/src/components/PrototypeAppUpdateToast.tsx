import Icon from '@/components/react/Icon';
import {
  PROTO_APP_UPDATE_EVENT,
  reloadPrototypeAfterUpdate,
  showPrototypeAppUpdateNotice,
} from '@/utils/prototype-app-update-notice';
import { isAppUpdateToastHeld, onAppUpdateToastRelease } from '../pages/prototype/welcome3-bridge';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PrototypeAppUpdateToast() {
  const [visible, setVisible] = useState(false);
  /* An update that arrived while the Harvous 3 welcome was up. Deferred rather than dropped —
     the reload still needs asking for, just not stacked on top of the welcome. */
  const pendingRef = useRef(false);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const show = useCallback(() => {
    if (isAppUpdateToastHeld()) {
      pendingRef.current = true;
      return;
    }
    setVisible(true);
  }, []);

  useEffect(
    () =>
      onAppUpdateToastRelease(() => {
        if (!pendingRef.current) return;
        pendingRef.current = false;
        setVisible(true);
      }),
    [],
  );

  useEffect(() => {
    window.__harvousShowAppUpdateNotice = (opts) => {
      if (opts?.needsReload) {
        showPrototypeAppUpdateNotice('reload');
      }
    };

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: 'info' | 'reload' }>).detail;
      if (detail?.mode === 'reload') {
        show();
      }
    };

    window.addEventListener(PROTO_APP_UPDATE_EVENT, onUpdate);
    return () => {
      delete window.__harvousShowAppUpdateNotice;
      window.removeEventListener(PROTO_APP_UPDATE_EVENT, onUpdate);
    };
  }, [show]);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div role="status" aria-live="polite" className="proto-update-toast">
      <span className="proto-update-toast__label">Harvous was updated</span>
      <button type="button" className="proto-update-toast__action" onClick={reloadPrototypeAfterUpdate}>
        Reload
      </button>
      <button type="button" className="proto-side-panel__action-btn" aria-label="Dismiss" onClick={dismiss}>
        <Icon name="xmark" size={12} aria-hidden />
      </button>
    </div>,
    document.body,
  );
}

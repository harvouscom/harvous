import Icon from '@/components/react/Icon';
import {
  PROTO_APP_UPDATE_EVENT,
  reloadPrototypeAfterUpdate,
  showPrototypeAppUpdateNotice,
} from '@/utils/prototype-app-update-notice';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PrototypeAppUpdateToast() {
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const show = useCallback(() => {
    setVisible(true);
  }, []);

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

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import type { FeedbackTopic } from '@/utils/support-mailto';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import PrototypeSupportForm from './settings/PrototypeSupportForm';

type Props = {
  open: boolean;
  onClose: () => void;
  initialTopic?: FeedbackTopic;
};

export default function PrototypeSupportSheet({ open, onClose, initialTopic }: Props) {
  const { mounted, exiting } = useProtoOverlayMotion(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={[
        'proto-votd-sheet-overlay',
        'proto-votd-sheet-overlay--motion',
        exiting ? 'proto-votd-sheet-overlay--exiting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={[
          'proto-votd-sheet',
          'proto-support-sheet',
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label="Get support"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="proto-votd-sheet__header">
          <div className="proto-votd-sheet__header-text">
            <p className="proto-caption proto-votd-sheet__eyebrow">Help</p>
            <h2 className="proto-votd-sheet__reference">Get support</h2>
          </div>
          <button
            type="button"
            className="proto-toolbar-icon-btn proto-votd-sheet__close"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="xmark" size={22} />
          </button>
        </header>

        <div className="proto-votd-sheet__divider" aria-hidden />

        <div className="proto-votd-sheet__body">
          <PrototypeSupportForm key={open ? 'open' : 'closed'} initialTopic={initialTopic} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

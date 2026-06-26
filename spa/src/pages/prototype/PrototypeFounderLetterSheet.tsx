import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import FounderLetterContent from '@/components/react/FounderLetterContent';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function PrototypeFounderLetterSheet({ open, onClose }: Props) {
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
        'proto-founder-letter-overlay',
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
          'proto-founder-letter-sheet',
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label="Letter from the founder"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="proto-toolbar-icon-btn proto-founder-letter-sheet__close"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="xmark" size={22} />
        </button>
        <div className="proto-founder-letter-sheet__body">
          <FounderLetterContent />
        </div>
      </div>
    </div>,
    document.body,
  );
}

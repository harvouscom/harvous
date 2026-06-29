import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';

type Props = {
  open: boolean;
  onClose: () => void;
};

function MigrationSidebarChip({ icon, label }: { icon: 'folder' | 'arrow-right-arrow-left'; label: string }) {
  return (
    <span className="proto-migration-sheet__chip" aria-hidden>
      <Icon name={icon} size={11} />
      <span>{label}</span>
    </span>
  );
}

export default function PrototypeMigrationSheet({ open, onClose }: Props) {
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
          'proto-migration-sheet',
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label="Folders update"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="proto-votd-sheet__header">
          <div className="proto-votd-sheet__header-text">
            <p className="proto-caption proto-votd-sheet__eyebrow">What&apos;s new</p>
            <h2 className="proto-votd-sheet__reference">Old threads are now folders</h2>
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

        <div className="proto-votd-sheet__body proto-migration-sheet__body">
          <p className="proto-migration-sheet__text">
            You used to organize notes under a thread title. Those titles are{' '}
            <MigrationSidebarChip icon="folder" label="Folders" /> now. The new{' '}
            <MigrationSidebarChip icon="arrow-right-arrow-left" label="Threads" /> links related notes so you can
            follow your study from note to note.
          </p>
          <div className="proto-detail-card proto-migration-sheet__disclaimer" role="note">
            <Icon name="circle-info" size={18} className="proto-detail-card__icon" aria-hidden />
            <p className="pds-list-preview proto-detail-card__text">
              Every previous thread is now a locked primary folder. Your notes are unchanged, and you can edit those
              folders anytime.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

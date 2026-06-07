import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';

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
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="proto-votd-sheet-overlay" role="presentation" onClick={onClose}>
      <div
        className="proto-votd-sheet proto-migration-sheet"
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
            Browse notes by your former thread titles under <MigrationSidebarChip icon="folder" label="Folders" />.{' '}
            <MigrationSidebarChip icon="arrow-right-arrow-left" label="Threads" /> is new—it connects related notes
            into a study chain, separate from the old threads you used before.
          </p>
          <p className="proto-migration-sheet__text proto-migration-sheet__text--secondary">
            Nothing was removed—your notes are still here, grouped under folder names that match your old thread
            titles.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

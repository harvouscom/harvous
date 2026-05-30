import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import { fetchVerseHtml } from '@/utils/fetch-verse-html';
import type { VotdToday } from '../../lib/votd-today';

type Props = {
  votd: VotdToday;
  open: boolean;
  showsAddFAB: boolean;
  onClose: () => void;
  onAdd: () => void;
};

export default function PrototypeVotdPassageSheet({ votd, open, showsAddFAB, onClose, onAdd }: Props) {
  const [html, setHtml] = useState('');
  const [loadingPassage, setLoadingPassage] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    void (async () => {
      setLoadingPassage(true);
      const h = await fetchVerseHtml(votd.reference, votd.translation);
      if (cancelled) return;
      setHtml(h || '');
      setLoadingPassage(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, votd.reference, votd.translation]);

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
    <div
      className="proto-votd-sheet-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="proto-votd-sheet"
        role="dialog"
        aria-label="Today's passage"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="proto-votd-sheet__header">
          <div className="proto-votd-sheet__header-text">
            <p className="proto-caption proto-votd-sheet__eyebrow">Today&apos;s Passage</p>
            <h2 className="proto-votd-sheet__reference">{votd.reference}</h2>
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

        <div className={`proto-votd-sheet__body${showsAddFAB ? ' proto-votd-sheet__body--fab' : ''}`}>
          {loadingPassage ? (
            <p className="proto-caption">Loading passage…</p>
          ) : html ? (
            <div
              className="proto-votd-sheet__html"
              dangerouslySetInnerHTML={{ __html: safeRenderHtml(html) }}
            />
          ) : (
            <p className="proto-caption">Could not load this passage.</p>
          )}
        </div>

        {showsAddFAB ? (
          <button
            type="button"
            className="proto-votd-sheet__fab"
            aria-label="Add passage to notes"
            onClick={onAdd}
          >
            <Icon name="plus" size={17} />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

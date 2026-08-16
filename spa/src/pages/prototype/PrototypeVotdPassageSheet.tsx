import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { getTranslationAbbreviationDisplay, TRANSLATIONS } from '@/data/translations';
import { safeRenderHtml } from '@/utils/content-renderer';
import { fetchVerseHtml, getCachedVerseHtml } from '@/utils/fetch-verse-html';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import type { VotdToday } from '../../lib/votd-today';
import '@/styles/scripture-pill-chrome.css';

type Props = {
  votd: VotdToday;
  open: boolean;
  showsAddFAB: boolean;
  onClose: () => void;
  onAdd: () => void;
};

export default function PrototypeVotdPassageSheet({ votd, open, showsAddFAB, onClose, onAdd }: Props) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const [html, setHtml] = useState('');
  const [loadingPassage, setLoadingPassage] = useState(true);
  const translationLabel = getTranslationAbbreviationDisplay(votd.translation);
  const translationInfo = TRANSLATIONS[votd.translation];
  const translationCopyright = translationInfo?.copyright;

  useEffect(() => {
    const cached = getCachedVerseHtml(votd.reference, votd.translation);
    setHtml(cached ?? '');
    setLoadingPassage(cached == null);
  }, [votd.reference, votd.translation]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const cached = getCachedVerseHtml(votd.reference, votd.translation);
    if (cached) {
      setHtml(cached);
      setLoadingPassage(false);
      return undefined;
    }

    setLoadingPassage(true);
    void (async () => {
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
          'proto-votd-sheet--motion',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label="Today's passage"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="proto-votd-sheet__header">
          <div className="proto-votd-sheet__header-text">
            <p className="proto-caption proto-votd-sheet__eyebrow">Today&apos;s Passage</p>
            <h2 className="proto-votd-sheet__reference-row scripture-pill-chrome__header-label">
              <span className="proto-votd-sheet__reference scripture-pill-chrome__title-text">{votd.reference}</span>
              <span className="scripture-pill-chrome__trans-chip" aria-label={`Translation ${translationLabel}`}>
                {translationLabel}
              </span>
            </h2>
          </div>
          <button
            type="button"
            className="proto-side-panel__action-btn proto-votd-sheet__close"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </header>

        <div className="proto-votd-sheet__divider" aria-hidden />

        <div className="proto-votd-sheet__body">
          {loadingPassage ? (
            <p className="proto-caption">Loading passage…</p>
          ) : html ? (
            <div
              className="proto-votd-sheet__html scripture-pill-chrome__passage-html"
              dangerouslySetInnerHTML={{ __html: safeRenderHtml(html) }}
            />
          ) : (
            <p className="proto-caption">Could not load this passage.</p>
          )}
        </div>

        {/*
          Footer holds the credit AND the action side by side. The action used
          to be an absolutely-positioned FAB floating over this text, which
          overlapped the copyright line at every width — the clearance padding
          it relied on was silently overridden. In normal flow it cannot.
        */}
        {translationCopyright || showsAddFAB ? (
          <footer className="proto-votd-sheet__footer">
            {translationCopyright ? (
              /*
                The calm credit line, not the boxed banner. The banner variant
                clamps to one line with `white-space: nowrap`, which truncated
                the copyright mid-word ("New Living Translatio…") — legally the
                notice should be readable, so it wraps here instead.
              */
              <p className="proto-votd-sheet__credit">
                {translationCopyright}
                {translationInfo?.website ? (
                  <>
                    {' '}
                    <a
                      className="proto-votd-sheet__credit-link"
                      href={translationInfo.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {translationLabel}
                      <Icon name="arrow-up-right-from-square" size={7} aria-hidden />
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}

            {showsAddFAB ? (
              <button
                type="button"
                className="proto-glass-action proto-glass-action--primary proto-votd-sheet__add"
                aria-label="Add passage to notes"
                onClick={onAdd}
              >
                <Icon name="plus" size={12} aria-hidden />
                <span className="proto-glass-action__label">New note</span>
              </button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

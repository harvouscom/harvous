import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { getTranslationAbbreviationDisplay, TRANSLATIONS } from '@/data/translations';
import { useOverlayMotion } from '@/hooks/useOverlayMotion';
import type { VotdPreviewDay } from '@/hooks/queries/useVotdPreview';
import { safeRenderHtml } from '@/utils/content-renderer';
import { fetchVerseHtml, getCachedVerseHtml } from '@/utils/fetch-verse-html';
import { utcTodayStr } from '@/utils/admin-votd-calendar';
import '@/styles/scripture-pill-chrome.css';
import '../../../spa/src/styles/prototype-components.css';

type MutationBundle = {
  overrideMutation: {
    isPending: boolean;
    mutate: (
      body: { date: string; reference: string },
      options?: { onSuccess?: () => void },
    ) => void;
  };
  refreshMutation: {
    isPending: boolean;
    mutate: (body: { date: string }) => void;
  };
  clearMutation: {
    isPending: boolean;
    mutate: (date: string) => void;
  };
};

type Props = {
  day: VotdPreviewDay | null;
  open: boolean;
  overrideForDate: string | null;
  overrideRefInput: string;
  onOverrideRefInputChange: (value: string) => void;
  onStartOverride: (date: string) => void;
  onCancelOverride: () => void;
  onClose: () => void;
  overrideMutation: MutationBundle['overrideMutation'];
  refreshMutation: MutationBundle['refreshMutation'];
  clearMutation: MutationBundle['clearMutation'];
};

export default function AdminVotdPassageDialog({
  day,
  open,
  overrideForDate,
  overrideRefInput,
  onOverrideRefInputChange,
  onStartOverride,
  onCancelOverride,
  onClose,
  overrideMutation,
  refreshMutation,
  clearMutation,
}: Props) {
  const { mounted, exiting } = useOverlayMotion(open);
  const [html, setHtml] = useState('');
  const [loadingPassage, setLoadingPassage] = useState(true);

  const translation = day?.translation ?? 'NET';
  const translationLabel = getTranslationAbbreviationDisplay(translation);
  const translationInfo = TRANSLATIONS[translation];
  const translationCopyright = translationInfo?.copyright;
  const today = utcTodayStr();
  const canEdit = day ? !day.isPublished && day.date >= today : false;
  const showOverrideForm = day && overrideForDate === day.date && canEdit;

  useEffect(() => {
    if (!day) return;
    const cached = getCachedVerseHtml(day.reference, translation);
    setHtml(cached ?? '');
    setLoadingPassage(cached == null);
  }, [day, translation]);

  useEffect(() => {
    if (!open || !day) return undefined;
    let cancelled = false;
    const cached = getCachedVerseHtml(day.reference, translation);
    if (cached) {
      setHtml(cached);
      setLoadingPassage(false);
      return undefined;
    }

    setLoadingPassage(true);
    void (async () => {
      const h = await fetchVerseHtml(day.reference, translation);
      if (cancelled) return;
      setHtml(h || '');
      setLoadingPassage(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, day, translation]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !day || typeof document === 'undefined') return null;

  const eyebrow =
    day.date === today ? "Today's Passage" : `${day.dayOfWeek}, ${day.date} (UTC)`;

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
          'admin-votd-passage-dialog',
          exiting ? 'proto-votd-sheet--exiting' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-label={`Passage for ${day.date}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="proto-votd-sheet__header">
          <div className="proto-votd-sheet__header-text">
            <p className="proto-caption proto-votd-sheet__eyebrow">{eyebrow}</p>
            <h2 className="proto-votd-sheet__reference-row scripture-pill-chrome__header-label">
              <span className="proto-votd-sheet__reference scripture-pill-chrome__title-text">{day.reference}</span>
              <span className="scripture-pill-chrome__trans-chip" aria-label={`Translation ${translationLabel}`}>
                {translationLabel}
              </span>
            </h2>
            <div className="admin-votd-passage-dialog__meta">
              {day.label ? <span className="admin-votd-day__badge">{day.label}</span> : null}
              <span className="admin-votd-passage-dialog__source pds-caption">{day.source}</span>
            </div>
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
          {loadingPassage ? (
            <p className="proto-caption">Loading passage…</p>
          ) : html ? (
            <div
              className="proto-votd-sheet__html scripture-pill-chrome__passage-html"
              dangerouslySetInnerHTML={{ __html: safeRenderHtml(html) }}
            />
          ) : day.versePreview ? (
            <p className="proto-votd-sheet__html">&ldquo;{day.versePreview}&rdquo;</p>
          ) : (
            <p className="proto-caption">Could not load this passage.</p>
          )}
        </div>

        {showOverrideForm ? (
          <>
            <div className="proto-votd-sheet__divider" aria-hidden />
            <div className="admin-votd-passage-dialog__override">
              <input
                type="text"
                className="admin-votd-day__input"
                placeholder="e.g. Psalm 23:1-3"
                value={overrideRefInput}
                onChange={(e) => onOverrideRefInputChange(e.target.value)}
              />
              <div className="admin-votd-day__override-actions">
                <button
                  type="button"
                  className="admin-votd-day__action admin-votd-day__action--primary"
                  disabled={overrideMutation.isPending || !overrideRefInput.trim()}
                  onClick={() => {
                    overrideMutation.mutate(
                      { date: day.date, reference: overrideRefInput.trim() },
                      { onSuccess: onCancelOverride },
                    );
                  }}
                >
                  Save override
                </button>
                <button type="button" className="admin-votd-day__action" onClick={onCancelOverride}>
                  Cancel
                </button>
              </div>
            </div>
          </>
        ) : null}

        {canEdit ? (
          <>
            <div className="proto-votd-sheet__divider" aria-hidden />
            <footer className="admin-votd-passage-dialog__actions">
              <button
                type="button"
                className="admin-votd-day__action"
                disabled={refreshMutation.isPending}
                onClick={() => refreshMutation.mutate({ date: day.date })}
              >
                Refresh pick
              </button>
              {day.isOverridden ? (
                <button
                  type="button"
                  className="admin-votd-day__action"
                  disabled={clearMutation.isPending}
                  onClick={() => clearMutation.mutate(day.date)}
                >
                  Clear override
                </button>
              ) : null}
              <button
                type="button"
                className="admin-votd-day__action admin-votd-day__action--emphasis"
                onClick={() => onStartOverride(day.date)}
              >
                Override…
              </button>
            </footer>
          </>
        ) : null}

        {translationCopyright ? (
          <>
            <div className="proto-votd-sheet__divider" aria-hidden />
            <footer className="proto-votd-sheet__attribution scripture-pill-chrome__attribution">
              <Icon name="circle-info" size={9} className="scripture-pill-chrome__attribution-icon" aria-hidden />
              <p className="scripture-pill-chrome__attribution-copyright">{translationCopyright}</p>
              {translationInfo?.website ? (
                <a
                  className="scripture-pill-chrome__attribution-link"
                  href={translationInfo.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {translationLabel}
                  <Icon name="arrow-up-right-from-square" size={7} aria-hidden />
                </a>
              ) : null}
            </footer>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

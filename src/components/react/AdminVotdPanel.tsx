import React, { useState } from 'react';
import SquareButton from './SquareButton';
import Icon from './Icon';
import { FeaturedCardActionsDock } from './FeaturedCardActionsDock';
import { useVotdPreviewForAdmin, useVotdPreviewMutations, type VotdPreviewDay } from '@/hooks/queries/useVotdPreview';
import '@/styles/admin-votd.css';

function utcTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function AdminVotdScheduleBody({
  days,
  previewLoading,
  previewError,
  overrideMutation,
  refreshMutation,
  clearMutation,
}: {
  days: VotdPreviewDay[] | undefined;
  previewLoading: boolean;
  previewError: boolean;
  overrideMutation: ReturnType<typeof useVotdPreviewMutations>['overrideMutation'];
  refreshMutation: ReturnType<typeof useVotdPreviewMutations>['refreshMutation'];
  clearMutation: ReturnType<typeof useVotdPreviewMutations>['clearMutation'];
}) {
  const today = utcTodayStr();
  const [overrideForDate, setOverrideForDate] = useState<string | null>(null);
  const [overrideRefInput, setOverrideRefInput] = useState('');

  return (
    <>
      <p className="admin-votd__intro">
        Editorial preview (UTC dates). Cron publishes automatically at 00:15 UTC — no approval required. Override or
        refresh any future day as needed.
      </p>

      {previewLoading && <p className="admin-votd__muted">Loading schedule…</p>}
      {previewError && <p className="admin-votd__error">Could not load preview. Try again.</p>}

      {days?.map((day) => {
        const isToday = day.date === today;
        const isPast = day.date < today;
        const canEdit = !day.isPublished && day.date >= today;
        const translation = day.translation ?? 'NET';

        const shellClass = [
          'admin-votd-day-shell',
          day.isHoliday ? 'admin-votd-day-shell--holiday' : '',
          isToday ? 'admin-votd-day-shell--today' : '',
          isPast || day.isPublished ? 'admin-votd-day-shell--past' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const verseBlock = (
          <div className="featured-card__verse-row">
            <div className="featured-card__votd-verse-icon" aria-hidden="true">
              <Icon name="scroll" size={20} />
            </div>
            <div className="featured-card__verse-text">
              {day.versePreview ? (
                <>
                  &ldquo;{day.versePreview}&rdquo;{' '}
                  <span
                    className="scripture-pill"
                    data-scripture-reference={day.reference}
                    data-scripture-translation={translation}
                  >
                    {day.reference}
                  </span>
                </>
              ) : (
                <span className="admin-votd-day__verse-missing">Verse text could not be loaded.</span>
              )}
            </div>
          </div>
        );

        const metaRow = (
          <div className="admin-votd-day__meta">
            <div>
              <span className="admin-votd-day__date">{day.date}</span>
              <span className="admin-votd-day__dow">{day.dayOfWeek}</span>
              {day.label ? <span className="admin-votd-day__badge">{day.label}</span> : null}
            </div>
            <span className="admin-votd-day__source">{day.source}</span>
          </div>
        );

        const overrideForm =
          overrideForDate === day.date && canEdit ? (
            <div className="admin-votd-day__override-form">
              <input
                type="text"
                className="admin-votd-day__input"
                placeholder="e.g. Psalm 23:1-3"
                value={overrideRefInput}
                onChange={(e) => setOverrideRefInput(e.target.value)}
              />
              <button
                type="button"
                className="admin-votd__btn admin-votd__btn--primary"
                disabled={overrideMutation.isPending || !overrideRefInput.trim()}
                onClick={() => {
                  overrideMutation.mutate(
                    { date: day.date, reference: overrideRefInput.trim() },
                    {
                      onSuccess: () => {
                        setOverrideForDate(null);
                        setOverrideRefInput('');
                      },
                    },
                  );
                }}
              >
                Save
              </button>
              <button type="button" className="admin-votd__btn" onClick={() => setOverrideForDate(null)}>
                Cancel
              </button>
            </div>
          ) : null;

        const cardBody = (
          <div className="featured-card featured-card--votd">
            {metaRow}
            {verseBlock}
            {overrideForm}
          </div>
        );

        return (
          <div key={day.date} className={shellClass}>
            {canEdit ? (
              <div className="featured-card-shell">
                {cardBody}
                <FeaturedCardActionsDock animateEntrance={false} className="admin-votd__action-dock">
                  <button
                    type="button"
                    className="action-strip__item"
                    disabled={refreshMutation.isPending}
                    onClick={() => refreshMutation.mutate({ date: day.date })}
                  >
                    <span className="action-strip__label">Refresh pick</span>
                  </button>
                  {day.isOverridden ? (
                    <button
                      type="button"
                      className="action-strip__item"
                      disabled={clearMutation.isPending}
                      onClick={() => clearMutation.mutate(day.date)}
                    >
                      <span className="action-strip__label">Clear override</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="action-strip__item featured-card__strip-item--primary"
                    onClick={() => {
                      setOverrideForDate(day.date);
                      setOverrideRefInput('');
                    }}
                  >
                    <span className="action-strip__label">Override…</span>
                  </button>
                </FeaturedCardActionsDock>
              </div>
            ) : (
              cardBody
            )}
          </div>
        );
      })}
    </>
  );
}

export type AdminVotdPanelProps = {
  onClose?: () => void;
  inBottomSheet?: boolean;
  /** Full panel chrome (desktop profile column / mobile drawer). Omit or false for embedding in `/admin/votd`. */
  variant?: 'panel' | 'embed';
};

export default function AdminVotdPanel({
  onClose,
  inBottomSheet = false,
  variant = 'panel',
}: AdminVotdPanelProps) {
  const { admin, preview } = useVotdPreviewForAdmin(30);
  const mutations = useVotdPreviewMutations();

  const handleClose = () => {
    onClose?.();
  };

  if (variant === 'embed') {
    if (admin.isLoading) {
      return <p className="admin-votd__muted">Checking access…</p>;
    }
    if (!admin.data?.isAdmin) {
      return null;
    }
    return (
      <AdminVotdScheduleBody
        days={preview.data?.days}
        previewLoading={preview.isLoading}
        previewError={preview.isError}
        overrideMutation={mutations.overrideMutation}
        refreshMutation={mutations.refreshMutation}
        clearMutation={mutations.clearMutation}
      />
    );
  }

  if (admin.isLoading) {
    return (
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        <div className="flex-fill flex-stack" style={{ position: 'relative', gap: 0 }}>
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            <div className="panel__header">
              <div className="panel__title">
                <p>Verse of the Day</p>
              </div>
            </div>
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                <p className="admin-votd__muted">Checking access…</p>
              </div>
            </div>
          </div>
        </div>
        <div className="panel__footer--buttons">
          <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
        </div>
      </div>
    );
  }

  if (!admin.data?.isAdmin) {
    return (
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        <div className="flex-fill flex-stack" style={{ position: 'relative', gap: 0 }}>
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            <div className="panel__header">
              <div className="panel__title">
                <p>Verse of the Day</p>
              </div>
            </div>
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                <p className="admin-votd__muted">This area is only available to Harvous admins.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="panel__footer--buttons">
          <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
        </div>
      </div>
    );
  }

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className="flex-fill flex-stack" style={{ position: 'relative', gap: 0 }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>Verse of the Day</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              <AdminVotdScheduleBody
                days={preview.data?.days}
                previewLoading={preview.isLoading}
                previewError={preview.isError}
                overrideMutation={mutations.overrideMutation}
                refreshMutation={mutations.refreshMutation}
                clearMutation={mutations.clearMutation}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="panel__footer--buttons">
        <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
      </div>
    </div>
  );
}

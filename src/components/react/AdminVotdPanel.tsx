import React, { useEffect, useMemo, useState } from 'react';
import ProtoStatusChip from './ProtoStatusChip';
import SquareButton from './SquareButton';
import Icon from './Icon';
import AdminVotdPassageDialog from './AdminVotdPassageDialog';
import {
  useHarvousAdminCheck,
  useVotdPreviewMonth,
  useVotdPreviewMutations,
  type VotdPreviewDay,
} from '@/hooks/queries/useVotdPreview';
import {
  abbreviateScriptureReference,
  buildMonthGrid,
  formatUtcMonthLabel,
  shiftUtcMonth,
  utcTodayMonth,
  utcTodayStr,
  VOTD_WEEKDAY_LABELS,
} from '@/utils/admin-votd-calendar';
import '@/styles/admin-votd.css';

type MutationBundle = {
  overrideMutation: ReturnType<typeof useVotdPreviewMutations>['overrideMutation'];
  refreshMutation: ReturnType<typeof useVotdPreviewMutations>['refreshMutation'];
  clearMutation: ReturnType<typeof useVotdPreviewMutations>['clearMutation'];
};

function votdSourceDotClass(source: VotdPreviewDay['source']): string {
  switch (source) {
    case 'calendar':
      return 'admin-votd-cal__cell-dot--source-calendar';
    case 'pool':
      return 'admin-votd-cal__cell-dot--source-pool';
    case 'override':
      return 'admin-votd-cal__cell-dot--override';
    case 'published':
      return 'admin-votd-cal__cell-dot--published';
  }
}

function votdSourceDotTitle(day: VotdPreviewDay): string {
  if (day.label) return day.label;
  switch (day.source) {
    case 'calendar':
      return 'Calendar';
    case 'pool':
      return 'Pool';
    case 'override':
      return 'Override';
    case 'published':
      return 'Published';
  }
}

function AdminVotdCalendarGrid({
  viewMonth,
  daysByDate,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  viewMonth: string;
  daysByDate: Map<string, VotdPreviewDay>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const today = utcTodayStr();
  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  return (
    <div className="admin-votd-cal">
      <div className="admin-votd-cal__nav">
        <button type="button" className="admin-votd-cal__nav-btn" onClick={onPrevMonth} aria-label="Previous month">
          <Icon name="caret-left" size={16} />
        </button>
        <h2 className="admin-votd-cal__title pds-list-title">{formatUtcMonthLabel(viewMonth)}</h2>
        <button type="button" className="admin-votd-cal__nav-btn" onClick={onNextMonth} aria-label="Next month">
          <Icon name="caret-right" size={16} />
        </button>
      </div>

      <div className="admin-votd-cal__weekdays" aria-hidden="true">
        {VOTD_WEEKDAY_LABELS.map((label) => (
          <span key={label} className="admin-votd-cal__weekday pds-caption">
            {label}
          </span>
        ))}
      </div>

      <div className="admin-votd-cal__grid" role="grid" aria-label={`Passage schedule for ${formatUtcMonthLabel(viewMonth)}`}>
        {grid.map((cell, index) => {
          if (!cell.date || !cell.inMonth) {
            return (
              <div
                key={`pad-${index}`}
                className="admin-votd-cal__cell admin-votd-cal__cell--pad"
                role="gridcell"
                aria-hidden="true"
              />
            );
          }

          const day = daysByDate.get(cell.date);
          const isToday = cell.date === today;
          const isPast = cell.date < today;
          const isSelected = cell.date === selectedDate;
          const source = day?.source;
          const cellDate = cell.date;

          const cellClass = [
            'admin-votd-cal__cell',
            isToday ? 'admin-votd-cal__cell--today' : '',
            isPast || day?.isPublished ? 'admin-votd-cal__cell--past' : '',
            day?.isHoliday ? 'admin-votd-cal__cell--holiday' : '',
            day?.isOverridden ? 'admin-votd-cal__cell--overridden' : '',
            source ? `admin-votd-cal__cell--source-${source}` : '',
            isSelected ? 'admin-votd-cal__cell--selected' : '',
            day ? 'admin-votd-cal__cell--has-data' : '',
          ]
            .filter(Boolean)
            .join(' ');

          const dayNum = parseInt(cellDate.slice(8, 10), 10);

          return (
            <button
              key={cellDate}
              type="button"
              className={cellClass}
              role="gridcell"
              aria-selected={isSelected}
              aria-label={
                day
                  ? `${cellDate}, ${day.reference}${day.label ? `, ${day.label}` : ''}`
                  : `${cellDate}, no passage loaded`
              }
              disabled={!day}
              onClick={() => day && onSelectDate(cellDate)}
            >
              <span className="admin-votd-cal__cell-date">{dayNum}</span>
              {day ? (
                <>
                  <span className="admin-votd-cal__cell-ref pds-caption">
                    {abbreviateScriptureReference(day.reference)}
                  </span>
                  <span className="admin-votd-cal__cell-badges">
                    <span
                      className={`admin-votd-cal__cell-dot ${votdSourceDotClass(day.source)}`}
                      title={votdSourceDotTitle(day)}
                    />
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="admin-votd-cal__legend pds-caption">
        <span className="admin-votd-cal__legend-item">
          <span className="admin-votd-cal__cell-dot admin-votd-cal__cell-dot--source-calendar" /> Calendar
        </span>
        <span className="admin-votd-cal__legend-item">
          <span className="admin-votd-cal__cell-dot admin-votd-cal__cell-dot--source-pool" /> Pool
        </span>
        <span className="admin-votd-cal__legend-item">
          <span className="admin-votd-cal__cell-dot admin-votd-cal__cell-dot--override" /> Override
        </span>
        <span className="admin-votd-cal__legend-item">
          <span className="admin-votd-cal__cell-dot admin-votd-cal__cell-dot--published" /> Published
        </span>
      </div>
    </div>
  );
}

function AdminVotdScheduleBody({
  viewMonth,
  days,
  previewLoading,
  previewError,
  onViewMonthChange,
  overrideMutation,
  refreshMutation,
  clearMutation,
}: {
  viewMonth: string;
  days: VotdPreviewDay[] | undefined;
  previewLoading: boolean;
  previewError: boolean;
  onViewMonthChange: (month: string) => void;
  overrideMutation: MutationBundle['overrideMutation'];
  refreshMutation: MutationBundle['refreshMutation'];
  clearMutation: MutationBundle['clearMutation'];
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [overrideForDate, setOverrideForDate] = useState<string | null>(null);
  const [overrideRefInput, setOverrideRefInput] = useState('');

  const daysByDate = useMemo(() => new Map((days ?? []).map((d) => [d.date, d])), [days]);
  const activeDay = activeDate ? daysByDate.get(activeDate) : undefined;

  useEffect(() => {
    setDialogOpen(false);
    setActiveDate(null);
    setOverrideForDate(null);
    setOverrideRefInput('');
  }, [viewMonth]);

  useEffect(() => {
    if (activeDate && !daysByDate.has(activeDate)) {
      setDialogOpen(false);
      setActiveDate(null);
    }
  }, [activeDate, daysByDate]);

  const handleSelectDate = (date: string) => {
    setActiveDate(date);
    setDialogOpen(true);
    setOverrideForDate(null);
    setOverrideRefInput('');
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setActiveDate(null);
    setOverrideForDate(null);
    setOverrideRefInput('');
  };

  const handlePrevMonth = () => {
    const prev = shiftUtcMonth(viewMonth, -1);
    if (prev) onViewMonthChange(prev);
  };

  const handleNextMonth = () => {
    const next = shiftUtcMonth(viewMonth, 1);
    if (next) onViewMonthChange(next);
  };

  return (
    <>
      <div className="admin-votd__board">
        {previewError && <p className="admin-votd__error pds-body">Could not load preview. Try again.</p>}

        <AdminVotdCalendarGrid
        viewMonth={viewMonth}
        daysByDate={daysByDate}
        selectedDate={dialogOpen ? activeDate : null}
        onSelectDate={handleSelectDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
      />

      {!previewLoading && days && days.length === 0 ? (
        <p className="admin-votd__muted pds-body">No passages scheduled for this month.</p>
      ) : null}

      <AdminVotdPassageDialog
        day={activeDay ?? null}
        open={dialogOpen && !!activeDay}
        overrideForDate={overrideForDate}
        overrideRefInput={overrideRefInput}
        onOverrideRefInputChange={setOverrideRefInput}
        onStartOverride={(date) => {
          setOverrideForDate(date);
          setOverrideRefInput('');
        }}
        onCancelOverride={() => {
          setOverrideForDate(null);
          setOverrideRefInput('');
        }}
        onClose={handleCloseDialog}
        overrideMutation={overrideMutation}
        refreshMutation={refreshMutation}
        clearMutation={clearMutation}
      />
      </div>
      <ProtoStatusChip visible={previewLoading} variant="syncing" label="Loading…" />
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
  const [viewMonth, setViewMonth] = useState(utcTodayMonth);
  const { admin, preview } = useVotdPreviewMonth(viewMonth);
  const mutations = useVotdPreviewMutations();

  const scheduleBody = (
    <AdminVotdScheduleBody
      viewMonth={viewMonth}
      days={preview.data?.days}
      previewLoading={preview.isLoading}
      previewError={preview.isError}
      onViewMonthChange={setViewMonth}
      overrideMutation={mutations.overrideMutation}
      refreshMutation={mutations.refreshMutation}
      clearMutation={mutations.clearMutation}
    />
  );

  const handleClose = () => {
    onClose?.();
  };

  if (variant === 'embed') {
    if (admin.isLoading) {
      return <ProtoStatusChip visible variant="syncing" label="Loading…" />;
    }
    if (!admin.data?.isAdmin) {
      return null;
    }
    return scheduleBody;
  }

  if (admin.isLoading) {
    return (
      <>
        <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
          <div className="flex-fill flex-stack" style={{ position: 'relative', gap: 0 }}>
            <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
              <div className="panel__header">
                <div className="panel__title">
                  <p>Today&apos;s Passage</p>
                </div>
              </div>
              <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
                <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                  <div className="panel__content-scroll" />
                </div>
              </div>
            </div>
          </div>
          <div className="panel__footer--buttons">
            <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
          </div>
        </div>
        <ProtoStatusChip visible variant="syncing" label="Loading…" />
      </>
    );
  }

  if (!admin.data?.isAdmin) {
    return (
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
        <div className="flex-fill flex-stack" style={{ position: 'relative', gap: 0 }}>
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            <div className="panel__header">
              <div className="panel__title">
                <p>Today&apos;s Passage</p>
              </div>
            </div>
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                <div className="panel__content-scroll">
                  <p className="admin-votd__muted pds-body">This area is only available to Harvous admins.</p>
                </div>
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
              <p>Today&apos;s Passage</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              <div className="panel__content-scroll">{scheduleBody}</div>
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

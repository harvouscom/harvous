import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useAdminMonthlyReport,
  useAdminReportsCatalog,
  useAdminSeasonReport,
  useGenerateAdminReport,
  downloadAdminReport,
  adminReportDownloadUrl,
  type AdminMonthlyReportPayload,
  type AdminReportRankItem,
} from '@/hooks/queries/useAdminReports';
import AdminCanonHeatmap from '@/components/react/AdminCanonHeatmap';
import { formatDivineNamesInLabel } from '@/utils/divine-name-display';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import Icon, { type IconName } from '@/components/react/Icon';
import { getAdminReportMonthStatus } from '@/utils/season-helpers';
import '@/styles/admin-usage.css';
import '@/styles/admin-reports.css';
import '@/styles/admin-pulse.css';

function formatCount(n: number): string {
  return n.toLocaleString();
}

function seasonKey(seasonId: string): string {
  return seasonId.split('-')[0] ?? 'spring';
}

function seasonIcon(seasonId: string): IconName {
  const key = seasonKey(seasonId);
  if (key === 'summer') return 'sun';
  if (key === 'fall') return 'leaf';
  if (key === 'winter') return 'snowflake';
  return 'seedling';
}

function seasonTitle(seasonId: string): string {
  const key = seasonKey(seasonId);
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function seasonYearBadge(seasonId: string): string {
  const year = parseInt(seasonId.split('-')[1] ?? '', 10);
  if (!year) return '';
  return `'${String(year).slice(-2)}`;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-usage__card">
      <div className="admin-usage__card-value">{typeof value === 'number' ? formatCount(value) : value}</div>
      <div className="admin-usage__card-label">{label}</div>
    </div>
  );
}

function RankList({
  title,
  items,
  formatName,
}: {
  title: string;
  items: AdminReportRankItem[];
  formatName?: (name: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="admin-reports__rank-block">
      <h4 className="admin-reports__rank-title">{title}</h4>
      <ol className="admin-reports__rank-list">
        {items.map((item) => (
          <li key={item.name}>
            <span>{formatName ? formatName(item.name) : item.name}</span>
            <span>{formatCount(item.count)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function reportCuriosity(payload: AdminMonthlyReportPayload) {
  return payload.pulse.curiosity ?? { tones: [], folders: [], dictionaryWords: [] };
}

function reportCanon(payload: AdminMonthlyReportPayload) {
  return payload.pulse.canon ?? { sections: [], books: [] };
}

function reportThreadTotal(payload: AdminMonthlyReportPayload): number {
  const threads = payload.pulse.threads;
  return threads.totalThreads ?? threads.activeThreads ?? 0;
}

function MonthDetail({ payload }: { payload: AdminMonthlyReportPayload }) {
  const { usage, pulse } = payload;
  const curiosity = reportCuriosity(payload);
  const canon = reportCanon(payload);
  const canonSections = canon.sections.filter((section) => section.count > 0);
  return (
    <div className="admin-reports__detail" id={`month-${payload.month}`}>
      <div className="admin-usage__hero" aria-label="Month headline metrics">
        <div className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">{formatCount(usage.notesCreated)}</div>
          <div className="admin-usage__hero-label">Notes created</div>
        </div>
        <div className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">{formatCount(usage.activeUsers)}</div>
          <div className="admin-usage__hero-label">Active users</div>
        </div>
        <div className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">{formatCount(pulse.xp.totalXp)}</div>
          <div className="admin-usage__hero-label">XP awarded</div>
        </div>
        <div className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">{formatCount(pulse.uniquePassages)}</div>
          <div className="admin-usage__hero-label">Unique passages</div>
        </div>
      </div>

      <section className="admin-usage__board-card admin-reports__detail-section">
        <h3 className="admin-usage__board-title">Usage</h3>
        <div className="admin-usage__cards admin-usage__cards--compact">
          <StatCard label="Signups" value={usage.signups} />
          <StatCard label="Notes edited" value={usage.notesEdited} />
          <StatCard label="Scripture pills" value={usage.scripturePills} />
          <StatCard label="Recall opens" value={usage.recall.opens} />
          <StatCard label="Link rate" value={`${usage.study.linkRatePct}%`} />
          <StatCard label="Passage rate" value={`${usage.study.passageRatePct}%`} />
        </div>
      </section>

      <section className="admin-usage__board-card admin-reports__detail-section">
        <h3 className="admin-usage__board-title">Pulse</h3>
        <div className="admin-reports__rank-grid">
          <RankList title="Top books" items={pulse.books} />
          <RankList title="Top themes" items={pulse.themes} formatName={formatDivineNamesInLabel} />
          <RankList title="Top passages" items={pulse.passages} />
          <RankList title="Top tags" items={pulse.tags} />
          <RankList title="Translations" items={pulse.translations} />
          <RankList title="Tones" items={curiosity.tones} />
          <RankList title="Folders" items={curiosity.folders} />
          <RankList title="Words people paused on" items={curiosity.dictionaryWords} />
        </div>
      </section>

      <section className="admin-usage__board-card admin-reports__detail-section">
        <h3 className="admin-usage__board-title">Canon</h3>
        <div className="admin-reports__rank-grid">
          <RankList
            title="Section trends"
            items={canonSections.map((section) => ({ name: section.label, count: section.count }))}
          />
        </div>
        {canon.books.some((book) => book.count > 0) ? (
          <div className="admin-reports__canon-heatmap">
            <AdminCanonHeatmap books={canon.books} />
          </div>
        ) : null}
      </section>

      {(pulse.monthlyAnalytics.books.length > 0 || pulse.monthlyAnalytics.tags.length > 0) ? (
        <section className="admin-usage__board-card admin-reports__detail-section">
          <h3 className="admin-usage__board-title">Platform analytics</h3>
          <p className="admin-usage__muted admin-usage__footnote pds-caption">
            From the monthly analytics aggregator job, not limited to note activity in this calendar month.
          </p>
          <div className="admin-reports__rank-grid">
            <RankList title="Top books (analytics)" items={pulse.monthlyAnalytics.books} />
            <RankList title="Top tags (analytics)" items={pulse.monthlyAnalytics.tags} />
          </div>
        </section>
      ) : null}

      <section className="admin-usage__board-card admin-reports__detail-section">
        <h3 className="admin-usage__board-title">Threads</h3>
        <div className="admin-usage__cards admin-usage__cards--compact">
          <StatCard label="Total threads" value={reportThreadTotal(payload)} />
          <StatCard label="Links created" value={pulse.threads.linksCreated} />
          <StatCard label="Avg notes / thread" value={pulse.threads.avgNotesPerThread} />
        </div>
      </section>

      <section className="admin-usage__board-card admin-reports__detail-section">
        <h3 className="admin-usage__board-title">Rewards</h3>
        <div className="admin-usage__cards admin-usage__cards--compact">
          <StatCard label="XP events" value={pulse.xp.eventCount} />
          <StatCard label="Reward earners" value={pulse.xp.users} />
          <StatCard label="Avg XP / user" value={pulse.xp.avgXpPerUser} />
        </div>
        <RankList
          title="Top activities"
          items={pulse.xp.byActivity.map((row) => ({ name: row.label, count: row.totalXp }))}
        />
      </section>
    </div>
  );
}

function useAdminReportsDialogPortal(): { portalTarget: HTMLElement; scopedToDetailPane: boolean } {
  const [portal, setPortal] = useState<{ portalTarget: HTMLElement; scopedToDetailPane: boolean }>(() => ({
    portalTarget: typeof document !== 'undefined' ? document.body : (null as unknown as HTMLElement),
    scopedToDetailPane: false,
  }));

  useEffect(() => {
    const detailPane = document.querySelector('.proto-shell__main-inner');
    if (detailPane instanceof HTMLElement) {
      setPortal({ portalTarget: detailPane, scopedToDetailPane: true });
    }
  }, []);

  return portal;
}

function ReportMonthDialog({
  month,
  label,
  generatedAt,
  report,
  onClose,
}: {
  month: string;
  label: string;
  generatedAt: string;
  report: ReturnType<typeof useAdminMonthlyReport>;
  onClose: () => void;
}) {
  const { portalTarget, scopedToDetailPane } = useAdminReportsDialogPortal();
  const regenerate = useGenerateAdminReport();
  const [regenerateMessage, setRegenerateMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const generatedLabel = new Date(generatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const scrollHost =
      scopedToDetailPane && portalTarget !== document.body ? portalTarget : document.body;
    const previousOverflow = scrollHost.style.overflow;
    scrollHost.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      scrollHost.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, portalTarget, scopedToDetailPane]);

  const onRegenerate = async () => {
    setRegenerateMessage(null);
    try {
      await regenerate.mutateAsync(month);
      await report.refetch();
      setRegenerateMessage({ text: 'Report regenerated.', isError: false });
    } catch (error) {
      setRegenerateMessage({
        text: error instanceof Error ? error.message : 'Regeneration failed.',
        isError: true,
      });
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={[
        'admin-reports__dialog-overlay',
        scopedToDetailPane ? '' : 'admin-reports__dialog-overlay--viewport',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`admin-report-dialog-title-${month}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="admin-reports__dialog" onClick={(event) => event.stopPropagation()}>
        <header className="admin-reports__dialog-header">
          <div className="admin-reports__dialog-heading">
            <span className="admin-reports__dialog-icon" aria-hidden>
              <Icon name="calendar" size={18} />
            </span>
            <div className="admin-reports__dialog-copy">
              <h2 className="admin-reports__dialog-title" id={`admin-report-dialog-title-${month}`}>
                {label}
              </h2>
              <p className="admin-reports__dialog-meta">Generated {generatedLabel}</p>
            </div>
          </div>
          <div className="admin-reports__dialog-actions">
            <button
              type="button"
              className="admin-action-btn"
              disabled={regenerate.isPending}
              onClick={() => void onRegenerate()}
            >
              {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
            </button>
            <ExportButtons kind="month" id={month} compact />
            <button type="button" className="admin-reports__dialog-close" onClick={onClose} aria-label="Close report">
              <Icon name="xmark" size={16} aria-hidden />
            </button>
          </div>
        </header>
        {regenerateMessage ? (
          <p
            className={`admin-reports__regenerate-note${
              regenerateMessage.isError ? ' admin-reports__regenerate-note--error' : ''
            }`}
            role={regenerateMessage.isError ? 'alert' : 'status'}
          >
            {regenerateMessage.text}
          </p>
        ) : null}
        <div className="admin-reports__dialog-body">
          {report.isLoading ? <ProtoStatusChip visible variant="syncing" label="Loading month…" /> : null}
          {report.isError ? (
            <p className="admin-reports__dialog-error" role="alert">
              Could not load this month&apos;s report.
            </p>
          ) : null}
          {report.data ? <MonthDetail payload={report.data} /> : null}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

function ExportButtons({
  kind,
  id,
  disabled,
  compact = false,
}: {
  kind: 'month' | 'season' | 'year';
  id: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [pending, setPending] = useState<'csv' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDownload = async (format: 'csv' | 'json') => {
    setPending(format);
    setError(null);
    try {
      const ext = format === 'csv' ? 'csv' : 'json';
      await downloadAdminReport(adminReportDownloadUrl(kind, id, format), `harvous-report-${id}.${ext}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={`admin-reports__export-row${compact ? ' admin-reports__export-row--compact' : ''}`}>
      <button
        type="button"
        className="admin-action-btn admin-reports__export-btn"
        disabled={disabled || pending !== null}
        onClick={() => onDownload('csv')}
      >
        {pending === 'csv' ? '…' : 'CSV'}
      </button>
      <button
        type="button"
        className="admin-action-btn admin-reports__export-btn"
        disabled={disabled || pending !== null}
        onClick={() => onDownload('json')}
      >
        {pending === 'json' ? '…' : 'JSON'}
      </button>
      {error ? <span className="admin-reports__export-error">{error}</span> : null}
    </div>
  );
}

export default function AdminReportsPanel() {
  const catalog = useAdminReportsCatalog();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [dialogMonth, setDialogMonth] = useState<string | null>(null);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);

  const years = catalog.data?.years ?? [];
  const yearEntry = useMemo(
    () => years.find((y) => y.year === selectedYear) ?? years[0],
    [years, selectedYear],
  );

  const dialogMonthMeta = useMemo(() => {
    if (!dialogMonth || !yearEntry) return null;
    for (const season of yearEntry.seasons) {
      const month = season.months.find((entry) => entry.month === dialogMonth);
      if (month) return month;
    }
    return null;
  }, [dialogMonth, yearEntry]);

  const monthReport = useAdminMonthlyReport(dialogMonth);
  const seasonReport = useAdminSeasonReport(expandedSeason);

  const hasAnyGenerated = useMemo(
    () => years.some((y) => y.seasons.some((s) => s.months.some((m) => m.generatedAt))),
    [years],
  );

  const yearOptions = years.length > 0 ? years : [{ year: currentYear, seasons: [] }];

  if (catalog.isLoading) {
    return (
      <>
        <div className="admin-usage__board" />
        <ProtoStatusChip visible variant="syncing" label="Loading reports…" />
      </>
    );
  }

  if (catalog.isError) {
    return (
      <div className="admin-reports__callout admin-usage__board-card" role="alert">
        <Icon name="circle-exclamation" size={22} className="admin-reports__callout-icon" aria-hidden />
        <p className="admin-reports__callout-text">Could not load reports catalog.</p>
      </div>
    );
  }

  return (
    <div className="admin-usage__board admin-reports__board">
      <section className="admin-usage__board-card admin-reports__toolbar-card">
        <div className="admin-reports__toolbar">
          <div className="admin-reports__year-nav" role="group" aria-label="Choose year">
            {yearOptions.map((y) => {
              const active = yearEntry?.year === y.year;
              return (
                <button
                  key={y.year}
                  type="button"
                  className={`admin-usage__section-nav-pill${active ? ' admin-usage__section-nav-pill--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedYear(y.year);
                    setDialogMonth(null);
                    setExpandedSeason(null);
                  }}
                >
                  {y.year}
                </button>
              );
            })}
          </div>
          <div className="admin-reports__toolbar-export">
            <span className="admin-reports__export-label">Year export</span>
            <ExportButtons kind="year" id={String(yearEntry?.year ?? currentYear)} disabled={!hasAnyGenerated} compact />
          </div>
        </div>
      </section>

      {yearEntry?.seasons.map((season) => {
        const generatedCount = season.months.filter((m) => m.generatedAt).length;
        const seasonComplete = generatedCount === season.months.length && generatedCount > 0;

        return (
          <section key={season.seasonId} className="admin-usage__board-card admin-reports__season-card">
            <div className="admin-reports__season-top">
              <div className="admin-reports__season-heading">
                <span className="admin-reports__season-icon" aria-hidden>
                  <Icon name={seasonIcon(season.seasonId)} size={18} />
                </span>
                <div>
                  <div className="admin-reports__season-title-row">
                    <h2 className="admin-reports__season-title">{seasonTitle(season.seasonId)}</h2>
                    <span
                      className="admin-reports__year-badge"
                      aria-label={`Season year ${seasonYearBadge(season.seasonId).slice(1)}`}
                    >
                      {seasonYearBadge(season.seasonId)}
                    </span>
                  </div>
                  <p className="admin-reports__season-meta">
                    {generatedCount} of {season.months.length} months generated
                  </p>
                </div>
              </div>
            </div>

            <div className="admin-reports__season-header">
              <div className="admin-reports__season-actions">
                {generatedCount > 0 ? (
                  <button
                    type="button"
                    className="admin-action-btn"
                    onClick={() =>
                      setExpandedSeason((prev) => (prev === season.seasonId ? null : season.seasonId))
                    }
                  >
                    {expandedSeason === season.seasonId ? 'Hide summary' : 'Season summary'}
                  </button>
                ) : null}
                <div className="admin-reports__toolbar-export">
                  <span className="admin-reports__export-label">Export</span>
                  <ExportButtons kind="season" id={season.seasonId} disabled={generatedCount === 0} compact />
                </div>
              </div>
            </div>

            <div
              className="admin-reports__season-progress"
              role="img"
              aria-label={`${generatedCount} of ${season.months.length} months generated`}
            >
              {season.months.map((month) => (
                <span
                  key={month.month}
                  className="admin-reports__season-progress-seg"
                  data-filled={month.generatedAt ? 'true' : 'false'}
                  title={month.label}
                />
              ))}
            </div>

            {expandedSeason === season.seasonId && seasonReport.data ? (
              <div className="admin-reports__season-summary">
                <div className="admin-usage__cards admin-usage__cards--compact">
                  <StatCard label="Notes created" value={seasonReport.data.totals.notesCreated} />
                  <StatCard label="Signups" value={seasonReport.data.totals.signups} />
                  <StatCard label="XP awarded" value={seasonReport.data.totals.totalXp} />
                  <StatCard label="Recall opens" value={seasonReport.data.totals.recallOpens} />
                </div>
              </div>
            ) : null}
            {expandedSeason === season.seasonId && seasonReport.isLoading ? (
              <ProtoStatusChip visible variant="syncing" label="Loading season…" />
            ) : null}

            <div className="admin-reports__month-grid">
              {season.months.map((month) => {
                const isActive = dialogMonth === month.month;
                const isGenerated = !!month.generatedAt;
                const status = getAdminReportMonthStatus(month.month, month.generatedAt);
                return (
                  <article
                    key={month.month}
                    className="admin-reports__month-tile"
                    data-generated={isGenerated ? 'true' : 'false'}
                    data-active={isActive ? 'true' : 'false'}
                  >
                    <div className="admin-reports__month-tile-head">
                      <button
                        type="button"
                        className="admin-reports__month-toggle"
                        disabled={!isGenerated}
                        aria-haspopup={isGenerated ? 'dialog' : undefined}
                        onClick={() => setDialogMonth(month.month)}
                      >
                        <span className="admin-reports__month-icon" aria-hidden>
                          <Icon name="calendar" size={16} />
                        </span>
                        <span className="admin-reports__month-copy">
                          <span className="admin-reports__month-label">{month.label}</span>
                          <span
                            className={`admin-reports__month-badge${
                              isGenerated
                                ? ' admin-reports__month-badge--ready'
                                : ` admin-reports__month-badge--${status.kind}`
                            }`}
                            title={status.kind !== 'generated' ? status.title : undefined}
                          >
                            {status.label}
                          </span>
                        </span>
                      </button>
                      {isGenerated ? (
                        <ExportButtons kind="month" id={month.month} compact />
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            {!seasonComplete && generatedCount > 0 ? (
              <p className="admin-reports__partial-note">Season rollup includes generated months only.</p>
            ) : null}
          </section>
        );
      })}

      {dialogMonth && dialogMonthMeta?.generatedAt ? (
        <ReportMonthDialog
          month={dialogMonth}
          label={dialogMonthMeta.label}
          generatedAt={dialogMonthMeta.generatedAt}
          report={monthReport}
          onClose={() => setDialogMonth(null)}
        />
      ) : null}
    </div>
  );
}

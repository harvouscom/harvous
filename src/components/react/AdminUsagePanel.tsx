import React, { useState } from 'react';
import {
  useAdminUsageOverview,
  useAdminUsageTrends,
} from '@/hooks/queries/useAdminUsage';
import {
  AdminStickySectionNav,
  useAdminWindowDaysChange,
} from '@/components/react/AdminBoardNav';
import AdminUsageTrendsChart from '@/components/react/AdminUsageTrendsChart';
import AdminXpRewards from '@/components/react/AdminXpRewards';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import Icon, { type IconName } from '@/components/react/Icon';
import '@/styles/admin-usage.css';

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatPercent(n: number | null): string {
  if (n == null) return '—';
  return `${n}%`;
}

type UsageTone = 'notes' | 'threads' | 'highlights' | 'scripture' | 'folders' | 'recall';

const USAGE_SECTIONS = [
  { id: 'usage-overview', label: 'Overview' },
  { id: 'usage-trends', label: 'Trends' },
  { id: 'usage-study', label: 'Study' },
  { id: 'usage-recall', label: 'Recall' },
  { id: 'usage-rewards', label: 'Rewards' },
] as const;

function GlanceHero({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="admin-usage__hero" aria-label="Headline metrics">
      {items.map((item) => (
        <div key={item.label} className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">
            {typeof item.value === 'number' ? formatCount(item.value) : item.value}
          </div>
          <div className="admin-usage__hero-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function UsageSectionHeading({
  title,
  icon,
  tone,
  className = 'admin-usage__board-title',
  as: Tag = 'h2',
  id,
  iconSize = 12,
}: {
  title: string;
  icon: IconName;
  tone?: UsageTone;
  className?: string;
  as?: 'h2' | 'h3';
  id?: string;
  iconSize?: number;
}) {
  const toneClass = tone ? `admin-usage__section-heading--${tone}` : '';
  return (
    <Tag id={id} className={`admin-usage__section-heading ${className} ${toneClass}`.trim()}>
      <span className="admin-usage__section-heading-icon" aria-hidden>
        <Icon name={icon} size={iconSize} />
      </span>
      <span>{title}</span>
    </Tag>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="admin-usage__card">
      <div className="admin-usage__card-value">{typeof value === 'number' ? formatCount(value) : value}</div>
      <div className="admin-usage__card-label">{label}</div>
      {detail ? <div className="admin-usage__card-detail">{detail}</div> : null}
    </div>
  );
}

function BehaviorKpi({
  label,
  value,
  ratePct,
  rateCaption,
}: {
  label: string;
  value: string | number;
  ratePct?: number;
  rateCaption?: string;
}) {
  return (
    <div className="admin-usage__behavior-kpi">
      <div className="admin-usage__behavior-kpi-value">{typeof value === 'number' ? formatCount(value) : value}</div>
      <div className="admin-usage__behavior-kpi-label">{label}</div>
      {ratePct != null ? (
        <>
          <div className="admin-usage__behavior-rate" aria-hidden>
            <div className="admin-usage__behavior-rate-fill" style={{ width: `${Math.min(ratePct, 100)}%` }} />
          </div>
          <p className="admin-usage__behavior-rate-caption">
            {rateCaption ?? `${formatPercent(ratePct)} of all notes`}
          </p>
        </>
      ) : null}
    </div>
  );
}

function UsageChip({ tone, children }: { tone?: UsageTone; children: React.ReactNode }) {
  return (
    <span className={tone ? `admin-usage__chip admin-usage__chip--${tone}` : 'admin-usage__chip'}>{children}</span>
  );
}

function RankBarList({
  items,
  tone,
  emptyLabel,
  limit = 8,
}: {
  items: { name: string; count: number }[];
  tone?: UsageTone;
  emptyLabel: string;
  limit?: number;
}) {
  if (items.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty--inline">{emptyLabel}</p>;
  }

  const visible = items.slice(0, limit);
  const max = visible[0]?.count ?? 1;
  const toneClass = tone ? `admin-usage__rank-bars--${tone}` : '';

  return (
    <ol className={`admin-usage__rank-bars ${toneClass}`.trim()}>
      {visible.map((item, index) => {
        const widthPct = max > 0 ? Math.max((item.count / max) * 100, item.count > 0 ? 4 : 0) : 0;
        return (
          <li key={item.name} className="admin-usage__rank-bar-item">
            <div className="admin-usage__rank-bar-head">
              <span className="admin-usage__rank-bar-rank">{index + 1}</span>
              <span className="admin-usage__rank-bar-name" title={item.name}>
                {item.name}
              </span>
              <span className="admin-usage__rank-bar-count">{formatCount(item.count)}</span>
            </div>
            <div className="admin-usage__rank-bar-track" aria-hidden>
              <div className="admin-usage__rank-bar-fill" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SegmentBar({
  segments,
  ariaLabel,
}: {
  segments: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  return (
    <div className="admin-usage__segment-bar-wrap">
      <div className="admin-usage__segment-bar" role="img" aria-label={ariaLabel}>
        {segments.map((segment, index) => (
          <div
            key={segment.label}
            className={`admin-usage__segment-bar-segment admin-usage__segment-bar-segment--${index === 0 ? 'primary' : 'secondary'}`}
            style={{ flexGrow: segment.value, flexBasis: 0 }}
            title={`${segment.label}: ${formatCount(segment.value)}`}
          />
        ))}
      </div>
      <div className="admin-usage__segment-bar-legend">
        {segments.map((segment) => (
          <span key={segment.label} className="admin-usage__segment-bar-legend-item">
            {segment.label} {formatCount(segment.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function DiscoveryBlock({
  title,
  tone,
  spanAll,
  icon,
  children,
}: {
  title: string;
  tone?: UsageTone;
  spanAll?: boolean;
  icon: IconName;
  children: React.ReactNode;
}) {
  const toneClass = tone ? `admin-usage__discovery-block--${tone}` : '';
  const spanClass = spanAll ? 'admin-usage__discovery-block--span-all' : '';
  return (
    <div className={`admin-usage__discovery-block ${toneClass} ${spanClass}`.trim()}>
      <UsageSectionHeading
        title={title}
        icon={icon}
        tone={tone}
        as="h3"
        className="admin-usage__discovery-block-title"
      />
      {children}
    </div>
  );
}

function SectionCard({
  id,
  title,
  icon,
  tone,
  children,
  headerExtra,
}: {
  id: string;
  title: string;
  icon: IconName;
  tone?: UsageTone;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}) {
  return (
    <section className="admin-usage__board-card admin-usage__board-section" id={id}>
      <div className="admin-usage__board-card-header">
        <UsageSectionHeading title={title} icon={icon} tone={tone} />
        {headerExtra}
      </div>
      {children}
    </section>
  );
}

export default function AdminUsagePanel() {
  const [windowDays, setWindowDays] = useState(14);
  const overview = useAdminUsageOverview(windowDays);
  const trends = useAdminUsageTrends(windowDays);
  const changeWindowDays = useAdminWindowDaysChange(setWindowDays, {
    windowDays,
    isUpdating: overview.isFetching || trends.isFetching,
    dataRevision: overview.dataUpdatedAt + trends.dataUpdatedAt,
  });
  const showLoadingChip = overview.isLoading || trends.isLoading;
  const showSyncChip = overview.isFetching || trends.isFetching;

  if (overview.isError) {
    return (
      <p className="admin-usage__error pds-body">
        {overview.error instanceof Error ? overview.error.message : 'Could not load usage data. Try again.'}
      </p>
    );
  }

  if (!overview.data && overview.isLoading) {
    return <ProtoStatusChip visible={showLoadingChip} variant="syncing" label="Loading…" />;
  }

  if (!overview.data) {
    return null;
  }

  const { users, content, engagement, study, passage, scripture, recall, xp } = overview.data;

  return (
    <>
      <div className="admin-usage__board">
      <GlanceHero
        items={[
          { label: `Active users (${windowDays}d)`, value: engagement.activeUsers },
          { label: `Notes created (${windowDays}d)`, value: content.notesCreated },
          { label: `XP awarded (${windowDays}d)`, value: xp.totalXp },
          { label: `Reward earners (${windowDays}d)`, value: xp.users },
        ]}
      />

      <AdminStickySectionNav
        sections={USAGE_SECTIONS}
        navAriaLabel="Sections"
        windowDays={windowDays}
        onWindowDaysChange={changeWindowDays}
      />

      <SectionCard id="usage-overview" title="Overview" icon="layer-group">
        <div className="admin-usage__subsection-grid admin-usage__subsection-grid--triple">
          <div className="admin-usage__subsection">
            <h3 className="admin-usage__subheading admin-usage__subheading--group">Users & billing</h3>
            <div className="admin-usage__cards admin-usage__cards--compact">
              <StatCard label="Users with notes" value={users.withContent} />
              <StatCard label="Signups" value={users.signups} />
              <StatCard label="Active rate" value={formatPercent(users.activeRatePct)} />
              <StatCard label="Free tier" value={users.freeTier} />
              <StatCard label="Unlimited tier" value={users.unlimitedTier} />
            </div>
            {users.freeTier + users.unlimitedTier > 0 ? (
              <SegmentBar
                ariaLabel="Billing tier split"
                segments={[
                  { label: 'Free', value: users.freeTier },
                  { label: 'Unlimited', value: users.unlimitedTier },
                ]}
              />
            ) : null}
            {users.clerkAccounts != null && users.clerkAccounts !== users.total ? (
              <p className="admin-usage__muted admin-usage__footnote pds-caption">
                Clerk (this API env): {formatCount(users.clerkAccounts)} accounts — differs from Postgres when local
                Clerk keys point at a different instance than the database.
              </p>
            ) : null}
          </div>

          <div className="admin-usage__subsection">
            <h3 className="admin-usage__subheading admin-usage__subheading--group">Engagement</h3>
            <div className="admin-usage__cards admin-usage__cards--compact">
              <StatCard label="Active users" value={engagement.activeUsers} />
              <StatCard label="Notes edited" value={engagement.notesEdited} />
            </div>
          </div>

          <div className="admin-usage__subsection">
            <h3 className="admin-usage__subheading admin-usage__subheading--group">Content</h3>
            <div className="admin-usage__cards admin-usage__cards--compact">
              <StatCard label="Folders active" value={content.folders} />
              <StatCard label="Thread links created" value={content.threads} />
              <StatCard label="Notes created" value={content.notesCreated} />
            </div>
            <div className="admin-usage__chips">
              <UsageChip>Pills created {formatCount(scripture.totalPills)}</UsageChip>
              <UsageChip>Scripture notes {scripture.scriptureNoteShare}%</UsageChip>
            </div>
          </div>
        </div>
        <p className="admin-usage__muted admin-usage__footnote admin-usage__footnote--section pds-caption">
          Counts in this section use the selected {windowDays}-day window. Welcome pack notes are excluded.
          Billing tier totals are current snapshots, not window-scoped.
        </p>
      </SectionCard>

      <SectionCard id="usage-trends" title="Trends" icon="chart-pie">
        {trends.isError ? (
          <p className="admin-usage__section-error admin-usage__empty">
            {trends.error instanceof Error ? trends.error.message : 'Could not load trends.'}
          </p>
        ) : trends.data ? (
          <div className="admin-usage__trend-chart-host">
            <AdminUsageTrendsChart
              signups={trends.data.signups}
              notesCreated={trends.data.notesCreated}
              activeUsers={trends.data.activeUsers}
              scripturePillsCreated={trends.data.scripturePillsCreated}
              recallOpens={trends.data.recallOpens}
              days={windowDays}
            />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard id="usage-study" title="Study" icon="book-open">
        <div className="admin-usage__stack">
          <div className="admin-usage__subsection">
            <h3 className="admin-usage__subheading admin-usage__subheading--group">Study behavior</h3>
            <div className="admin-usage__behavior-kpis">
              <BehaviorKpi label="Avg notes per active user" value={study.avgNotesPerUserWithContent} />
              <BehaviorKpi
                label="Notes linked in threads"
                value={study.notesLinkedInThreads}
                ratePct={study.linkRatePct}
              />
              <BehaviorKpi
                label="Highlights from selection"
                value={study.highlightsSpawned}
                ratePct={study.highlightRatePct}
              />
              <BehaviorKpi
                label="Notes citing scripture"
                value={study.notesWithPassages}
                ratePct={study.passageRatePct}
              />
            </div>
            <div className="admin-usage__chips">
              <UsageChip>Pinned notes (now) {formatCount(study.pinnedNotes)}</UsageChip>
              <UsageChip>Anchored study notes ({windowDays}d) {formatCount(study.studyThreadEntries)}</UsageChip>
            </div>
            <p className="admin-usage__muted admin-usage__footnote pds-caption">
              Study KPIs and rates use the selected {windowDays}-day window. Pinned notes is a current snapshot.
            </p>
          </div>

          <div className="admin-usage__subsection">
            <h3 className="admin-usage__subheading admin-usage__subheading--group">Today&apos;s Passage</h3>
            <div className="admin-usage__cards admin-usage__cards--compact">
              <StatCard label="Users who added passage" value={passage.usersWhoAddedPassage} />
              <StatCard label="Dismiss / close events" value={passage.dismissCloseEvents} />
              <StatCard label="Add-note events" value={passage.createNoteEvents} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard id="usage-recall" title="Recall & review" icon="arrow-rotate-left">
        <div className="admin-usage__stack">
          <div className="admin-usage__behavior-kpis">
            <BehaviorKpi label="Opens" value={recall.opens} />
            <BehaviorKpi label="Users active" value={recall.usersActive} />
            <BehaviorKpi
              label="Snooze rate"
              value={formatPercent(recall.snoozeRatePct)}
              ratePct={recall.snoozeRatePct}
              rateCaption={`${formatPercent(recall.snoozeRatePct)} of opens snoozed`}
            />
            <BehaviorKpi label="Snoozes" value={recall.snoozes} />
          </div>
          <div className="admin-usage__chips">
            <UsageChip>Avg stability {recall.avgStabilityDays}d</UsageChip>
          </div>
          <DiscoveryBlock title="Opens by kind" icon="arrow-rotate-left">
            <RankBarList items={recall.opensByKind} emptyLabel="No recall opens in this period." limit={8} />
          </DiscoveryBlock>
        </div>
      </SectionCard>

      <SectionCard id="usage-rewards" title="Rewards" icon="circle-up">
        <AdminXpRewards xp={xp} windowDays={windowDays} />
      </SectionCard>
      </div>
      <ProtoStatusChip visible={showSyncChip && !showLoadingChip} variant="syncing" label="Updating…" />
    </>
  );
}

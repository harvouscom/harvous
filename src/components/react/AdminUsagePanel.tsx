import React from 'react';
import {
  useAdminUsageOverview,
  useAdminUsageTrends,
  useAdminUsageDiscovery,
} from '@/hooks/queries/useAdminUsage';
import AdminUsageTrendsChart from '@/components/react/AdminUsageTrendsChart';
import '@/styles/admin-usage.css';

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatPercent(n: number | null): string {
  if (n == null) return '—';
  return `${n}%`;
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-usage__hero-stat">
      <div className="admin-usage__hero-value">{typeof value === 'number' ? formatCount(value) : value}</div>
      <div className="admin-usage__hero-label">{label}</div>
    </div>
  );
}

type UsageTone = 'notes' | 'threads' | 'highlights' | 'scripture' | 'folders';

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
  tone,
  ratePct,
}: {
  label: string;
  value: string | number;
  tone: UsageTone;
  ratePct?: number;
}) {
  return (
    <div className={`admin-usage__behavior-kpi admin-usage__behavior-kpi--${tone}`}>
      <div className="admin-usage__behavior-kpi-value">{typeof value === 'number' ? formatCount(value) : value}</div>
      <div className="admin-usage__behavior-kpi-label">{label}</div>
      {ratePct != null ? (
        <>
          <div className="admin-usage__behavior-rate" aria-hidden>
            <div className="admin-usage__behavior-rate-fill" style={{ width: `${Math.min(ratePct, 100)}%` }} />
          </div>
          <p className="admin-usage__behavior-rate-caption">{formatPercent(ratePct)} of all notes</p>
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
    return <p className="admin-usage__muted admin-usage__empty">{emptyLabel}</p>;
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

function TranslationBars({ items }: { items: { name: string; count: number }[] }) {
  if (items.length === 0) return null;
  const max = items[0]?.count ?? 1;

  return (
    <div className="admin-usage__translation-bars admin-usage__translation-bars--scripture">
      {items.map((item) => {
        const widthPct = max > 0 ? Math.max((item.count / max) * 100, item.count > 0 ? 6 : 0) : 0;
        return (
          <div key={item.name} className="admin-usage__translation-bar">
            <div className="admin-usage__translation-bar-head">
              <span className="admin-usage__translation-bar-label">{item.name}</span>
              <span className="admin-usage__translation-bar-count">{formatCount(item.count)}</span>
            </div>
            <div className="admin-usage__translation-bar-track" aria-hidden>
              <div className="admin-usage__translation-bar-fill" style={{ width: `${widthPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiscoveryBlock({
  title,
  tone,
  spanAll,
  children,
}: {
  title: string;
  tone?: UsageTone;
  spanAll?: boolean;
  children: React.ReactNode;
}) {
  const toneClass = tone ? `admin-usage__discovery-block--${tone}` : '';
  const spanClass = spanAll ? 'admin-usage__discovery-block--span-all' : '';
  return (
    <div className={`admin-usage__discovery-block ${toneClass} ${spanClass}`.trim()}>
      <h3 className="admin-usage__discovery-block-title">{title}</h3>
      {children}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="admin-usage__board-card">
      <h2 className="admin-usage__board-title">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminUsagePanel() {
  const overview = useAdminUsageOverview();
  const trends = useAdminUsageTrends(30);
  const discovery = useAdminUsageDiscovery(30);

  if (overview.isLoading) {
    return <p className="admin-usage__muted pds-body">Loading usage data…</p>;
  }

  if (overview.isError || !overview.data) {
    return (
      <p className="admin-usage__error pds-body">
        {overview.error instanceof Error ? overview.error.message : 'Could not load usage data. Try again.'}
      </p>
    );
  }

  const { users, content, engagement, study, passage, scripture } = overview.data;

  return (
    <div className="admin-usage__board">
      <div className="admin-usage__hero">
        <HeroStat label="Harvous accounts" value={users.total} />
        <HeroStat label="Activation rate" value={formatPercent(users.activationRate)} />
        <HeroStat label="Total notes" value={content.notes} />
        <HeroStat label="Signups (30 days)" value={users.signupsLast30Days} />
      </div>

      <div className="admin-usage__grid admin-usage__grid--triple">
        <SectionCard title="Users & billing">
          <div className="admin-usage__cards admin-usage__cards--compact">
            <StatCard label="Users with notes" value={users.withContent} />
            <StatCard label="Signups (7 days)" value={users.signupsLast7Days} />
            <StatCard label="Active rate (30d)" value={formatPercent(users.activeLast30DaysPct)} />
            <StatCard label="Free tier" value={users.freeTier} />
            <StatCard label="Unlimited tier" value={users.unlimitedTier} />
          </div>
          {users.clerkAccounts != null && users.clerkAccounts !== users.total ? (
            <p className="admin-usage__muted admin-usage__footnote pds-caption">
              Clerk (this API env): {formatCount(users.clerkAccounts)} accounts — differs from Postgres when local
              Clerk keys point at a different instance than the database.
            </p>
          ) : null}
          <p className="admin-usage__muted admin-usage__footnote pds-caption">
            Share of all Harvous accounts with note activity in the last 30 days — same as MAU (
            {formatCount(engagement.mau)} of {formatCount(users.total)}).
          </p>
        </SectionCard>

        <SectionCard title="Engagement">
          <div className="admin-usage__cards admin-usage__cards--compact">
            <StatCard label="DAU" value={engagement.dau} />
            <StatCard label="WAU" value={engagement.wau} />
            <StatCard label="MAU" value={engagement.mau} />
            <StatCard label="Stickiness (DAU/MAU)" value={formatPercent(engagement.stickiness)} />
            <StatCard label="Notes edited (7 days)" value={engagement.notesEditedLast7Days} />
          </div>
          <p className="admin-usage__muted admin-usage__footnote pds-caption">
            Users who created or edited a note in the period. Onboarding Welcome pack notes are excluded.
          </p>
        </SectionCard>

        <SectionCard title="Content">
          <div className="admin-usage__cards admin-usage__cards--compact">
            <StatCard label="Folders" value={content.folders} />
            <StatCard label="Threads" value={content.threads} />
            <StatCard label="Notes (7 days)" value={content.notesCreatedLast7Days} />
            <StatCard label="Notes (30 days)" value={content.notesCreatedLast30Days} />
          </div>
          <p className="admin-usage__muted admin-usage__footnote pds-caption">
            Folders combine legacy thread titles and current collection labels (deduped per user). Threads are
            connected note clusters in the prototype.
          </p>
          <div className="admin-usage__chips">
            <UsageChip tone="notes">Default {formatCount(content.notesByType.default)}</UsageChip>
            <UsageChip tone="scripture">Scripture {formatCount(content.notesByType.scripture)}</UsageChip>
            <UsageChip>Resource {formatCount(content.notesByType.resource)}</UsageChip>
            <UsageChip tone="scripture">Pills {formatCount(scripture.totalPills)}</UsageChip>
            <UsageChip tone="scripture">Scripture notes {scripture.scriptureNoteShare}%</UsageChip>
          </div>
        </SectionCard>
      </div>

      <div className="admin-usage__wide-row admin-usage__wide-row--single">
        <SectionCard title="Study behavior">
          <div className="admin-usage__behavior-kpis">
            <BehaviorKpi label="Avg notes per user" value={study.avgNotesPerUserWithContent} tone="notes" />
            <BehaviorKpi
              label="Notes linked in threads"
              value={study.notesLinkedInThreads}
              tone="threads"
              ratePct={study.linkRatePct}
            />
            <BehaviorKpi
              label="Highlights from selection"
              value={study.highlightsSpawned}
              tone="highlights"
              ratePct={study.highlightRatePct}
            />
            <BehaviorKpi
              label="Notes citing scripture"
              value={study.notesWithPassages}
              tone="scripture"
              ratePct={study.passageRatePct}
            />
          </div>
          <div className="admin-usage__chips">
            <UsageChip tone="notes">Pinned notes {formatCount(study.pinnedNotes)}</UsageChip>
            <UsageChip tone="threads">Anchored study notes {formatCount(study.studyThreadEntries)}</UsageChip>
          </div>
          <p className="admin-usage__muted admin-usage__footnote pds-caption">
            Rates use user notes as the denominator (onboarding Welcome pack notes are excluded). Linked notes
            appear in at least one thread connection. Highlights are notes created from a text selection on another
            note.
          </p>
        </SectionCard>
      </div>

      <div className="admin-usage__wide-row admin-usage__wide-row--single">
        <SectionCard title="Today's Passage (30 days)">
          <div className="admin-usage__cards admin-usage__cards--compact">
            <StatCard label="Users who added passage" value={passage.usersWhoAddedPassageLast30Days} />
            <StatCard label="Dismiss / close events" value={passage.dismissCloseEventsLast30Days} />
            <StatCard label="Add-note events" value={passage.createNoteEventsLast30Days} />
          </div>
          <p className="admin-usage__muted admin-usage__footnote pds-caption">
            Dismiss and close are recorded when a user closes Today&apos;s Passage (prototype pill or legacy
            featured card). Users who added passage counts distinct users with a note citing a published daily
            passage in this window (or engagement XP). Add-note events count those passage notes; quick-add on the
            legacy card is included when it creates a matching note.
          </p>
        </SectionCard>
      </div>

      <SectionCard title="Trends (last 14 days)">
        {trends.isLoading ? (
          <p className="admin-usage__muted pds-caption admin-usage__empty">Loading trends…</p>
        ) : trends.isError ? (
          <p className="admin-usage__section-error admin-usage__empty">
            {trends.error instanceof Error ? trends.error.message : 'Could not load trends.'}
          </p>
        ) : trends.data ? (
          <AdminUsageTrendsChart
            signups={trends.data.signups}
            notesCreated={trends.data.notesCreated}
            activeUsers={trends.data.activeUsers}
            scripturePillsCreated={trends.data.scripturePillsCreated}
            days={14}
          />
        ) : null}
      </SectionCard>

      <SectionCard title={`Study trends (${discovery.data?.days ?? 30} days)`}>
        {discovery.isLoading ? (
          <p className="admin-usage__muted pds-caption admin-usage__empty">Loading study trends…</p>
        ) : discovery.isError ? (
          <p className="admin-usage__section-error admin-usage__empty">
            {discovery.error instanceof Error ? discovery.error.message : 'Could not load study trends.'}
          </p>
        ) : discovery.data ? (
          <div className="admin-usage__discovery-layout">
            <div className="admin-usage__discovery-grid">
              {scripture.topTranslations.length > 0 ? (
                <DiscoveryBlock title="Top translations" tone="scripture" spanAll>
                  <TranslationBars items={scripture.topTranslations} />
                </DiscoveryBlock>
              ) : null}

              <DiscoveryBlock title="Passage references" tone="scripture">
                <RankBarList
                  items={discovery.data.passages}
                  tone="scripture"
                  emptyLabel="No passage activity in this window."
                />
              </DiscoveryBlock>
              <DiscoveryBlock title="Top books" tone="scripture">
                <RankBarList
                  items={discovery.data.books}
                  tone="scripture"
                  emptyLabel="No book activity in this window."
                />
              </DiscoveryBlock>
              <DiscoveryBlock title="Bible dictionary lookups" tone="highlights">
                <RankBarList
                  items={discovery.data.dictionaryWords}
                  tone="highlights"
                  emptyLabel="No saved dictionary lookups in this window."
                />
              </DiscoveryBlock>
              <DiscoveryBlock title="Trending auto folders" tone="folders">
                <RankBarList
                  items={discovery.data.folders}
                  tone="folders"
                  emptyLabel="No auto-assigned folder activity in this window."
                />
              </DiscoveryBlock>
              <DiscoveryBlock title="Top auto tags" tone="notes">
                <RankBarList
                  items={discovery.data.tags}
                  tone="notes"
                  emptyLabel="No auto-generated tag activity in this window."
                />
              </DiscoveryBlock>
              <DiscoveryBlock title="Top themes" tone="highlights">
                <RankBarList
                  items={discovery.data.themes}
                  tone="highlights"
                  emptyLabel="No fingerprint themes in this window."
                />
              </DiscoveryBlock>
              <DiscoveryBlock title="Top tones">
                <RankBarList items={discovery.data.tones} emptyLabel="No emotional tones in this window." />
              </DiscoveryBlock>
            </div>

            <p className="admin-usage__muted admin-usage__footnote pds-caption">
              Passage references and books count distinct notes citing them. Dictionary lookups are saved Easton&apos;s
              reference words from study threads. Auto folders exclude user-picked labels and Classic thread-title
              backfills. Auto tags include system tags and auto-generated note tags only. Themes and tones from note
              fingerprints.
            </p>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

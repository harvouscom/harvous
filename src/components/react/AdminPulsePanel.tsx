import React, { Fragment, useMemo, useState } from 'react';
import { useAdminPulse, type AdminPulse, type RankDelta } from '@/hooks/queries/useAdminPulse';
import {
  AdminStickySectionNav,
  useAdminWindowDaysChange,
} from '@/components/react/AdminBoardNav';
import AdminRankBarList, { AdminSectionHeading } from '@/components/react/AdminRankBarList';
import AdminPulseHistoryChart from '@/components/react/AdminPulseHistoryChart';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { abbreviateCanonBook } from '@/utils/admin-pulse-heatmap';
import { groupCanonBookCells } from '@/utils/admin-pulse-canon-groups';
import { buildCanonGroupObservations } from '@/utils/admin-pulse-group-insights';
import { buildPulseRightNowCopy, formatRankDeltaBadge, type PulseRightNowChipKind, type PulseRightNowSegment } from '@/utils/admin-pulse-deltas';
import { formatDivineNamesInLabel } from '@/utils/divine-name-display';
import { translationMixColors } from '@/utils/admin-translation-mix-colors';
import Icon, { type IconName } from '@/components/react/Icon';
import '@/styles/admin-usage.css';
import '@/styles/admin-pulse.css';

type UsageTone = 'notes' | 'threads' | 'highlights' | 'scripture' | 'folders' | 'recall';

const PULSE_SECTIONS = [
  { id: 'pulse-headlines', label: 'TLDR;' },
  { id: 'pulse-momentum', label: 'Momentum' },
  { id: 'pulse-threads', label: 'Threads' },
  { id: 'pulse-canon', label: 'Books' },
  { id: 'pulse-sections', label: 'Sections' },
  { id: 'pulse-mood', label: 'Mood' },
  { id: 'pulse-translations', label: 'Translations' },
  { id: 'pulse-curiosity', label: 'Curiosity' },
  { id: 'pulse-history', label: 'History' },
] as const;

function formatCount(n: number): string {
  return n.toLocaleString();
}

function GlanceHero({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="admin-usage__hero" aria-label="Pulse headline metrics">
      {items.map((item) => (
        <div key={item.label} className="admin-usage__hero-stat">
          <div
            className={[
              'admin-usage__hero-value',
              'admin-pulse__hero-value',
              typeof item.value === 'string' ? 'admin-pulse__hero-value--label' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {typeof item.value === 'number' ? formatCount(item.value) : item.value}
          </div>
          <div className="admin-usage__hero-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  id,
  title,
  icon,
  tone,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  tone?: UsageTone;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-usage__board-card admin-usage__board-section" id={id}>
      <div className="admin-usage__board-card-header">
        <AdminSectionHeading title={title} icon={icon} tone={tone} />
      </div>
      {children}
    </section>
  );
}

function DiscoveryBlock({
  title,
  tone,
  icon,
  children,
}: {
  title: string;
  tone?: UsageTone;
  icon: IconName;
  children: React.ReactNode;
}) {
  const toneClass = tone ? `admin-usage__discovery-block--${tone}` : '';
  return (
    <div className={`admin-usage__discovery-block ${toneClass}`.trim()}>
      <AdminSectionHeading
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

function PulseRightNowChip({ kind, label }: { kind: PulseRightNowChipKind; label: string }) {
  const iconName: IconName | null =
    kind === 'book' || kind === 'passage'
      ? 'book'
      : kind === 'folder'
        ? 'folder'
        : kind === 'thread'
          ? 'arrow-right-arrow-left'
          : null;
  const iconSize = kind === 'book' || kind === 'passage' ? 14 : 10;

  return (
    <span className="proto-glass-surface proto-home-greeting__chip admin-pulse__right-now-chip">
      {iconName ? <Icon name={iconName} size={iconSize} aria-hidden /> : null}
      <span>{label}</span>
    </span>
  );
}

function PulseRightNow({ segments }: { segments: PulseRightNowSegment[] }) {
  if (segments.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty">No study activity in this window yet.</p>;
  }

  return (
    <p className="admin-pulse__right-now">
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <Fragment key={`text-${index}`}>{segment.value}</Fragment>
        ) : (
          <Fragment key={`chip-${segment.label}-${index}`}>
            <PulseRightNowChip kind={segment.kind} label={segment.label} />
          </Fragment>
        ),
      )}
    </p>
  );
}

function canonHeatBand(level: number): 'none' | 'low' | 'mid' | 'high' {
  if (level <= 0) return 'none';
  if (level < 0.34) return 'low';
  if (level < 0.67) return 'mid';
  return 'high';
}

function CanonHeatmapCell({
  cell,
}: {
  cell: { name: string; count: number; sharePct: number; heatLevel: number };
}) {
  return (
    <div
      role="listitem"
      className="admin-pulse__canon-cell"
      data-active={cell.count > 0 ? 'true' : 'false'}
      data-heat={canonHeatBand(cell.heatLevel)}
      style={{ '--pulse-heat': String(cell.heatLevel) } as React.CSSProperties}
      title={`${cell.name}: ${cell.count.toLocaleString()} notes (${cell.sharePct}% of activity)`}
    >
      <span className="admin-pulse__canon-abbr">{abbreviateCanonBook(cell.name)}</span>
    </div>
  );
}

function CanonHeatmap({
  books,
}: {
  books: { name: string; order: number; count: number; sharePct: number; heatLevel: number }[];
}) {
  const ot = books.filter((b) => b.order <= 39);
  const nt = books.filter((b) => b.order > 39);
  const total = books.reduce((sum, b) => sum + b.count, 0);

  if (total === 0) {
    return <p className="admin-usage__muted admin-usage__empty">No scripture activity in this window.</p>;
  }

  const renderTestament = (cells: typeof books, label: string, testament: 'ot' | 'nt') => (
    <div className="admin-pulse__canon-col">
      <h3 className="admin-usage__subheading admin-usage__subheading--group">{label}</h3>
      <div className="admin-pulse__canon-groups">
        {groupCanonBookCells(cells, testament).map(({ group, cells: groupCells }) => (
          <section
            key={group.id}
            className="admin-pulse__canon-group"
            aria-label={group.label}
            title={group.label}
          >
            <span className="admin-pulse__canon-group-label">{group.label}</span>
            <div className="admin-pulse__canon-grid" role="list">
              {groupCells.map((cell) => (
                <CanonHeatmapCell key={cell.name} cell={cell} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );

  return (
    <div className="admin-pulse__canon-wrap">
      {renderTestament(ot, 'Old Testament', 'ot')}
      {renderTestament(nt, 'New Testament', 'nt')}
    </div>
  );
}

function DeltaList({ items, emptyLabel, rising }: { items: RankDelta[]; emptyLabel: string; rising: boolean }) {
  if (items.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty--inline">{emptyLabel}</p>;
  }
  return (
    <ol className="admin-pulse__delta-list">
      {items.map((item) => (
        <li key={item.name} className="admin-pulse__delta-item">
          <span className="admin-pulse__delta-name" title={item.name}>
            {item.name}
          </span>
          <span className="admin-pulse__delta-meta">
            <span className="admin-pulse__delta-count">{formatCount(item.current)}</span>
            <span className={`admin-pulse__delta-badge admin-pulse__delta-badge--${rising ? 'up' : 'down'}`}>
              {formatRankDeltaBadge(item, rising)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function MomentumColumn({
  title,
  rising,
  books,
  passages,
  themes,
}: {
  title: string;
  rising: boolean;
  books: RankDelta[];
  passages: RankDelta[];
  themes: RankDelta[];
}) {
  const emptyLabel = rising ? 'Nothing rising.' : 'Nothing cooling.';
  return (
    <div className="admin-usage__subsection">
      <h3 className="admin-usage__subheading admin-usage__subheading--group">{title}</h3>
      <div className="admin-usage__subsection-grid admin-usage__subsection-grid--triple admin-pulse__delta-cols">
        <div className="admin-pulse__delta-col">
          <h4 className="admin-pulse__delta-col-title">Books</h4>
          <DeltaList items={books} rising={rising} emptyLabel={emptyLabel} />
        </div>
        <div className="admin-pulse__delta-col">
          <h4 className="admin-pulse__delta-col-title">Passages</h4>
          <DeltaList items={passages} rising={rising} emptyLabel={emptyLabel} />
        </div>
        <div className="admin-pulse__delta-col">
          <h4 className="admin-pulse__delta-col-title">Themes</h4>
          <DeltaList items={themes} rising={rising} emptyLabel={emptyLabel} />
        </div>
      </div>
    </div>
  );
}

function MoodFingerprintList({
  items,
  variant,
  emptyLabel,
  limit = 8,
}: {
  items: { name: string; count: number }[];
  variant: 'themes' | 'tones';
  emptyLabel: string;
  limit?: number;
}) {
  const visible = items.slice(0, limit);
  if (visible.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty--inline">{emptyLabel}</p>;
  }

  const max = visible[0]?.count ?? 1;
  const sectionTotal = visible.reduce((sum, item) => sum + item.count, 0);

  return (
    <ol className={`admin-pulse__mood-ranks admin-pulse__mood-ranks--${variant}`}>
      {visible.map((item, index) => {
        const widthPct = max > 0 ? Math.max((item.count / max) * 100, item.count > 0 ? 5 : 0) : 0;
        const sharePct = sectionTotal > 0 ? Math.round((item.count / sectionTotal) * 100) : 0;
        return (
          <li key={item.name} className="admin-pulse__mood-rank-item">
            <div className="admin-pulse__mood-rank-head">
              <span className="admin-pulse__mood-rank-num">{index + 1}</span>
              <span className="admin-pulse__mood-rank-name" title={item.name}>
                {item.name}
              </span>
              <span className="admin-pulse__mood-rank-meta">
                <span className="admin-pulse__mood-rank-count">{formatCount(item.count)}</span>
                <span className="admin-pulse__mood-rank-share">{sharePct}%</span>
              </span>
            </div>
            <div className="admin-pulse__mood-rank-track" aria-hidden>
              <div className="admin-pulse__mood-rank-fill" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MoodBoard({ themes, tones }: { themes: { name: string; count: number }[]; tones: { name: string; count: number }[] }) {
  const topTheme = themes[0]?.name;
  const topTone = tones[0]?.name;
  const summary =
    topTheme && topTone
      ? `Notes this period skew ${topTone.toLowerCase()} with themes like ${topTheme}.`
      : topTheme
        ? `Top theme: ${topTheme}.`
        : topTone
          ? `Dominant tone: ${topTone}.`
          : null;

  if (!summary && themes.length === 0 && tones.length === 0) {
    return <p className="admin-usage__muted admin-usage__empty">No fingerprint themes or tones in this window.</p>;
  }

  return (
    <div className="admin-usage__stack">
      {summary ? <p className="admin-pulse__mood-summary pds-body">{summary}</p> : null}
      <div className="admin-pulse__mood-split">
        <div className="admin-pulse__mood-col">
          <h3 className="admin-usage__subheading admin-usage__subheading--group">Themes</h3>
          <p className="admin-pulse__mood-col-hint pds-caption">What notes are about</p>
          <MoodFingerprintList items={themes} variant="themes" emptyLabel="No themes in this window." />
        </div>
        <div className="admin-pulse__mood-col">
          <h3 className="admin-usage__subheading admin-usage__subheading--group">Tones</h3>
          <p className="admin-pulse__mood-col-hint pds-caption">How notes feel</p>
          <MoodFingerprintList items={tones} variant="tones" emptyLabel="No tones in this window." />
        </div>
      </div>
    </div>
  );
}

function TranslationMix({ items }: { items: { name: string; count: number }[] }) {
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total <= 0) {
    return <p className="admin-usage__muted admin-usage__empty">No translation activity in this window.</p>;
  }

  const max = items[0]?.count ?? 1;
  const isHovering = hoveredName != null;

  return (
    <div
      className="admin-pulse__translation-mix admin-usage__segment-bar-wrap"
      data-hovering={isHovering ? 'true' : 'false'}
      onMouseLeave={() => setHoveredName(null)}
    >
      <div className="admin-usage__segment-bar admin-pulse__translation-bar" aria-hidden="true">
        {items.map((item, index) => {
          const colors = translationMixColors(index, item.count, max);
          const isActive = hoveredName === item.name;
          return (
            <div
              key={item.name}
              className="admin-pulse__translation-segment"
              data-active={isActive ? 'true' : 'false'}
              style={
                {
                  flexGrow: item.count,
                  flexBasis: 0,
                  '--translation-segment': colors.segment,
                } as React.CSSProperties
              }
              title={`${item.name}: ${formatCount(item.count)}`}
              onMouseEnter={() => setHoveredName(item.name)}
            />
          );
        })}
      </div>
      <div className="admin-usage__segment-bar-legend admin-pulse__translation-legend">
        {items.map((item, index) => {
          const colors = translationMixColors(index, item.count, max);
          const isActive = hoveredName === item.name;
          return (
            <span
              key={item.name}
              className="admin-pulse__translation-legend-item"
              data-active={isActive ? 'true' : 'false'}
              onMouseEnter={() => setHoveredName(item.name)}
            >
              <span
                className="admin-pulse__translation-swatch"
                style={{ '--translation-swatch': colors.swatch } as React.CSSProperties}
                aria-hidden
              />
              <span className="admin-pulse__translation-legend-label">
                <span className="admin-pulse__translation-legend-name">{item.name}</span>
                <span className="admin-pulse__translation-legend-count">{formatCount(item.count)}</span>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CanonGroupTrends({ canonGroups, days }: { canonGroups: AdminPulse['canonGroups']; days: number }) {
  const observations = useMemo(
    () =>
      buildCanonGroupObservations({
        days,
        groups: canonGroups.groups,
        rising: canonGroups.rising,
        cooling: canonGroups.cooling,
      }),
    [canonGroups, days],
  );

  const otBars = canonGroups.groups
    .filter((group) => group.testament === 'ot')
    .map((group) => ({ name: group.label, count: group.count }));
  const ntBars = canonGroups.groups
    .filter((group) => group.testament === 'nt')
    .map((group) => ({ name: group.label, count: group.count }));
  const hasActivity = canonGroups.groups.some((group) => group.count > 0);

  if (!hasActivity) {
    return <p className="admin-usage__muted admin-usage__empty">No scripture activity in this window yet.</p>;
  }

  return (
    <div className="admin-usage__stack">
      {observations.length > 0 ? (
        <ul className="admin-pulse__observations">
          {observations.map((line) => (
            <li key={line} className="admin-pulse__observation pds-body">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="admin-usage__subsection-grid admin-usage__subsection-grid--triple admin-pulse__section-trends">
        <div className="admin-usage__subsection">
          <h3 className="admin-usage__subheading admin-usage__subheading--group">Old Testament</h3>
          <AdminRankBarList items={otBars} tone="scripture" emptyLabel="No OT activity." limit={10} />
        </div>
        <div className="admin-usage__subsection">
          <h3 className="admin-usage__subheading admin-usage__subheading--group">New Testament</h3>
          <AdminRankBarList items={ntBars} tone="scripture" emptyLabel="No NT activity." limit={10} />
        </div>
        <div className="admin-usage__subsection">
          <h3 className="admin-usage__subheading admin-usage__subheading--group">Momentum by section</h3>
          {canonGroups.rising.length === 0 ? (
            <p className="admin-usage__muted admin-usage__empty--inline">No sections rising vs the prior period.</p>
          ) : (
            <ol className="admin-pulse__delta-list">
              {canonGroups.rising.map((item) => (
                <li key={item.name} className="admin-pulse__delta-item">
                  <span className="admin-pulse__delta-name">{item.name}</span>
                  <span className="admin-pulse__delta-meta">
                    <span className="admin-pulse__delta-count">{formatCount(item.current)}</span>
                    <span className="admin-pulse__delta-badge admin-pulse__delta-badge--up">
                      {formatRankDeltaBadge(item)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadsSection({ threads }: { threads: AdminPulse['threads'] }) {
  const { summary, themes, recall } = threads;
  const hasActivity =
    summary.totalThreads > 0 ||
    summary.linksCreated > 0 ||
    themes.length > 0 ||
    recall.impressions > 0 ||
    recall.opens > 0;

  if (!hasActivity) {
    return <p className="admin-usage__muted admin-usage__empty">No thread activity in this window.</p>;
  }

  return (
    <div className="admin-usage__stack">
      <div className="admin-usage__hero" aria-label="Thread summary">
        <div className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">{formatCount(summary.totalThreads)}</div>
          <div className="admin-usage__hero-label">Total threads</div>
        </div>
        <div className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">{summary.avgNotesPerThread || '—'}</div>
          <div className="admin-usage__hero-label">Avg notes per thread</div>
        </div>
        <div className="admin-usage__hero-stat">
          <div className="admin-usage__hero-value">{formatCount(summary.linksCreated)}</div>
          <div className="admin-usage__hero-label">Links created</div>
        </div>
      </div>

      <DiscoveryBlock title="Themes in threads" icon="tag" tone="threads">
        <AdminRankBarList
          items={themes}
          tone="threads"
          emptyLabel="No study themes on notes in connected threads yet."
        />
      </DiscoveryBlock>

      <DiscoveryBlock title="Home thread suggestions" icon="house" tone="recall">
        {recall.impressions <= 0 && recall.opens <= 0 ? (
          <p className="admin-usage__muted admin-usage__empty--inline">
            No thread-related Home recall cards shown or opened in this window yet.
          </p>
        ) : (
          <div className="admin-usage__stack">
            <p className="pds-body admin-pulse__threads-recall-summary">
              {recall.impressions > 0 ? `${formatCount(recall.impressions)} shown` : 'None shown yet'}
              {recall.opens > 0 ? ` · ${formatCount(recall.opens)} opened` : ''}
              {recall.snoozes > 0 ? ` · ${formatCount(recall.snoozes)} snoozed (${recall.snoozeRatePct}%)` : ''}
              {' '}
              on connect, theme, arc, and cross-ref cards from Home.
            </p>
            {recall.impressionsByKind.length > 0 ? (
              <AdminRankBarList
                items={recall.impressionsByKind}
                tone="recall"
                emptyLabel="No suggestions shown by kind."
              />
            ) : null}
            {recall.opensByKind.length > 0 ? (
              <AdminRankBarList items={recall.opensByKind} tone="recall" emptyLabel="No opens by kind." />
            ) : null}
          </div>
        )}
      </DiscoveryBlock>

      <p className="admin-usage__muted admin-usage__footnote pds-caption">
        Total threads matches the sidebar: connected note clusters plus titled single-note threads (
        {formatCount(summary.notesInThreads)} notes in multi-note clusters). Links created and threads linked count
        activity in this window only
        {summary.threadsLinkedInWindow > 0
          ? ` (${formatCount(summary.threadsLinkedInWindow)} ${summary.threadsLinkedInWindow === 1 ? 'thread' : 'threads'} linked).`
          : '.'}{' '}
        Home metrics track when thread-related recall cards are shown or tapped — not every Home card.
      </p>
    </div>
  );
}

function pulseHeroItems(data: AdminPulse): { label: string; value: string | number }[] {
  return [
    { label: 'Unique passages saved', value: data.uniquePassages },
    { label: 'Total threads', value: data.threads.summary.totalThreads },
    { label: 'Top passage notes', value: data.curiosity.passages[0]?.count ?? 0 },
    { label: 'Top theme', value: data.curiosity.themes[0]?.name ? formatDivineNamesInLabel(data.curiosity.themes[0].name) : '—' },
  ];
}

export default function AdminPulsePanel() {
  const [windowDays, setWindowDays] = useState(7);
  const pulse = useAdminPulse(windowDays);
  const changeWindowDays = useAdminWindowDaysChange(setWindowDays, {
    windowDays,
    isUpdating: pulse.isFetching,
    dataRevision: pulse.dataUpdatedAt,
  });

  const rightNowCopy = useMemo(() => {
    if (!pulse.data) return [];
    const topCanonGroup = [...pulse.data.canonGroups.groups]
      .filter((group) => group.count > 0)
      .sort((a, b) => b.count - a.count)[0];
    return buildPulseRightNowCopy({
      days: windowDays,
      risingBooks: pulse.data.rising.books,
      topPassage: pulse.data.curiosity.passages[0] ?? null,
      topThemes: pulse.data.curiosity.themes,
      topTranslation: pulse.data.curiosity.translations[0] ?? null,
      topCanonSection: topCanonGroup
        ? { label: topCanonGroup.label, count: topCanonGroup.count }
        : null,
      topTone: pulse.data.curiosity.tones[0] ?? null,
      topFolder: pulse.data.curiosity.folders[0] ?? null,
      topDictionaryWord: pulse.data.curiosity.dictionaryWords[0] ?? null,
      threads: {
        linksCreated: pulse.data.threads.summary.linksCreated,
        threadsLinkedInWindow: pulse.data.threads.summary.threadsLinkedInWindow,
        avgNotesPerThread: pulse.data.threads.summary.avgNotesPerThread,
        topThreadTheme: pulse.data.threads.themes[0] ?? null,
        recallImpressions: pulse.data.threads.recall.impressions,
      },
    });
  }, [pulse.data, windowDays]);

  if (pulse.isError) {
    return (
      <p className="admin-usage__error pds-body">
        {pulse.error instanceof Error ? pulse.error.message : 'Could not load pulse. Try again.'}
      </p>
    );
  }

  if (!pulse.data && pulse.isLoading) {
    return <ProtoStatusChip visible={pulse.isLoading} variant="syncing" label="Loading…" />;
  }

  if (!pulse.data) {
    return null;
  }

  const { books, rising, cooling, curiosity, history, canonGroups, threads } = pulse.data;

  return (
    <>
      <div className="admin-usage__board">
      <GlanceHero items={pulseHeroItems(pulse.data)} />

      <AdminStickySectionNav
        sections={PULSE_SECTIONS}
        navAriaLabel="Pulse sections"
        windowDays={windowDays}
        onWindowDaysChange={changeWindowDays}
      />

      <SectionCard id="pulse-headlines" title="TLDR;" icon="wand-magic-sparkles">
        <PulseRightNow segments={rightNowCopy} />
      </SectionCard>

      <SectionCard id="pulse-momentum" title="Rising & falling" icon="chart-line">
        <div className="admin-usage__stack">
          <MomentumColumn
            title="Rising"
            rising
            books={rising.books}
            passages={rising.passages}
            themes={rising.themes}
          />
          <MomentumColumn
            title="Cooling off"
            rising={false}
            books={cooling.books}
            passages={cooling.passages}
            themes={cooling.themes}
          />
        </div>
      </SectionCard>

      <SectionCard id="pulse-threads" title="Threads" icon="arrow-right-arrow-left" tone="threads">
        <ThreadsSection threads={threads} />
      </SectionCard>

      <SectionCard id="pulse-canon" title="Scripture by book" icon="book-open" tone="scripture">
        <CanonHeatmap books={books} />
      </SectionCard>

      <SectionCard id="pulse-sections" title="Section trends" icon="layer-group" tone="scripture">
        <CanonGroupTrends canonGroups={canonGroups} days={windowDays} />
      </SectionCard>

      <SectionCard id="pulse-mood" title="Mood board" icon="paintbrush">
        <MoodBoard themes={curiosity.themes} tones={curiosity.tones} />
      </SectionCard>

      <SectionCard id="pulse-translations" title="Translation mix" icon="language" tone="scripture">
        <TranslationMix items={curiosity.translations} />
      </SectionCard>

      <SectionCard id="pulse-curiosity" title="Curiosity corner" icon="magnifying-glass">
        <div className="admin-usage__discovery-layout">
          <div className="admin-usage__discovery-grid admin-pulse__curiosity-grid">
            <DiscoveryBlock title="Passage references" icon="bookmark" tone="scripture">
              <AdminRankBarList
                items={curiosity.passages}
                tone="scripture"
                emptyLabel="No passage activity."
                showTrend
              />
            </DiscoveryBlock>
            <DiscoveryBlock title="Words people paused on" icon="lines-leaning">
              <AdminRankBarList items={curiosity.dictionaryWords} emptyLabel="No dictionary lookups." showTrend />
            </DiscoveryBlock>
            <DiscoveryBlock title="Where notes land" icon="folder" tone="folders">
              <AdminRankBarList
                items={curiosity.folders}
                tone="folders"
                emptyLabel="No folder activity."
                showTrend
              />
            </DiscoveryBlock>
            <DiscoveryBlock title="Auto tags" icon="tag">
              <AdminRankBarList items={curiosity.tags} emptyLabel="No tag activity." showTrend />
            </DiscoveryBlock>
          </div>
        </div>
      </SectionCard>

      <SectionCard id="pulse-history" title="Monthly history" icon="chart-pie">
        <div className="admin-usage__trend-chart-host">
          <AdminPulseHistoryChart history={history} />
        </div>
        <p className="admin-usage__muted admin-usage__footnote admin-usage__footnote--section pds-caption">
          Top books per month from MonthlyAnalytics (not limited to the {windowDays}d window above). Run
          aggregate analytics if a month is empty.
        </p>
      </SectionCard>
      </div>
      <ProtoStatusChip visible={pulse.isFetching && !pulse.isLoading} variant="syncing" label="Updating…" />
    </>
  );
}

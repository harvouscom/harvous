import AdminRankBarList from '@/components/react/AdminRankBarList';
import type { PulseXpSummary } from '@/hooks/queries/useAdminPulse';
import { formatRankDeltaBadge } from '@/utils/admin-pulse-deltas';
import '@/styles/admin-pulse.css';

function formatCount(n: number): string {
  return n.toLocaleString();
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

export default function AdminXpRewards({ xp, windowDays }: { xp: PulseXpSummary; windowDays: number }) {
  const days = xp.days || windowDays;
  const byActivityBars = xp.byActivity.map((row) => ({ name: row.label, count: row.totalXp }));

  return (
    <div className="admin-usage__stack">
      <div className="admin-usage__subsection">
        <p className="admin-usage__muted admin-usage__footnote pds-caption">
          Last {days} days (inclusive). Changing the time window above updates these totals.
        </p>
        <div className="admin-usage__cards admin-usage__cards--compact">
          <StatCard label="XP awarded" value={xp.totalXp} />
          <StatCard
            label="Reward earners"
            value={xp.users}
            detail="Distinct users with XP events in this period"
          />
          <StatCard label="Reward events" value={xp.eventCount} />
          <StatCard label="Avg XP per earner" value={xp.avgXpPerUser} />
        </div>
        <p className="admin-usage__muted admin-usage__footnote pds-caption">
          Not the same as Active users in Overview — most note activity does not write to the XP ledger
          unless a reward rule fires (sessions, creates, streaks, etc.). Legacy imported-thread XP is
          excluded from thread totals.
        </p>
      </div>

      <div className="admin-usage__subsection">
        <h3 className="admin-usage__subheading admin-usage__subheading--group">By activity</h3>
        <AdminRankBarList
          items={byActivityBars}
          emptyLabel="No XP awarded in this window."
          limit={10}
        />
      </div>

      {xp.rising.length > 0 ? (
        <div className="admin-usage__subsection">
          <h3 className="admin-usage__subheading admin-usage__subheading--group">Rising vs prior period</h3>
          <ol className="admin-pulse__delta-list">
            {xp.rising.map((item) => (
              <li key={item.name} className="admin-pulse__delta-item">
                <span className="admin-pulse__delta-name">{item.name}</span>
                <span className="admin-pulse__delta-meta">
                  <span className="admin-pulse__delta-count">{formatCount(item.current)} XP</span>
                  <span className="admin-pulse__delta-badge admin-pulse__delta-badge--up">
                    {formatRankDeltaBadge(item)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="admin-usage__subsection">
        <h3 className="admin-usage__subheading admin-usage__subheading--group">Reward rates</h3>
        <p className="admin-usage__muted admin-usage__footnote pds-caption admin-pulse__xp-rates-intro">
          Configured XP values from the live reward system.
        </p>
        <div className="admin-usage__chips admin-usage__chips--discovery admin-pulse__xp-rate-chips">
          {xp.rates.map((rate) => (
            <span key={rate.label} className="admin-usage__chip" title={rate.detail}>
              {rate.label} · {rate.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

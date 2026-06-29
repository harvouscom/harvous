import type { RankDelta } from '@/utils/admin-pulse-deltas';
import { shouldShowRankDeltaPct } from '@/utils/admin-pulse-deltas';
import type { CanonGroupStat } from '@/utils/admin-pulse-canon-groups';

export type PulseCanonGroupInsights = {
  groups: CanonGroupStat[];
  rising: RankDelta[];
  cooling: RankDelta[];
};

/** Short admin-facing observations from canon section aggregates. */
export function buildCanonGroupObservations(input: {
  days: number;
  groups: CanonGroupStat[];
  rising: RankDelta[];
  cooling: RankDelta[];
}): string[] {
  const active = input.groups.filter((group) => group.count > 0);
  if (active.length === 0) return [];

  const observations: string[] = [];
  const windowLead = input.days === 7 ? 'This week' : `In the last ${input.days} days`;
  const top = [...active].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0]!;

  observations.push(
    `${windowLead}, ${top.label} leads with ${top.count.toLocaleString()} notes (${top.sharePct}% of scripture activity).`,
  );

  const otTotal = input.groups.filter((group) => group.testament === 'ot').reduce((sum, group) => sum + group.count, 0);
  const ntTotal = input.groups.filter((group) => group.testament === 'nt').reduce((sum, group) => sum + group.count, 0);
  const total = otTotal + ntTotal;

  if (total > 0) {
    const otPct = Math.round((otTotal / total) * 100);
    const ntPct = 100 - otPct;
    if (ntPct - otPct >= 12) {
      observations.push(`New Testament sections account for ${ntPct}% of scripture notes.`);
    } else if (otPct - ntPct >= 12) {
      observations.push(`Old Testament sections account for ${otPct}% of scripture notes.`);
    }
  }

  const topRising = input.rising[0];
  if (topRising && topRising.delta > 0) {
    if (shouldShowRankDeltaPct(topRising.previous, topRising.deltaPct)) {
      observations.push(`${topRising.name} is up ${topRising.deltaPct}% vs the prior period.`);
    } else {
      observations.push(`${topRising.name} is gaining momentum vs the prior period.`);
    }
  }

  const topCooling = input.cooling[0];
  if (topCooling && topCooling.delta < 0) {
    observations.push(`${topCooling.name} cooled compared to the prior period.`);
  }

  return observations.slice(0, 4);
}

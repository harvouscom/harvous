/**
 * Roll up stored monthly admin reports into season/year summaries.
 */

import type {
  AdminMonthlyReportPayload,
  AdminMonthlyReportPulse,
  AdminMonthlyReportUsage,
  AdminReportCanonBook,
  AdminReportCanonSection,
  AdminReportRankItem,
  AdminReportRollup,
  AdminReportRollupTotals,
} from './admin-report-types';
import type { DiscoveryRankItem } from './admin-usage-stats';
import { buildCanonBookGrid } from '@/utils/admin-pulse-heatmap';
import { CANON_BOOK_GROUPS } from '@/utils/admin-pulse-canon-groups';

function mergeRankedLists(lists: DiscoveryRankItem[][], limit: number): AdminReportRankItem[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const item of list) {
      totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function emptyCuriosity(): AdminMonthlyReportPulse['curiosity'] {
  return { tones: [], folders: [], dictionaryWords: [] };
}

function pulseThreadTotalThreads(threads: AdminMonthlyReportPulse['threads'] & { activeThreads?: number }): number {
  return threads.totalThreads ?? threads.activeThreads ?? 0;
}

function mergeCanonSections(payloads: AdminMonthlyReportPayload[]): AdminReportCanonSection[] {
  const totals = new Map<string, number>();
  for (const payload of payloads) {
    const sections = payload.pulse.canon?.sections ?? [];
    for (const section of sections) {
      totals.set(section.id, (totals.get(section.id) ?? 0) + section.count);
    }
  }
  return CANON_BOOK_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    testament: group.testament,
    count: totals.get(group.id) ?? 0,
  })).filter((section) => section.count > 0);
}

function mergeCanonBooks(payloads: AdminMonthlyReportPayload[]): AdminReportCanonBook[] {
  const totals = new Map<string, number>();
  for (const payload of payloads) {
    const books = payload.pulse.canon?.books ?? [];
    for (const book of books) {
      if (book.count <= 0) continue;
      totals.set(book.name, (totals.get(book.name) ?? 0) + book.count);
    }
  }
  const bookCounts = [...totals.entries()].map(([name, count]) => ({ name, count }));
  return buildCanonBookGrid(bookCounts);
}

function mergeXpActivities(
  payloads: AdminMonthlyReportPayload[],
): AdminMonthlyReportPulse['xp']['byActivity'] {
  const byLabel = new Map<string, { totalXp: number; eventCount: number; users: number }>();
  for (const payload of payloads) {
    for (const row of payload.pulse.xp.byActivity) {
      const existing = byLabel.get(row.label) ?? { totalXp: 0, eventCount: 0, users: 0 };
      byLabel.set(row.label, {
        totalXp: existing.totalXp + row.totalXp,
        eventCount: existing.eventCount + row.eventCount,
        users: existing.users + row.users,
      });
    }
  }
  return [...byLabel.entries()]
    .sort((a, b) => b[1].totalXp - a[1].totalXp)
    .map(([label, stats]) => ({ label, ...stats }));
}

function sumUsage(payloads: AdminMonthlyReportPayload[]): AdminMonthlyReportUsage {
  const base: AdminMonthlyReportUsage = {
    signups: 0,
    activeUsers: 0,
    notesCreated: 0,
    notesEdited: 0,
    notesByType: { default: 0, scripture: 0, resource: 0 },
    scripturePills: 0,
    study: {
      notesLinkedInThreads: 0,
      linkRatePct: 0,
      notesWithPassages: 0,
      passageRatePct: 0,
      highlightsSpawned: 0,
      highlightRatePct: 0,
      studyThreadEntries: 0,
      pinnedNotes: 0,
    },
    recall: { opens: 0, snoozes: 0, snoozeRatePct: 0, usersActive: 0 },
  };

  for (const p of payloads) {
    base.signups += p.usage.signups;
    base.activeUsers += p.usage.activeUsers;
    base.notesCreated += p.usage.notesCreated;
    base.notesEdited += p.usage.notesEdited;
    base.notesByType.default += p.usage.notesByType.default;
    base.notesByType.scripture += p.usage.notesByType.scripture;
    base.notesByType.resource += p.usage.notesByType.resource;
    base.scripturePills += p.usage.scripturePills;
    base.study.notesLinkedInThreads += p.usage.study.notesLinkedInThreads;
    base.study.notesWithPassages += p.usage.study.notesWithPassages;
    base.study.highlightsSpawned += p.usage.study.highlightsSpawned;
    base.study.studyThreadEntries += p.usage.study.studyThreadEntries;
    base.study.pinnedNotes += p.usage.study.pinnedNotes;
    base.recall.opens += p.usage.recall.opens;
    base.recall.snoozes += p.usage.recall.snoozes;
    base.recall.usersActive += p.usage.recall.usersActive;
  }

  const notesCreated = base.notesCreated;
  base.study.linkRatePct =
    notesCreated > 0 ? Math.round((base.study.notesLinkedInThreads / notesCreated) * 100) : 0;
  base.study.passageRatePct =
    notesCreated > 0 ? Math.round((base.study.notesWithPassages / notesCreated) * 100) : 0;
  base.study.highlightRatePct =
    notesCreated > 0 ? Math.round((base.study.highlightsSpawned / notesCreated) * 100) : 0;
  base.recall.snoozeRatePct =
    base.recall.opens > 0 ? Math.round((base.recall.snoozes / base.recall.opens) * 100) : 0;

  return base;
}

function sumPulse(payloads: AdminMonthlyReportPayload[]): AdminMonthlyReportPulse {
  let totalXp = 0;
  let eventCount = 0;
  let xpUsers = 0;
  let uniquePassages = 0;
  let totalThreads = 0;
  let linksCreated = 0;
  let avgNotesSum = 0;

  for (const p of payloads) {
    totalXp += p.pulse.xp.totalXp;
    eventCount += p.pulse.xp.eventCount;
    xpUsers += p.pulse.xp.users;
    uniquePassages += p.pulse.uniquePassages;
    totalThreads = Math.max(totalThreads, pulseThreadTotalThreads(p.pulse.threads));
    linksCreated += p.pulse.threads.linksCreated;
    avgNotesSum += p.pulse.threads.avgNotesPerThread;
  }

  const count = payloads.length;
  const byActivity = mergeXpActivities(payloads);

  return {
    uniquePassages,
    books: mergeRankedLists(
      payloads.map((p) => p.pulse.books),
      10,
    ),
    themes: mergeRankedLists(
      payloads.map((p) => p.pulse.themes),
      10,
    ),
    passages: mergeRankedLists(
      payloads.map((p) => p.pulse.passages),
      10,
    ),
    tags: mergeRankedLists(
      payloads.map((p) => p.pulse.tags),
      10,
    ),
    translations: mergeRankedLists(
      payloads.map((p) => p.pulse.translations),
      5,
    ),
    monthlyAnalytics: {
      books: mergeRankedLists(
        payloads.map((p) => p.pulse.monthlyAnalytics.books),
        10,
      ),
      tags: mergeRankedLists(
        payloads.map((p) => p.pulse.monthlyAnalytics.tags),
        10,
      ),
    },
    curiosity: {
      tones: mergeRankedLists(
        payloads.map((p) => (p.pulse.curiosity ?? emptyCuriosity()).tones),
        10,
      ),
      folders: mergeRankedLists(
        payloads.map((p) => (p.pulse.curiosity ?? emptyCuriosity()).folders),
        10,
      ),
      dictionaryWords: mergeRankedLists(
        payloads.map((p) => (p.pulse.curiosity ?? emptyCuriosity()).dictionaryWords),
        10,
      ),
    },
    canon: {
      sections: mergeCanonSections(payloads),
      books: mergeCanonBooks(payloads),
    },
    threads: {
      totalThreads,
      linksCreated,
      avgNotesPerThread: count > 0 ? Math.round((avgNotesSum / count) * 10) / 10 : 0,
    },
    xp: {
      totalXp,
      eventCount,
      users: xpUsers,
      avgXpPerUser: xpUsers > 0 ? Math.round(totalXp / xpUsers) : 0,
      byActivity,
    },
  };
}

function buildTotals(payloads: AdminMonthlyReportPayload[]): AdminReportRollupTotals {
  const usage = sumUsage(payloads);
  const pulse = sumPulse(payloads);
  return {
    monthCount: payloads.length,
    signups: usage.signups,
    activeUsers: usage.activeUsers,
    notesCreated: usage.notesCreated,
    notesEdited: usage.notesEdited,
    scripturePills: usage.scripturePills,
    recallOpens: usage.recall.opens,
    recallSnoozes: usage.recall.snoozes,
    totalXp: pulse.xp.totalXp,
    uniquePassages: pulse.uniquePassages,
    threadLinksCreated: pulse.threads.linksCreated,
  };
}

export function rollupMonthlyReports(
  scope: 'season' | 'year',
  scopeId: string,
  scopeName: string,
  payloads: AdminMonthlyReportPayload[],
): AdminReportRollup {
  const months = payloads.map((p) => p.month).sort();
  const usage = sumUsage(payloads);
  const pulse = sumPulse(payloads);
  return {
    scope,
    scopeId,
    scopeName,
    months,
    totals: buildTotals(payloads),
    usage,
    pulse,
  };
}

/**
 * Admin monthly report payload types (stored as JSON in AdminMonthlyReports.payload).
 */

import type { DiscoveryRankItem } from './admin-usage-stats';

export type AdminReportRankItem = DiscoveryRankItem;

export type AdminMonthlyReportUsage = {
  signups: number;
  activeUsers: number;
  notesCreated: number;
  notesEdited: number;
  notesByType: { default: number; scripture: number; resource: number };
  scripturePills: number;
  study: {
    notesLinkedInThreads: number;
    linkRatePct: number;
    notesWithPassages: number;
    passageRatePct: number;
    highlightsSpawned: number;
    highlightRatePct: number;
    studyThreadEntries: number;
    pinnedNotes: number;
  };
  recall: {
    opens: number;
    snoozes: number;
    snoozeRatePct: number;
    usersActive: number;
  };
  passage: {
    usersWhoAddedPassage: number;
    dismissCloseEvents: number;
    createNoteEvents: number;
  };
};

export type AdminMonthlyReportPulse = {
  uniquePassages: number;
  books: AdminReportRankItem[];
  themes: AdminReportRankItem[];
  passages: AdminReportRankItem[];
  tags: AdminReportRankItem[];
  translations: AdminReportRankItem[];
  monthlyAnalytics: {
    books: AdminReportRankItem[];
    tags: AdminReportRankItem[];
  };
  threads: {
    activeThreads: number;
    avgNotesPerThread: number;
    linksCreated: number;
  };
  xp: {
    totalXp: number;
    eventCount: number;
    users: number;
    avgXpPerUser: number;
    byActivity: { label: string; totalXp: number; eventCount: number; users: number }[];
  };
};

export type AdminMonthlyReportPayload = {
  month: string;
  seasonId: string;
  seasonName: string;
  generatedAt: string;
  usage: AdminMonthlyReportUsage;
  pulse: AdminMonthlyReportPulse;
};

export type AdminReportCatalogMonth = {
  month: string;
  label: string;
  generatedAt: string | null;
};

export type AdminReportCatalogSeason = {
  seasonId: string;
  seasonName: string;
  months: AdminReportCatalogMonth[];
};

export type AdminReportCatalogYear = {
  year: number;
  seasons: AdminReportCatalogSeason[];
};

export type AdminReportCatalog = {
  years: AdminReportCatalogYear[];
};

export type AdminReportRollupTotals = {
  monthCount: number;
  signups: number;
  activeUsers: number;
  notesCreated: number;
  notesEdited: number;
  scripturePills: number;
  recallOpens: number;
  recallSnoozes: number;
  totalXp: number;
  uniquePassages: number;
  threadLinksCreated: number;
};

export type AdminReportRollup = {
  scope: 'season' | 'year';
  scopeId: string;
  scopeName: string;
  months: string[];
  totals: AdminReportRollupTotals;
  usage: AdminMonthlyReportUsage;
  pulse: AdminMonthlyReportPulse;
};

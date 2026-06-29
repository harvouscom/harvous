import { describe, expect, it } from 'vitest';
import {
  exportPayloadToJson,
  exportRowsToCsv,
  reportPayloadToExportRows,
} from '../admin-report-export';
import type { AdminMonthlyReportPayload } from '../admin-report-types';

const payload: AdminMonthlyReportPayload = {
  month: '2026-03',
  seasonId: 'spring-2026',
  seasonName: 'Spring 2026',
  generatedAt: '2026-03-31T00:00:00.000Z',
  usage: {
    signups: 10,
    activeUsers: 50,
    notesCreated: 100,
    notesEdited: 20,
    notesByType: { default: 60, scripture: 30, resource: 10 },
    scripturePills: 40,
    study: {
      notesLinkedInThreads: 25,
      linkRatePct: 25,
      notesWithPassages: 30,
      passageRatePct: 30,
      highlightsSpawned: 5,
      highlightRatePct: 5,
      studyThreadEntries: 8,
      pinnedNotes: 3,
    },
    recall: { opens: 15, snoozes: 3, snoozeRatePct: 20, usersActive: 12 },
    passage: { usersWhoAddedPassage: 4, dismissCloseEvents: 2, createNoteEvents: 3 },
  },
  pulse: {
    uniquePassages: 20,
    books: [{ name: 'Psalms', count: 10 }],
    themes: [],
    passages: [],
    tags: [],
    translations: [],
    monthlyAnalytics: { books: [], tags: [] },
    threads: { activeThreads: 5, avgNotesPerThread: 2.5, linksCreated: 12 },
    xp: {
      totalXp: 500,
      eventCount: 50,
      users: 20,
      avgXpPerUser: 25,
      byActivity: [],
    },
  },
};

describe('admin-report-export', () => {
  it('builds flat CSV rows from payload', () => {
    const rows = reportPayloadToExportRows('month', '2026-03', payload);
    expect(rows.some((r) => r.section === 'usage' && r.metric === 'signups' && r.value === 10)).toBe(true);
    const csv = exportRowsToCsv(rows);
    expect(csv.split('\n')[0]).toBe('scope,scopeId,section,metric,value');
    expect(csv).toContain('month,2026-03,usage,signups,10');
  });

  it('serializes payload to JSON', () => {
    const json = exportPayloadToJson(payload);
    const parsed = JSON.parse(json) as AdminMonthlyReportPayload;
    expect(parsed.month).toBe('2026-03');
  });
});

import { describe, expect, it } from 'vitest';
import { rollupMonthlyReports } from '../admin-report-rollup';
import type { AdminMonthlyReportPayload } from '../admin-report-types';

function samplePayload(month: string, overrides: Partial<AdminMonthlyReportPayload> = {}): AdminMonthlyReportPayload {
  return {
    month,
    seasonId: 'spring-2026',
    seasonName: 'Spring 2026',
    generatedAt: '2026-03-15T00:00:00.000Z',
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
      themes: [{ name: 'Hope', count: 5 }],
      passages: [{ name: 'John 3:16', count: 4 }],
      tags: [{ name: 'grace', count: 2 }],
      translations: [{ name: 'NET', count: 20 }],
      monthlyAnalytics: { books: [{ name: 'Psalms', count: 10 }], tags: [] },
      curiosity: {
        tones: [{ name: 'Reflective', count: 3 }],
        folders: [{ name: 'Prayer', count: 2 }],
        dictionaryWords: [{ name: 'grace', count: 1 }],
      },
      canon: {
        sections: [{ id: 'wisdom', label: 'Wisdom', count: 10, testament: 'ot' }],
        books: [{ name: 'Psalms', order: 19, count: 10, sharePct: 100, heatLevel: 1 }],
      },
      threads: { totalThreads: 5, avgNotesPerThread: 2.5, linksCreated: 12 },
      xp: {
        totalXp: 500,
        eventCount: 50,
        users: 20,
        avgXpPerUser: 25,
        byActivity: [{ label: 'Note created', totalXp: 200, eventCount: 20, users: 10 }],
      },
    },
    ...overrides,
  };
}

describe('rollupMonthlyReports', () => {
  it('sums additive usage metrics across months', () => {
    const a = samplePayload('2026-03');
    const b = samplePayload('2026-04', {
      usage: { ...a.usage, signups: 5, notesCreated: 50 },
    });
    b.usage.signups = 5;
    b.usage.notesCreated = 50;

    const rollup = rollupMonthlyReports('season', 'spring-2026', 'Spring 2026', [a, b]);
    expect(rollup.totals.signups).toBe(15);
    expect(rollup.totals.notesCreated).toBe(150);
    expect(rollup.totals.monthCount).toBe(2);
  });

  it('merges ranked book lists by summing counts', () => {
    const a = samplePayload('2026-03', {
      pulse: {
        ...samplePayload('2026-03').pulse,
        books: [
          { name: 'Psalms', count: 10 },
          { name: 'John', count: 5 },
        ],
      },
    });
    const b = samplePayload('2026-04', {
      pulse: {
        ...samplePayload('2026-04').pulse,
        books: [
          { name: 'Psalms', count: 3 },
          { name: 'Romans', count: 7 },
        ],
      },
    });

    const rollup = rollupMonthlyReports('season', 'spring-2026', 'Spring 2026', [a, b]);
    expect(rollup.pulse.books[0]).toEqual({ name: 'Psalms', count: 13 });
  });

  it('merges curiosity and canon sections across months', () => {
    const a = samplePayload('2026-03');
    const b = samplePayload('2026-04', {
      pulse: {
        ...samplePayload('2026-04').pulse,
        curiosity: {
          tones: [{ name: 'Reflective', count: 2 }],
          folders: [],
          dictionaryWords: [],
        },
        canon: {
          sections: [{ id: 'wisdom', label: 'Wisdom', count: 4, testament: 'ot' }],
          books: [],
        },
      },
    });

    const rollup = rollupMonthlyReports('season', 'spring-2026', 'Spring 2026', [a, b]);
    expect(rollup.pulse.curiosity.tones[0]).toEqual({ name: 'Reflective', count: 5 });
    expect(rollup.pulse.canon.sections.find((section) => section.id === 'wisdom')?.count).toBe(14);
  });
});

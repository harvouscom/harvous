/**
 * The personal/shared floor split on the study feed, asserted against the source the same way
 * study-feed-review-answers.test.ts does — a request-level test would need a live database and
 * would say nothing about the *next* source someone adds to this route with the wrong helper.
 *
 * The property that matters: personal sources (what one person wrote, read, highlighted,
 * reviewed) respect the reader's own plan; a shared space's activity never does, because it is
 * not only the viewer's data to gate. Mixing these up either locks a free member out of a
 * Plus host's room, or quietly gives a free account someone else's paid history — worth a
 * dedicated test at the boundary between them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(resolve(process.cwd(), 'server/routes/study-feed.ts'), 'utf8');

const PERSONAL_WINDOWED_CALLS = [
  'personalWindowed(Notes.createdAt)',
  'personalWindowed(NoteVersions.createdAt)',
  'personalWindowed(StudyThreadEntries.createdAt)',
  'personalWindowed(ReadingEvents.createdAt)',
  'personalWindowed(NoteVisitEvents.createdAt)',
  'personalWindowed(ReviewEvents.createdAt)',
] as const;

describe('study feed history window', () => {
  it('gates every personal source on the reader’s own plan', () => {
    const text = source();
    for (const call of PERSONAL_WINDOWED_CALLS) expect(text).toContain(call);
  });

  it('gates shared-space activity on the flat floor, never the viewer’s plan', () => {
    const text = source();
    expect(text).toContain('sharedWindowed(Notes.updatedAt)');
    // The one shared-space query in the route, and it must not carry the personal floor.
    const spaceNoteRowsStart = text.indexOf('const spaceNoteRows = await source(');
    const spaceNoteRowsEnd = text.indexOf('const authors = await batchAuthorAttribution');
    const spaceNoteRowsBlock = text.slice(spaceNoteRowsStart, spaceNoteRowsEnd);
    expect(spaceNoteRowsBlock).not.toContain('personalWindowed');
  });

  it('checks full_history with the throttled reconcile, not a full sync on every load', () => {
    const text = source();
    expect(text).toContain(
      "hasFeatureWithReconcile(auth, 'full_history', { throttle: true })",
    );
  });

  it('only probes for hidden history once the trail is actually exhausted', () => {
    const text = source();
    const guardMatch = text.match(/if \(wantsOwn && personalFloor && nextCursor === null\) \{/);
    expect(guardMatch).not.toBeNull();
    expect(text).toContain('hasOlderPersonalHistory(auth.userId, personalFloor)');
  });

  /*
   * The probe used to ask only about notes and saves, so someone whose only older study was
   * highlights or reading was told their study "begins here" while that history was hidden.
   * It now lives in history-window-status.ts and must cover every personally windowed source.
   */
  it('probes every personally windowed source, cheaply, stopping on the first hit', () => {
    const util = readFileSync(resolve(process.cwd(), 'server/utils/history-window-status.ts'), 'utf8');
    const start = util.indexOf('export async function hasOlderPersonalHistory');
    const body = util.slice(start, util.indexOf('\n}\n', start));
    for (const table of ['Notes', 'NoteVersions', 'StudyThreadEntries', 'ReadingEvents', 'NoteVisitEvents', 'ReviewEvents']) {
      expect(body, table).toContain(`.from(${table})`);
    }
    expect(body.indexOf('.from(Notes)')).toBeLessThan(body.indexOf('.from(NoteVersions)'));
    expect(body).toContain('if (await probe()) return true;');
    expect(body.split('.limit(1)').length - 1).toBe(6);
  });

  it('never lets a Plus reader’s query carry a personal floor', () => {
    const text = source();
    expect(text).toContain('const personalFloor = hasFullHistory ? null : freeHistoryFloor(');
  });

  it('sends lockedBefore on the wire, alongside nextCursor', () => {
    const text = source();
    const body = text.slice(text.indexOf('const body: StudyFeedResponse'));
    expect(body).toContain('nextCursor,');
    expect(body).toContain('lockedBefore,');
  });
});

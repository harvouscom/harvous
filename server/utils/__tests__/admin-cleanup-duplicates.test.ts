import { describe, expect, it } from 'vitest';
import { planDuplicateDeletions } from '../admin-cleanup-duplicates';

/**
 * The comparator used to be
 *   `(a.createdAt || '').localeCompare(b.createdAt || '')`
 * while `NoteThreads.createdAt` / `NoteScriptureReferences.createdAt` are `ts()` columns,
 * so Drizzle hands back **Date** objects. A Date is truthy, so `|| ''` never fired, and
 * `Date.prototype.localeCompare` does not exist → TypeError.
 *
 * It only bites on groups larger than one — i.e. exactly when there are duplicates to
 * clean — so both admin cleanup endpoints 500 precisely when they have work to do,
 * dry-run included, while looking healthy on the "Database is clean!" path.
 *
 * Existing fixtures elsewhere pass ISO strings, a shape production never produces, which
 * is why nothing caught it. These use Dates.
 */
describe('planDuplicateDeletions', () => {
  const row = (id: string, createdAt: Date | string | null) => ({ id, noteId: 'note_1', createdAt });

  it('does not throw on Date createdAt, which is what Drizzle actually returns', () => {
    expect(() =>
      planDuplicateDeletions(
        [row('a', new Date('2026-01-01T00:00:00.000Z')), row('b', new Date('2026-02-01T00:00:00.000Z'))],
        (e) => e.noteId,
      ),
    ).not.toThrow();
  });

  it('keeps the oldest row and deletes the rest', () => {
    const { groups, report } = planDuplicateDeletions(
      [
        row('newer', new Date('2026-02-01T00:00:00.000Z')),
        row('oldest', new Date('2026-01-01T00:00:00.000Z')),
        row('newest', new Date('2026-03-01T00:00:00.000Z')),
      ],
      (e) => e.noteId,
    );
    expect(groups).toBe(1);
    expect(report[0].kept.id).toBe('oldest');
    expect(report[0].toDelete.map((r) => r.id).sort()).toEqual(['newer', 'newest']);
  });

  it('orders by real time, not lexicographically', () => {
    // '2026-9-01' vs '2026-10-01' sort the wrong way as strings.
    const { report } = planDuplicateDeletions(
      [
        row('october', new Date('2026-10-01T00:00:00.000Z')),
        row('september', new Date('2026-09-01T00:00:00.000Z')),
      ],
      (e) => e.noteId,
    );
    expect(report[0].kept.id).toBe('september');
  });

  it('still accepts ISO strings, for callers not reading straight from the DB', () => {
    const { report } = planDuplicateDeletions(
      [row('newer', '2026-02-01T00:00:00.000Z'), row('older', '2026-01-01T00:00:00.000Z')],
      (e) => e.noteId,
    );
    expect(report[0].kept.id).toBe('older');
  });

  it('treats a missing createdAt as oldest rather than throwing', () => {
    const { report } = planDuplicateDeletions(
      [row('dated', new Date('2026-01-01T00:00:00.000Z')), row('undated', null)],
      (e) => e.noteId,
    );
    expect(report[0].kept.id).toBe('undated');
  });

  it('reports no groups when there is nothing duplicated', () => {
    const { groups, report } = planDuplicateDeletions(
      [{ id: 'a', noteId: 'n1', createdAt: new Date() }, { id: 'b', noteId: 'n2', createdAt: new Date() }],
      (e) => e.noteId,
    );
    expect(groups).toBe(0);
    expect(report).toEqual([]);
  });
});

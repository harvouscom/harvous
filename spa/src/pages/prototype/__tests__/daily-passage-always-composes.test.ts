/**
 * Today's passage always composes — never reopens an old note, never drills into search.
 *
 * This row used to switch between two actions: compose (no note yet) or "view notes on this
 * passage" (drilling the sidebar's Scripture browse view, then later opening whatever note
 * the scripture index turned up — a past, possibly unrelated one, since the daily passage
 * rotates through a finite pool and a reference can recur). Both were surprises: the reader
 * asked to write about today's reading and instead landed on a list, or on someone else's
 * (their own, but old) writing about the same verse from months back. One action now:
 * `takeNote` (was `studyNow`), which itself only resumes a note actually started earlier *today*.
 *
 * Source-inspected because the seam is which function the button calls and how that function
 * decides "resume vs. new", not a value a snapshot would catch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeDailyPassagePill.tsx'), 'utf8');

describe("today's passage action", () => {
  it('has one action button, not a second view/eye branch', () => {
    const text = source();
    expect(text).not.toContain('name="eye"');
    expect(text).not.toContain('dailyPassageNoteExists');
    expect(text).not.toContain('onOpenScripturePassage');
    expect(text).not.toContain('findMostRecentNoteForScriptureReference');
  });

  it('always calls takeNote, never a library/search drill', () => {
    const text = source();
    const start = text.indexOf('aria-label="Add passage to notes"');
    expect(start).toBeGreaterThan(-1);
    const button = text.slice(start, start + 200);
    expect(button).toContain('onClick={takeNote}');
    expect(button).toContain('name="pen-to-square"');
  });

  it('resumes only a note started today, shared with the card', () => {
    // The action moved into `useDailyPassageActions` so the Activity card and this row cannot
    // drift. Its resume rule is still "a note on this passage touched today", nothing wider.
    const hook = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/use-daily-passage-actions.ts'),
      'utf8',
    );
    expect(hook).toContain('findPersistedDailyPassageNote(notes, votd.reference)');
    expect(hook).not.toContain('findMostRecentNoteForScriptureReference');
  });
});

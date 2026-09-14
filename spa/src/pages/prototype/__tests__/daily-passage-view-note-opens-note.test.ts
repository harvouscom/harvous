/**
 * Today's passage "view notes" control opens the note, not a library/search view.
 *
 * The eye-icon branch used to drill the sidebar's Scripture browse view to this passage's
 * row (`onOpenScripturePassage`) — the same anti-pattern `openPassageConnection` in
 * `use-home-surface-data.ts` documents for a sibling card: a tap meant to view a note
 * instead surfaced a list. Source-inspected because the seam is which function the button
 * calls, not a value a snapshot would catch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeDailyPassagePill.tsx'), 'utf8');

describe("today's passage view-note control", () => {
  it('does not drill into a library/search view any more', () => {
    const text = source();
    // The prop and its call are gone; a historical mention in a comment (explaining what
    // this used to do, and why) is fine and expected.
    expect(text).not.toContain('onOpenScripturePassage: (');
    expect(text).not.toContain('onOpenScripturePassage(');
  });

  it('resolves the specific note from the scripture index, falling back to composing one', () => {
    const text = source();
    const start = text.indexOf('const openScripturePassageNotes');
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start, start + 500);
    expect(body).toContain('findMostRecentNoteForScriptureReference');
    expect(body).toContain('openNote(recentNoteId)');
    expect(body).toContain('studyNow(votd)');
  });
});

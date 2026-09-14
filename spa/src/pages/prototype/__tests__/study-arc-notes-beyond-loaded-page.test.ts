/**
 * The "returning to" greeting chip proposes a Thread from the arc's real notes, not just
 * whichever ones happen to be on Home's loaded page.
 *
 * A study arc is by definition a theme returned to across weeks or months, so its notes are
 * routinely outside the recent page Home keeps in memory. `noteIds` used to be computed by
 * filtering that paginated `notes` array, which resolved too few — often zero — and
 * `openStudyArc` would then fall back to a keyword search instead of proposing the Thread,
 * even though `fingerprintsById` (from the unpaginated `/api/notes/fingerprints`) already had
 * every fingerprinted note's themes sitting in memory.
 *
 * Source-inspected because the seam is which collection a `.map`/`.filter` scans — the kind
 * of change that looks correct in isolation, compiles, and quietly narrows behavior back to
 * the bug.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/use-home-surface-data.ts'), 'utf8');

describe('study arc note resolution', () => {
  it('derives noteIds from the full fingerprints map, not the loaded notes page', () => {
    const text = source();
    const start = text.indexOf('if (fromLayer) {');
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start, text.indexOf('return { ...fromLayer, noteIds };', start));
    expect(body).toContain('fingerprintsById.entries()');
    expect(body).not.toContain('notes\n        .filter');
    expect(body).not.toContain('notes.filter((n) =>');
  });

  it('keeps a proposal note even when its title is not on the loaded page', () => {
    const text = source();
    const start = text.indexOf('const openStudyArc = useCallback');
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start, text.indexOf('if (proposalNotes.length === 0', start));
    // The old shape dropped ids missing from `notes` outright — `.find(...)` then
    // `.filter(Boolean)`. The fix keeps every id, with title `null` when unresolved.
    expect(body).not.toContain('.filter((n): n is SpaceNoteRow => Boolean(n))');
    expect(body).toContain('notes.find((n) => n.id === id)?.title ?? null');
  });
});

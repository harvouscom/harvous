import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A seeded compose (`beginPrototypeComposeSession({ seed })`) opened BLANK whenever it was
 * started while a compose draft was already on screen. From Activity, where no editor is
 * mounted, it always worked.
 *
 * The page stays mounted across that transition, so the epoch bump runs
 * `resetComposeSessionState` — a passive effect, which React commits after the new
 * session's editor has already mounted and seeded itself. Two writes in that reset landed
 * on the new session instead of the old one:
 *
 *   1. It raised the draft→persist remount signal with `{ content: '' }`. The fresh
 *      `CardFullEditable` read that as "your draft just persisted" and, with TipTap not up
 *      yet, took the fallback that reseeds the signal's (empty) body.
 *   2. It cleared the live snapshot through `setLiveNoteSnapshot`, which stamps whatever
 *      epoch is current — by then the new one. A blank snapshot for this session outranks
 *      the seed in `editorNote`.
 *
 * And a fresh `CardFullEditable` started its handled tick at -1, so it also answered the
 * previous session's leftover signal at mount.
 */
const root = process.cwd();
const page = readFileSync(resolve(root, 'spa/src/pages/prototype/PrototypeNotePage.tsx'), 'utf8');
const card = readFileSync(resolve(root, 'src/components/react/CardFullEditable.tsx'), 'utf8');

function resetBlock(): string {
  const start = page.indexOf('const resetComposeSessionState = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = page.indexOf('}, [', start);
  expect(end).toBeGreaterThan(start);
  return page.slice(start, end);
}

describe('a seeded compose started over an open draft keeps its seed', () => {
  it('the session reset withdraws the persist-remount signal instead of raising it', () => {
    const block = resetBlock();
    expect(block).toContain('draftPersistRemountRef.current = null;');
    expect(block).not.toContain('setDraftPersistRemountTick');
    expect(block).not.toMatch(/draftPersistRemountRef\.current = \{/);
  });

  it('the session reset does not write a live snapshot', () => {
    // Any write here is stamped with the new epoch and hides the seed.
    expect(resetBlock()).not.toMatch(/setLiveNoteSnapshot(State)?\(/);
  });

  it('the editor only answers remount signals raised after it mounted', () => {
    expect(card).toContain('const handledPersistRemountTickRef = useRef(prototypeDraftPersistRemountTick);');
    expect(card).not.toContain('const handledPersistRemountTickRef = useRef(-1);');
  });

  it('the seed is still what a session with no live snapshot opens with', () => {
    expect(page).toContain(
      "(hasLiveNoteSnapshot ? liveNoteSnapshot.content : composeSeed?.contentHtml ?? '')",
    );
  });
});

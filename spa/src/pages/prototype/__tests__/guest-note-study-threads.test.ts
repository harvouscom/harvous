import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Everything a guest can press inside their own note either works on the device or offers an
 * account — nothing posts a study-thread row for a note the server has never seen.
 *
 * Before this, Highlight, Save reference, a passage highlight in a pill's dock and New note all
 * sent a request that could only 401 (`QueryClient401Redirect` no longer bounces a guest, so
 * the failure was silent). The guards key on `isGuestLocalNote`, not `isGuestNoteId`: the note
 * a guest is composing is `note_draft` for as long as it is open, and an id check alone missed
 * it. These are source-order checks because the call sites live in components too large to
 * mount under test.
 */
function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

/** The guard sits between `start` and the request, inside the same function. */
function expectGuardBefore(source: string, start: string, guard: string, request: string) {
  const from = source.indexOf(start);
  expect(from, `start not found: ${start}`).toBeGreaterThan(-1);
  const guardAt = source.indexOf(guard, from);
  const requestAt = source.indexOf(request, from);
  expect(requestAt, `request not found after: ${start}`).toBeGreaterThan(-1);
  expect(guardAt, `guard missing before request: ${guard}`).toBeGreaterThan(-1);
  expect(guardAt).toBeLessThan(requestAt);
}

const STUDY_THREAD_POST = 'fetch(`/api/notes/${sourceNoteId}/study-threads`';

describe("a guest's note never posts a study-thread row", () => {
  const editor = read('src/components/react/TiptapEditor.tsx');

  it('Save reference on a typed word keeps the mark and skips the POST', () => {
    expectGuardBefore(
      editor,
      'const saveReferenceHighlight = useCallback(',
      '!isGuestLocalNote(sourceNoteId)',
      STUDY_THREAD_POST,
    );
  });

  it("the selection bar's Highlight keeps the mark and skips the POST", () => {
    expectGuardBefore(
      editor,
      'title="Highlight selected text"',
      '!isGuestLocalNote(sourceNoteId)',
      STUDY_THREAD_POST,
    );
  });

  it('Save reference on a passage word offers an account instead', () => {
    expectGuardBefore(
      editor,
      'const savePassageReference = useCallback(',
      "offerGuestAccount('Saving references')",
      'saveReferenceStudyThread(',
    );
  });

  it('a pasted reference processes nothing for a guest draft either', () => {
    expectGuardBefore(
      editor,
      'If editing an existing note, immediately process scripture references',
      '!isGuestLocalNote(sourceNoteId)',
      '/process-scripture-references',
    );
    expect(editor).not.toContain('isGuestNoteId(');
  });

  it('New note skips the signed-in lookup for an existing scripture note', () => {
    expectGuardBefore(
      editor,
      'const handleCreateNoteFromSelection = async (',
      'isGuestLocalNote(sourceNoteId)',
      "fetch('/api/scripture/check-existing'",
    );
  });

  it("the pill dock neither reads nor writes a guest note's entries", () => {
    const pill = read('src/components/react/ScripturePillChromeWeb.tsx');
    const byScripture = pill.indexOf('/study-threads/by-scripture?');
    const effect = pill.lastIndexOf('useEffect(() => {', byScripture);
    const guard = pill.indexOf('if (isGuestLocalNote(sourceNoteId)) return;', effect);
    expect(guard).toBeGreaterThan(effect);
    expect(guard).toBeLessThan(byScripture);

    expectGuardBefore(
      pill,
      'const handleCreatePassageHighlight = useCallback(',
      "offerGuestAccount('Highlighting a passage in a note')",
      STUDY_THREAD_POST,
    );
  });
});

describe('the pages around the editor', () => {
  it('the reader offers an account before saving to a stacked guest note', () => {
    expectGuardBefore(
      read('spa/src/pages/prototype/PrototypeReadPage.tsx'),
      'const handleSaveReference = useCallback(',
      "offerGuestAccount('Saving references')",
      'if (stackedNoteId) {',
    );
  });

  it("New note from a selection makes a guest's note on the device", () => {
    const page = read('spa/src/pages/prototype/PrototypeNotePage.tsx');
    const listener = page.indexOf("window.addEventListener('openNewNotePanel', handler)");
    const handler = page.lastIndexOf('const handler = async () => {', listener);
    const guestBranch = page.indexOf('if (isGuest) {', handler);
    const localCreate = page.indexOf('addGuestNote(', handler);
    const spaceBail = page.indexOf('if (!spaceId) return;', handler);
    expect(guestBranch).toBeGreaterThan(handler);
    expect(localCreate).toBeGreaterThan(guestBranch);
    expect(spaceBail).toBeGreaterThan(localCreate);
    expect(spaceBail).toBeLessThan(listener);
  });
});

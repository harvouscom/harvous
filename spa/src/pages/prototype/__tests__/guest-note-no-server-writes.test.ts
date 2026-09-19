import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A guest's note lives only in the guest store. Three places treated it like a member's note
 * and reached for a server that has never seen it.
 *
 * The visible one: a note started from the reader carries a pending scripture pill, the note
 * page's open-time pass POSTs it for processing, the POST 401s, and the app-wide 401 handler
 * sent the guest to /sign-in — the moment they opened their own note from Home.
 */
function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sliceFrom(source: string, marker: string, length: number): string {
  const start = source.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThan(-1);
  return source.slice(start, start + length);
}

describe('a guest note never triggers a server write or a sign-in bounce', () => {
  it('the 401 redirect lets a guest stay', () => {
    const block = sliceFrom(read('spa/src/App.tsx'), 'function QueryClient401Redirect', 2400);
    const guard = block.indexOf('if (isGuestModeActive()) return;');
    const redirect = block.indexOf("window.location.href = '/sign-in'");
    expect(guard).toBeGreaterThan(-1);
    expect(redirect).toBeGreaterThan(guard);
  });

  it('the open-time scripture pass skips a guest note', () => {
    const source = read('spa/src/pages/prototype/PrototypeNotePage.tsx');
    const mutate = source.indexOf('processScriptureMutation.mutate({ noteId, contentOverride: content, threadId })');
    expect(mutate).toBeGreaterThan(-1);
    const effect = source.lastIndexOf('useEffect(() => {', mutate);
    const guard = source.indexOf('if (isGuestNoteId(noteId)) return;', effect);
    expect(guard).toBeGreaterThan(effect);
    expect(guard).toBeLessThan(mutate);
  });

  it("the unload flush saves a guest's note to the store before any draft write", () => {
    const flush = sliceFrom(
      read('src/components/react/CardFullEditable.tsx'),
      'const flush = () => {',
      9000,
    );
    const guestBranch = flush.indexOf('isGuestNoteId(departingNoteId) ||');
    const draftWrite = flush.indexOf('saveNoteDraft(draftKey');
    const keepalive = flush.indexOf('keepalive: true');
    expect(guestBranch).toBeGreaterThan(-1);
    expect(draftWrite).toBeGreaterThan(guestBranch);
    expect(keepalive).toBeGreaterThan(guestBranch);
  });
});

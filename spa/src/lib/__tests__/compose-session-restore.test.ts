import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMPOSE_RESTORE_TTL_MS,
  clearComposeRestoreStash,
  consumeComposeRestore,
  resolveComposeRestoreTarget,
  stashComposeRestore,
} from '../compose-session-restore';

/**
 * Compose keeps the URL at `/` until an idle moment, so a refresh while typing used to
 * land on a blank Home even though the note persisted seconds earlier. The stash bridges
 * exactly that window; these pin its lifecycle and the user's stated constraints —
 * survive a refresh, die with the tab (sessionStorage), fresh after an hour.
 */
describe('compose session restore', () => {
  beforeEach(() => sessionStorage.clear());

  it('round-trips through a refresh', () => {
    stashComposeRestore('note_1');
    expect(consumeComposeRestore()).toEqual({ noteId: 'note_1' });
  });

  it('consuming clears — a second boot must not restore again', () => {
    stashComposeRestore('note_1');
    consumeComposeRestore();
    expect(consumeComposeRestore()).toBeNull();
  });

  it('carries the shared-space search param when compose targeted one', () => {
    stashComposeRestore('note_1', '1234');
    expect(consumeComposeRestore()).toEqual({ noteId: 'note_1', spaceParam: '1234' });
  });

  it('expires after the TTL — an hour away means Home is the right landing', () => {
    const fresh = { noteId: 'note_1', at: Date.now() - COMPOSE_RESTORE_TTL_MS + 1_000 };
    const stale = { noteId: 'note_1', at: Date.now() - COMPOSE_RESTORE_TTL_MS - 1 };
    expect(resolveComposeRestoreTarget(fresh)).not.toBeNull();
    expect(resolveComposeRestoreTarget(stale)).toBeNull();
  });

  it('rejects clock skew and malformed stashes rather than guessing', () => {
    expect(resolveComposeRestoreTarget({ noteId: 'n', at: Date.now() + 60_000 })).toBeNull();
    expect(resolveComposeRestoreTarget({ noteId: '', at: Date.now() })).toBeNull();
    expect(resolveComposeRestoreTarget({ noteId: 'n', at: Number.NaN })).toBeNull();
    sessionStorage.setItem('harvous.compose.restore', 'not json');
    expect(consumeComposeRestore()).toBeNull();
  });

  it('clearComposeRestoreStash covers every compose-session end path', () => {
    // The shell setter calls this on every null — URL replace and session resets alike —
    // which is what keeps a stale stash from bouncing a deliberate Home visit.
    stashComposeRestore('note_1');
    clearComposeRestoreStash();
    expect(consumeComposeRestore()).toBeNull();
  });
});

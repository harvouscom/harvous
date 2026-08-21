import { describe, expect, it } from 'vitest';
import {
  noteAudienceLabel,
  resolveCoEditFollower,
  resolveForeignNoteReadOnly,
  resolveNoteAudience,
  resolveNoteEditStatusVisibility,
  resolveSharedNoteEditStatus,
  resolveNoteSpaceSwitch,
  type NoteAudienceSpaceInput,
} from '../note-audience';

const ROMANS: NoteAudienceSpaceInput = {
  id: 'space_romans',
  title: 'Romans Group',
  spaceType: 'shared',
  coEditEnabled: true,
};
const TUESDAY: NoteAudienceSpaceInput = {
  id: 'space_tuesday',
  title: 'Tuesday Study',
  spaceType: 'shared',
  coEditEnabled: false,
};
const CHANNEL: NoteAudienceSpaceInput = {
  id: 'space_teaching',
  title: 'Teaching Channel',
  spaceType: 'public',
  coEditEnabled: false,
};

describe('resolveNoteAudience', () => {
  it('reports Home scope and no in-context co-edit when there is no shared context', () => {
    const audience = resolveNoteAudience({
      contextSpaceId: null,
      spaces: [ROMANS],
      noteCoEditEnabled: true,
    });

    expect(audience.scope).toBe('home');
    expect(audience.contextSpace).toBeNull();
    // The whole point: the mirror is on, but Home is not a co-editing context.
    expect(audience.coEditEnabledInContext).toBe(false);
    expect(audience.coEditEnabledAnywhere).toBe(true);
  });

  it('scopes co-edit to the association for the active space', () => {
    const audience = resolveNoteAudience({
      contextSpaceId: 'space_romans',
      spaces: [ROMANS, TUESDAY],
      noteCoEditEnabled: true,
    });

    expect(audience.scope).toBe('space');
    expect(audience.contextSpace?.title).toBe('Romans Group');
    expect(audience.coEditEnabledInContext).toBe(true);
  });

  it('never lets the mirror override a per-space false', () => {
    const audience = resolveNoteAudience({
      contextSpaceId: 'space_tuesday',
      spaces: [ROMANS, TUESDAY],
      noteCoEditEnabled: true,
    });

    // Co-edit is on in Romans Group, off in Tuesday Study. Reading it in Tuesday
    // Study must say "Editing is off", not inherit Romans Group's flag.
    expect(audience.coEditEnabledInContext).toBe(false);
  });

  it('treats undefined associations as unknown, not as an empty audience', () => {
    const audience = resolveNoteAudience({
      contextSpaceId: null,
      spaces: undefined,
      noteCoEditEnabled: true,
    });

    expect(audience.scope).toBe('unknown');
    expect(audience.sharedSpaces).toEqual([]);
    expect(audience.coEditEnabledInContext).toBe(false);
  });

  it('separates collaborative spaces from broadcast channels', () => {
    const audience = resolveNoteAudience({
      contextSpaceId: null,
      spaces: [ROMANS, TUESDAY, CHANNEL],
      noteCoEditEnabled: false,
    });

    expect(audience.sharedSpaces.map((s) => s.id)).toEqual(['space_romans', 'space_tuesday']);
    expect(audience.channels.map((s) => s.id)).toEqual(['space_teaching']);
  });

  it('matches a bare context id against prefixed association ids', () => {
    const audience = resolveNoteAudience({
      contextSpaceId: 'romans',
      spaces: [{ ...ROMANS, id: 'space_romans' }],
      noteCoEditEnabled: true,
    });

    expect(audience.contextSpace?.id).toBe('space_romans');
    expect(audience.coEditEnabledInContext).toBe(true);
  });

  it('defaults a missing spaceType to shared rather than silently creating a channel', () => {
    const audience = resolveNoteAudience({
      contextSpaceId: null,
      spaces: [{ id: 'space_x', title: 'X' }],
      noteCoEditEnabled: false,
    });

    expect(audience.sharedSpaces).toHaveLength(1);
    expect(audience.channels).toHaveLength(0);
  });

  it('reports a space scope even when the note has no association with that space', () => {
    // Reachable by opening a private note from a My-Home-scoped list inside a
    // shared space. There is a context, but no association — so no co-edit.
    const audience = resolveNoteAudience({
      contextSpaceId: 'space_romans',
      spaces: [],
      noteCoEditEnabled: false,
    });

    expect(audience.scope).toBe('space');
    expect(audience.contextSpace).toBeNull();
    expect(audience.coEditEnabledInContext).toBe(false);
  });
});

describe('resolveNoteEditStatusVisibility', () => {
  const base = {
    scope: 'home' as const,
    coEditEnabledInContext: false,
    isForeignSharedNote: false,
    penHeldByOther: false,
    isFollower: false,
    isHolding: false,
    sharedCount: 0,
    channelCount: 0,
  };

  it('hides everything on a private note with no audience', () => {
    expect(resolveNoteEditStatusVisibility(base)).toBe('hidden');
  });

  it('hides everything while membership is unknown', () => {
    expect(resolveNoteEditStatusVisibility({ ...base, scope: 'unknown' })).toBe('hidden');
  });

  it('goes quiet in Home for a shared note that nobody is touching', () => {
    expect(resolveNoteEditStatusVisibility({ ...base, sharedCount: 2 })).toBe('quiet');
  });

  it('goes quiet in Home for a channel-only audience', () => {
    expect(resolveNoteEditStatusVisibility({ ...base, channelCount: 1 })).toBe('quiet');
  });

  it('goes loud in a space where co-edit is on', () => {
    expect(
      resolveNoteEditStatusVisibility({
        ...base,
        scope: 'space',
        coEditEnabledInContext: true,
        sharedCount: 1,
      })
    ).toBe('loud');
  });

  it('goes loud for another member’s note', () => {
    expect(
      resolveNoteEditStatusVisibility({ ...base, scope: 'space', isForeignSharedNote: true })
    ).toBe('loud');
  });

  // The anti-clobber invariant, stated three ways so a refactor can't lose it.
  it('is never quiet while this viewer is a follower, even in Home', () => {
    expect(
      resolveNoteEditStatusVisibility({ ...base, sharedCount: 3, isFollower: true })
    ).toBe('loud');
  });

  it('is never quiet while someone else holds the pen, even in Home', () => {
    expect(
      resolveNoteEditStatusVisibility({ ...base, sharedCount: 3, penHeldByOther: true })
    ).toBe('loud');
  });

  it('is never hidden while this viewer holds the pen', () => {
    expect(resolveNoteEditStatusVisibility({ ...base, isHolding: true })).toBe('loud');
  });

  it('escalates from quiet to loud without changing the note’s audience', () => {
    const quiet = { ...base, sharedCount: 1 };
    expect(resolveNoteEditStatusVisibility(quiet)).toBe('quiet');
    expect(resolveNoteEditStatusVisibility({ ...quiet, penHeldByOther: true })).toBe('loud');
  });
});

describe('the locked-editor invariant', () => {
  // The one failure mode worth engineering against: the editor goes read-only
  // because a collaborator took the pen, while the bar stays quiet — leaving the
  // user unable to type with nothing on screen explaining why. Asserted here as a
  // property over the whole input space rather than a handful of examples, so a
  // refactor of either function can't quietly break the pairing.
  const bools = [false, true];

  it('never renders anything but loud while the editor is a follower', () => {
    let followerCases = 0;
    for (const coEditEnabledAnywhere of bools)
      for (const isOnboardingReadonly of bools)
        for (const leaseActive of bools)
          for (const penHeldByOther of bools)
            for (const isOwnNote of bools)
              for (const canCoEdit of bools)
                for (const scope of ['home', 'space', 'unknown'] as const)
                  for (const coEditEnabledInContext of bools)
                    for (const isForeignSharedNote of bools)
                      for (const isHolding of bools)
                        for (const sharedCount of [0, 2]) {
                          const isFollower = resolveCoEditFollower({
                            coEditEnabledAnywhere,
                            isOnboardingReadonly,
                            leaseActive,
                            penHeldByOther,
                            isOwnNote,
                            canCoEdit,
                          });
                          if (!isFollower) continue;
                          followerCases += 1;
                          expect(
                            resolveNoteEditStatusVisibility({
                              scope,
                              coEditEnabledInContext,
                              isForeignSharedNote,
                              penHeldByOther,
                              isFollower,
                              isHolding,
                              sharedCount,
                              channelCount: 0,
                            })
                          ).toBe('loud');
                        }
    // Guard the guard: if the follower rule ever becomes unreachable, this test
    // would pass vacuously.
    expect(followerCases).toBeGreaterThan(0);
  });

  it('only becomes a follower when someone else actually holds the pen', () => {
    // Structural backstop: `penHeldByOther` alone also forces loud, so the
    // invariant survives even if the isFollower input is dropped at a call site.
    const withoutRemoteHolder = resolveCoEditFollower({
      coEditEnabledAnywhere: true,
      isOnboardingReadonly: false,
      leaseActive: true,
      penHeldByOther: false,
      isOwnNote: true,
      canCoEdit: true,
    });
    expect(withoutRemoteHolder).toBe(false);
  });

  it('does not lock the author out when the lease is down', () => {
    // Disconnected means we cannot see a holder — failing closed here would strand
    // the author read-only on their own note, which is the native bug.
    expect(
      resolveCoEditFollower({
        coEditEnabledAnywhere: true,
        isOnboardingReadonly: false,
        leaseActive: false,
        penHeldByOther: true,
        isOwnNote: true,
        canCoEdit: true,
      })
    ).toBe(false);
  });

  it('does not make an unauthorized viewer a follower', () => {
    expect(
      resolveCoEditFollower({
        coEditEnabledAnywhere: true,
        isOnboardingReadonly: false,
        leaseActive: true,
        penHeldByOther: true,
        isOwnNote: false,
        canCoEdit: false,
      })
    ).toBe(false);
  });
});

describe('resolveSharedNoteEditStatus', () => {
  // Regression: turning on "Others can edit" flipped the lease from disabled to
  // enabled, and the banner announced "Reconnecting — your note is safe" for a
  // channel that had never connected once. It then stuck, because the only thing
  // that cleared it was a SUBSCRIBED that was never coming. A reconnect claim now
  // requires evidence of a previous connection.
  const base = {
    scope: 'space' as const,
    coEditEnabledInContext: true,
    isOwnNote: true,
    canCoEdit: true,
    penHolding: false,
    penHeldByName: null as string | null,
    penHasConnected: false,
    penDisconnected: false,
  };

  it('does not claim a reconnect before the lease has ever connected', () => {
    expect(resolveSharedNoteEditStatus({ ...base, penDisconnected: true })).toEqual({
      kind: 'available',
    });
  });

  it('reports reconnecting only after a connection is actually lost', () => {
    expect(
      resolveSharedNoteEditStatus({ ...base, penHasConnected: true, penDisconnected: true }),
    ).toEqual({ kind: 'reconnecting' });
  });

  it('clears back to available when the channel returns', () => {
    expect(
      resolveSharedNoteEditStatus({ ...base, penHasConnected: true, penDisconnected: false }),
    ).toEqual({ kind: 'available' });
  });

  it('never reports reconnecting in My Home', () => {
    // There is nothing to reconnect *to* until someone else shows up, and the
    // warning read as though a private note were at risk.
    expect(
      resolveSharedNoteEditStatus({
        ...base,
        scope: 'home',
        penHasConnected: true,
        penDisconnected: true,
      }),
    ).toEqual({ kind: 'available' });
  });

  it('keeps pen state ahead of connection state', () => {
    // A live holder must surface even mid-drop; going quiet would leave a locked
    // editor with no explanation.
    expect(
      resolveSharedNoteEditStatus({
        ...base,
        penHeldByName: 'Ada',
        penHasConnected: true,
        penDisconnected: true,
      }),
    ).toEqual({ kind: 'held', holderName: 'Ada' });
    expect(
      resolveSharedNoteEditStatus({
        ...base,
        penHolding: true,
        penHasConnected: true,
        penDisconnected: true,
      }),
    ).toEqual({ kind: 'holding' });
  });

  it('stays read-only for a viewer who may not write, however the channel is doing', () => {
    for (const penHasConnected of [true, false])
      for (const penDisconnected of [true, false]) {
        expect(
          resolveSharedNoteEditStatus({
            ...base,
            isOwnNote: false,
            canCoEdit: false,
            penHasConnected,
            penDisconnected,
          }),
        ).toEqual({ kind: 'read-only' });
      }
  });

  it('stays read-only when co-edit is off in this space', () => {
    expect(
      resolveSharedNoteEditStatus({ ...base, coEditEnabledInContext: false }),
    ).toEqual({ kind: 'read-only' });
  });
});

describe('resolveForeignNoteReadOnly', () => {
  // Regression: switching the switcher to My Home used to make `noteInSharedSpace`
  // collapse to false for a foreign note (its context was lost), which skipped the
  // read-only check entirely and left the editor genuinely writable. The server
  // still rejected the resulting save (verified against production data — no
  // unauthorized write has ever persisted), but the client silently discarded
  // what the user typed and looked editable the whole time.
  const base = {
    noteInSharedSpace: false,
    isOwnNoteConfirmed: false as boolean | null,
    canEdit: false,
    holdsPen: false,
    penFree: false,
  };

  it('stays read-only for a foreign, non-co-edited note even with no space context', () => {
    // This is the exact bug: context lost (noteInSharedSpace: false), but the
    // note is positively known to be someone else's and not writable.
    expect(resolveForeignNoteReadOnly(base)).toBe(true);
  });

  it('stays read-only for a foreign note inside its shared-space context too', () => {
    expect(resolveForeignNoteReadOnly({ ...base, noteInSharedSpace: true })).toBe(true);
  });

  it('is writable for a foreign note with a co-edit grant, once the pen is available', () => {
    expect(
      resolveForeignNoteReadOnly({
        ...base,
        noteInSharedSpace: true,
        canEdit: true,
        penFree: true,
      })
    ).toBe(false);
    expect(
      resolveForeignNoteReadOnly({
        ...base,
        noteInSharedSpace: true,
        canEdit: true,
        holdsPen: true,
      })
    ).toBe(false);
  });

  it('stays read-only for a co-edit-granted note while the pen is neither held nor free', () => {
    expect(
      resolveForeignNoteReadOnly({ ...base, noteInSharedSpace: true, canEdit: true })
    ).toBe(true);
  });

  it('is never read-only for your own note, in any context', () => {
    expect(
      resolveForeignNoteReadOnly({ ...base, isOwnNoteConfirmed: true, noteInSharedSpace: false })
    ).toBe(false);
    expect(
      resolveForeignNoteReadOnly({ ...base, isOwnNoteConfirmed: true, noteInSharedSpace: true })
    ).toBe(false);
  });

  it('hides in Home (renders editable) while ownership is still unknown and there is no context', () => {
    // `null` = still resolving. Outside a shared-space context there's nothing
    // to lock against yet — this matches a note that hasn't loaded far enough
    // to know anything, not a foreign note losing its context.
    expect(
      resolveForeignNoteReadOnly({ ...base, isOwnNoteConfirmed: null, noteInSharedSpace: false })
    ).toBe(false);
  });

  it('fails closed (read-only) while ownership is unknown inside a shared-space context', () => {
    expect(
      resolveForeignNoteReadOnly({ ...base, isOwnNoteConfirmed: null, noteInSharedSpace: true })
    ).toBe(true);
  });
});

describe('noteAudienceLabel', () => {
  it('renders nothing for a private note', () => {
    expect(noteAudienceLabel({ sharedCount: 0, channelCount: 0 })).toBeNull();
  });

  it('names the space when there is exactly one', () => {
    expect(
      noteAudienceLabel({ sharedCount: 1, channelCount: 0, firstSpaceTitle: 'Romans Group' })
    ).toBe('Shared with Romans Group');
  });

  it('counts when there are several', () => {
    expect(
      noteAudienceLabel({ sharedCount: 3, channelCount: 0, firstSpaceTitle: 'Romans Group' })
    ).toBe('Shared with 3 spaces');
  });

  it('splits spaces from channels', () => {
    expect(noteAudienceLabel({ sharedCount: 2, channelCount: 1 })).toBe(
      'Shared with 2 spaces · 1 channel'
    );
  });

  it('handles a channel-only audience', () => {
    expect(noteAudienceLabel({ sharedCount: 0, channelCount: 2 })).toBe('Shared with 2 channels');
  });

  it('falls back to a count when the single space has no title', () => {
    expect(noteAudienceLabel({ sharedCount: 1, channelCount: 0 })).toBe('Shared with 1 space');
  });
});

describe('resolveNoteSpaceSwitch', () => {
  const base = {
    homeSpaceId: 'space_home',
    noteSpaceIds: [] as string[] | undefined,
    isOwnNote: true,
    isDraft: false,
  };

  it('keeps your own note when switching to My Home, re-reading it there', () => {
    // My Home is an aggregate — it drops the spaceId filter entirely.
    expect(
      resolveNoteSpaceSwitch({ ...base, destinationSpaceId: null, noteSpaceIds: ['space_a'] })
    ).toBe('retarget');
  });

  it('treats an explicit home id the same as null', () => {
    expect(resolveNoteSpaceSwitch({ ...base, destinationSpaceId: 'space_home' })).toBe('retarget');
  });

  it('closes another member\u2019s note when switching to My Home', () => {
    expect(
      resolveNoteSpaceSwitch({
        ...base,
        destinationSpaceId: null,
        isOwnNote: false,
        noteSpaceIds: ['space_a'],
      })
    ).toBe('close');
  });

  it('re-reads a note that is associated with the destination space', () => {
    expect(
      resolveNoteSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: ['space_a', 'space_b'],
      })
    ).toBe('retarget');
  });

  it('closes a note that is not associated with the destination space', () => {
    expect(
      resolveNoteSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: ['space_a'],
      })
    ).toBe('close');
  });

  it('closes a Home-only note when switching into a shared space', () => {
    expect(
      resolveNoteSpaceSwitch({ ...base, destinationSpaceId: 'space_b', noteSpaceIds: [] })
    ).toBe('close');
  });

  /*
   * The case this three-way answer exists for.
   *
   * Membership arrives with the note detail; a note seeded from a list has
   * `spaces: undefined`. Closing on unknown would vanish notes that belonged, and
   * retargeting on unknown re-reads the note under a space it may not be in — which,
   * because folders are per-space, looked exactly like its folders being wiped.
   */
  it('leaves the note completely alone while membership is unknown', () => {
    expect(
      resolveNoteSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: undefined,
      })
    ).toBe('leave');
  });

  it('does not even retarget on unknown membership when heading to My Home', () => {
    expect(
      resolveNoteSpaceSwitch({ ...base, destinationSpaceId: null, noteSpaceIds: undefined })
    ).toBe('leave');
  });

  it('never closes an unsaved draft \u2014 it retargets instead', () => {
    expect(
      resolveNoteSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: [],
        isDraft: true,
      })
    ).toBe('retarget');
  });

  it('matches bare against prefixed ids in both directions', () => {
    expect(
      resolveNoteSpaceSwitch({ ...base, destinationSpaceId: 'b', noteSpaceIds: ['space_b'] })
    ).toBe('retarget');
    expect(
      resolveNoteSpaceSwitch({ ...base, destinationSpaceId: 'space_b', noteSpaceIds: ['b'] })
    ).toBe('retarget');
  });
});

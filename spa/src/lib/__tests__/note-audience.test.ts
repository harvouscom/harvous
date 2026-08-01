import { describe, expect, it } from 'vitest';
import {
  noteAudienceLabel,
  resolveCoEditFollower,
  resolveNoteAudience,
  resolveNoteEditStatusVisibility,
  shouldCloseNoteOnSpaceSwitch,
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

describe('shouldCloseNoteOnSpaceSwitch', () => {
  const base = {
    homeSpaceId: 'space_home',
    noteSpaceIds: [] as string[] | undefined,
    isOwnNote: true,
    isDraft: false,
  };

  it('never closes your own note when switching to My Home', () => {
    // My Home is an aggregate — it drops the spaceId filter entirely.
    expect(
      shouldCloseNoteOnSpaceSwitch({ ...base, destinationSpaceId: null, noteSpaceIds: ['space_a'] })
    ).toBe(false);
  });

  it('treats an explicit home id the same as null', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({ ...base, destinationSpaceId: 'space_home' })
    ).toBe(false);
  });

  it('closes another member’s note when switching to My Home', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({
        ...base,
        destinationSpaceId: null,
        isOwnNote: false,
        noteSpaceIds: ['space_a'],
      })
    ).toBe(true);
  });

  it('keeps a note that is associated with the destination space', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: ['space_a', 'space_b'],
      })
    ).toBe(false);
  });

  it('closes a note that is not associated with the destination space', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: ['space_a'],
      })
    ).toBe(true);
  });

  it('closes a Home-only note when switching into a shared space', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({ ...base, destinationSpaceId: 'space_b', noteSpaceIds: [] })
    ).toBe(true);
  });

  // Fail-open cases: closing a note that actually belonged reads as data loss.
  it('never closes while membership is unknown', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: undefined,
      })
    ).toBe(false);
  });

  it('never closes an unsaved draft — it retargets instead', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({
        ...base,
        destinationSpaceId: 'space_b',
        noteSpaceIds: [],
        isDraft: true,
      })
    ).toBe(false);
  });

  it('matches bare against prefixed ids in both directions', () => {
    expect(
      shouldCloseNoteOnSpaceSwitch({ ...base, destinationSpaceId: 'b', noteSpaceIds: ['space_b'] })
    ).toBe(false);
    expect(
      shouldCloseNoteOnSpaceSwitch({ ...base, destinationSpaceId: 'space_b', noteSpaceIds: ['b'] })
    ).toBe(false);
  });
});

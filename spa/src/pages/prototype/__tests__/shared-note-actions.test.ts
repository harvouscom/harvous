import { describe, expect, it } from 'vitest';
import {
  isVisiblePrototypeSharedContext,
  resolveVisibleComposeTarget,
} from '../../../layouts/proto-shell-context';
import {
  buildAssociateNoteRequest,
  buildOptimisticAssociatedSpaceNote,
  buildRemoveNoteAssociationRequest,
  isSaveCopyRequiredError,
} from '../../../hooks/mutations/useSpaceNoteAssociation';
import { buildSaveNoteCopyRequest } from '../../../hooks/mutations/useCopyNotesToSpace';
import { buildShareNoteRequest } from '../../../hooks/mutations/useShareNote';
import { createNoteCacheSpaceIds } from '../../../hooks/mutations/useCreateSimpleNote';
import { APIError } from '../../../lib/api';
import {
  candidateToSpaceNoteRow,
  filterCandidatesByOriginScope,
  noteMatchesPickerSearch,
  planSharedAddNotesRequest,
  resolveSelectedNoteRows,
} from '../PrototypeAddNotesSheet';
import { validComposeThreadSelection } from '../PrototypeGroupStudyThreadPicker';
import {
  canOrganizeSharedSpaceNote,
  canPinSharedSpaceItem,
} from '../../../lib/shared-space-capabilities';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import {
  resolveNativeToolbarContextCapabilities,
  resolveNativeToolbarSharedContextId,
} from '../NativeToolbar';
import {
  DELETE_CANONICAL_NOTE_CONFIRMATION,
  REMOVE_NOTE_FROM_SPACE_CONFIRMATION,
  resolveInspectorNoteAction,
} from '../PrototypeInspectorPane';
import {
  DELETE_NOTE_EVERYWHERE_MENU_CONFIRMATION,
  REMOVE_NOTE_FROM_SPACE_MENU_CONFIRMATION,
} from '../PrototypeNoteMoreMenu';
import {
  draftSaveDestinationLabel,
  resolveInspectorSharedActionSpaceId,
  resolvePrototypeNoteLoadState,
} from '../PrototypeNotePage';
import {
  membershipRemovalConfirmationCopy,
  resolvePeopleQueryState,
} from '../PrototypeSpacePeopleSheet';

describe('visible compose target', () => {
  const homeSpaceId = 'space_home';
  const activeSpaceId = 'space_shared';

  it('targets the active space from its dashboard and This space list', () => {
    expect(
      resolveVisibleComposeTarget({
        homeSpaceId,
        activeSpaceId,
        sidebarLayer: 'space',
        sidebarListSpaceScope: 'space',
      }),
    ).toBe(activeSpaceId);
    expect(
      resolveVisibleComposeTarget({
        homeSpaceId,
        activeSpaceId,
        sidebarLayer: 'list',
        sidebarListSpaceScope: 'space',
      }),
    ).toBe(activeSpaceId);
  });

  it('targets My Home only when My Home is the active space', () => {
    expect(
      resolveVisibleComposeTarget({
        homeSpaceId,
        activeSpaceId: null,
        sidebarLayer: 'space',
        sidebarListSpaceScope: 'space',
      }),
    ).toBe(homeSpaceId);
  });

  it('ignores the list scope — placement follows the space you are in', () => {
    // Deliberate change: browsing My Home notes while inside a shared space used to
    // silently land the new note in My Home. The list scope filters what you're
    // reading; it does not decide where new work belongs.
    expect(
      resolveVisibleComposeTarget({
        homeSpaceId,
        activeSpaceId,
        sidebarLayer: 'list',
        sidebarListSpaceScope: 'my-home',
      }),
    ).toBe(activeSpaceId);
  });
});

describe('canonical shared-note action contracts', () => {
  it('associates and removes the same canonical note id', () => {
    expect(buildAssociateNoteRequest('shared', 'note_1')).toEqual({
      url: '/api/spaces/space_shared/add-note',
      body: { noteId: 'note_1' },
    });
    expect(buildRemoveNoteAssociationRequest('shared', 'note_1')).toEqual({
      url: '/api/spaces/space_shared/remove-items',
      body: { noteIds: ['note_1'], threadIds: [] },
    });
  });

  it('saves a foreign copy only through My Home', () => {
    expect(buildSaveNoteCopyRequest('home', 'note_foreign')).toEqual({
      url: '/api/spaces/space_home/copy-notes',
      body: { noteIds: ['note_foreign'] },
    });
  });

  it('routes SAVE_COPY_REQUIRED into the explicit copy flow', () => {
    expect(
      isSaveCopyRequiredError(
        new APIError(409, 'Save an independent copy', 'SAVE_COPY_REQUIRED'),
      ),
    ).toBe(true);
    expect(isSaveCopyRequiredError(new APIError(403, 'Forbidden', 'FORBIDDEN'))).toBe(false);
  });

  it('patches both My Home and the shared target after creation', () => {
    expect(createNoteCacheSpaceIds('shared', 'home')).toEqual([
      'space_home',
      'space_shared',
    ]);
    expect(createNoteCacheSpaceIds('home', 'home')).toEqual(['space_home']);
  });

  it('starts an optimistic target association without source organization', () => {
    const source = {
      id: 'note_1',
      title: 'Canonical title',
      content: '<p>Canonical body</p>',
      isPinned: true,
      primaryCollection: 'Source folder',
      secondaryCollections: ['Other'],
      collectionPinned: true,
      collectionUserOverride: true,
    } as SpaceNoteRow;
    expect(buildOptimisticAssociatedSpaceNote(source)).toMatchObject({
      title: 'Canonical title',
      content: '<p>Canonical body</p>',
      isPinned: false,
      primaryCollection: null,
      secondaryCollections: [],
      collectionPinned: false,
      collectionUserOverride: false,
      isOwnNote: true,
    });
  });

  it('removes in shared context but permanently deletes only from My Home', () => {
    expect(
      resolveInspectorNoteAction({
        sharedSpaceId: 'space_shared',
        isNoteAuthor: true,
        isSpaceOwner: false,
      }),
    ).toBe('remove-from-space');
    expect(
      resolveInspectorNoteAction({
        sharedSpaceId: 'space_shared',
        isNoteAuthor: false,
        isSpaceOwner: true,
      }),
    ).toBe('remove-from-space');
    expect(
      resolveInspectorNoteAction({
        sharedSpaceId: 'space_shared',
        isNoteAuthor: false,
        isSpaceOwner: false,
      }),
    ).toBeNull();
    expect(
      resolveInspectorNoteAction({
        sharedSpaceId: null,
        isNoteAuthor: true,
        isSpaceOwner: false,
      }),
    ).toBe('delete-everywhere');
    // Assert the meaning these dialogs must convey, not their exact wording — the copy
    // was rewritten out of data-model vocabulary ("canonical note", "responses are
    // archived") into something a reader can act on.
    expect(REMOVE_NOTE_FROM_SPACE_CONFIRMATION.description).toMatch(/keep it in My Home/i);
    expect(REMOVE_NOTE_FROM_SPACE_CONFIRMATION.description).toMatch(/replies .*(kept|come back)/i);
    expect(DELETE_CANONICAL_NOTE_CONFIRMATION.description).toMatch(/every space/i);
    expect(DELETE_NOTE_EVERYWHERE_MENU_CONFIRMATION.description).toMatch(/can.t be undone/i);
  });

  it('never offers remove-from-space for a note read from My Home', () => {
    // Regression: a note shared into a space, opened from the My Home list, offered
    // "Remove from this space" with no space in view — because the context fell back to
    // the note's own spaceId. Home is the source of truth; the action there is delete.
    const home = 'space_home';
    const fromHome = resolveInspectorSharedActionSpaceId({
      contextSpaceId: undefined,
      personalHomeSpaceId: home,
      // `foreignSharedSpaceId` resolves to the note's own space even for own notes,
      // so the foreign gate is what keeps it out of a Home read.
      isForeignSharedNote: false,
      foreignSharedSpaceId: 'space_A',
    });
    expect(fromHome).toBeNull();
    expect(
      resolveInspectorNoteAction({ sharedSpaceId: fromHome, isNoteAuthor: true, isSpaceOwner: false }),
    ).toBe('delete-everywhere');

    // `?space=<My Home>` is still a Home read.
    expect(
      resolveInspectorSharedActionSpaceId({
        contextSpaceId: home,
        personalHomeSpaceId: home,
        isForeignSharedNote: false,
        foreignSharedSpaceId: null,
      }),
    ).toBeNull();
    // Bare and prefixed ids are the same space.
    expect(
      resolveInspectorSharedActionSpaceId({
        contextSpaceId: 'home',
        personalHomeSpaceId: home,
        isForeignSharedNote: false,
        foreignSharedSpaceId: null,
      }),
    ).toBeNull();
  });

  it('still offers remove when the note is genuinely read inside a shared space', () => {
    const inSpace = resolveInspectorSharedActionSpaceId({
      contextSpaceId: 'space_A',
      personalHomeSpaceId: 'space_home',
      isForeignSharedNote: false,
      foreignSharedSpaceId: null,
    });
    expect(inSpace).toBe('space_A');
    expect(
      resolveInspectorNoteAction({ sharedSpaceId: inSpace, isNoteAuthor: true, isSpaceOwner: false }),
    ).toBe('remove-from-space');

    // A foreign note has no My Home copy, so its space is the only context there is.
    expect(
      resolveInspectorSharedActionSpaceId({
        contextSpaceId: undefined,
        personalHomeSpaceId: 'space_home',
        isForeignSharedNote: true,
        foreignSharedSpaceId: 'space_B',
      }),
    ).toBe('space_B');
  });

  it('keeps destructive copy to one sentence plus the reversibility clause', () => {
    // The complaint these replaced: too much text, too technical.
    for (const copy of [
      REMOVE_NOTE_FROM_SPACE_CONFIRMATION,
      DELETE_CANONICAL_NOTE_CONFIRMATION,
      REMOVE_NOTE_FROM_SPACE_MENU_CONFIRMATION,
      DELETE_NOTE_EVERYWHERE_MENU_CONFIRMATION,
    ]) {
      expect(copy.description.length).toBeLessThanOrEqual(120);
      expect(copy.description).not.toMatch(/canonical|association|archived/i);
    }
  });
});

describe('shared panel retry and destination contracts', () => {
  it('keeps note query failures in place with distinct retryable states', () => {
    expect(
      resolvePrototypeNoteLoadState({
        isDraft: false,
        isLoading: false,
        hasNote: false,
        error: new APIError(503, 'offline'),
        keepEditor: false,
      }),
    ).toBe('error');
    expect(
      resolvePrototypeNoteLoadState({
        isDraft: false,
        isLoading: false,
        hasNote: false,
        error: new APIError(404, 'missing'),
        keepEditor: false,
      }),
    ).toBe('not-found');
  });

  it('distinguishes people errors from a valid empty list', () => {
    expect(resolvePeopleQueryState({ isLoading: false, isError: true, count: 0 })).toBe('error');
    expect(resolvePeopleQueryState({ isLoading: false, isError: false, count: 0 })).toBe('empty');
  });

  it('keeps a persistent draft destination for shared and Home compose', () => {
    expect(
      draftSaveDestinationLabel({
        targetSpaceId: 'space_shared',
        homeSpaceId: 'space_home',
        targetSpaceTitle: 'Romans Group',
      }),
    ).toBe('Saving to Romans Group');
    expect(
      draftSaveDestinationLabel({
        targetSpaceId: 'space_home',
        homeSpaceId: 'space_home',
        targetSpaceTitle: 'Ignored',
      }),
    ).toBe('Saving to My Home');
  });

  it('names the resolved Thread in the draft destination once one is attached', () => {
    expect(
      draftSaveDestinationLabel({
        targetSpaceId: 'space_shared',
        homeSpaceId: 'space_home',
        targetSpaceTitle: 'Romans Group',
        threadTitle: 'Life together in Romans 12',
      }),
    ).toBe('Saving to Life together in Romans 12 in Romans Group');
    expect(
      draftSaveDestinationLabel({
        targetSpaceId: 'space_shared',
        homeSpaceId: 'space_home',
        targetSpaceTitle: 'Romans Group',
        threadTitle: null,
      }),
    ).toBe('Saving to Romans Group');
  });

  it('explains leave and removal consequences without implying note deletion', () => {
    const leave = membershipRemovalConfirmationCopy({
      userId: 'me',
      displayName: 'Me',
      isSelf: true,
    });
    const remove = membershipRemovalConfirmationCopy({
      userId: 'member',
      displayName: 'Sarah',
      isSelf: false,
    });
    expect(leave.title).toContain('Leave this space?');
    expect(leave.description).toContain('Your notes stay in My Home');
    expect(remove.title).toContain('Remove Sarah?');
    expect(remove.description).toContain('Their notes stay in My Home');
  });
});

describe('shared Add Notes request planning', () => {
  it('organizes an active owned note without re-associating it', () => {
    expect(
      planSharedAddNotesRequest({
        isAlreadyAssociated: true,
        isOwnNote: true,
        isSpaceOwner: false,
      }),
    ).toBe('organize-associated');
  });

  it('lets only the actual owner organize an active foreign note', () => {
    expect(
      planSharedAddNotesRequest({
        isAlreadyAssociated: true,
        isOwnNote: false,
        isSpaceOwner: false,
      }),
    ).toBe('forbidden');
    expect(
      planSharedAddNotesRequest({
        isAlreadyAssociated: true,
        isOwnNote: false,
        isSpaceOwner: true,
      }),
    ).toBe('organize-associated');
  });

  it('associates an owned candidate and requires explicit copy for a foreign candidate', () => {
    expect(
      planSharedAddNotesRequest({
        isAlreadyAssociated: false,
        isOwnNote: true,
        isSpaceOwner: false,
      }),
    ).toBe('associate-then-organize');
    expect(
      planSharedAddNotesRequest({
        isAlreadyAssociated: false,
        isOwnNote: false,
        isSpaceOwner: true,
      }),
    ).toBe('save-copy-required');
  });

  it('resolves My Home picker candidates into organize rows', () => {
    const candidate = {
      id: 'note_home',
      title: 'From Home',
      noteType: 'default',
      updatedAt: '2026-07-28T12:00:00.000Z',
      createdAt: '2026-07-28T12:00:00.000Z',
      content: '<p>Body</p>',
      isOwnNote: true,
      isAssociatedWithTarget: false,
    };
    expect(candidateToSpaceNoteRow(candidate)).toMatchObject({
      id: 'note_home',
      title: 'From Home',
      isOwnNote: true,
      primaryCollection: null,
      secondaryCollections: [],
    });
    expect(resolveSelectedNoteRows(['note_home'], new Map(), [], [candidate])).toEqual([
      candidateToSpaceNoteRow(candidate),
    ]);
  });

  it('splits picker candidates into This space vs My Home chips', () => {
    const notes = [
      {
        id: 'in-space',
        title: 'In space',
        noteType: 'default',
        updatedAt: null,
        createdAt: null,
        content: null,
        isOwnNote: true,
        isAssociatedWithTarget: true,
      },
      {
        id: 'home-only',
        title: 'Home only',
        noteType: 'default',
        updatedAt: null,
        createdAt: null,
        content: null,
        isOwnNote: true,
        isAssociatedWithTarget: false,
      },
      {
        id: 'foreign-space',
        title: 'Foreign',
        noteType: 'default',
        updatedAt: null,
        createdAt: null,
        content: null,
        isOwnNote: false,
        isAssociatedWithTarget: true,
      },
    ];
    expect(filterCandidatesByOriginScope(notes, 'this-space').map((n) => n.id)).toEqual([
      'in-space',
      'foreign-space',
    ]);
    expect(filterCandidatesByOriginScope(notes, 'my-home').map((n) => n.id)).toEqual(['home-only']);
    expect(
      filterCandidatesByOriginScope(notes, 'this-space', { ownNotesOnly: true }).map((n) => n.id),
    ).toEqual(['in-space']);
  });

  it('fuzzy-matches Add notes candidates by title, body, and tags', () => {
    const note = {
      id: 'n1',
      title: 'Joy in Christ',
      noteType: 'default',
      updatedAt: null,
      createdAt: null,
      content: '<p>Steadfast hope in suffering</p>',
      tagNames: ['perseverance', 'romans'],
    };
    expect(noteMatchesPickerSearch(note, 'joy')).toBe(true);
    expect(noteMatchesPickerSearch(note, 'steadfst')).toBe(true);
    expect(noteMatchesPickerSearch(note, 'persever')).toBe(true);
    expect(noteMatchesPickerSearch(note, 'zzzz-nope')).toBe(false);
  });
});

describe('shared permission and Thread picker policies', () => {
  it('allows organization for note authors and actual owners only', () => {
    expect(canOrganizeSharedSpaceNote({ isOwnNote: true, isSpaceOwner: false })).toBe(true);
    expect(canOrganizeSharedSpaceNote({ isOwnNote: false, isSpaceOwner: true })).toBe(true);
    expect(canOrganizeSharedSpaceNote({ isOwnNote: false, isSpaceOwner: false })).toBe(false);
  });

  it('keeps shared pin controls owner-only', () => {
    expect(canPinSharedSpaceItem({ isSpaceOwner: true })).toBe(true);
    expect(canPinSharedSpaceItem({ isSpaceOwner: false })).toBe(false);
  });

  it('never lets the active space alone create a context the note has no association with', () => {
    // Regression: switching the switcher used to re-context an open My Home note,
    // which hid Share (shared contexts set canShare false) and offered a
    // "Remove from this space" that 404'd.
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'space_A',
        noteSharedSpaceIds: [],
        homeSpaceId: 'space_home',
      }),
    ).toBeNull();
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'space_A',
        noteSharedSpaceIds: ['space_B'],
        homeSpaceId: 'space_home',
      }),
    ).toBeNull();
  });

  it('fails closed until the note’s associations have loaded', () => {
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'space_A',
        noteSharedSpaceIds: undefined,
        homeSpaceId: 'space_home',
      }),
    ).toBeNull();
  });

  it('reads an unresolved home space as personal, not as a shared context', () => {
    /*
     * Regression: home is resolved from navigation, which lands after first paint. While it
     * was null, `active === home` could not be true, so a My Home note was reported as
     * shared — capabilities failed closed and the folder chip and Share button vanished for
     * as long as nav took. Foreign shared notes are caught by `readOnlyForeignNote`, which
     * Share is gated on separately, so reading toward personal here cannot leak Share.
     */
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'space_home',
        noteSharedSpaceIds: ['space_home'],
        homeSpaceId: null,
      }),
    ).toBeNull();
    // And once nav lands, a genuinely shared context is still recognised.
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'space_A',
        noteSharedSpaceIds: ['space_A'],
        homeSpaceId: 'space_home',
      }),
    ).toBe('space_A');
  });

  it('matches bare active ids against prefixed association ids', () => {
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'A',
        noteSharedSpaceIds: ['space_A'],
        homeSpaceId: 'space_home',
      }),
    ).toBe('space_A');
  });

  it('restores full Home capabilities when there is no shared context', () => {
    expect(
      resolveNativeToolbarContextCapabilities({
        hasSharedContext: false,
        contextualAccessKnown: true,
        isOwnNote: true,
        isSpaceOwner: false,
      }),
    ).toEqual({ canOrganize: true, canPin: true, canRemove: false, canShare: true });
  });

  it('withholds sharing and pinning from a guest', () => {
    /*
     * A guest's note lives in their browser and nowhere else, so there is no link to hand
     * out. Pinning was left on here on the reasoning that it is still coherent for a local
     * note — but it is not local: the item fired `PATCH` at a row the server has never seen
     * and answered "Could not update pin", and there is no on-device pin to stand in for it.
     * Organizing stays, because a folder is written into the note itself.
     */
    expect(
      resolveNativeToolbarContextCapabilities({
        hasSharedContext: false,
        contextualAccessKnown: true,
        isOwnNote: true,
        isSpaceOwner: false,
        isGuest: true,
      }),
    ).toEqual({ canOrganize: true, canPin: false, canRemove: false, canShare: false });
  });

  it('uses explicit-context membership instead of active-shell ownership', () => {
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'space_B',
        noteSharedSpaceIds: ['space_B'],
        homeSpaceId: 'space_home',
      }),
    ).toBe('space_B');
    expect(
      resolveNativeToolbarContextCapabilities({
        hasSharedContext: true,
        contextualAccessKnown: true,
        isOwnNote: false,
        isSpaceOwner: false,
      }),
    ).toEqual({
      canOrganize: false,
      canPin: false,
      canRemove: false,
      canShare: false,
    });
  });

  it('fails closed for an unknown contextual role and keeps Home non-contextual', () => {
    expect(
      resolveNativeToolbarSharedContextId({
        activeSpaceId: 'space_home',
        noteSharedSpaceIds: ['space_A'],
        homeSpaceId: 'space_home',
      }),
    ).toBeNull();
    expect(
      resolveNativeToolbarContextCapabilities({
        hasSharedContext: true,
        contextualAccessKnown: false,
        isOwnNote: true,
        isSpaceOwner: true,
      }),
    ).toEqual({
      canOrganize: false,
      canPin: false,
      canRemove: false,
      canShare: false,
    });
    expect(
      resolveNativeToolbarContextCapabilities({
        hasSharedContext: false,
        contextualAccessKnown: false,
        isOwnNote: true,
        isSpaceOwner: false,
      }),
    ).toEqual({
      canOrganize: true,
      canPin: true,
      canRemove: false,
      canShare: true,
    });
  });

  it('clears a stored Thread absent from settled target options', () => {
    expect(validComposeThreadSelection('thread_old', [{ id: 'thread_new', isPinned: true }], false)).toBeNull();
    expect(validComposeThreadSelection('thread_new', [{ id: 'thread_new', isPinned: true }], false)).toBe(
      'thread_new',
    );
    expect(validComposeThreadSelection('thread_old', [], true)).toBe('thread_old');
  });
});

describe('public-share context and acknowledgment', () => {
  it('hides public sharing in shared scope but not the My Home overlay', () => {
    expect(
      isVisiblePrototypeSharedContext({
        visibleTargetSpaceId: 'space_shared',
        homeSpaceId: 'space_home',
      }),
    ).toBe(true);
    expect(
      isVisiblePrototypeSharedContext({
        visibleTargetSpaceId: 'space_home',
        homeSpaceId: 'space_home',
      }),
    ).toBe(false);
    expect(
      isVisiblePrototypeSharedContext({
        explicitContextSpaceId: 'space_shared',
        visibleTargetSpaceId: 'space_home',
        homeSpaceId: 'space_home',
      }),
    ).toBe(true);
  });

  it('retries enable with explicit shared-context acknowledgment', () => {
    expect(
      buildShareNoteRequest({
        noteId: 'note_1',
        action: 'enable',
        acknowledgeSharedContext: true,
      }),
    ).toEqual({
      url: '/api/notes/note_1/share',
      body: { action: 'enable', acknowledgeSharedContext: true },
    });
  });
});

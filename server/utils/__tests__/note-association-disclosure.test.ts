/**
 * Who is told where else a note lives.
 *
 * The rule is a disclosure decision, not a display one, so it is pinned here rather than
 * left to a ternary in the note-detail response. The regression it guards runs both ways:
 * loosen it and a member reading in one space learns the author's other audiences; tighten
 * it and the author's own destination row goes blank inside a shared space.
 */
import { describe, expect, it } from 'vitest';
import { shouldCollapseAssociationsToReadContext } from '../space-access';

const AUTHOR = 'user_author';
const MEMBER = 'user_member';

describe('shouldCollapseAssociationsToReadContext', () => {
  it('hides the author’s other audiences from another member reading in a space', () => {
    expect(
      shouldCollapseAssociationsToReadContext({
        isSharedReadContext: true,
        noteAuthorUserId: AUTHOR,
        viewerUserId: MEMBER,
      }),
    ).toBe(true);
  });

  it('reports every association to the author, even inside a shared space', () => {
    // The destination row above the editor renders from this list; collapsing it here is
    // what made "where does this note live?" unanswerable from inside a shared space.
    expect(
      shouldCollapseAssociationsToReadContext({
        isSharedReadContext: true,
        noteAuthorUserId: AUTHOR,
        viewerUserId: AUTHOR,
      }),
    ).toBe(false);
  });

  it('never collapses a My Home read, for anyone', () => {
    for (const viewerUserId of [AUTHOR, MEMBER]) {
      expect(
        shouldCollapseAssociationsToReadContext({
          isSharedReadContext: false,
          noteAuthorUserId: AUTHOR,
          viewerUserId,
        }),
      ).toBe(false);
    }
  });
});

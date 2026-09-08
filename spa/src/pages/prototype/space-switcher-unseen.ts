/**
 * Which spaces have something new in them, and whether the switcher should say so.
 *
 * The rule was written inline on the row — "not the one you are in, and it has new notes" —
 * while the trigger's dot answered a different question entirely: whether *your own Home* had
 * unseen recall suggestions. So the toolbar could sit undotted while two spaces in the list
 * behind it each had a dot, which is the opposite of what a roll-up is for.
 *
 * One rule, two levels: the list says which, the trigger says whether any. Both read
 * `newNoteCount`, which `/api/navigation/data` already computes from the viewer's
 * `SpaceMemberships.lastVisitedAt` watermark — so "new" means new *to you*, not merely
 * recent, and it clears by visiting rather than by time passing.
 */
import type { NavSpace } from '../../hooks/queries/useNavigation';

/** Nav rows sometimes carry a bare id; the shell always holds the prefixed one. */
export function normalizeSwitcherSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

/**
 * The space you are currently in never carries a dot.
 *
 * Not a display quirk — you are looking at the thing, so "there is something here you have
 * not seen" is answered by the page itself. Dotting it would leave a mark that the only
 * available action, going there, cannot clear.
 */
export function spaceHasUnseenActivity(row: NavSpace, isActive: boolean): boolean {
  if (isActive) return false;
  return (row.newNoteCount ?? 0) > 0;
}

/** Whether any space in the list would carry a dot — the trigger's half of the same rule. */
export function anySpaceHasUnseenActivity(
  rows: readonly NavSpace[],
  isActive: (row: NavSpace) => boolean,
): boolean {
  return rows.some((row) => spaceHasUnseenActivity(row, isActive(row)));
}

/**
 * What the trigger's `aria-label` has to add, given what is actually new.
 *
 * The dot is `aria-hidden`, so its meaning only reaches anyone through here. Two sources can
 * raise it and they are not the same news — a suggestion is the app proposing something, a
 * space is a person having written something — so the label names which.
 */
export function unseenDotLabelSuffix(input: {
  suggestions: boolean;
  spaces: boolean;
}): string | null {
  if (input.suggestions && input.spaces) return 'new suggestions and activity';
  if (input.suggestions) return 'new suggestions';
  if (input.spaces) return 'new activity';
  return null;
}

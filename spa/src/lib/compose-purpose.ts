/**
 * What a note is *for*, when the person opened it to do a particular job.
 *
 * Almost every note is just a note, and this says nothing. But two flows arrive
 * at the same blank editor meaning something specific — writing into a week the
 * church has planned, and writing a note in order to make it a template — and
 * until now the editor could not tell them apart from a blank page. The
 * template case is the sharper one: "create a template" has never had an entry
 * point at all, because a template *is* a note you later save as one, and
 * nothing carried the intention across the gap.
 *
 * Purpose is a hint, not a mode. It changes one line of chrome, never what the
 * editor does, and it can always be dismissed — the note underneath is an
 * ordinary note and must keep behaving like one.
 */
/**
 * Only 'template' is client-declared. Service purpose is read off the note.
 *
 * Where it lives: on the shell's compose session (`composePurpose` in `proto-shell-context`),
 * stamped with the session's epoch. It used to be a sessionStorage key, and nothing consumed
 * it — saving the template did not, starting the next note did not — so once "New" had been
 * pressed in the Templates sheet, every note for the rest of the tab opened as a template.
 */
export type ComposePurpose = 'template';

/**
 * Per-note dismissal.
 *
 * localStorage rather than a column: dismissing a hint is not a fact about the
 * note that other people or other devices need, and a server round trip for it
 * would make the cheapest possible interaction the slowest. A draft has no id
 * yet; its dismissal is clearing the session purpose on the shell.
 */
function dismissKey(noteId: string) {
  return `harvous_purpose_dismissed:${noteId}`;
}

export function isPurposeDismissed(noteId: string | null | undefined): boolean {
  if (!noteId) return false;
  try {
    return localStorage.getItem(dismissKey(noteId)) === '1';
  } catch {
    return false;
  }
}

export function dismissPurpose(noteId: string | null | undefined) {
  if (!noteId) return;
  try {
    localStorage.setItem(dismissKey(noteId), '1');
  } catch {
    /* ignore */
  }
}

export type NotePurpose =
  | { kind: 'template'; label: string; actionLabel: string }
  | { kind: 'service'; label: string; actionLabel: null };

/**
 * The purpose register for one note, or null when there is nothing to say.
 *
 * Template beats service when somehow both are true: the service is where the
 * note *came from*, the template is what the author is currently trying to do,
 * and the more recent intention is the more useful one to show.
 */
export function notePurposeModel(input: {
  composePurpose: ComposePurpose | null;
  startedFromServiceTitle?: string | null;
  /**
   * The note's own space is a church space, not My Home — which is the difference
   * between the two surfaces that set a service title. "This Sunday" on Home creates
   * into My Home and is genuinely this week; "Coming up" creates into the room it
   * belongs to and is that room's *next* sermon, which can be weeks out.
   *
   * Derived rather than stored. A `startedFromServiceKind` column would be sturdier if
   * those surfaces ever stop differing this way, but it would also be null for every
   * note already written, so every existing note would keep the old copy. This reads
   * correctly for them too.
   */
  startedInChurchSpace?: boolean;
  /**
   * Whether the reader is looking at this note in the context it was started in.
   *
   * `startedFromServiceId/Title` is a permanent column that travels with the note, and nothing
   * clears it when the note is later filed into a study, copied to another space, or opened
   * from My Home. So a note that began as sermon notes used to announce that sermon inside
   * every room it ever joined — "adding notes to a shared space study creates this wrong header
   * context of relating to sermon". The provenance is still true; it is just not what this
   * reader is doing right now, and a register above the paper is about right now.
   *
   * Undefined means "not established" and is treated as in-context, so callers that don't know
   * behave exactly as before rather than silently losing the banner.
   */
  readingInStartedContext?: boolean;
  dismissed?: boolean;
}): NotePurpose | null {
  if (input.dismissed) return null;

  if (input.composePurpose === 'template') {
    return {
      kind: 'template',
      label: 'Creating a template',
      actionLabel: 'Save as template',
    };
  }

  /*
    Name the occasion, and only the occasion.

    Two things were redundant. The sermon's title, because `starterNoteTitle` derives the
    note's title from that same sermon — the banner sat directly above a heading saying
    the same words. And "Writing notes for", because writing notes is what this whole
    surface is; a register above the paper does not need to announce it.

    "Sermon" is the product's own word for both of these — `sermonEyebrow`,
    `ChurchSermon`, `starterFolderForSermon`. "Gathering" only ever appeared in a code
    docblock.
  */
  const service = input.startedFromServiceTitle?.trim();
  if (service && input.readingInStartedContext !== false) {
    return {
      kind: 'service',
      label: input.startedInChurchSpace ? 'The next sermon' : "This week's sermon",
      actionLabel: null,
    };
  }

  return null;
}

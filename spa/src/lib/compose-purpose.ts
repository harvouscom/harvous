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
const COMPOSE_PURPOSE_KEY = 'harvous_compose_purpose';

/** Only 'template' is client-declared. Service purpose is read off the note. */
export type ComposePurpose = 'template';

export function getComposePurpose(): ComposePurpose | null {
  try {
    return sessionStorage.getItem(COMPOSE_PURPOSE_KEY) === 'template' ? 'template' : null;
  } catch {
    return null;
  }
}

export function setComposePurpose(purpose: ComposePurpose | null) {
  try {
    if (purpose) sessionStorage.setItem(COMPOSE_PURPOSE_KEY, purpose);
    else sessionStorage.removeItem(COMPOSE_PURPOSE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Per-note dismissal.
 *
 * localStorage rather than a column: dismissing a hint is not a fact about the
 * note that other people or other devices need, and a server round trip for it
 * would make the cheapest possible interaction the slowest. A draft has no id
 * yet, so clearing the session purpose *is* its dismissal.
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
  if (!noteId) {
    setComposePurpose(null);
    return;
  }
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
   * into My Home; "Coming up" creates into the room it belongs to.
   *
   * Derived rather than stored. A `startedFromServiceKind` column would be sturdier if
   * those surfaces ever stop differing this way, but it would also be null for every
   * note already written, so every existing note would keep the old copy. This reads
   * correctly for them too.
   */
  startedInChurchSpace?: boolean;
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
    Name the occasion, not the sermon.

    The title was the sermon's own, and `starterNoteTitle` derives the note's title from
    that same sermon — so the banner sat directly above a heading saying the same words.
    It cost a line and told the reader nothing. What is actually worth saying is which
    occasion these notes are for.
  */
  const service = input.startedFromServiceTitle?.trim();
  if (service) {
    return {
      kind: 'service',
      label: input.startedInChurchSpace
        ? 'Writing notes for the next gathering'
        : "Writing notes for this week's sermon",
      actionLabel: null,
    };
  }

  return null;
}

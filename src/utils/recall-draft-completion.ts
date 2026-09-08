/**
 * Whether a suggested draft actually became something.
 *
 * ## The problem this exists to solve
 *
 * `RECALL_EVENT_ACTIONS` has five members and one of them, `complete`, had never been
 * recorded once in sixty days across every kind. The cause was wiring — only `connectNotes`
 * ever reported it — but the obvious repair is wrong in a way worth writing down.
 *
 * The obvious repair is "fire `complete` when the note is created". It fails because a
 * suggested draft is not born empty. `continueBook` seeds a title *and* a scripture pill;
 * `studyPerson` and `reflection` seed a title. `isEffectivelyEmptyPrototypeNote` returns
 * not-empty as soon as a title is present, so a seeded draft clears the save gate on its own.
 * Firing there would replace "never recorded" with "recorded every time the card was tapped",
 * and a metric that is always true is worse than one that is always false: the first looks
 * like an answer.
 *
 * So completion is a comparison, not a trigger. The card asked for something to be written;
 * `complete` means something was written that the card did not supply.
 *
 * ## Why the pill is stripped before comparing
 *
 * The seed's scripture pill is rewritten after the save — `processScriptureReferences`
 * re-renders that markup server-side, and it can gain a translation attribute or a
 * canonicalised reference that nobody typed. Comparing raw HTML would read that rewrite as
 * the reader's work. Stripping the pill node entirely, on both sides, leaves only prose.
 */

/** Pill spans carry the reference as their text, so the node goes rather than its tags. */
const SCRIPTURE_PILL = /<span[^>]*data-scripture-reference[^>]*>[\s\S]*?<\/span>/gi;

function proseOf(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(SCRIPTURE_PILL, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(title: string | null | undefined): string {
  return (title ?? '').replace(/\s+/g, ' ').trim();
}

export function draftWentBeyondItsSeed(input: {
  seedTitle?: string | null;
  seedContentHtml?: string | null;
  title: string | null | undefined;
  content: string | null | undefined;
}): boolean {
  const savedProse = proseOf(input.content);
  const seedProse = proseOf(input.seedContentHtml);

  /*
   * Any prose the seed did not carry counts, and the check is "differs" rather than "is
   * longer". Deleting the seed's own sentence and writing a shorter one is still writing.
   */
  if (savedProse !== seedProse) return true;

  /*
   * A title the reader changed counts on its own. Renaming "John 4" to "The woman at the
   * well" is the card's prompt being taken up, even if the body is still only the pill it
   * arrived with.
   */
  return titleOf(input.title) !== titleOf(input.seedTitle);
}

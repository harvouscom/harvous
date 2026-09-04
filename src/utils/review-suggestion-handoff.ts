/**
 * Where the line falls between a Suggestion and a Review.
 *
 * **If a right answer exists and the reader could be wrong, it is Review. If the outcome is
 * something new made or something organised, it is a Suggestion.** Reflection is neither — it
 * is an invitation, and it lives on Home.
 *
 * Two Home cards are memory exercises in disguise. `passage` ("a passage you keep returning
 * to") and `highlight` ("a highlight to revisit") both resurface a thing to be re-read, which
 * is Review's job once the reader has done enough with it for a question to be fair. They stay
 * on Home while the readiness gate has not passed — that is the point of them, and a passage
 * with one citation is nobody's memory problem yet — and they step aside for a source Review
 * has already taken up. Otherwise the same verse is a question upstairs and a nudge downstairs
 * in one screen, and the two surfaces argue about whose job it is.
 *
 * `referenceWord` stays put whatever Review is doing: a word you keep looking up is study, not
 * memory, and nothing in Review will ever ask about it.
 *
 * The two that stay say so in the eyebrow — "Worth reading again", "Worth a second look" — so
 * a Home card reads as an extension of study rather than a recall drill without a grader.
 */

/** Home kinds that defer to an active Review item on the same source. */
export const RECALL_KINDS_DEFERRING_TO_REVIEW = ['passage', 'highlight'] as const;

/**
 * A chapter you read is a Suggestion the day you read it and a Review once you have read it
 * enough to be asked about it.
 *
 * The card steps aside for an active **chapter** item on that chapter, and for nothing else —
 * not for a verse item inside it, which is where this differs from the two kinds above. A
 * question about John 3:16 and an invitation to write about John 3 are different acts: one asks
 * what you remember, the other asks what you saw. The two resurfacing kinds defer to a verse
 * because they are memory exercises wearing a suggestion's clothes; this one is not.
 */
export function activeReviewCoversChapter(
  chapterKey: string | null | undefined,
  activeChapterKeys: ReadonlySet<string>,
): boolean {
  const target = chapterKey?.trim();
  return Boolean(target) && activeChapterKeys.has(target!);
}

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * Is this passage or verse already being asked about?
 *
 * Exact match, plus containment either way, because the two surfaces name passages at
 * different grains: Home's passage card is often a chapter ("Psalms 62") while a Review item
 * is a verse inside it ("Psalms 62:5"), and a highlight can name a range. A chapter card is
 * redundant once any verse in it is a question, and a verse card is redundant when the whole
 * chapter is. Matching is textual on purpose — it stays in step with `reviewSourceKey`, which
 * is itself the trimmed, lowercased reference, and it needs no parser here.
 */
export function activeReviewCoversReference(
  reference: string | null | undefined,
  activeReferences: ReadonlySet<string>,
): boolean {
  const target = reference ? normalise(reference) : '';
  if (!target || activeReferences.size === 0) return false;
  for (const raw of activeReferences) {
    const active = normalise(raw);
    if (!active) continue;
    if (active === target) return true;
    // "Psalms 62" covers "Psalms 62:5", and the other way round. The separator matters: without
    // it "Psalms 6" would swallow "Psalms 62".
    if (active.startsWith(`${target}:`) || target.startsWith(`${active}:`)) return true;
  }
  return false;
}

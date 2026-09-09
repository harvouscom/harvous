export const REVIEW_COLLAPSED_ROWS = 2;

export const REVIEW_PASSAGE_KINDS = new Set<string>(['verse', 'highlight', 'chapter']);

export function reviewVariationKey(item: {
  kind: string;
  promptKey?: string | null;
  task?: string | null;
}): string {
  return `${item.kind}:${item.promptKey ?? item.task ?? ''}`;
}

/** Closed Activity: two rows, different halves when both exist, else two different exercises. */
export function collapsedReviewRows<T extends {
  id: string;
  kind: string;
  promptKey?: string | null;
  task?: string | null;
}>(items: readonly T[]): T[] {
  if (items.length <= REVIEW_COLLAPSED_ROWS) return [...items];
  const note = items.find((item) => !REVIEW_PASSAGE_KINDS.has(item.kind));
  const passage = items.find((item) => REVIEW_PASSAGE_KINDS.has(item.kind));
  if (note && passage) return [note, passage];
  const first = items[0];
  const second =
    items.find((item) => item.id !== first.id && reviewVariationKey(item) !== reviewVariationKey(first)) ??
    items[1];
  return [first, second];
}

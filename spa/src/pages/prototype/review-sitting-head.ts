/**
 * The two decisions behind the sitting card on Activity, kept apart from the component so they
 * can be tested without rendering a section.
 */

/**
 * The card's question: the session's first that is also on the shelf.
 *
 * Not simply the shelf's first. The session is built further than the inbox — questions that
 * cannot be built are dropped and some move to another rung — and a head the session lacks sends
 * the dock to its slow fallback with a prompt that may differ from the one shown. The session is
 * frozen for a sitting while the inbox is re-read after every answer, so the intersection is what
 * is both current and warm. A practice re-ask is never the card's question: it is the second look
 * at something just missed, not today's next.
 */
export function pickSittingHead<T extends { id: string; practice?: boolean }>(
  sessionItems: readonly T[] | null | undefined,
  inboxItems: readonly T[],
): T | null {
  const onShelf = new Set(inboxItems.map((item) => item.id));
  return (
    (sessionItems ?? []).find((item) => !item.practice && onShelf.has(item.id)) ??
    inboxItems[0] ??
    null
  );
}

/**
 * When the next sitting can start, once today's is finished.
 *
 * The earliest thing still scheduled, but never before local midnight: the day's budget is
 * spent, so the inbox stays empty until tomorrow whatever falls due this afternoon — "More later
 * today" would send someone back to an empty shelf. Null when nothing is scheduled at all.
 */
export function nextSittingAt(
  items: readonly { dueAt: string }[] | null | undefined,
  nowMs: number,
): string | null {
  const due = (items ?? []).map((item) => Date.parse(item.dueAt)).filter(Number.isFinite);
  if (due.length === 0) return null;
  const midnight = new Date(nowMs);
  midnight.setHours(24, 0, 0, 0);
  return new Date(Math.max(Math.min(...due), midnight.getTime())).toISOString();
}

/**
 * localStorage-backed recall cooldown / snooze for the prototype Home recall carousel. When the user
 * opens a recall opportunity OR snoozes it ("not now"), we record the calendar day so the same item
 * isn't resurfaced again for a while; `activeCooldownIds` then excludes it from the carousel until the
 * window passes. Space-scoped; all opportunity kinds share one store keyed by a stable opportunity id —
 * note/highlight ids or synthetic trend ids ('arc:grace', 'passage:John 3:16'), which don't collide.
 * Mirrors the safe-IO pattern in proto-pinned-stores.ts.
 */

const KEY_PREFIX = 'harvous.prototype.recallCooldown.';

/** Default window: don't resurface an opened recall item for three weeks. */
export const RECALL_COOLDOWN_DAYS = 21;

type CooldownMap = Record<string, number>;

function key(spaceId: string): string {
  return `${KEY_PREFIX}${spaceId}`;
}

function safeRead(spaceId: string): CooldownMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key(spaceId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CooldownMap = {};
    for (const [id, day] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof day === 'number' && Number.isFinite(day)) out[id] = day;
    }
    return out;
  } catch {
    return {};
  }
}

function safeWrite(spaceId: string, map: CooldownMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(spaceId), JSON.stringify(map));
  } catch {
    // quota / storage disabled — ignore
  }
}

/**
 * Record that a recall item was opened today. Prunes entries older than the
 * cooldown window so the store stays bounded.
 */
export function recordRecallOpened(
  spaceId: string | undefined | null,
  id: string,
  todayDayIndex: number,
  windowDays: number = RECALL_COOLDOWN_DAYS,
): void {
  if (!spaceId || !id) return;
  const map = safeRead(spaceId);
  map[id] = todayDayIndex;
  for (const [existingId, day] of Object.entries(map)) {
    if (todayDayIndex - day >= windowDays) delete map[existingId];
  }
  safeWrite(spaceId, map);
}

/**
 * Snooze a recall opportunity ("not now"): same store + window as opening one, so it rests before
 * resurfacing. Alias of {@link recordRecallOpened} for call-site clarity in the carousel.
 */
export function recordRecallSnoozed(
  spaceId: string | undefined | null,
  id: string,
  todayDayIndex: number,
  windowDays: number = RECALL_COOLDOWN_DAYS,
): void {
  recordRecallOpened(spaceId, id, todayDayIndex, windowDays);
}

/** Ids opened or snoozed within the cooldown window — excluded from recall picks. */
export function activeCooldownIds(
  spaceId: string | undefined | null,
  todayDayIndex: number,
  windowDays: number = RECALL_COOLDOWN_DAYS,
): Set<string> {
  const active = new Set<string>();
  if (!spaceId) return active;
  const map = safeRead(spaceId);
  for (const [id, day] of Object.entries(map)) {
    if (todayDayIndex - day < windowDays) active.add(id);
  }
  return active;
}

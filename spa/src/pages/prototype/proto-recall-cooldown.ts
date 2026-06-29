/**
 * localStorage-backed recall cooldown / snooze for the prototype Home recall carousel. When the user
 * explicitly snoozes a recall opportunity ("not now"), we record the calendar day so the same item
 * isn't resurfaced again for a while; `activeCooldownIds` then excludes it from the carousel until the
 * window passes. Opening/navigating a card does not rest it — only dismiss does. Space-scoped; all
 * opportunity kinds share one store keyed by a stable opportunity id — note/highlight ids or synthetic
 * trend ids ('arc:grace', 'passage:John 3:16'), which don't collide. Mirrors the safe-IO pattern in
 * proto-pinned-stores.ts.
 */

const KEY_PREFIX = 'harvous.prototype.recallCooldown.';

/** Default window: don't resurface a snoozed recall item for three weeks. */
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
 * Record a recall cooldown entry (used by snooze and future engagement hooks). Prunes entries older
 * than the cooldown window so the store stays bounded.
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
 * Snooze a recall opportunity ("not now") so it rests before resurfacing.
 * Alias of {@link recordRecallOpened} for call-site clarity in the carousel.
 */
export function recordRecallSnoozed(
  spaceId: string | undefined | null,
  id: string,
  todayDayIndex: number,
  windowDays: number = RECALL_COOLDOWN_DAYS,
): void {
  recordRecallOpened(spaceId, id, todayDayIndex, windowDays);
}

const SECTION_HISTORY_PREFIX = 'harvous.prototype.recallSections.';
const RECALL_SECTION_HISTORY_MAX = 8;

type SectionHistory = string[];

function sectionHistoryKey(spaceId: string): string {
  return `${SECTION_HISTORY_PREFIX}${spaceId}`;
}

function safeReadSectionHistory(spaceId: string): SectionHistory {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(sectionHistoryKey(spaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

function safeWriteSectionHistory(spaceId: string, history: SectionHistory): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(sectionHistoryKey(spaceId), JSON.stringify(history));
  } catch {
    // quota / storage disabled — ignore
  }
}

/** Record a canon section when the user opens a recall opportunity tied to that section. */
export function recordRecallSectionEngaged(
  spaceId: string | undefined | null,
  sectionId: string | undefined | null,
  maxEntries: number = RECALL_SECTION_HISTORY_MAX,
): void {
  if (!spaceId || !sectionId) return;
  const history = safeReadSectionHistory(spaceId);
  history.push(sectionId);
  const trimmed = history.slice(-Math.max(1, maxEntries));
  safeWriteSectionHistory(spaceId, trimmed);
}

/** Count of each canon section in recent recall opens (for diversity nudge). */
export function recentRecallSectionCounts(
  spaceId: string | undefined | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!spaceId) return out;
  for (const sectionId of safeReadSectionHistory(spaceId)) {
    out[sectionId] = (out[sectionId] ?? 0) + 1;
  }
  return out;
}

/** Ids snoozed within the cooldown window — excluded from recall picks. */
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

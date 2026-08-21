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

/**
 * Window after *acting* on a card. Shorter than an explicit dismissal: taking the
 * suggestion means it was useful, not that it was unwanted — but it shouldn't be the same
 * suggestion again tomorrow. Acting used to record nothing at all, which is why a
 * recommendation you had already followed (or followed and changed your mind about) came
 * straight back.
 */
export const RECALL_OPENED_COOLDOWN_DAYS = 7;

/**
 * Window after *finishing* what a card asked for.
 *
 * Longer than merely acting on it, and for a different reason than snoozing. A snooze says
 * "not this"; a completion says "done" — the thread exists, the note is written — so offering
 * it again is not badly timed, it is asking for something that already happened. Short of the
 * full dismissal window because the underlying material can move on: a passage you wrote about
 * this month is fair to raise again next month.
 */
export const RECALL_COMPLETED_COOLDOWN_DAYS = 30;

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

/**
 * Put a suggestion back on the shelf — "nevermind, I didn't mean to take that one".
 *
 * Undoing a rest is not the same shape as recording one. The local map can simply drop the
 * id, but the server has already written an `open` row and
 * {@link mergeServerRecallHistoryIntoCooldowns} unions those back in, so a delete alone
 * would last until the next render. So a restore also leaves a mark of its own: the moment
 * it happened. Any server row *older* than that mark is the thing being undone and stops
 * counting; a later open or snooze is a new decision and still does.
 *
 * Local only, by design — this module touches nothing but localStorage so it stays testable
 * without a server. The cross-device half is a `restored` event the caller posts alongside
 * this, and it is not optional for a permanent dismissal: a snooze made on a phone heals
 * itself in three weeks, but "not interested" never does, so an undo that only worked on the
 * device that made the mistake would not be an undo at all.
 */
export function restoreRecallOpportunity(
  spaceId: string | undefined | null,
  id: string,
  nowMs: number = Date.now(),
): void {
  if (!spaceId || !id) return;
  const map = safeRead(spaceId);
  if (id in map) {
    delete map[id];
    safeWrite(spaceId, map);
  }
  // A permanent dismissal is the one this most has to reach: a snooze heals itself in three
  // weeks, so an undo that missed it would still come right. This one never would.
  const dismissed = safeReadDismissed(spaceId);
  if (id in dismissed) {
    delete dismissed[id];
    safeWriteDismissed(spaceId, dismissed);
  }
  const restored = safeReadRestored(spaceId);
  restored[id] = nowMs;
  const cutoff = nowMs - RECALL_COOLDOWN_DAYS * DAY_MS;
  for (const [existingId, at] of Object.entries(restored)) {
    if (at < cutoff) delete restored[existingId];
  }
  safeWriteRestored(spaceId, restored);
  notifyRecallCooldownChanged();
}

/** When each id was last put back, in epoch ms. */
export function recallRestoredAt(spaceId: string | undefined | null): Record<string, number> {
  if (!spaceId) return {};
  return safeReadRestored(spaceId);
}

/**
 * Permanently dismissed ids — "not interested", which is the one answer with no window.
 *
 * Its own store rather than a very long entry in the cooldown map above, for two reasons the
 * map cannot accommodate: that map is pruned by window on every write (a permanent entry would
 * delete itself), and `activeCooldownIds` decides membership by comparing day indices, which
 * has no way to express "forever". The value here is the epoch ms of the dismissal, kept so a
 * later restore can be compared against it the same way server rows are.
 *
 * Bounded by count, not by age — see RECALL_PERMANENT_MAX_LOCAL.
 */
const DISMISSED_PREFIX = 'harvous.prototype.recallDismissed.';

/**
 * Local dismissals are capped so one device's storage cannot grow without limit, and the cap
 * is generous because overflowing it un-dismisses something. The server keeps its own, larger
 * copy (`RECALL_PERMANENT_MAX_ROWS`), so an overflow here is recovered on the next history
 * fetch rather than lost — this store is the offline half, not the record.
 */
const RECALL_PERMANENT_MAX_LOCAL = 500;

function safeReadDismissed(spaceId: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`${DISMISSED_PREFIX}${spaceId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

function safeWriteDismissed(spaceId: string, map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${DISMISSED_PREFIX}${spaceId}`, JSON.stringify(map));
  } catch {
    // quota / storage disabled — ignore
  }
}

/**
 * "Not interested" — stop offering this, with no expiry.
 *
 * Distinct from {@link recordRecallSnoozed} in effect and not only in wording. The control
 * that used to say "Don't suggest this again" posted a plain snooze, so the promise it made
 * had never once been kept; this is the call that keeps it.
 */
export function recordRecallDismissed(
  spaceId: string | undefined | null,
  id: string,
  nowMs: number = Date.now(),
): void {
  if (!spaceId || !id) return;
  const map = safeReadDismissed(spaceId);
  map[id] = nowMs;
  const entries = Object.entries(map);
  if (entries.length > RECALL_PERMANENT_MAX_LOCAL) {
    // Newest kept. An overflow drops the oldest dismissals, which are the likeliest to have
    // gone stale and the ones the server is most able to restore from its own copy.
    entries.sort((a, b) => b[1] - a[1]);
    safeWriteDismissed(spaceId, Object.fromEntries(entries.slice(0, RECALL_PERMANENT_MAX_LOCAL)));
    return;
  }
  safeWriteDismissed(spaceId, map);
}

/** Ids this device has been told never to offer again. */
export function dismissedRecallIds(spaceId: string | undefined | null): Set<string> {
  if (!spaceId) return new Set();
  return new Set(Object.keys(safeReadDismissed(spaceId)));
}

const RESTORED_PREFIX = 'harvous.prototype.recallRestored.';
const DAY_MS = 24 * 60 * 60 * 1000;

function safeReadRestored(spaceId: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`${RESTORED_PREFIX}${spaceId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

function safeWriteRestored(spaceId: string, map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${RESTORED_PREFIX}${spaceId}`, JSON.stringify(map));
  } catch {
    // quota / storage disabled — ignore
  }
}

/**
 * The store is written from two places now — the shelf's own ✕, and the breadcrumb edge over
 * whatever a suggestion opened, which lives in the shell and not in Home's tree at all. The
 * shelf re-reads on this event rather than on a tick it owns, because it cannot see the
 * other caller.
 */
const COOLDOWN_CHANGED_EVENT = 'harvous:recall-cooldown-changed';

export function notifyRecallCooldownChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COOLDOWN_CHANGED_EVENT));
}

export function subscribeRecallCooldownChanged(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(COOLDOWN_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(COOLDOWN_CHANGED_EVENT, onChange);
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

export type ServerRecallHistoryEntry = {
  opportunityId: string;
  action: 'open' | 'snooze' | 'complete' | 'dismissed' | 'restored';
  createdAt: string;
};

/**
 * Union of this device's cooldowns with the server's cross-device history.
 *
 * The localStorage store is per-device, so a card dismissed on a phone still appeared on
 * a desktop. The server has always written these rows; nothing read them back for
 * suppression. Merging (rather than replacing) keeps suppression working offline, where
 * the server list is simply empty.
 */
export function mergeServerRecallHistoryIntoCooldowns(
  localIds: Set<string>,
  serverEvents: ServerRecallHistoryEntry[] | undefined,
  now: Date,
  windows: { open: number; snooze: number; complete: number } = {
    open: RECALL_OPENED_COOLDOWN_DAYS,
    snooze: RECALL_COOLDOWN_DAYS,
    complete: RECALL_COMPLETED_COOLDOWN_DAYS,
  },
  /** See {@link restoreRecallOpportunity} — ids put back on this device, and when. */
  restoredAt: Record<string, number> = {},
): Set<string> {
  const merged = new Set(localIds);
  const nowMs = now.getTime();

  /*
   * One restore mark per id, taking whichever is later: this device's, or a `restored` row
   * from another device.
   *
   * Built in a first pass rather than checked inline, because the events arrive in no
   * particular order and a restore has to be able to cancel a row that appears before it in
   * the list. Reading them in one pass would let a dismissal listed first win over the undo
   * that came after it.
   */
  const restoreMark: Record<string, number> = { ...restoredAt };
  for (const event of serverEvents ?? []) {
    if (event?.action !== 'restored' || !event.opportunityId) continue;
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at)) continue;
    const existing = restoreMark[event.opportunityId];
    if (existing == null || at > existing) restoreMark[event.opportunityId] = at;
  }

  for (const event of serverEvents ?? []) {
    if (!event?.opportunityId) continue;
    if (event.action === 'restored') continue;
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at)) continue;
    // Undone. The row this event recorded was put back by hand afterwards, so it no longer
    // says anything about whether the suggestion should show.
    const restored = restoreMark[event.opportunityId];
    if (restored != null && at <= restored) continue;
    /*
     * The one action with no window. Everything else asks "how long ago?"; this one only
     * asks whether it happened, because the reader said never rather than not yet. Checked
     * before the age arithmetic so no window can be accidentally applied to it.
     */
    if (event.action === 'dismissed') {
      if (at <= nowMs) merged.add(event.opportunityId);
      continue;
    }
    const windowDays =
      event.action === 'complete'
        ? windows.complete
        : event.action === 'open'
          ? windows.open
          : windows.snooze;
    const ageDays = (nowMs - at) / (24 * 60 * 60 * 1000);
    if (ageDays >= 0 && ageDays < windowDays) merged.add(event.opportunityId);
  }
  return merged;
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

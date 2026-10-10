/**
 * Feature callouts — the small card that says "this is new" once, and then gets out of the way.
 *
 * Each callout is defined here, beside the code it announces, and ships with that release.
 * They are not authored in admin: a callout is a promise about what the app does, so it should
 * change in the same commit as the thing it points at, and its illustration is code anyway.
 *
 * The rules that keep this from becoming a stream of interruptions live in `pickCallout`, not at
 * the mount sites:
 * 1. **One at a time.** Never two cards, never a queue on screen.
 * 2. **Never twice.** Seen is recorded on the account (`OnboardingState.calloutsSeen`), so a card
 *    put away on the laptop does not come back on the phone.
 * 3. **Not back to back.** After one is put away, nothing for a day — a second card appearing
 *    the moment the first goes reads as a queue, which is rule 1 by another name.
 * 4. **Only for the right people.** Guests see none unless a callout says so; Plus-only features
 *    are announced only to Plus.
 * 5. **Only to people it is news to.** A change is only a change for an account that had the app
 *    before it shipped (`shippedAt`). Someone who signed up after it never saw the old way, and
 *    gets onboarding instead.
 * 6. **Newest wins.** Coming back after a month away does not mean a card a day for a week:
 *    when several are due, the newest shows and the older ones are retired unseen — What's new
 *    and the release notes already cover them.
 * 7. **News goes stale.** Every callout leaves the shelf six weeks after it ships unless it says
 *    otherwise (`until`).
 * 8. **Not before its date.** A callout whose `shippedAt` is still ahead waits for it, so one can
 *    be merged early and scheduled — the Family card is dated a week after launch on purpose.
 *
 * ## What earns a callout
 *
 * Something a person already does has changed, or there is a new thing they can do. Fixes and
 * polish go in the release notes and nowhere else. If a release has a callout, its What's new
 * card steps aside (`releaseHasCallout`), so one release is one card, not two.
 *
 * A callout can also say when it is *due* by other means (`dueWhen`) — the legal notice is due
 * whenever the account's acknowledged policy version is older than the current one, which no
 * "seen" flag can express.
 */
import type { CalloutIllustrationKey } from './CalloutIllustration';

export interface CalloutContext {
  isGuest: boolean;
  isPlus: boolean;
  /** The running build, from `appVersion()`; undefined outside a bundle. */
  appVersion: string | undefined;
  now: number;
  /**
   * When the account was created, as ms. Undefined for a guest, who has no account yet and is
   * treated as new to everything.
   */
  accountCreatedAt: number | undefined;
}

export interface CalloutActionContext {
  /** Go to Home and bring the Today band's tabs into view. */
  openHomeTabs: () => void;
  /** Open an in-app settings page (`settings/family`), in this tab. `href` is for the web. */
  openSettings: (path: string) => void;
}

export type CalloutAction =
  | { label: string; run: (ctx: CalloutActionContext) => void }
  | { label: string; href: string };

export interface Callout {
  /** Stable forever — it is the key in the account's seen record. */
  id: string;
  title: string;
  body: string;
  illustration: CalloutIllustrationKey;
  action: CalloutAction;
  /**
   * ISO date the change reached people. Required for every entry in `CALLOUTS` (a test holds
   * it): it decides who it is news to, which is newest, and when it goes stale. Only a callout
   * due by its own rule (the legal notice) goes without.
   */
  shippedAt?: string;
  /** Shown from this release on (major.minor.patch). */
  minVersion?: string;
  /** ISO date; never shown after. Defaults to `shippedAt` plus `CALLOUT_SHELF_MS`. */
  until?: string;
  audience?: 'all' | 'members' | 'plus';
  /** Higher first. Legal outranks features. */
  priority?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after putting one away before another may appear. */
export const CALLOUT_QUIET_MS = DAY_MS;

/** How long a callout stays news when it does not set its own `until`. */
export const CALLOUT_SHELF_MS = 42 * DAY_MS;

/**
 * How long a callout speaks for its release: inside this window the release's What's new card
 * stays away, because the callout already said what changed.
 */
export const CALLOUT_FOLD_MS = 14 * DAY_MS;

/**
 * The time recorded for a callout retired unseen because a newer one superseded it. Far in the
 * past so it can never start the quiet period (`lastSeenAt` takes the latest time), and the
 * account merge keeps the earliest time, so a real "seen" never overwrites it — either way the
 * callout is done.
 */
export const CALLOUT_RETIRED_AT = '1970-01-01T00:00:00.000Z';

export const CALLOUTS: readonly Callout[] = [
  {
    id: 'today-tabs-2026-10',
    title: 'Today, tidied',
    body: 'Pick up, Review and Suggestions now sit in tabs under today’s passage.',
    illustration: 'today-tabs',
    action: { label: 'Show me', run: (ctx) => ctx.openHomeTabs() },
    shippedAt: '2026-10-08',
    audience: 'members',
  },
  {
    /* Family launched Oct 9 (#248). Dated a week later on purpose, so "Today, tidied" gets its
       week before newest-wins retires it — and so it reaches anyone signed up by the 16th. */
    id: 'family-2026-10',
    title: 'Study together as a family',
    body: 'Share a Family Space at home. With Plus, it covers up to 5 more people, and parents see progress, never notes.',
    illustration: 'family',
    action: { label: 'Take a look', run: (ctx) => ctx.openSettings('settings/family') },
    shippedAt: '2026-10-16',
    audience: 'members',
  },
];

/** -1, 0 or 1, comparing dotted numeric versions ("3.18.5"). Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** When a callout stops being news: its own `until`, or six weeks after it shipped. */
function expiresAt(callout: Callout): number | null {
  if (callout.until) return Date.parse(callout.until);
  if (callout.shippedAt) return Date.parse(callout.shippedAt) + CALLOUT_SHELF_MS;
  return null;
}

/** For the right people, in the right build, still news, and news to this account. */
function forThisAccount(callout: Callout, ctx: CalloutContext): boolean {
  const expires = expiresAt(callout);
  if (expires !== null && ctx.now >= expires) return false;
  if (callout.minVersion) {
    if (!ctx.appVersion || compareVersions(ctx.appVersion, callout.minVersion) < 0) return false;
  }
  const audience = callout.audience ?? 'members';
  if (audience !== 'all' && ctx.isGuest) return false;
  if (audience === 'plus' && !ctx.isPlus) return false;
  /* A change is only a change to someone who had the app before it. */
  if (callout.shippedAt) {
    /* And not before it ships: a callout merged ahead of its date waits for it. */
    if (ctx.now < Date.parse(callout.shippedAt)) return false;
    if (ctx.accountCreatedAt === undefined) return false;
    if (ctx.accountCreatedAt >= Date.parse(callout.shippedAt)) return false;
  }
  return true;
}

function shippedMs(callout: Callout): number {
  return callout.shippedAt ? Date.parse(callout.shippedAt) : Number.NEGATIVE_INFINITY;
}

/** The newest put-away time, as ms — the start of the quiet period. */
export function lastSeenAt(seen: Record<string, string> | undefined): number {
  let latest = Number.NEGATIVE_INFINITY;
  for (const at of Object.values(seen ?? {})) {
    const ms = Date.parse(at);
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return latest;
}

export interface CalloutPick {
  /** The one to show now, or null. */
  callout: Callout | null;
  /**
   * Older callouts the shown one makes redundant. The caller records them as retired
   * (`CALLOUT_RETIRED_AT`) so they do not trickle out one a day after it.
   */
  superseded: Callout[];
}

/**
 * The one callout to show now, and the older ones it retires.
 *
 * `extra` are callouts that are due by their own logic (the legal notice): they bypass the seen
 * record and the quiet period, and outrank by priority. Among the registry's own, priority first,
 * then newest.
 */
export function pickCalloutWithSuperseded(
  registry: readonly Callout[],
  seen: Record<string, string> | undefined,
  ctx: CalloutContext,
  extra: readonly Callout[] = [],
): CalloutPick {
  const record = seen ?? {};
  const due = registry
    .filter((callout) => !record[callout.id] && forThisAccount(callout, ctx))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || shippedMs(b) - shippedMs(a));
  const newest = due[0] ?? null;
  const superseded = newest ? due.slice(1) : [];

  const urgent = [...extra].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  if (urgent && (!newest || (urgent.priority ?? 0) >= (newest.priority ?? 0))) {
    /* Due by its own rule, so not held back by the quiet period. Nothing is retired while it
       shows: the feature callout is still waiting its turn behind it. */
    return { callout: urgent, superseded: [] };
  }
  if (!newest) return { callout: null, superseded: [] };
  if (ctx.now - lastSeenAt(record) < CALLOUT_QUIET_MS) return { callout: null, superseded: [] };
  return { callout: newest, superseded };
}

/** The one callout to show now, or null. See `pickCalloutWithSuperseded`. */
export function pickCallout(
  registry: readonly Callout[],
  seen: Record<string, string> | undefined,
  ctx: CalloutContext,
  extra: readonly Callout[] = [],
): Callout | null {
  return pickCalloutWithSuperseded(registry, seen, ctx, extra).callout;
}

/**
 * Whether a recent callout already speaks for this release, for this account — seen or not.
 * While one does, the release's What's new card stays away: a callout and What's new announcing
 * the same release is the same news twice.
 */
export function releaseHasCallout(registry: readonly Callout[], ctx: CalloutContext): boolean {
  return registry.some(
    (callout) =>
      callout.shippedAt !== undefined &&
      ctx.now - Date.parse(callout.shippedAt) < CALLOUT_FOLD_MS &&
      forThisAccount(callout, ctx),
  );
}

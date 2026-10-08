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
}

export interface CalloutActionContext {
  /** Go to Home and bring the Today band's tabs into view. */
  openHomeTabs: () => void;
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
  /** Shown from this release on (major.minor.patch). */
  minVersion?: string;
  /** ISO date; never shown after. Features stop being new. */
  until?: string;
  audience?: 'all' | 'members' | 'plus';
  /** Higher first. Legal outranks features. */
  priority?: number;
}

/** How long after putting one away before another may appear. */
export const CALLOUT_QUIET_MS = 24 * 60 * 60 * 1000;

export const CALLOUTS: readonly Callout[] = [
  {
    id: 'today-tabs-2026-10',
    title: 'Today, tidied',
    body: 'Pick up, Review and Suggestions now sit in tabs under today’s passage.',
    illustration: 'today-tabs',
    action: { label: 'Show me', run: (ctx) => ctx.openHomeTabs() },
    until: '2026-12-01',
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

function eligible(callout: Callout, seen: Record<string, string>, ctx: CalloutContext): boolean {
  if (seen[callout.id]) return false;
  if (callout.until && ctx.now >= Date.parse(callout.until)) return false;
  if (callout.minVersion) {
    if (!ctx.appVersion || compareVersions(ctx.appVersion, callout.minVersion) < 0) return false;
  }
  const audience = callout.audience ?? 'members';
  if (audience !== 'all' && ctx.isGuest) return false;
  if (audience === 'plus' && !ctx.isPlus) return false;
  return true;
}

/** The newest put-away time, as ms — the start of the quiet period. */
function lastSeenAt(seen: Record<string, string>): number {
  let latest = Number.NEGATIVE_INFINITY;
  for (const at of Object.values(seen)) {
    const ms = Date.parse(at);
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return latest;
}

/**
 * The one callout to show now, or null.
 *
 * `extra` are callouts that are due by their own logic (the legal notice) and bypass the seen
 * record, though not the quiet period's ordering — they simply outrank by priority.
 */
export function pickCallout(
  registry: readonly Callout[],
  seen: Record<string, string> | undefined,
  ctx: CalloutContext,
  extra: readonly Callout[] = [],
): Callout | null {
  const record = seen ?? {};
  const due = [...extra, ...registry.filter((callout) => eligible(callout, record, ctx))];
  if (due.length === 0) return null;
  const top = [...due].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]!;
  /* Something due by its own rule (legal) is not held back by the quiet period. */
  if (extra.includes(top)) return top;
  if (ctx.now - lastSeenAt(record) < CALLOUT_QUIET_MS) return null;
  return top;
}

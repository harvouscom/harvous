/**
 * The "getting started" checklist's state, and the rules that keep it honest.
 *
 * Shared by the SPA and the server on purpose. The merge below runs on both sides: the
 * client merges the account's copy into the device's, and the write endpoint merges the
 * device's copy into the account's. Last-write-wins would be wrong here in a way it is not
 * wrong for appearance — appearance is a preference, where the newest edit is the truest
 * one, while this is a record of things that happened. A phone that has been offline since
 * Tuesday still knows a true fact about Tuesday, and pushing it must not erase Wednesday.
 *
 * So every field is monotonic: `done` and `dismissed` only ever go false → true, versions
 * only climb, and timestamps keep the *earliest* claim rather than the latest. Two devices
 * in any order converge on the same state, which is what lets the sync layer be as simple
 * as "merge both ways and stop worrying about it".
 */

/**
 * Bump to re-show the checklist with a new step set.
 *
 * Dismissal and completion are recorded against the version that was current when they
 * happened, so a bump brings the dock back for people who had put v1 away — without
 * un-checking the steps they really did finish.
 */
export const ONBOARDING_VERSION = 1;

export type OnboardingStepId = 'read' | 'note' | 'pill' | 'highlight' | 'thread' | 'recall';

/** Display order, and the set `shouldShowOnboarding` counts against. */
export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = [
  'read',
  'note',
  'pill',
  'highlight',
  'thread',
  'recall',
];

const STEP_ID_SET = new Set<string>(ONBOARDING_STEP_IDS);

/** Narrow a string that came from storage or a URL back to a step id. */
export function isOnboardingStepId(value: string): value is OnboardingStepId {
  return STEP_ID_SET.has(value);
}

/**
 * The four steps Home can see the answer to without being told.
 *
 * These are latched from data the sidebar already loads, so they arrive pre-checked for
 * anyone who did the thing before the dock existed. The other two ('thread', 'recall') are
 * event-stored — deriving them would mean new queries on a surface that already waits on
 * fifteen.
 */
export const DERIVED_STEP_IDS: readonly OnboardingStepId[] = ['read', 'note', 'pill', 'highlight'];

/**
 * Derived signals this many or more means the account is already a going concern, and the
 * checklist auto-completes instead of introducing someone to their own app.
 */
export const ONBOARDING_AUTOCOMPLETE_MIN_SIGNALS = 3;

export interface OnboardingStepState {
  done: boolean;
  dismissed: boolean;
  /** When the step was first satisfied. Absent while `done` is false. */
  at?: string;
}

export interface OnboardingState {
  version: number;
  /** Version at which the whole cluster was put away; 0 = never. */
  dismissedVersion: number;
  /**
   * Version at which the reader asked for it back from settings; 0 = never.
   *
   * A second counter rather than resetting `dismissedVersion`, because every field here is
   * monotonic and merges by taking the larger — clearing the dismissal would simply lose to
   * whichever device still remembered it, and the checklist would vanish again on the next
   * sync. Two climbing numbers survive that: the cluster is hidden only while the dismissal
   * is ahead of the restore, and either action can be taken any number of times.
   */
  restoredVersion: number;
  /** When every step was first satisfied. Informational — visibility derives from the steps. */
  completedAt: string | null;
  steps: Record<OnboardingStepId, OnboardingStepState>;
}

export interface OnboardingSignals {
  hasReadPosition: boolean;
  hasNote: boolean;
  hasScripturePill: boolean;
  hasHighlight: boolean;
}

function emptySteps(): Record<OnboardingStepId, OnboardingStepState> {
  const steps = {} as Record<OnboardingStepId, OnboardingStepState>;
  for (const id of ONBOARDING_STEP_IDS) steps[id] = { done: false, dismissed: false };
  return steps;
}

export function emptyOnboardingState(): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    dismissedVersion: 0,
    restoredVersion: 0,
    completedAt: null,
    steps: emptySteps(),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStep(raw: unknown): OnboardingStepState {
  if (!isPlainObject(raw)) return { done: false, dismissed: false };
  const done = raw.done === true;
  const dismissed = raw.dismissed === true;
  const at = typeof raw.at === 'string' && raw.at ? raw.at : undefined;
  return done && at ? { done, dismissed, at } : { done, dismissed };
}

/**
 * Parse the stored JSON, or `null` when there is nothing usable there.
 *
 * Tolerant by design: an unreadable value means the checklist starts over, which is a
 * strictly better failure than a thrown parse taking Home down with it. Unknown step keys
 * are dropped rather than kept — a v2 that renames a step should not carry the old key
 * around forever.
 */
export function parseOnboardingState(raw: string | null | undefined): OnboardingState | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(obj)) return null;

  const version = typeof obj.version === 'number' && obj.version > 0 ? Math.floor(obj.version) : 1;
  const dismissedVersion =
    typeof obj.dismissedVersion === 'number' && obj.dismissedVersion > 0
      ? Math.floor(obj.dismissedVersion)
      : 0;
  const restoredVersion =
    typeof obj.restoredVersion === 'number' && obj.restoredVersion > 0
      ? Math.floor(obj.restoredVersion)
      : 0;
  const completedAt = typeof obj.completedAt === 'string' && obj.completedAt ? obj.completedAt : null;

  const steps = emptySteps();
  if (isPlainObject(obj.steps)) {
    for (const [key, value] of Object.entries(obj.steps)) {
      if (!STEP_ID_SET.has(key)) continue;
      steps[key as OnboardingStepId] = parseStep(value);
    }
  }

  return { version, dismissedVersion, restoredVersion, completedAt, steps };
}

export function serializeOnboardingState(state: OnboardingState): string {
  return JSON.stringify(state);
}

/** The earlier of two ISO stamps, ignoring unparseable ones. */
function earliestIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const at = Date.parse(a);
  const bt = Date.parse(b);
  if (Number.isNaN(at)) return b;
  if (Number.isNaN(bt)) return a;
  return at <= bt ? a : b;
}

function mergeStep(a: OnboardingStepState, b: OnboardingStepState): OnboardingStepState {
  const done = a.done || b.done;
  const dismissed = a.dismissed || b.dismissed;
  // Earliest wins: `done` is monotonic, so the first device to see it is the one that was
  // actually there. Taking the newest would let a late-syncing phone restate Tuesday as today.
  const at = done ? earliestIso(a.done ? a.at : null, b.done ? b.at : null) : null;
  return at ? { done, dismissed, at } : { done, dismissed };
}

/**
 * Combine two copies of the state. Commutative and idempotent — order of arrival never
 * changes the result, which is the whole reason the sync layer can merge in both directions.
 */
export function mergeOnboardingStates(a: OnboardingState, b: OnboardingState): OnboardingState {
  const steps = {} as Record<OnboardingStepId, OnboardingStepState>;
  for (const id of ONBOARDING_STEP_IDS) steps[id] = mergeStep(a.steps[id], b.steps[id]);
  return {
    version: Math.max(a.version, b.version),
    dismissedVersion: Math.max(a.dismissedVersion, b.dismissedVersion),
    restoredVersion: Math.max(a.restoredVersion, b.restoredVersion),
    completedAt: earliestIso(a.completedAt, b.completedAt),
    steps,
  };
}

/** Which derived steps the account's own data already answers "yes" to. */
export function deriveInitialLatches(signals: OnboardingSignals): OnboardingStepId[] {
  const done: OnboardingStepId[] = [];
  if (signals.hasReadPosition) done.push('read');
  if (signals.hasNote) done.push('note');
  if (signals.hasScripturePill) done.push('pill');
  if (signals.hasHighlight) done.push('highlight');
  return done;
}

/**
 * Whether an account is established enough that the checklist should never appear.
 *
 * Someone who has read, written, cited and highlighted does not need to be walked through
 * reading, writing, citing and highlighting. Checked once, when the state is first created.
 */
export function shouldAutoCompleteOnboarding(signals: OnboardingSignals): boolean {
  return deriveInitialLatches(signals).length >= ONBOARDING_AUTOCOMPLETE_MIN_SIGNALS;
}

/** Mark a step done, keeping the first timestamp if it was already done. */
export function markStep(
  state: OnboardingState,
  id: OnboardingStepId,
  nowIso: string,
): OnboardingState {
  const prev = state.steps[id];
  if (prev.done) return state;
  const next: OnboardingState = {
    ...state,
    steps: { ...state.steps, [id]: { done: true, dismissed: prev.dismissed, at: nowIso } },
  };
  return withCompletion(next, nowIso);
}

/** Latch several steps at once — the derived-signal path, which fires on a single render. */
export function markSteps(
  state: OnboardingState,
  ids: readonly OnboardingStepId[],
  nowIso: string,
): OnboardingState {
  return ids.reduce((acc, id) => markStep(acc, id, nowIso), state);
}

export function dismissStep(state: OnboardingState, id: OnboardingStepId): OnboardingState {
  const prev = state.steps[id];
  if (prev.dismissed) return state;
  return {
    ...state,
    steps: { ...state.steps, [id]: { ...prev, dismissed: true } },
  };
}

/** Put the whole cluster away for this version. */
export function dismissOnboarding(state: OnboardingState): OnboardingState {
  /* Has to clear the restore as well as the current version, or putting the checklist away
     after asking for it back would leave the two counters level and change nothing. */
  const next = Math.max(ONBOARDING_VERSION, state.restoredVersion + 1);
  if (state.dismissedVersion >= next) return state;
  return { ...state, dismissedVersion: next };
}

/**
 * Bring the checklist back after it was dismissed — the way back in, from settings.
 *
 * Only the cluster. A step put away on its own stays away: that was a separate answer about
 * that step, and sweeping it up in a general "show me this again" would re-ask a question
 * already answered. `canRestoreOnboarding` is what a settings row should offer itself on, so
 * it does not present an action with nothing to undo.
 */
export function restoreOnboarding(state: OnboardingState): OnboardingState {
  if (state.restoredVersion >= state.dismissedVersion) return state;
  return { ...state, restoredVersion: state.dismissedVersion };
}

/** Whether there is a dismissal for `restoreOnboarding` to lift. */
export function canRestoreOnboarding(state: OnboardingState | null): boolean {
  if (!state) return false;
  if (state.dismissedVersion <= state.restoredVersion) return false;
  /* Nothing to come back to if every step is done or was individually put away. */
  return !ONBOARDING_STEP_IDS.every((id) => isStepSettled(state.steps[id]));
}

/** A step is settled when it has been done or individually put away. */
function isStepSettled(step: OnboardingStepState): boolean {
  return step.done || step.dismissed;
}

function withCompletion(state: OnboardingState, nowIso: string): OnboardingState {
  if (state.completedAt) return state;
  const allDone = ONBOARDING_STEP_IDS.every((id) => state.steps[id].done);
  return allDone ? { ...state, completedAt: nowIso } : state;
}

export interface OnboardingProgress {
  done: number;
  total: number;
  /** Steps still worth rendering — not individually dismissed. */
  visible: OnboardingStepId[];
}

export function onboardingProgress(state: OnboardingState): OnboardingProgress {
  const visible = ONBOARDING_STEP_IDS.filter((id) => !state.steps[id].dismissed);
  const done = visible.filter((id) => state.steps[id].done).length;
  return { done, total: visible.length, visible };
}

/**
 * Whether the dock belongs on Home right now.
 *
 * Hidden once the cluster has been dismissed at the current version, or once every step is
 * settled. There is deliberately no "is this a new account" test: an established account
 * simply has all its derived steps latched, which lands in the same place without needing
 * to know anyone's signup date.
 */
export function shouldShowOnboarding(state: OnboardingState | null): boolean {
  if (!state) return true;
  if (state.dismissedVersion >= ONBOARDING_VERSION && state.dismissedVersion > state.restoredVersion)
    return false;
  return !ONBOARDING_STEP_IDS.every((id) => isStepSettled(state.steps[id]));
}

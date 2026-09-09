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

export type OnboardingStepId =
  | 'read'
  | 'note'
  | 'pill'
  | 'highlight'
  | 'thread'
  | 'recall'
  | OnboardingCustomizeId;

/**
 * The customization offers — reminders, appearance, translation, import.
 *
 * Deliberately *not* part of `ONBOARDING_STEP_IDS`, which is the tour: the six things that
 * teach someone what Harvous is. These four teach nothing. They are settings worth knowing
 * about, ridden along in the same dock because that is where a new account is already looking.
 *
 * Keeping them out of the tour set is what makes this change free of blast radius. The dock's
 * whole lifecycle — `shouldShowOnboarding`, `withCompletion`, `onboardingProgress`,
 * `canRestoreOnboarding`, and the auto-complete seed — is defined over the tour, so adding a
 * row here cannot un-settle an account that already finished. Folding them in instead would
 * bring the dock back for everyone who completed it, and the documented remedy for that
 * (bumping `ONBOARDING_VERSION`) is worse still: it also clears the protection on everyone who
 * dismissed. A version bump means "the tour changed, ask again". This is not that.
 *
 * They still live in the same `steps` record, so they persist, merge, and dismiss through
 * exactly the machinery the tour uses — see `ALL_STEP_IDS`.
 */
export type OnboardingCustomizeId = 'reminders' | 'appearance' | 'translation' | 'import';

/** Display order, and the set `shouldShowOnboarding` counts against. */
export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = [
  'read',
  'note',
  'pill',
  'highlight',
  'thread',
  'recall',
];

/** Display order of the "Make it yours" section, beneath the tour. */
export const CUSTOMIZE_STEP_IDS: readonly OnboardingCustomizeId[] = [
  'reminders',
  'appearance',
  'translation',
  'import',
];

/**
 * Every id the `steps` record holds.
 *
 * Only the shape-level operations use this — creating the record, narrowing keys off storage,
 * and merging. Everything that decides what the dock *does* uses `ONBOARDING_STEP_IDS`.
 */
export const ALL_STEP_IDS: readonly OnboardingStepId[] = [
  ...ONBOARDING_STEP_IDS,
  ...CUSTOMIZE_STEP_IDS,
];

const STEP_ID_SET = new Set<string>(ALL_STEP_IDS);

const CUSTOMIZE_ID_SET = new Set<string>(CUSTOMIZE_STEP_IDS);

/** Narrow a string back to one of the customization rows. */
export function isOnboardingCustomizeId(value: string): value is OnboardingCustomizeId {
  return CUSTOMIZE_ID_SET.has(value);
}

/** Narrow a string that came from storage or a URL back to a step id. */
export function isOnboardingStepId(value: string): value is OnboardingStepId {
  return STEP_ID_SET.has(value);
}

export const DERIVED_STEP_IDS: readonly OnboardingStepId[] = ['read', 'note', 'pill', 'highlight'];

export const ONBOARDING_AUTOCOMPLETE_MIN_SIGNALS = 3;

export interface OnboardingStepState {
  done: boolean;
  dismissed: boolean;
  at?: string;
}

export interface OnboardingState {
  version: number;
  dismissedVersion: number;
  restoredVersion: number;
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
  for (const id of ALL_STEP_IDS) steps[id] = { done: false, dismissed: false };
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
  const at = done ? earliestIso(a.done ? a.at : null, b.done ? b.at : null) : null;
  return at ? { done, dismissed, at } : { done, dismissed };
}

export function mergeOnboardingStates(a: OnboardingState, b: OnboardingState): OnboardingState {
  const steps = {} as Record<OnboardingStepId, OnboardingStepState>;
  for (const id of ALL_STEP_IDS) steps[id] = mergeStep(a.steps[id], b.steps[id]);
  return {
    version: Math.max(a.version, b.version),
    dismissedVersion: Math.max(a.dismissedVersion, b.dismissedVersion),
    restoredVersion: Math.max(a.restoredVersion, b.restoredVersion),
    completedAt: earliestIso(a.completedAt, b.completedAt),
    steps,
  };
}

export function deriveInitialLatches(signals: OnboardingSignals): OnboardingStepId[] {
  const done: OnboardingStepId[] = [];
  if (signals.hasReadPosition) done.push('read');
  if (signals.hasNote) done.push('note');
  if (signals.hasScripturePill) done.push('pill');
  if (signals.hasHighlight) done.push('highlight');
  return done;
}

export function shouldAutoCompleteOnboarding(signals: OnboardingSignals): boolean {
  return deriveInitialLatches(signals).length >= ONBOARDING_AUTOCOMPLETE_MIN_SIGNALS;
}

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

export function dismissOnboarding(state: OnboardingState): OnboardingState {
  const next = Math.max(ONBOARDING_VERSION, state.restoredVersion + 1);
  if (state.dismissedVersion >= next) return state;
  return { ...state, dismissedVersion: next };
}

export function restoreOnboarding(state: OnboardingState): OnboardingState {
  if (state.restoredVersion >= state.dismissedVersion) return state;
  return { ...state, restoredVersion: state.dismissedVersion };
}

/**
 * Whether the cluster has been put away for the current version, and not asked back.
 *
 * `dismissedVersion` is monotonic — restore never clears it — so "is it away?" is the
 * comparison against `restoredVersion`, not a check that a dismissal ever happened.
 * The dock used to do the latter, which is why Support could restore the chip and still
 * paint an empty card.
 */
export function isOnboardingClusterDismissed(state: OnboardingState | null): boolean {
  if (!state) return false;
  return (
    state.dismissedVersion >= ONBOARDING_VERSION && state.dismissedVersion > state.restoredVersion
  );
}

export function canRestoreOnboarding(state: OnboardingState | null): boolean {
  if (!state) return false;
  if (!isOnboardingClusterDismissed(state)) return false;
  return !ONBOARDING_STEP_IDS.every((id) => isStepSettled(state.steps[id]));
}

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
  visible: OnboardingStepId[];
}

export function onboardingProgress(state: OnboardingState): OnboardingProgress {
  const visible = ONBOARDING_STEP_IDS.filter((id) => !state.steps[id].dismissed);
  const done = visible.filter((id) => state.steps[id].done).length;
  return { done, total: visible.length, visible };
}

export function shouldShowOnboarding(state: OnboardingState | null): boolean {
  if (!state) return true;
  if (isOnboardingClusterDismissed(state)) return false;
  return !ONBOARDING_STEP_IDS.every((id) => isStepSettled(state.steps[id]));
}

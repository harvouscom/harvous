/**
 * The checklist's device ↔ account sync, and the little store the dock reads from.
 *
 * Modelled on the appearance account-sync block in `prototype-background.ts`, with one
 * simplification that the monotonic merge in `src/utils/onboarding-state.ts` buys us:
 * there is no "account wins" rule and no need to suppress hydration while a local edit is
 * pending. Merging can only ever add facts, so we merge in both directions and let the
 * order of arrival stop mattering. The pending marker survives, but only for its other
 * job — remembering an edit made offline so it still reaches the server.
 *
 * localStorage is this device's first-paint cache: Home renders the dock from it before
 * the profile request has come back, so a returning user does not watch their own progress
 * appear.
 */
import { api } from './api';
import {
  PROTO_ONBOARDING_KEY,
  PROTO_ONBOARDING_PENDING_KEY,
  PROTO_ONBOARDING_PREVIEW_KEY,
} from '../layouts/proto-session-keys';
import {
  HARVOUS_ONBOARDING_ACCOUNT_SYNC,
  type OnboardingAccountSyncDetail,
} from '@/utils/harvous-onboarding-account-event';
import {
  SCRIPTURE_DRAFT_CONFIRMED_EVENT,
  type ScriptureDraftConfirmedDetail,
} from '@/utils/scripture-draft-events';
import {
  emptyOnboardingState,
  markStep,
  mergeOnboardingStates,
  parseOnboardingState,
  serializeOnboardingState,
  type OnboardingState,
  type OnboardingStepId,
} from '@/utils/onboarding-state';

const ONBOARDING_UPDATE_ENDPOINT = '/api/user/update-onboarding';

/**
 * Dev-only: show the checklist as a new account would see it.
 *
 * The dock is by design something almost nobody sees twice, which makes it exactly the kind
 * of surface that rots — you cannot design or review what you cannot get back on screen.
 * Preview starts from an empty state, suppresses the seed (see `seedOnboardingFromSignals`)
 * and never writes anything: not the cache, not the account. Turn it on with
 * `localStorage.setItem('harvous-proto-onboarding-preview', '1')` and reload.
 *
 * Read once at module load so it cannot change halfway through a session and leave the
 * store half-real.
 */
export const onboardingPreviewMode: boolean = (() => {
  try {
    return import.meta.env.DEV && localStorage.getItem(PROTO_ONBOARDING_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
})();

function readCache(): OnboardingState | null {
  if (onboardingPreviewMode) return null;
  try {
    return parseOnboardingState(localStorage.getItem(PROTO_ONBOARDING_KEY));
  } catch {
    return null;
  }
}

function writeCache(raw: string): void {
  if (onboardingPreviewMode) return;
  try {
    localStorage.setItem(PROTO_ONBOARDING_KEY, raw);
  } catch {
    /* private mode / quota — the account copy is still authoritative */
  }
}

function readPending(): string | null {
  try {
    return localStorage.getItem(PROTO_ONBOARDING_PENDING_KEY);
  } catch {
    return null;
  }
}
function setPending(raw: string): void {
  try {
    localStorage.setItem(PROTO_ONBOARDING_PENDING_KEY, raw);
  } catch {
    /* ignore */
  }
}
function clearPending(): void {
  try {
    localStorage.removeItem(PROTO_ONBOARDING_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────
//
// Module state, not context: the dock reads it, but so do surfaces nowhere near Home (the
// create-thread sheet, the recall shelf) that should not have to be handed a setter through
// six components to record that something happened.

let current: OnboardingState | null = null;
let currentRaw: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

export interface OnboardingSnapshot {
  state: OnboardingState | null;
  /**
   * Whether the account has answered yet (even with "nothing stored").
   *
   * Home waits on this before seeding. Without it, a device whose cache is empty because
   * it has simply never synced looks identical to a brand-new account, and the seed would
   * run against signals it should have merged with the account's copy first.
   */
  hydrated: boolean;
  /**
   * Whether this device had a stored copy to paint from.
   *
   * The dock renders on `hydrated || fromCache`, which is what keeps a checklist from
   * appearing in front of a four-year user who happens to be offline: with no cache and no
   * answer from the account, we do not yet know anything, and showing nothing is the only
   * honest option. A returning device has its cache and paints immediately.
   */
  fromCache: boolean;
}

let fromCache = false;
let snapshot: OnboardingSnapshot = { state: null, hydrated: false, fromCache: false };

function emit(): void {
  snapshot = { state: current, hydrated, fromCache };
  for (const listener of listeners) listener();
}

export function subscribeOnboardingState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The current snapshot.
 *
 * Stable by reference between changes — `useSyncExternalStore` compares snapshots with
 * `Object.is`, so returning a fresh object each call would re-render Home forever.
 */
export function getOnboardingSnapshot(): OnboardingSnapshot {
  return snapshot;
}

/** Server-side render / test safety: there is never a stored state on the server. */
export function getOnboardingServerSnapshot(): OnboardingSnapshot {
  return SERVER_SNAPSHOT;
}

const SERVER_SNAPSHOT: OnboardingSnapshot = { state: null, hydrated: false, fromCache: false };

function ensureLoaded(): OnboardingState {
  if (current) return current;
  const stored = readCache() ?? readPendingState();
  fromCache = stored != null;
  current = stored ?? emptyOnboardingState();
  currentRaw = serializeOnboardingState(current);
  snapshot = { state: current, hydrated, fromCache };
  return current;
}

function readPendingState(): OnboardingState | null {
  return parseOnboardingState(readPending());
}

/**
 * Fold a state into the current one and tell everybody, if anything actually changed.
 *
 * Returns whether it changed, so the push path can skip a request that would be a no-op.
 */
function commit(next: OnboardingState): boolean {
  const merged = current ? mergeOnboardingStates(current, next) : next;
  const raw = serializeOnboardingState(merged);
  if (raw === currentRaw) return false;
  current = merged;
  currentRaw = raw;
  writeCache(raw);
  emit();
  return true;
}

// ─── Push ────────────────────────────────────────────────────────────────────

let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Send the pending edit to the account. Keeps the marker on failure so it retries on
 * `online` and at next init.
 *
 * The response is the *merged* account copy, which we fold back in — that is how a step
 * done on another device arrives without waiting for a realtime tick.
 */
async function flushPendingOnboarding(): Promise<boolean> {
  const raw = readPending();
  if (!raw) return true;
  const parsed = parseOnboardingState(raw);
  if (!parsed) {
    clearPending();
    return true;
  }
  try {
    const res = await api.post<{ onboardingState?: string }>(ONBOARDING_UPDATE_ENDPOINT, {
      onboardingState: raw,
    });
    const returned = parseOnboardingState(res.onboardingState ?? null);
    if (returned) commit(returned);
    // Only clear if no newer edit landed while the request was in flight.
    if (readPending() === raw) clearPending();
    return true;
  } catch {
    /* offline or signed out — retried on `online` / next init */
    return false;
  }
}

/**
 * Persist a local change: mark it pending synchronously (durable across reload), then
 * debounce the network flush so a burst of latches collapses into one request.
 */
function schedulePush(delayMs = 600): void {
  if (onboardingPreviewMode || !currentRaw) return;
  setPending(currentRaw);
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    void flushPendingOnboarding();
  }, delayMs);
}

/** Apply a local edit and queue it for the account. */
export function updateOnboardingState(
  fn: (state: OnboardingState) => OnboardingState,
): OnboardingState {
  const next = fn(ensureLoaded());
  if (commit(next)) schedulePush();
  return current!;
}

/** Record a step as done. Safe to call repeatedly — the first call is the one that counts. */
export function markOnboardingStep(id: OnboardingStepId): void {
  updateOnboardingState((state) => markStep(state, id, new Date().toISOString()));
}

// ─── Account → device ────────────────────────────────────────────────────────

/**
 * Route an account payload into the store.
 *
 * `null` means the account has never stored a checklist. Unlike appearance, that is not a
 * seed trigger — Home seeds it once it has looked at the account's own data and can latch
 * the steps already done (see `latchDerivedSignals`). Seeding from an empty device here
 * would write "nothing done yet" for an account with four years of notes.
 */
export function handleOnboardingAccountSync(raw: string | null): void {
  ensureLoaded();
  hydrated = true;
  // Preview shows the empty checklist, so the account's real copy must not merge in.
  const parsed = onboardingPreviewMode ? null : parseOnboardingState(raw);
  // `commit` is a no-op when nothing changed, so emit unconditionally — the `hydrated`
  // flip is itself news, and it is the edge Home's seed effect waits for.
  if (!parsed || !commit(parsed)) emit();
}

/**
 * Hydrate from the profile endpoint.
 *
 * Takes an already-fetched profile when the caller has one — the prototype layout asks for
 * `/api/user/get-profile` once and feeds both this and the appearance sync, rather than
 * making the same authenticated request twice on every cold start.
 */
export async function fetchAndHydrateOnboardingFromProfile(
  profile?: { onboardingState?: string | null } | null,
): Promise<void> {
  try {
    const data =
      profile ?? (await api.get<{ onboardingState?: string | null }>('/api/user/get-profile'));
    handleOnboardingAccountSync(data.onboardingState ?? null);
  } catch {
    /* offline or not signed in — the local cache is fine, and `hydrated` stays false so
       nothing gets seeded from a question the account never answered */
  }
}

let initialized = false;

/** Wire account → device sync. Idempotent; called once on prototype mount. */
export function initOnboardingAccountSync(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  ensureLoaded();
  window.addEventListener(HARVOUS_ONBOARDING_ACCOUNT_SYNC, (e) => {
    const detail = (e as CustomEvent<OnboardingAccountSyncDetail>).detail;
    handleOnboardingAccountSync(detail?.onboardingState ?? null);
  });
  window.addEventListener('online', () => {
    void flushPendingOnboarding();
  });

  /*
   * "Mention a verse", reported by the editor at the moment it happens.
   *
   * This used to be derived from the space's scripture index being non-empty, which was too
   * loose in one specific and likely way: highlighting a verse creates a note carrying that
   * reference, so the index filled up and the row ticked off for someone who had never typed
   * a reference in their life — the exact confusion the step exists to clear up.
   *
   * The editor already dispatches this on confirm and it already bubbles, so listening at the
   * window costs nothing and needs no wiring through the note page. `isNew` filters out
   * re-confirming a pill that was backspaced into and edited.
   */
  window.addEventListener(SCRIPTURE_DRAFT_CONFIRMED_EVENT, (e) => {
    const detail = (e as CustomEvent<ScriptureDraftConfirmedDetail>).detail;
    if (detail?.isNew) markOnboardingStep('pill');
  });

  void flushPendingOnboarding(); // an edit left pending by a previous session
}

/** Test seam: forget everything this module is holding. */
export function resetOnboardingStateForTests(): void {
  current = null;
  currentRaw = null;
  hydrated = false;
  fromCache = false;
  initialized = false;
  snapshot = { state: null, hydrated: false, fromCache: false };
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = null;
  listeners.clear();
}

/**
 * Interface sounds — a few soft cues at the moments that mean something, and a quieter layer
 * for moving around the app.
 *
 * Synthesized live by `cuelume` (Web Audio, no audio files), loaded as its own chunk the first
 * time anything asks: nothing here sits on the initial payload but this file and its prefs.
 *
 * Callers name a **moment**, never a cue. What a moment sounds like lives in one table below, so
 * the palette is tuned in one place and a call site never has to know what "a right answer"
 * should sound like — only that one just happened.
 *
 * Two classes:
 * - `moment` — outcomes, completions, creations. Heard on "Everywhere" and "Moments only".
 * - `nav` — the interface moving: panels opening, drilling in, a menu value changing. Heard on
 *   "Everywhere" only, and quieter, because it happens far more often.
 *
 * The rules that keep it from being busy live here rather than at forty call sites:
 * 1. A `nav` sound needs a real gesture in the last moment. Functions like `setLocation` or
 *    `stackNote` are also called from effects, links and sync; the gate is what keeps those
 *    silent without every caller having to know which kind of call it is.
 * 2. One sound per gesture. `nav` requests wait a beat and the most meaningful one wins, so
 *    "open a search result" (close + navigate) is one sound. A `moment` cancels anything pending
 *    and hushes the interface briefly — creating a space also closes its sheet and switches
 *    space, and only the creation should be heard.
 * 3. A held key does not machine-gun: repeats are dropped, and moving through a list is
 *    throttled. The same interface sound twice in quick succession is heard once — a card that
 *    plays its own close and then hands off to a shell that closes it is one close.
 * 4. Nothing plays while the page is hidden or the reader has said not to.
 */
import type { PlayOptions, SoundName } from 'cuelume';
import { getSoundPreferenceSnapshot, type SoundPreference } from './sound-prefs';

type Cuelume = typeof import('cuelume');

export type SoundMoment =
  // moments
  | 'review.right'
  | 'review.almost'
  | 'review.miss'
  | 'review.tryAgain'
  | 'review.holding'
  | 'review.sittingDone'
  | 'space.created'
  | 'organize.filed'
  | 'highlight.created'
  | 'challenge.step'
  | 'challenge.finished'
  | 'study.finished'
  // nav
  | 'nav.open'
  | 'nav.close'
  | 'nav.forward'
  | 'nav.back'
  | 'nav.select'
  | 'nav.toggle';

type SoundClass = 'moment' | 'nav';

interface Cue {
  class: SoundClass;
  sound: SoundName;
  emphasis: NonNullable<PlayOptions['emphasis']>;
  volume?: number;
  direction?: PlayOptions['direction'];
  /** For `nav` only: which of two requests in the same beat is the one heard. */
  priority?: number;
}

/** How much quieter the interface is than the moments. */
const NAV_VOLUME = 0.7;

/*
 * The palette. cuelume's own notes on each cue, for whoever tunes this next:
 * success — "one soft mallet chord… confirmed completion"; ready — "one warm glass note, below
 * success: a result is there"; error — "one muted low mallet chord… a calm, recoverable
 * refusal"; open/close — air drawing up / falling shut; navigate — a soft whoosh; select — a
 * crisp detent over a small wooden knock.
 */
export const SOUND_CUES: Record<SoundMoment, Cue> = {
  'review.right': { class: 'moment', sound: 'success', emphasis: 'subtle' },
  'review.almost': { class: 'moment', sound: 'ready', emphasis: 'subtle' },
  /* Never a buzzer: a miss is the low, muted chord, and it is meant to sound recoverable. */
  'review.miss': { class: 'moment', sound: 'error', emphasis: 'subtle' },
  /* Same family as a miss, quieter — there is a go left. */
  'review.tryAgain': { class: 'moment', sound: 'error', emphasis: 'subtle', volume: 0.6 },
  /* Replaces `review.right` on the answer that moves an item into holding — never both. */
  'review.holding': { class: 'moment', sound: 'success', emphasis: 'normal' },
  'review.sittingDone': { class: 'moment', sound: 'success', emphasis: 'strong' },
  'space.created': { class: 'moment', sound: 'success', emphasis: 'normal' },
  'organize.filed': { class: 'moment', sound: 'ready', emphasis: 'subtle' },
  /* A detent, not a chord: reading is the quietest part of the app. */
  'highlight.created': { class: 'moment', sound: 'select', emphasis: 'subtle' },
  'challenge.step': { class: 'moment', sound: 'ready', emphasis: 'subtle' },
  'challenge.finished': { class: 'moment', sound: 'success', emphasis: 'normal' },
  'study.finished': { class: 'moment', sound: 'success', emphasis: 'normal' },

  'nav.open': { class: 'nav', sound: 'open', emphasis: 'subtle', volume: NAV_VOLUME, priority: 2 },
  'nav.close': { class: 'nav', sound: 'close', emphasis: 'subtle', volume: NAV_VOLUME, priority: 2 },
  'nav.forward': {
    class: 'nav',
    sound: 'navigate',
    emphasis: 'subtle',
    volume: NAV_VOLUME,
    direction: 'forward',
    priority: 3,
  },
  'nav.back': {
    class: 'nav',
    sound: 'navigate',
    emphasis: 'subtle',
    volume: NAV_VOLUME,
    direction: 'back',
    priority: 3,
  },
  'nav.select': { class: 'nav', sound: 'select', emphasis: 'subtle', volume: NAV_VOLUME, priority: 1 },
  'nav.toggle': { class: 'nav', sound: 'toggle', emphasis: 'subtle', volume: NAV_VOLUME, priority: 1 },
};

/** Everything plays at half of cuelume's level; the moments are already level-matched to each other. */
const MASTER_VOLUME = 0.5;
/** How recent a gesture has to be for an interface sound to count as caused by it. */
const GESTURE_WINDOW_MS = 600;
/** How long an interface sound waits for a more meaningful one from the same gesture. */
const NAV_SETTLE_MS = 40;
/** How long a moment keeps the interface quiet, so its sheet closing is not heard over it. */
const MOMENT_HUSH_MS = 300;
/** The fastest a list can tick as you move through it. */
const SELECT_THROTTLE_MS = 120;
/** How soon the same interface sound counts as an echo of the last one rather than a new one. */
const ECHO_MS = 400;
/** How often a gesture re-primes the audio context — see `primeInGesture`. */
const PRIME_INTERVAL_MS = 30_000;
/** Far below hearing, but not zero — cuelume returns early on a zero volume. */
const PRIME_VOLUME = 0.0001;

let modulePromise: Promise<Cuelume> | null = null;
let cuelume: Cuelume | null = null;
let listening = false;
let lastGestureAt = Number.NEGATIVE_INFINITY;
let lastGestureWasRepeat = false;
let lastPrimeAt = Number.NEGATIVE_INFINITY;
let lastSelectAt = Number.NEGATIVE_INFINITY;
let hushUntil = 0;
let pendingNav: { moment: SoundMoment; cue: Cue } | null = null;
const lastNavHeardAt = new Map<SoundMoment, number>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function load(): Promise<Cuelume> {
  if (!modulePromise) {
    modulePromise = import('cuelume').then(
      (mod) => {
        mod.setTheme('default');
        mod.setVolume(MASTER_VOLUME);
        cuelume = mod;
        return mod;
      },
      (error: unknown) => {
        // A chunk that failed to load (offline, a deploy mid-session) can be tried again later.
        modulePromise = null;
        throw error;
      },
    );
  }
  return modulePromise;
}

function allows(preference: SoundPreference, soundClass: SoundClass): boolean {
  if (preference === 'everywhere') return true;
  return preference === 'moments' && soundClass === 'moment';
}

/*
 * Mix under whatever else is playing — a worship playlist, a sermon — instead of pausing it, and
 * follow the ringer switch. Safari 17+ only; everywhere else it is already how Web Audio behaves.
 */
let sessionSet = false;
function mixWithOtherAudio(): void {
  if (sessionSet) return;
  sessionSet = true;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'ambient') session.type = 'ambient';
  } catch {
    /* an older engine that exposes the object but refuses the write */
  }
}

function render(mod: Cuelume, cue: Cue): void {
  mixWithOtherAudio();
  mod.play(cue.sound, {
    emphasis: cue.emphasis,
    volume: cue.volume,
    direction: cue.direction,
  });
}

function emit(moment: SoundMoment, cue: Cue): void {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') console.debug('[sound]', moment);
  if (cuelume) {
    render(cuelume, cue);
    return;
  }
  void load().then(
    (mod) => render(mod, cue),
    () => {},
  );
}

function cancelPendingNav(): void {
  pendingNav = null;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
}

function flushNav(): void {
  pendingTimer = null;
  const pending = pendingNav;
  pendingNav = null;
  if (!pending) return;
  const at = now();
  if (at < hushUntil) return;
  if (pending.cue.sound !== 'select' && at - (lastNavHeardAt.get(pending.moment) ?? -Infinity) < ECHO_MS) {
    return;
  }
  lastNavHeardAt.set(pending.moment, at);
  emit(pending.moment, pending.cue);
}

/**
 * Plays the sound for a moment, if the reader's choice allows it.
 *
 * `force` is for "Hear it" in Settings: it overrides the choice, never the other rules.
 */
export function playSound(moment: SoundMoment, options?: { force?: boolean }): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') return;
  const cue = SOUND_CUES[moment];
  if (!cue) return;
  if (!options?.force && !allows(getSoundPreferenceSnapshot(), cue.class)) return;

  const at = now();
  if (cue.class === 'moment') {
    cancelPendingNav();
    hushUntil = at + MOMENT_HUSH_MS;
    emit(moment, cue);
    return;
  }

  if (at - lastGestureAt > GESTURE_WINDOW_MS) return;
  if (at < hushUntil) return;
  if (cue.sound === 'select') {
    if (at - lastSelectAt < SELECT_THROTTLE_MS) return;
  } else if (lastGestureWasRepeat) {
    return;
  }

  if (pendingNav && (pendingNav.cue.priority ?? 0) >= (cue.priority ?? 0)) return;
  if (cue.sound === 'select') lastSelectAt = at;
  pendingNav = { moment, cue };
  if (!pendingTimer) pendingTimer = setTimeout(flushNav, NAV_SETTLE_MS);
}

/*
 * Safari only lets an AudioContext start inside a gesture, and almost every sound here plays
 * after one — on a server's reply, or after the beat rule 2 waits. cuelume creates its context
 * lazily inside `play` and has no unlock of its own, so a near-silent `play` inside the gesture
 * is how the context gets made and resumed where Safari allows it; the real sound a moment later
 * then finds it running.
 *
 * `pointerup` and not `pointerdown`: a touch only counts as user activation on the way up, and
 * cuelume refuses to play at all before activation.
 *
 * Every 30 seconds rather than once, because the context's state is cuelume's and iOS suspends
 * it in the background; re-primed on return to the page for the same reason.
 */
function primeInGesture(): void {
  if (!cuelume) {
    if (getSoundPreferenceSnapshot() !== 'off') void load().catch(() => {});
    return;
  }
  if (getSoundPreferenceSnapshot() === 'off') return;
  const at = now();
  if (at - lastPrimeAt < PRIME_INTERVAL_MS) return;
  lastPrimeAt = at;
  mixWithOtherAudio();
  cuelume.play('tap', { volume: PRIME_VOLUME });
}

function onPointerDown(): void {
  lastGestureAt = now();
  lastGestureWasRepeat = false;
}

function onActivation(event: Event): void {
  lastGestureAt = now();
  lastGestureWasRepeat = event instanceof KeyboardEvent ? event.repeat : false;
  primeInGesture();
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') lastPrimeAt = Number.NEGATIVE_INFINITY;
}

/**
 * Starts listening for gestures and loads the synth in the background.
 *
 * Idempotent. Skips the download while sounds are off unless `force` asks for it — Settings
 * does, so "Hear it" plays inside its own click rather than a fetch later.
 */
export function warmSounds(options?: { force?: boolean }): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!listening) {
    listening = true;
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointerdown', onPointerDown, opts);
    document.addEventListener('pointerup', onActivation, opts);
    document.addEventListener('click', onActivation, opts);
    document.addEventListener('keydown', onActivation, opts);
    document.addEventListener('visibilitychange', onVisibility);
  }
  if (options?.force || getSoundPreferenceSnapshot() !== 'off') void load().catch(() => {});
}

/** Test seam: back to a cold start. */
export function resetSoundsForTests(): void {
  cancelPendingNav();
  if (listening && typeof document !== 'undefined') {
    const opts = { capture: true } as const;
    document.removeEventListener('pointerdown', onPointerDown, opts);
    document.removeEventListener('pointerup', onActivation, opts);
    document.removeEventListener('click', onActivation, opts);
    document.removeEventListener('keydown', onActivation, opts);
    document.removeEventListener('visibilitychange', onVisibility);
  }
  listening = false;
  modulePromise = null;
  cuelume = null;
  sessionSet = false;
  lastGestureAt = Number.NEGATIVE_INFINITY;
  lastGestureWasRepeat = false;
  lastPrimeAt = Number.NEGATIVE_INFINITY;
  lastSelectAt = Number.NEGATIVE_INFINITY;
  lastNavHeardAt.clear();
  hushUntil = 0;
}

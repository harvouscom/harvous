/**
 * In-memory unlock session for locked notes.
 *
 * One PIN entry opens every locked note for a short window: the PIN is held in memory
 * (never persisted) until the session ends, and each note that has actually been
 * decrypted is remembered so the editor knows its body is plaintext. Every locked note
 * carries its own salt, so a note-specific key can't be shared — the PIN is what the
 * session keeps, and it is also what a save needs to re-encrypt with a fresh salt/IV.
 *
 * The session ends after SESSION_IDLE_MS without activity, when the tab has been hidden
 * longer than HIDDEN_GRACE_MS, on unload, or on an explicit "Lock now". Hidden gets a
 * grace rather than locking on the spot because a note's last save is encrypted
 * asynchronously — locking the instant the tab hides would strand it without its PIN.
 */

export const SESSION_IDLE_MS = 5 * 60 * 1000;
export const HIDDEN_GRACE_MS = 15 * 1000;
export const LOCK_SESSION_EVENT = 'harvous:lock-session-changed';

type Session = { pin: string; expiresAt: number };

let session: Session | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenAt: number | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
/** Notes whose body has been decrypted under the current session. */
const decryptedNotes = new Set<string>();
const listeners = new Set<() => void>();
/** Bumped on every change so `useSyncExternalStore` snapshots compare cheaply. */
let revision = 0;

function now(): number {
  return Date.now();
}

function emit(): void {
  revision += 1;
  for (const l of listeners) l();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCK_SESSION_EVENT, { detail: { active: session !== null } }));
  }
}

function clearIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

function armIdleTimer(): void {
  clearIdleTimer();
  if (!session) return;
  idleTimer = setTimeout(() => {
    // A timer can fire late (background throttling) or early relative to a touch that
    // re-armed it — re-check the deadline rather than trusting the callback.
    if (session && now() >= session.expiresAt) lockAllNotes();
    else armIdleTimer();
  }, Math.max(0, (session.expiresAt - now())));
}

/** End the session if its deadline passed while nothing was watching. */
function expireIfDue(): void {
  if (session && now() >= session.expiresAt) lockAllNotes();
}

/** Start (or restart) the unlock session with the account PIN. */
export function unlockSession(pin: string): void {
  session = { pin, expiresAt: now() + SESSION_IDLE_MS };
  armIdleTimer();
  emit();
}

/** True while a PIN entry is still covering locked notes. */
export function isLockSessionActive(): boolean {
  expireIfDue();
  return session !== null;
}

/** The session PIN, for decrypting another note or re-encrypting a save. */
export function getSessionPin(): string | undefined {
  expireIfDue();
  return session?.pin;
}

/** Slide the idle window forward — call on edits, saves and interaction. */
export function touchUnlockSession(): void {
  if (!session) return;
  expireIfDue();
  if (!session) return;
  session.expiresAt = now() + SESSION_IDLE_MS;
  armIdleTimer();
}

/** Milliseconds left before the session idles out, or 0 when there is none. */
export function lockSessionRemainingMs(): number {
  expireIfDue();
  return session ? Math.max(0, session.expiresAt - now()) : 0;
}

/** True when this note's body has been decrypted under the live session. */
export function isNoteUnlocked(noteId: string): boolean {
  expireIfDue();
  return session !== null && decryptedNotes.has(noteId);
}

/**
 * Record a successful decrypt. `key` is accepted for the older call shape and not kept:
 * it is specific to one note's salt, and the session PIN covers every note.
 */
export function setNoteUnlocked(noteId: string, _key: CryptoKey | null, pin: string): void {
  if (!session || session.pin !== pin) {
    session = { pin, expiresAt: now() + SESSION_IDLE_MS };
  } else {
    session.expiresAt = now() + SESSION_IDLE_MS;
  }
  decryptedNotes.add(noteId);
  armIdleTimer();
  emit();
}

/** The PIN that can re-encrypt this note's next save, if it is open under the session. */
export function getUnlockPin(noteId?: string): string | undefined {
  expireIfDue();
  if (!session) return undefined;
  if (noteId !== undefined && !decryptedNotes.has(noteId)) return undefined;
  return session.pin;
}

/** Forget one note's decrypted state (after re-locking it) without ending the session. */
export function lockNote(noteId: string): void {
  if (!decryptedNotes.delete(noteId)) return;
  emit();
}

/** End the session: forget the PIN and every decrypted note. */
export function lockAllNotes(): void {
  const had = session !== null || decryptedNotes.size > 0;
  session = null;
  decryptedNotes.clear();
  clearIdleTimer();
  if (had) emit();
}

export function getUnlockedNoteCount(): number {
  return isLockSessionActive() ? decryptedNotes.size : 0;
}

export function getUnlockedNoteIds(): string[] {
  return isLockSessionActive() ? Array.from(decryptedNotes) : [];
}

/** `useSyncExternalStore` plumbing. */
export function subscribeLockSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLockSessionRevision(): number {
  return revision;
}

/** Visibility handling, exported so tests can drive it without a real document. */
export function handleVisibilityChange(state: 'hidden' | 'visible'): void {
  if (state === 'hidden') {
    if (!session) return;
    hiddenAt = now();
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = setTimeout(() => {
      hiddenTimer = null;
      if (hiddenAt !== null && now() - hiddenAt >= HIDDEN_GRACE_MS) lockAllNotes();
    }, HIDDEN_GRACE_MS);
    return;
  }
  // Back in view. Background tabs throttle timers, so the grace check above may never
  // have run — settle it here, before anything renders a decrypted body.
  if (hiddenTimer) clearTimeout(hiddenTimer);
  hiddenTimer = null;
  const wasHiddenFor = hiddenAt === null ? 0 : now() - hiddenAt;
  hiddenAt = null;
  if (wasHiddenFor >= HIDDEN_GRACE_MS) lockAllNotes();
  else expireIfDue();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    lockAllNotes();
  });

  document.addEventListener('visibilitychange', () => {
    handleVisibilityChange(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
  });

  // Interaction keeps an open session alive — the window is five minutes of *idle*,
  // not five minutes total. Passive and cheap: a no-op when no session is open.
  const onActivity = () => {
    if (session) touchUnlockSession();
  };
  window.addEventListener('keydown', onActivity, { passive: true, capture: true });
  window.addEventListener('pointerdown', onActivity, { passive: true, capture: true });
}

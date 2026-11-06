/**
 * Who the Harvous 3 welcome shows itself to — account-wide, once.
 *
 * It used to be a question about the browser: had this device run Harvous before 3.0? That
 * answered yes on every old browser of every account, two months after the account had been
 * living in 3.0, and it could not know that the account had already been welcomed on its phone.
 * Derek (Nov 2026): it should greet people who have not used 3.0 yet, and nobody else.
 *
 * So every condition is about the account:
 * - made before 3.0 shipped, so it has a 2.x to be welcomed from;
 * - nothing stored in `onboardingState` when the account first answered this session. Only the
 *   3.0 shell writes that field, so an empty one means 3.0 has never run on this account;
 * - not already put away (`welcome@3` in the account's seen record), on any device.
 *
 * The device flag stays as a belt: a browser that dismissed it before the account key existed
 * says so, and backfills the key (see `PrototypeWelcome3`).
 */

/** Seen-record key the welcome writes when it is put away. */
export const WELCOME_3_SEEN_KEY = 'welcome@3';

/** The day `new` was merged into main as Harvous 3.0 (1bdb8b9aa). */
export const HARVOUS_3_SHIPPED_AT = Date.parse('2026-09-04T00:00:00Z');

export interface Welcome3GateInput {
  /** Signed in and not a guest. */
  signedIn: boolean;
  /** The account itself answered (not just this device's cache). */
  hydrated: boolean;
  /** Whether the account had a stored checklist at that first answer; `null` = unknown. */
  accountHadState: boolean | null;
  /** Account creation time in ms; `undefined` while unknown. */
  accountCreatedAt: number | undefined;
  /** The account's seen record. */
  seen: Record<string, string> | undefined;
  /** This browser already put it away. */
  dismissedOnDevice: boolean;
}

export function shouldAutoShowWelcome3(input: Welcome3GateInput): boolean {
  if (!input.signedIn || !input.hydrated) return false;
  if (input.accountHadState !== false) return false;
  if (input.accountCreatedAt === undefined || input.accountCreatedAt >= HARVOUS_3_SHIPPED_AT) {
    return false;
  }
  if (input.seen?.[WELCOME_3_SEEN_KEY]) return false;
  return !input.dismissedOnDevice;
}

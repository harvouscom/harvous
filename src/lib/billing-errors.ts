/**
 * User-facing copy for a failed billing call, shared by the API and the
 * surfaces that show it.
 *
 * Polar's error text is written for whoever holds the API key, not for the
 * person paying. A rejected organization access token comes back as
 * `{"error":"Unauthorized","detail":"Invalid token"}`, and `handleAPIError`
 * put that message straight into the response body, which the checkout button
 * rendered verbatim — so someone on the paywall was told a token was invalid,
 * about a token they have never held and cannot fix.
 *
 * The rule: only strings this file owns reach a user. Provider text, a
 * gateway's `HTTP 502`, a driver error — all of it is logged server-side and
 * shown as one of these instead.
 */

export type BillingErrorCode =
  | 'BILLING_NOT_CONFIGURED'
  | 'BILLING_PLAN_UNAVAILABLE'
  | 'BILLING_PROVIDER_UNAVAILABLE'
  | 'FOUNDING_SOLD_OUT';

export const BILLING_ERROR_MESSAGES: Record<BillingErrorCode, string> = {
  BILLING_NOT_CONFIGURED: "Checkout isn't open right now. Nothing was charged — please try again later.",
  BILLING_PLAN_UNAVAILABLE: "That plan isn't available right now. Refresh the page and try again.",
  // Names whose side the fault is on. Someone who has just been asked for money
  // and then handed an error assumes it was their card or their account.
  BILLING_PROVIDER_UNAVAILABLE:
    "Checkout is temporarily unavailable — this is on our end, not your account. Nothing was charged. Please try again in a few minutes.",
  FOUNDING_SOLD_OUT: 'The founding price is fully claimed.',
};

/** Shown whenever a failure carries no code this app wrote. */
export const BILLING_FALLBACK_MESSAGE =
  "We couldn't start checkout. Nothing was charged — please try again in a few minutes.";

export function isBillingErrorCode(code: unknown): code is BillingErrorCode {
  return typeof code === 'string' && code in BILLING_ERROR_MESSAGES;
}

/**
 * Copy for a failed billing response or thrown error.
 *
 * Deliberately ignores `message`: a message is only safe to show if we wrote
 * it, and the code is the only reliable evidence of that. An unrecognized
 * failure gets the fallback rather than whatever text came back from upstream.
 *
 * Accepts a parsed error body (`{ error, code }`), an `APIError` (which carries
 * `.code`), or anything else — the last of which is exactly the case the
 * fallback exists for.
 */
export function billingErrorMessage(input: unknown, fallback: string = BILLING_FALLBACK_MESSAGE): string {
  const code = (input as { code?: unknown } | null | undefined)?.code;
  return isBillingErrorCode(code) ? BILLING_ERROR_MESSAGES[code] : fallback;
}

# Clerk "Unknown device" / "Unknown browser" in Session list

All behavior below is based on **Clerk docs**. We've contacted Clerk about device detection; this doc is for context and workarounds until they respond.

## What Clerk docs say

- **SessionActivity** ([Backend SessionActivity](https://clerk.com/docs/reference/backend/types/backend-session-activity)): "models the activity of a user session, capturing details such as the device type, browser information, and geographical location." Properties include optional `browserName`, `browserVersion`, `deviceType`, `isMobile` — "optional fields that may be undefined depending on what information is available."
- **Where device/browser come from**: Session activity device and browser information is **captured from the client side** — derived from the **User-Agent sent by the client's browser**. Clerk parses that User-Agent to fill device/browser; there is no manual backend configuration for these fields.
- **Astro**: We use `clerkClient(context)` in middleware so the client is created with the request context (per Clerk's Astro docs).

## What we do in this app

1. **No PWA auth init on sign-in/sign-up** – We don't run device fingerprint or cookie restore before Clerk on auth pages, so Clerk runs with a normal browser context.
2. **Astro** – We use `clerkClient(context)` in middleware (per Clerk's Astro docs).
3. **Service worker** – Our PWA service worker skips cross-origin requests, so requests to Clerk (e.g. clerk.harvous.com) are not intercepted; the browser sends its User-Agent directly to Clerk.

We previously tried patching `@clerk/astro` to pass the request User-Agent into `createClerkClient`; it did not fix "Unknown device" in the Dashboard, so the patch was removed. Awaiting Clerk's response.

## Verify server-side (optional)

To confirm whether the request that hits our app has a User-Agent:

- In **dev**, open `GET /api/debug/request-headers` in the browser. The response is JSON with `userAgent`, `xForwardedUserAgent`, and `hasAnyUA`. This route returns 404 in production.

## Why you might still see "Unknown device"

- **Session activity is set from the client** – Device/browser are derived from the **client's** User-Agent. The browser sends it by default; PWA/standalone often send a reduced UA that Clerk may not recognize.
- **PWA / standalone** – In installed/PWA mode the browser often sends a reduced or custom User-Agent; device/browser can stay unknown.

## What to try

1. **Sign in from a normal browser tab** – If you usually use PWA/standalone, try a normal Chrome/Safari tab; if that session shows device/browser, the issue is the PWA/standalone User-Agent.
2. **Follow up with Clerk** – Use their response to this app's message for any official fix or guidance.

## References (Clerk docs only)

- [Backend SessionActivity](https://clerk.com/docs/reference/backend/types/backend-session-activity) – device/browser are optional; may be undefined depending on what information is available.
- [SessionWithActivities](https://clerk.com/docs/reference/javascript/types/session-with-activities) – `latestActivity` holds SessionActivity data.

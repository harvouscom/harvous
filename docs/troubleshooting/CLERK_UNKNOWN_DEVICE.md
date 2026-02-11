# Clerk "Unknown device" / "Unknown browser" in Session list

All behavior and fixes below are based only on **Clerk docs** (no support contact).

## What Clerk docs say

- **SessionActivity** ([Backend SessionActivity](https://clerk.com/docs/reference/backend/types/backend-session-activity)): "models the activity of a user session, capturing details such as the device type, browser information, and geographical location." Properties include optional `browserName`, `browserVersion`, `deviceType`, `isMobile` — "optional fields that may be undefined depending on what information is available."
- **Where device/browser come from**: Session activity device and browser information is **captured from the client side** — derived from the **User-Agent sent by the client's browser**. Clerk parses that User-Agent to fill device/browser; there is no manual backend configuration for these fields.
- **createClerkClient** ([JS Backend SDK](https://clerk.com/docs/js-backend/getting-started/quickstart)): accepts `userAgent?` (string) — "The User-Agent request header passed to the Clerk API." This affects **Backend API** requests (our server → Clerk).
- **Astro**: "you must pass the endpoint context when invoking the `clerkClient` function" and use `clerkClient(context)` so the client is created with the request context.

So: for Clerk to "read the device" well we need (1) the **client** (browser) to send its User-Agent when it talks to Clerk (sign-in, token refresh), and (2) our **server** to pass the request User-Agent into the Clerk client for Backend API calls.

## What we do in this app

1. **No PWA auth init on sign-in/sign-up** – We don't run device fingerprint or cookie restore before Clerk on auth pages, so Clerk runs with a normal browser context.
2. **Patch for @clerk/astro** – We patch the package so the server client always gets a User-Agent from the **incoming request**: we read both `User-Agent` and `user-agent` (some runtimes use lowercase) and fall back to the package default only when neither is present. See `patches/@clerk+astro+2.11.8.patch`. Run `npm install` so the patch is applied.
3. **Astro** – We use `clerkClient(context)` in middleware so the client is created with the request context (per Clerk's Astro docs).
4. **Service worker** – Our PWA service worker skips cross-origin requests, so requests to Clerk (e.g. clerk.harvous.com) are not intercepted; the browser sends its User-Agent directly to Clerk.

## Verify server-side (does the request have User-Agent?)

To confirm whether the request that hits our app has a User-Agent (so the patch can pass it to Clerk):

- In **dev**, open `GET /api/debug/request-headers` in the browser (e.g. Chrome on Mac). The response is JSON with `userAgent`, `xForwardedUserAgent`, and `hasAnyUA`. If `hasAnyUA` is true, the server is receiving a User-Agent and the patch should be forwarding it on Backend API calls. If `hasAnyUA` is false, the request doesn't have a UA in any of the headers we read — fix by adding the header name your host uses (e.g. in the patch fallbacks) or by checking the adapter/runtime. This route returns 404 in production.

## Why you might still see "Unknown device"

From Clerk docs, SessionActivity's device/browser fields are **optional** and may be **undefined** "depending on what information is available." So "Unknown device" is the Dashboard's way of showing missing/optional data.

- **Session activity is set from the client** – Device/browser are derived from the **client's** User-Agent (the browser talking to Clerk). Our server patch only affects Backend API requests; if Clerk fills session activity from client requests at sign-in/token refresh, the client must send a recognizable User-Agent. The browser does this by default; PWA/standalone often sends a reduced UA that Clerk may not recognize.
- **Session created before the patch** – Sign out and sign in again so a new session is created with the current (patched) flow.
- **Header not available in your runtime** – If the request never has a `User-Agent` (or `user-agent`) in the environment where middleware runs, the client will use the default and Clerk may not have information to fill device/browser. Use the debug route above to confirm.
- **PWA / standalone** – In installed/PWA mode the browser often sends a reduced or custom User-Agent; Clerk may not recognize it, so device/browser can stay unknown (optional fields undefined).

## What to try (no support contact)

1. **Verify server-side** – In dev, hit `GET /api/debug/request-headers`. If `hasAnyUA` is false, the request has no User-Agent; add the header your host sends (e.g. in the patch) or fix the runtime. If `hasAnyUA` is true and the Dashboard still shows "Unknown device," session activity is likely set from client requests (sign-in/refresh); ensure sign-in happens in a context where the browser sends a full UA.
2. **Sign out and sign in again** – New session created with the current flow.
3. **Confirm patch is applied** – Run `npm install` and ensure `patches/@clerk+astro+2.11.8.patch` exists; the patched file reads `User-Agent`, `user-agent`, and forwarded variants from `context.request.headers`.
4. **Sign in from a normal browser tab** – If you usually use PWA/standalone, try a normal Chrome/Safari tab; if that session shows device/browser, the issue is the PWA/standalone User-Agent.

## References (Clerk docs only)

- [Backend SessionActivity](https://clerk.com/docs/reference/backend/types/backend-session-activity) – device/browser are optional; may be undefined depending on what information is available.
- [JS Backend SDK – createClerkClient](https://clerk.com/docs/js-backend/getting-started/quickstart) – `userAgent?`: "The User-Agent request header passed to the Clerk API."
- [SessionWithActivities](https://clerk.com/docs/reference/javascript/types/session-with-activities) – `latestActivity` holds SessionActivity data.

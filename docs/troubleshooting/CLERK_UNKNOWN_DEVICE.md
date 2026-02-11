# Clerk "Unknown device" / "Unknown browser" in Session list

All behavior and fixes below are based only on **Clerk docs** (no support contact).

## What Clerk docs say

- **SessionActivity** ([Backend SessionActivity](https://clerk.com/docs/reference/backend/types/backend-session-activity)): “models the activity of a user session, capturing details such as the device type, browser information, and geographical location.” Properties include optional `browserName`, `browserVersion`, `deviceType`, `isMobile` — “optional fields that may be undefined depending on what information is available.”
- **createClerkClient** ([JS Backend SDK](https://clerk.com/docs/js-backend/getting-started/quickstart)): accepts `userAgent?` (string) — “The User-Agent request header passed to the Clerk API.”
- **Astro**: “you must pass the endpoint context when invoking the `clerkClient` function” and use `clerkClient(context)` so the client is created with the request context.

So: we must pass the **request’s User-Agent** into the Clerk client when we call the Clerk API (e.g. in middleware). Device/browser in SessionActivity depend on “what information is available” (per docs).

## What we do in this app

1. **No PWA auth init on sign-in/sign-up** – We don’t run device fingerprint or cookie restore before Clerk on auth pages, so Clerk runs with a normal browser context.
2. **Patch for @clerk/astro** – We patch the package so the server client always gets a User-Agent from the **incoming request**: we read both `User-Agent` and `user-agent` (some runtimes use lowercase) and fall back to the package default only when neither is present. See `patches/@clerk+astro+2.11.8.patch`. Run `npm install` so the patch is applied.
3. **Astro** – We use `clerkClient(context)` in middleware so the client is created with the request context (per Clerk’s Astro docs).

## Why you might still see "Unknown device"

From Clerk docs, SessionActivity’s device/browser fields are **optional** and may be **undefined** “depending on what information is available.” So “Unknown device” is the Dashboard’s way of showing missing/optional data.

- **Session created before the patch** – Sign out and sign in again so a new session is created with the current (patched) flow.
- **Header not available in your runtime** – If the request never has a `User-Agent` (or `user-agent`) in the environment where middleware runs, the client will use the default and Clerk may not have information to fill device/browser.
- **PWA / standalone** – In installed/PWA mode the browser often sends a reduced or custom User-Agent; Clerk may not recognize it, so device/browser can stay unknown (optional fields undefined).

## What to try (no support contact)

1. **Sign out and sign in again** – New session created with the patched client and current flow.
2. **Confirm patch is applied** – Run `npm install` and ensure `patches/@clerk+astro+2.11.8.patch` exists; the patched file reads both `User-Agent` and `user-agent` from `context.request.headers`.
3. **Sign in from a normal browser tab** – If you usually use PWA/standalone, try a normal Chrome/Safari tab; if that session shows device/browser, the issue is the PWA/standalone User-Agent.

## References (Clerk docs only)

- [Backend SessionActivity](https://clerk.com/docs/reference/backend/types/backend-session-activity) – device/browser are optional; may be undefined depending on what information is available.
- [JS Backend SDK – createClerkClient](https://clerk.com/docs/js-backend/getting-started/quickstart) – `userAgent?`: “The User-Agent request header passed to the Clerk API.”
- [SessionWithActivities](https://clerk.com/docs/reference/javascript/types/session-with-activities) – `latestActivity` holds SessionActivity data.

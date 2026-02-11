# Clerk "Unknown device" / "Unknown browser" in Session list

## What we changed (already in place)

1. **No cookie restore on auth pages** – We no longer call `restoreClerkCookies()` in `initClerkForPWA()` on sign-in/sign-up. Restoring cookies before Clerk runs could cause Clerk to skip device registration. Cookie restore only runs in the silent-restore path (same device, valid backup) before `setSession()`.
2. **Clerk script on all pages** – The @clerk/astro integration injects the Clerk hotload script into every HTML response (before `</head>`), so the Clerk client runs on profile/dashboard too and can send activity with the browser User-Agent.
3. **Patch: forward browser User-Agent to Clerk client** – The @clerk/astro server creates a Clerk client with a fixed `userAgent: "@clerk/astro@2.11.8"`. When our middleware validates the session on every protected request, that client talks to Clerk’s API with that User-Agent, so Clerk was recording session activity as “unknown device”. We patch `@clerk/astro` (via `patches/@clerk+astro+2.11.8.patch`) so the client uses the **incoming request’s User-Agent** (the browser’s, e.g. “Mozilla/5.0 … Chrome/…”) when available. Session activity then shows “Mac using Chrome” (or the real device/browser). Run `npm install` so `patch-package` applies the patch.

## Why it might still show "Unknown device"

- **Session was created before the fix** – Existing sessions were created when we were still restoring cookies on auth pages. Sign out completely and sign in again to create a new session with the current flow.
- **Server-side requests** – Clerk’s SessionActivity (device/browser) is derived from the **User-Agent** of the request that creates/updates the session. The @clerk/astro server client uses `userAgent: "@clerk/astro@2.x.x"` when the server talks to Clerk (e.g. `createClerkClient`). If Clerk records session activity from those server requests, it would show as "unknown device". We don’t control that; it would require Clerk to forward the **incoming request’s User-Agent** (the browser’s) when recording activity.
- **PWA / standalone** – In PWA or standalone mode, the browser’s User-Agent can be reduced (e.g. no "Chrome" in the string), so Clerk’s parser might not recognize it and show "unknown browser".

## What to try

1. **Sign out and sign in again** – Create a fresh session with the current flow (no cookie restore on auth pages). Check in Clerk Dashboard whether the new session shows device/browser.
2. **Sign in from a normal browser tab** – If you usually use the PWA or an embedded browser, try signing in from a regular Chrome/Safari tab and see if that session shows "Mac using Chrome".
3. **Contact Clerk support** – If it still shows "Unknown device" for new sign-ins, ask them:
   - "Session activity shows Unknown device / Unknown browser (and sometimes 'Data unavailable') for our users. It used to show e.g. 'Mac using Chrome'. We use @clerk/astro with custom sign-in/sign-up pages. We no longer restore cookies before Clerk runs on auth pages. Does SessionActivity get populated from server-side `authenticateRequest`? If so, can the request’s User-Agent (browser) be forwarded so device shows correctly?"

## References

- [Clerk SessionActivity](https://clerk.com/docs/references/backend/types/backend-session-activity) – browserName, deviceType, etc. from User-Agent.
- Our change: `src/utils/clerk-pwa-helper.ts` – removed unconditional `restoreClerkCookies()` from `initClerkForPWA()`.

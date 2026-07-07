# Clerk sign-outs and email-code re-login (web browser)

Occasional trips back to `/sign-in` with an email verification code are **expected** with Clerk — not a Harvous bug.

## Clerk Hobby (free) plan

- **Maximum session lifetime is fixed at 7 days.** You will need to sign in again at least once a week, even if you use Harvous daily.
- Custom longer sessions require **Clerk Pro** (~$25/mo).
- **Inactivity timeout** is off on your instance, so idle time alone is not signing you out.

## Browser cookie limits (all plans)

Clerk documents that users can be signed out **before** the configured max lifetime when browsers clear cookies. See [Session options → Browser limitations on cookies](https://clerk.com/docs/guides/secure/session-options#browser-limitations-on-cookies).

Common cases:

- Manual cookie clear or “block all cookies”
- Incognito / private window closed
- Chrome `Max-Age` cap (400 days) on long-lived cookies
- Strict privacy settings affecting cookies on `clerk.harvous.com` (Clerk FAPI domain)

Clerk’s note: *“it is impossible to achieve a setup where your users are never signed out.”*

## Harvous sign-in

Production hosts use **passwordless email codes** only ([`HarvousAuthForm`](../../spa/src/components/auth/HarvousAuthForm.tsx)) — same idea as native macOS sign-in.

## If sign-outs feel more frequent than weekly

Before signing in again, check DevTools → Application → Cookies:

- **App origin** (`app.harvous.com` or `localhost`): `__client_uat`, `__session`
- **Clerk** (`clerk.harvous.com`): `__client` (long-lived session)

Missing `__client` on the Clerk domain often means the browser cleared third-party/partitioned cookies — re-login is required.

## Localhost + live Clerk keys

If API calls return 401 on localhost while Clerk still shows signed in, add to `.env`:

```bash
CLERK_AUTHORIZED_PARTIES=http://localhost:4322,https://app.harvous.com,https://new.harvous.com
```

See [`.env.example`](../../.env.example).

## Related

- [Clerk unknown device](./CLERK_UNKNOWN_DEVICE.md)
- [Clerk duplicate user migration](./CLERK_DUPLICATE_USER_MIGRATION.md)

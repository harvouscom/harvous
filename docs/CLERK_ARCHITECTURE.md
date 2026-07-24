# Clerk Architecture (Auth & Organizations)

> **Billing** (Harvous Plus, Paddle MoR, entitlements) lives in [`BILLING_ARCHITECTURE.md`](./BILLING_ARCHITECTURE.md).
> **Product pricing / church ladder** lives in [`future/MONETIZATION_AND_PRICING.md`](./future/MONETIZATION_AND_PRICING.md).

Clerk is used for **authentication** and **church Organizations** (identity). Paid access is **not** gated on Clerk Billing plans or JWT feature claims.

## Auth

- SPA: `@clerk/clerk-react` + `VITE_CLERK_PUBLISHABLE_KEY`
- API: Bearer JWT / session cookies via `server/middleware/auth.ts`
- Cold-start: gate authenticated queries on `useAuthReady()` (see `AGENTS.md`)
- Do **not** set Clerk Force redirect URL to `/` — join/invite return URLs must win

## Organizations (churches)

- Clerk orgs hold **staff** (`org:admin` / `org:member`)
- Congregants connect at the DB layer (`UserMetadata.connectedChurchId`), not as org members
- `Spaces.orgId` / `Churches.orgId` denormalize the Clerk org id
- Org member limits come from Clerk’s **B2B Authentication** product (not Clerk Billing). Default ~20 staff without the B2B Auth add-on; unlimited with it via `maxAllowedMemberships`

See [`future/CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md`](./future/CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md).

## What moved out of this doc

| Former topic | Now |
| --- | --- |
| Individual add-ons in `public_metadata` | Obsolete — `Entitlements` table |
| Clerk Billing / hand-rolled Stripe webhooks | [`BILLING_ARCHITECTURE.md`](./BILLING_ARCHITECTURE.md) |
| Church billing rail | Paddle (same doc); identity stays here |

Historical copies: `docs/CLERK_MONETIZATION_ARCHITECTURE.md` and `docs/future/CLERK_MONETIZATION_ARCHITECTURE.md` are stubs pointing here.

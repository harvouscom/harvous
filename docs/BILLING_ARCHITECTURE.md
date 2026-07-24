# Billing Architecture

Harvous sells **Harvous Plus** through **Paddle** as merchant of record. Clerk remains auth only (sessions, Organizations). Gates check **feature keys**, never plan names or providers.

## Why Paddle

- One plan per payer is enough for Plus; add-ons are not required for launch.
- EU/UK B2C digital services have a **zero** VAT registration threshold for non-established sellers. Clerk Billing has no tax layer. Paddle collects and remits VAT/sales tax as MoR.
- Checkout can be **inline** (Paddle.js `displayMode: 'inline'`) and the customer portal is hosted.

## Plan registry

[`src/lib/billing-plans.ts`](../src/lib/billing-plans.ts) maps Paddle price ids (`pri_…`) to:

- plan key (`plus`), interval, amount
- feature keys (`shared_spaces`, …)
- limits (`ownedSpaces`, `membersPerSpace`)
- `listed` — founding / step-up prices stay in the registry with `listed: false` after supersession so grandfathered subscribers keep resolving

Env (sandbox ≠ live):

| Server | Client |
| --- | --- |
| `PADDLE_API_KEY` | `VITE_PADDLE_CLIENT_TOKEN` |
| `PADDLE_WEBHOOK_SECRET` | `VITE_PADDLE_PLUS_PRICE_*` |
| `PADDLE_ENV` (`sandbox` \| `production`) | `VITE_PADDLE_ENV` |
| `PADDLE_PLUS_PRICE_MONTHLY` / `_ANNUAL` | |

Run `npm run billing:verify` before merge/announce.

## Entitlements

Table `Entitlements` (`server/db/schema.ts`):

- `userId`, `featureKey`, `status` (`active` \| `canceled` \| `expired`)
- `source` (`billing` \| `admin_grant` \| `church_seat` \| `trial`)
- `providerRef` (Paddle `sub_…`), `priceId` (`pri_…`)
- unique `(userId, featureKey, source)` so church seats can coexist with personal purchase

`UserMetadata.paddleCustomerId` links Clerk users to Paddle customers for portal + sync.

Utils: [`server/utils/entitlements.ts`](../server/utils/entitlements.ts). Gates in [`tier-limits.ts`](../server/utils/tier-limits.ts) call `hasEntitlement(..., 'shared_spaces')`.

**Never auto-revoke** on reconcile-on-read. Cancel clears `source='billing'` via webhook (or explicit sync cancel handling).

## Purchase flow

```
Upgrade page → POST /api/billing/checkout
  → ensure Paddle customer (customData.clerkUserId)
  → Paddle.js inline Checkout.open
  → checkout.completed → POST /api/billing/sync
  → list subscriptions → write Entitlements
```

Webhooks (`POST /api/webhooks/paddle`) also write entitlements. Signature: `Paddle-Signature` (`ts` + `h1`). Netlify may duplicate headers — take the first comma-split value before verifying (same class of bug as Clerk/Svix).

Manage: `GET /api/billing/portal` → customer portal session URL.

## Sandbox vs live

Separate API keys, client tokens, price ids, and webhook secrets. Seller approval is account-level; catalog is per environment. One Paddle seller account (e.g. Testament Made, LLC) can host multiple products (ReviseMy + Harvous) — use a **separate Product** and **notification destination** per app.

## Church org billing (deferred)

- **Identity:** Clerk Organizations unchanged (`orgId` on Spaces/Churches).
- **Billing:** same Paddle + Entitlements pipeline later (`source='church_seat'`, `Churches.billingPlan`).
- Clerk Billing vs Clerk B2B Auth add-on are unrelated; org member caps come from B2B Auth, not Billing.

See `docs/future/CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md` and `docs/CLERK_ARCHITECTURE.md` (auth/orgs only).

## Founding price

Launch: **$5/mo · $45/yr**. Annual is the default interval in the upgrade UI. Step-ups for new subscribers only; historical `pri_…` rows stay in the registry.

# Billing Architecture

How Harvous charges for paid features. **Provider: [Polar](https://polar.sh) as merchant of record.**
Clerk remains the auth layer — this covers billing only.

> Product/pricing strategy lives in [future/MONETIZATION_AND_PRICING.md](./future/MONETIZATION_AND_PRICING.md).
> This file is the **technical** contract: the entitlement model, the provider integration, and the
> playbook for adding a new paid product.

---

## 1. Why Polar (merchant of record)

Harvous has EU/UK users. For a US business selling B2C digital services the VAT registration threshold is
**zero** in both the EU (non-established seller) and the UK (HMRC NETP rule) — VAT is owed from the first
sale. Polar is the **merchant of record**: it is the legal seller, so VAT/GST/US-sales-tax registration,
collection, invoicing, and filing are Polar's obligation, not ours.

Polar also gives us, out of the box: **embedded checkout** (no redirect), a **hosted customer portal**
(manage/cancel/update card), **one-time purchases** (Season Pass), **seat-based pricing** for the church
path, and a **programmatic setup API** (products, prices, and webhook endpoints — unlike Clerk/Paddle).
It is open source (MIT).

Sandbox and production are **separate Polar environments** with different access tokens and product ids.

---

## 2. The core idea: gates check feature keys, never products or providers

Every paid capability is a **feature key**. Code asks `hasEntitlement(auth, 'shared_spaces')`, never "does
the user have plan X on provider Y." A registry maps provider **product ids → feature keys**; the DB is the
source of truth for what a user currently holds. This is what made the Clerk → Paddle → Polar migrations
each a contained, provider-layer-only change.

```
Polar product  ──(registry)──▶  feature keys  ──(Entitlements rows)──▶  hasEntitlement() gate
```

### Feature keys

`src/lib/billing-plans.ts` → `FEATURE_KEYS`:

| Key | Grants | Sold as |
|---|---|---|
| `shared_spaces` | Host/own shared spaces (limits below) | **Harvous Plus** |
| `review` | AI practice from your notes (future) | folds into Plus |
| `challenges` | Full season guide (future) | folds into Plus |
| `connector` | Outbound MCP/API access (future) | **Connector** add-on |
| `season_pass` | One season's guide/archive (future) | **Season Pass** one-time add-on |

(Add a key here to introduce a new gate. `season_pass`/`connector` are declared but not yet sold.)

---

## 3. The plan registry — `src/lib/billing-plans.ts`

Processor-agnostic. Each `(plan × interval)` is one **Polar product** (Polar checkout takes product ids;
a product carries its own catalog price). `PLANS` entries map a product id → `{ key, interval,
amountCents, features, limits, listed }`.

- **`listed: true`** — shown on the upgrade page.
- **`listed: false`** — hidden, but still resolves for existing subscribers. This is the **founding-price
  lock**: when the price rises for new subscribers, the old price point stays as a `listed:false` entry so
  grandfathered subscribers keep resolving to the right features and limits.
- Product ids come from **env** (`POLAR_PLUS_PRODUCT_MONTHLY`/`_ANNUAL` + `VITE_` mirrors) so sandbox and
  live stay distinct.
- `limitsForFeatures(features)` resolves per-plan caps (owned spaces, members/space). Plus = unlimited / 50 — the member cap is the fence, not the space count.

---

## 4. Entitlements — the source of truth (`server/db/schema.ts` → `Entitlements`)

Per-feature rows, unique on **(userId, featureKey, source)**:

```
Entitlements
  id, userId, featureKey, status ('active'|'canceled'|'expired'),
  source ('billing'|'admin_grant'|'church_seat'|'trial'),
  providerRef (Polar subscription id), productId (Polar product id),
  grantedAt, expiresAt, updatedAt
```

Why rows, not a boolean or jsonb: **multiple sources coexist per feature** without clobbering. A church can
sponsor a member's `review` (`source='church_seat'`) while that member also holds a personal `billing`
grant — two rows, both honored. A user holding **Plus + Connector + a Season Pass** is just three rows
across different `productId`s.

`server/utils/entitlements.ts` is the only module that reads/writes this table:

- `hasEntitlement(auth, key)` / `hasEntitlementForUserId(userId, key)` — the gate.
- `getActiveEntitlements(userId)` / `limitsForUser(userId)` — the full set + resolved caps.
- `setEntitlementsForProduct(userId, productId, enabled, source, providerRef)` — upsert every feature a
  product grants.
- `setFeatureEntitlement(...)` — admin/test single-feature grant.
- `syncEntitlementsFromProvider(userId)` — reconcile from Polar (see §6): promote *and*
  demote `source='billing'` rows to match active Polar subscriptions.
- `applyPolarSubscriptionEntitlement(...)` — apply a webhook event.

**Billing sync is bidirectional for `source='billing'`.** An active Polar subscription
promotes entitlements; no active known-product subscription cancels billing rows (covers
dashboard customer deletes and missed cancel webhooks). `admin_grant` / `church_seat` /
`trial` are never touched. Polar API failures fail closed (no revoke). Webhooks still
apply the same cancel path on `subscription.canceled`/`.revoked`.

---

## 5. Provider integration (Polar)

| Concern | Where | How |
|---|---|---|
| SDK client | `server/utils/polar-client.ts` | `new Polar({ accessToken: POLAR_ACCESS_TOKEN, server })` |
| Checkout | `POST /api/billing/checkout` | `polar.checkouts.create({ products:[productId], externalCustomerId: userId, successUrl, metadata })` → returns `checkout.url` (same-tab hosted redirect) |
| Status + summary | `GET /api/subscription/status` | Entitlements + optional `billing` summary from `polar.subscriptions.list` (`server/utils/polar-billing.ts`) |
| Manage payload | `GET /api/billing/manage` | Subscription + masked card (`listPaymentMethodsExternal`) + recent orders (`orders.list` by `externalCustomerId`) |
| Receipt / invoice | `GET /api/billing/orders/:id/receipt` | Ownership check → Polar receipt URL (fallback generate/get invoice) |
| Manage in Settings | Settings › Plan (`PrototypeAddonsPage`) | In-app plan status, card label, history downloads, cancel/resume (`POST /api/billing/cancel`); status load runs `/api/subscription/status` which syncs from Polar |
| Update card | `GET /api/billing/portal` | Hosted Polar portal only (PCI). Same-tab from “Payment method” |
| Webhook | `POST /api/webhooks/polar` | `validateEvent` (Standard Webhooks) → `polar-webhook.ts` maps event → intent |
| Reconcile | `POST /api/billing/sync` + `GET /api/subscription/status` | `polar.subscriptions.list({ externalCustomerId:[userId], active:true })` — grant when present, cancel billing rows when empty |

**Custom manage layer.** Settings › Plan shows as much as Polar’s Core API allows in Harvous chrome. The hosted Customer Portal is only for entering/changing a card. Upgrade’s “Manage Subscription” links to `/settings/addons`, not Polar.

**The customer is keyed by `externalCustomerId` = Clerk userId.** So checkout, portal, and sync all work
without a pre-created or stored customer id. `UserMetadata.polarCustomerId` is stored opportunistically
from webhooks as a fallback/audit only.

**Netlify header duplication.** Netlify's proxy can duplicate a header, joining copies with `", "`
(comma-space). `firstHeaderValue()` splits on `", "` — **not** a bare `","` — because Polar's Standard
Webhooks `webhook-signature` value legitimately contains a comma (`v1,<sig>`). Splitting on a bare comma
corrupts the signature. (Same class of bug the Clerk svix `dedupeSvixHeaders` guards against.)

**Purchase → webhook gap.** localhost and the moments right after checkout may not have the webhook yet.
The client's `"success"` handler calls `/api/billing/sync`, which reconciles straight from the Polar API —
so entitlements land even before the webhook. The same sync demotes when Polar has no active
subscription (e.g. customer deleted in the dashboard). Local E2E proves the reconcile-on-read path,
not the webhook (localhost receives no webhook).

---

## 6. Webhook event → entitlement mapping (`server/utils/polar-webhook.ts`)

Pure, unit-tested helpers (so we don't forge signed payloads in tests — signature verification is the
SDK's `validateEvent`):

| Polar event | Intent |
|---|---|
| `subscription.active` / `.created` / `.uncanceled` / `.past_due` | **enable** (past_due keeps access during dunning — never-evict) |
| `subscription.updated` | enable if status active/trialing/past_due, else disable |
| `subscription.canceled` / `.revoked` | **disable** (clears `source='billing'` rows) |
| `order.paid` | **enable** — the one-time path (Season Pass) |

`productIdFromPolarData` / `externalUserIdFromPolarData` / `customerIdFromPolarData` extract ids
camel/snake-tolerantly.

---

## 7. Playbook: add a new paid add-on

This is the whole point of the architecture — a new product is fill-in-the-blanks, not a re-derivation.

1. **Feature key** — add it to `FEATURE_KEYS` (`billing-plans.ts`) and gate the capability with
   `hasEntitlement(auth, 'your_key')`.
2. **Registry entry** — add the product to `PLANS` with its `productId` (from env), `features`, `limits`,
   `listed`. Extend `PlanKey` and, for a one-time add-on, add a `'one_time'` interval.
3. **Create it in Polar** — `npm run billing:setup -- --apply` (idempotent; `polar.products.create` +
   `polar.webhooks.createEndpoint`). Put the returned product id + secret in env; `npm run billing:verify`.
4. **Webhook** — recurring add-ons ride the existing `subscription.*` path; one-time add-ons use
   `order.paid` (already handled). No route change needed for either.
5. **Surface it** — Settings › Add-ons (`spa/src/pages/prototype/settings/PrototypeAddonsPage.tsx`).

### Prerequisite for time-boxed add-ons (Season Pass)

`listActiveFeatureKeys` filters on `status='active'` only — it does **not** check `expiresAt`.
Subscriptions are fine (cancel flips status via webhook), but a one-time Season Pass has no cancel event;
it just ends. **Before Season Pass ships**, either:

- make the active-read also require `expiresAt IS NULL OR expiresAt > now()`, or
- add a sweep that flips expired rows to `status='expired'`.

The `expiresAt` column already exists. Nothing else about the add-on model needs it.

---

## 8. Setup & operations

- **`npm run billing:setup`** — dry-run; `-- --apply [--url=https://host]` creates products + webhook
  endpoint in the current `POLAR_ENV`. Idempotent.
- **`npm run billing:verify`** — asserts every registry product id exists/active/price-matches in Polar,
  that `POLAR_ENV` agrees with the returned ids, and that the `/api/webhooks/polar` endpoint is registered.
  Run against sandbox, then production, before announcing.
- **Manual, dashboard-only** (not in the API): account approval to sell (MoR review), tax-collection
  settings for EU/UK/US, and the checkout **embed-origin allowlist** (prod + Netlify preview origins).
- **Env** — `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_ENV`, `POLAR_PLUS_PRODUCT_MONTHLY/_ANNUAL`,
  plus `VITE_POLAR_PLUS_PRODUCT_MONTHLY/_ANNUAL` for the SPA (public product ids, not secrets — see
  `netlify.toml` `SECRETS_SCAN_OMIT_KEYS`). The client needs no Polar token: the checkout session is
  created server-side; the embed just opens its URL.

### Sandbox → production go-live

Sandbox and production are **separate Polar orgs/environments**. Product ids and webhook secrets do
**not** carry over. Current local `.env` is sandbox (`POLAR_ENV=sandbox`); verify passes there.

1. In Polar **production** dashboard: create an Organization Access Token with products + webhooks +
   checkouts/subscriptions/orders scopes. Confirm MoR / tax settings are approved to sell.
2. Locally (or in a throwaway shell), set production credentials — do **not** reuse the sandbox token:
   ```bash
   export POLAR_ENV=production
   export POLAR_ACCESS_TOKEN='polar_oat_…'   # production token
   export POLAR_WEBHOOK_URL='https://app.harvous.com'   # or your live API origin
   ```
3. Create catalog + webhook:
   ```bash
   npm run billing:setup -- --apply --url="$POLAR_WEBHOOK_URL"
   ```
   Copy the printed `POLAR_*` / `VITE_POLAR_*` product ids and `POLAR_WEBHOOK_SECRET` into **local
   `.env`** and **Netlify** (same keys). Set `POLAR_ENV=production` in both.
4. Confirm:
   ```bash
   npm run billing:verify
   ```
   Expect `POLAR_ENV → production` and all five products `ok`.
5. Checkout origins: there is **no** Polar dashboard “allowed origins” list for normal hosted
   checkout. Our flow creates a Checkout Session server-side and redirects to `checkout.url`
   (`successUrl` back to `/upgrade`). For **embedded** iframe checkout only, pass
   [`embed_origin`](https://polar.sh/docs/api-reference/checkouts/create-session) (e.g.
   `https://app.harvous.com`) on session create — that is not a dashboard setting. Apple Pay /
   Google Pay inside an embed need a one-time domain allow from Polar (`support@polar.sh` with
   org slug + domain). Smoke-test a founding/Plus purchase, then cancel in the portal if needed.
6. Keep sandbox credentials somewhere safe (password manager / Netlify context) if you still want a
   preview branch on sandbox; production Netlify site must use production ids only.

---

## 9. Church / org billing (future)

Clerk **Organizations** stay the identity layer (roles, memberships, `orgId` on `Spaces`/`Churches`).
Church **billing** rides Polar too — seat-based pricing (prorated seat-count changes, `seat.claimed`/
`seat.revoked` webhooks) maps onto the leader-seat model, and Polar's org reference (`externalId`/metadata)
onto `Churches.orgId` / `Churches.billingPlan`. Review stays individual — a church-sponsored seat is a
`source='church_seat'` Entitlements row that coexists with the member's own grants. See
[future/MONETIZATION_AND_PRICING.md](./future/MONETIZATION_AND_PRICING.md) §7 and
[future/CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md](./future/CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md).

> **Not related to Clerk Billing:** Clerk's org member cap (20 without the B2B Auth add-on, unlimited with
> it) is set via `PATCH /v1/organizations/{id}` `maxAllowedMemberships` and has nothing to do with how
> Harvous charges its users. It's a *staff* cap — congregants connect at the DB layer
> (`UserMetadata.connectedChurchId`), not as Clerk org members.

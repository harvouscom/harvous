# Church Org: Onboarding Runbook and Billing Follow-Ups

**Status as of v2.18.0 (August 4, 2026).** Church org is shipped and live on `main`,
gated at every entry point. Self-serve checkout is deliberately **not** wired — see
[Why billing isn't self-serve yet](#why-billing-isnt-self-serve-yet).

Companion docs: [BILLING_ARCHITECTURE.md](BILLING_ARCHITECTURE.md) (Polar, entitlements),
[CLERK_ARCHITECTURE.md](CLERK_ARCHITECTURE.md) (auth, organizations),
[future/PASTOR_FEATURES_ROADMAP.md](future/PASTOR_FEATURES_ROADMAP.md) (feature ladder).

---

## What shipped

| Area | State |
|---|---|
| Church registry | `Churches` table; admin-registered against a Clerk Organization, optionally linked to a Here's My Church directory record |
| Ministry channels | `Spaces` with `type='public'` + `orgId`. Staff author; congregants follow and read |
| Congregant receive | Browse + follow channels in My Church; "From your church" study feed on Home |
| Staff management | Church admins invite/remove their own staff; Clerk `organizationMembership.*` webhook reconciles membership rows |
| Role gating | Capabilities derived server-side from the Clerk org role — `publish`, `manage_staff`, `manage_billing`, `manage_templates`, `sermon_tools` |
| Org templates | `NoteTemplates.orgId` — church-provisioned starters (the sermon template rides these rails) |
| Teaching plan | `ChurchServices` — staff plan services (date, title, passage, series); congregants see the next one as "This Sunday" on Home and start a note from it. Role-gated on `sermon_tools` (v2.19.0) |
| Sponsorship | `churchIsSponsored()` — paid **or** inside a pilot window. Gates **writes only** |
| Billing | Product registry + checkout route + webhook branch exist; **Polar products are not created**, so checkout cannot complete |

**Everything is gated.** A `Churches` row must be admin-registered; congregant surfaces
need `UserMetadata.connectedOrgId`; staff surfaces need Clerk org membership. A user with
no church sees no church UI at all.

---

## Why billing isn't self-serve yet

Onboarding a church is **necessarily manual**: the Clerk Organization is created by hand in
the Clerk dashboard, the church is registered by a Harvous admin, and a staff owner has to
be designated. Wiring Polar checkout would automate the one step in that flow that isn't the
bottleneck.

Clerk's Organizations allowance also caps self-serve independently — roughly **100 Monthly
Retained Organizations app-wide**, so churches can't be onboarded in volume regardless of
how payment works.

The billing code is complete and dormant. Turning it on is configuration, not development.

---

## Onboarding a church today

1. **Create the Clerk Organization** (Clerk dashboard). Staff and volunteers only —
   congregants are *never* Clerk org members. Hard cap of 20; pending invites count toward it.
2. **Add the staff owner** to that org, and give them the `org:admin` role if they should
   manage the roster and billing. Custom roles `org:pastor` / `org:teacher` unlock teaching
   tooling without roster access.
3. **Register the church** at `/admin/churches` — pick the org from the list (no pasting
   opaque `org_` ids) and link its Here's My Church record so name and location stay accurate.
4. **Start the pilot** — "Start 30-day pilot" or "90 days". Without this the church is
   unsponsored and its staff cannot create anything.
5. **Create the first ministry channel.** Either the staff member does it from the My Church
   hub, or an admin does it via `POST /api/admin/churches/:churchId/spaces` with an explicit
   `ownerUserId` (validated against the Clerk roster — never the Harvous system user, so
   ownership never needs migrating later).
6. **The church invites its own staff** from the My Church hub. Acceptance reconciles
   automatically via the Clerk webhook; "Sync staff" in the hub is the fallback if a webhook
   is missed.
7. **Congregants connect themselves**: Settings → My Church → pick the church from the
   directory. That sets `connectedOrgId`. They then browse and follow channels in My Church,
   and followed channels feed Home.

---

## Turning billing on, when you want it

1. **Create two Polar products** in the same Polar organization as Plus and Connector:
   Church monthly (**$30**) and Church annual (**$216** — 40% off, the one discount
   offered to a church). Create them at these figures, not the $39/$390 this doc carried
   before v2.19 — nothing was ever sold at the old price, so there is no legacy row to keep.
2. **Set four env vars** (Netlify and local `.env`) — server ids and their `VITE_` twins:
   ```
   POLAR_CHURCH_PRODUCT_MONTHLY / POLAR_CHURCH_PRODUCT_ANNUAL
   VITE_POLAR_CHURCH_PRODUCT_MONTHLY / VITE_POLAR_CHURCH_PRODUCT_ANNUAL
   ```
3. **Verify**: as a staff member, `GET /api/church/billing?orgId=…` should return a populated
   `plans` array. Until then it returns `plans: []` and the hub shows "Contact Harvous to set
   up billing" — correct, gated behaviour, not an error.
4. **Confirm the webhook path** in Polar sandbox before going live: a church checkout carries
   `metadata.churchId`, and the webhook branch writes `Churches.billingPlan` from it. Church
   and personal money never cross — a staff member's church purchase must not mint them a
   personal Plus entitlement, and cancelling it must not revoke their own plan.

The prices live in [src/lib/billing-plans.ts](../src/lib/billing-plans.ts) as `key: 'church'`
rows with `listed: false`, so they never appear on the personal `/upgrade` page.

---

## Known gap: a church that pays by invoice

`Churches.billingPlan` is written by **exactly one code path** — the Polar webhook
(`applyChurchSubscription` in
[server/utils/church-entitlement.ts](../server/utils/church-entitlement.ts)). There is no
admin action to mark a church as paid.

**Today, if a church pays you outside Polar, the only way to keep it sponsored is to keep
extending its pilot window** from `/admin/churches`. That works — `churchIsSponsored()` treats
a live pilot and a paid plan identically — but the record will read "pilot" forever, and
nothing distinguishes a paying customer from a trial.

If invoice-paying churches become normal before Polar checkout is wired, add a small
admin-only endpoint that sets `billingPlan` directly (mirroring the `/pilot` endpoint), so the
church's state reflects reality. Until then, extending the pilot is the documented workaround,
not an oversight.

---

## Watch: pilot expiry

**"New Hope Assembly of God" is on a pilot through 2026-09-02.** When a pilot lapses:

- Staff **writes** are refused with `402 CHURCH_NOT_SPONSORED` — no new channels, church
  shared spaces, or staff invites.
- **Reads are untouched.** Everything already published stays readable, and congregants keep
  their followed channels. Lapsing must never take a congregation's study away.
- The hub shows the lapsed banner with a Subscribe button (which, until Polar products exist,
  falls back to "Contact Harvous").

Extend or end a pilot at `/admin/churches`. `pilotUntil` is never shortened by a cancel — a
church that cancels keeps whatever remains of its window.

---

## Docs that now contradict shipped behaviour

Still stale, and will mislead anyone reading them cold:

- **[future/CHURCH_ORG_AND_CURRICULUM.md](future/CHURCH_ORG_AND_CURRICULUM.md)** — describes
  delivery via `InboxItems` with `sharingType='organization'` and the frozen `Members` table.
  Both are retired; delivery is broadcast spaces + `SpaceMemberships`. Also still quotes the
  old "3 shared spaces" limits, and a "Draft church tiers" line the reprice superseded.
- **[future/CHURCH_CONNECTION_SYSTEM.md](future/CHURCH_CONNECTION_SYSTEM.md)** — asserts
  "v0 is staff-only" and that congregant connect / "From your church" are dark. Both shipped.
- **[future/SHARING_AND_GROUPS_INFRASTRUCTURE.md](future/SHARING_AND_GROUPS_INFRASTRUCTURE.md)** —
  carries the full InboxItem org fan-out design with no banner saying it is historical.
- **[future/CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md](future/CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md)** —
  "one church per user" contradicts the locked multi-church model, and §8 still describes
  InboxItem delivery.
- **[future/README.md](future/README.md)** — says `Churches.billingPlan` and congregant connect
  are "Not yet" built.
- **`.claude/skills/marketing-agent/SKILL.md`** — "Never describe church org / curriculum as
  shipped." Now false, and it actively suppresses accurate marketing copy.

Fixed in v2.19.0 (kept here so the list reads as a changelog, not a standing debt):
`PASTOR_FEATURES_ROADMAP.md` (item 7 + the stale v0 lock), `MONETIZATION_AND_PRICING.md` §7
(the four-tier ladder is now explicitly marked superseded, and the price is current), and the
church design gallery (`sceneRegistry.ts` speculative flags and the "Not built" phase labels).

---

## Deliberately deferred

- **`ChurchConnectionRequests`** — a church-approves-the-congregant flow. Today connection is
  self-select via the Here's My Church directory, which is sufficient for concierge pilots.
- **Aggregate engagement analytics** — deliberately last. "Review is never shared" is the
  privacy line: churches see adoption counts, never note content.
- **Unlimited staff add-on** — needs Clerk's Enhanced B2B plan (~$100/mo app-wide) to exceed
  20 org members. `sync-staff` refuses rosters over the cap rather than truncating.

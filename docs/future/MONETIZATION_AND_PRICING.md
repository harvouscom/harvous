# Monetization and Pricing Strategy

Canonical product and pricing model for Harvous paid features. Technical billing (Polar MoR,
entitlements, webhooks) lives in [`docs/BILLING_ARCHITECTURE.md`](../BILLING_ARCHITECTURE.md). Clerk
auth/orgs: [`docs/CLERK_ARCHITECTURE.md`](../CLERK_ARCHITECTURE.md).

**Status (July 2026): three products, one of them free. Simple pricing, 37signals-style — one price
per product, everything included, no tiers within a product.**

| Product | Price | What's in it |
|---|---|---|
| **Free** | $0 | Private study, forever. Unlimited notes, Remember surfaces, Compete free track. **Join** shared spaces — hosting is the paid line. |
| **Founding** | **$45/yr** | First **99** subscribers · **annual only** · lifetime price lock. |
| **Harvous Plus** | **$8/mo · $64/yr** | Everything: unlimited shared spaces (**50 people each**), Review, Challenges, **every season**. Annual is "four months free". |
| **Connector** | **$5/mo · $60/yr** | Separate add-on — CLI/MCP read access. **No annual discount.** Hard paywall, no trial. |
| **Church** | See §7 | Separate org track — where caps lift and spaces transfer from individuals. |

Plus a **30-day money-back guarantee** on Plus (cancel anytime). There is deliberately **no free
trial** and **no metered free tier**: free/paid is a categorical line (private vs. shared), not a
quota.

**Why no Season Pass SKU.** Seasons fold into Plus via `challenges`. Selling them separately meant
8–11 purchase decisions a year at a price point where the processor takes ~15%, plus a new SKU each
season. Plus includes every season; free keeps the free track. There is no `season_pass` feature key.

**Why Connector stays separate.** Different buyer (CLI/MCP power users, not small-group hosts).
Separate *products* are fine; *tiers within a product* are what this model avoids.

**Guiding principle:** Notes and passive **Remember** stay free. **Review** is paid (bundled into
Plus when it ships). **Compete** stays free to play. Hosting Shared Spaces is Plus; members join free.

> **Historical:** earlier drafts had a "Harvous Complete" tier, then a four-SKU split (Review / Group
> Sharing / Connector / Season Pass) at $5/$45 founding stepping to $9/$79. Both are superseded by the
> table above. Sections below marked *historical derivation* are kept for the reasoning, not the prices.

---

## 1. Product split

| Area | What it is | Monetization |
|---|---|---|
| **Capture** | Notes, threads, scripture pills | Free (notes unlimited on all plans) |
| **Remember** | Passive resurfacing — nudges, home trend cards, On This Day | Free (deterministic; no runtime AI) |
| **Review** | Active personal practice — AI quizzes from *your* notes, your pace | **Always paid; individual subscription** |
| **Compete** | Themed seasons, study guides, leaderboards | Current season **free track**; **Season Pass** for full guide + archive |
| **Group Sharing** | Unlimited owned shared spaces (host/admin for small groups — roster, optional cohort Compete) | Paid (live today as Premium / `unlimited` tier); members join spaces free and buy **Review** on their own |
| **Connector** | Read-only reference to your notes, spaces, threads, and study connections from Claude, Cursor, scripts, and MCP-compatible assistants | Paid, individual, **stackable add-on** — see Section 4 |
| **Church org** | Curriculum distribution, multiple leaders, admin | Future; pricing TBD — see Section 7 |

**Naming:** Internal North Star pillar **Learn** powers customer-facing **Review**. **Compete** is a
separate pillar — communal program, not personal memory.

---

## 2. Consumer SKUs (recommended pre-launch)

| SKU | Monthly | Yearly | Buyer |
|---|---|---|---|
| **Review** | $4 | $36 | Individual |
| **Group Sharing** | $6 | $48 | Individual (matches live [UpgradePage](../../spa/src/pages/UpgradePage.tsx)); host/admin includes roster and optional cohort Compete view |
| **Connector** (docs/npm: **Harvous Connector**) | $6 | $50 | Individual — power users, Claude/Cursor, CLI |
| **Season Pass** | — | $5–8 one-time | Individual (or host bulk codes later) |

> **Superseded — historical derivation only (see Status banner).** Review, Group Sharing and Season
> Pass are **not** standalone SKUs; they are Plus features. Connector is the only separate paid
> product, at **$5/mo · $60/yr**. Live prices are in the Status banner and
> [src/lib/billing-plans.ts](../../src/lib/billing-plans.ts) — that registry is the source of truth,
> not this table.

### Free tier — strictly private

Free is **private study**, forever. The paid line is *hosting*, not a quota — nothing to count, nothing
to explain.

- Unlimited notes
- Remember surfaces (themes, cross-refs, passages on Home, etc.)
- **Join** shared spaces — no cap on memberships, always free
- **0 owned shared spaces** — `FREE_OWNED_SHARED_SPACES_LIMIT = 0`
  ([server/utils/tier-limits.ts](../../server/utils/tier-limits.ts))
- Current Compete season — **free track** (play, basic access)
- Deterministic practice (connection MCQ, etc. from knowledge layer — no LLM)
- **No free AI Review**, **no trial**. A 30-day money-back guarantee de-risks Plus instead.

**How free users experience hosting before they buy:** they don't host — they *join*. A Plus host
brings up to 50 free members in, and those members use shared spaces for weeks before they ever
consider hosting one. That is the trial, and it is already built. The consequence to accept: the
**first 99 founders are the hard part**, because the loop has no hosts to seed it yet.

### Review (paid, individual)

- AI-generated quiz sessions from the user's own notes and preferences
- Grounded on [scripture-knowledge layer](./SCRIPTURE_KNOWLEDGE_LAYER.md) (cross-refs, themes, related notes)
- Web-first runtime: **Mistral Small** on server ([SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md))
- Each subscriber's Review is tied to **their account only** — not shareable via Group Sharing or church org

### Shared Spaces hosting (in Plus)

- **Unlimited** owned shared spaces — `PLUS_LIMITS.ownedSpaces = UNLIMITED`
  ([src/lib/billing-plans.ts](../../src/lib/billing-plans.ts))
- **50 people per space** — `MEMBERS_PER_SPACE_CAP = 50`
  ([server/utils/tier-limits.ts](../../server/utils/tier-limits.ts))
- Host/admin surface: roster view, optional private cohort view on the active Compete season
- Members join owned spaces free; each member who wants AI practice from their own notes subscribes
  to **Plus** on their own

**The member cap is the fence between a personal plan and a church plan — the space count is not.**
Spaces are rows; they cost nothing, so capping them protects no margin. Seats are the product line: a
congregation hits 50 and the space transfers to the org (see §7), while a small group rarely touches
it. 50 is generous for groups and still below most churches — large enough that ordinary groups don't
hit a wall on a plan they were already paying for, small enough that oversized personal spaces migrate
to a church org. Set this number by "where does a person end and an org begin", never by cost.

The theoretical hole (10 spaces × 50 people) is fine: that's ten distinct communities and real work
to run, and that person is a power user worth having.

**Onboarding copy (principle):** *"Run the group on Harvous. Everyone brings their own Review."*

---

## 3. Seasons (Compete) — included in Plus

**Compete** and **Review** are different products:

- **Compete** — Harvous-themed seasons, curated study guides, community leaderboards
- **Review** — "Quiz me on what *I* wrote" — personal, private

**Every season is included in Plus** (via the `challenges` feature key). Each season runs ~4–6 weeks
and brings a full study guide, bonus modules, archive access, and a completion marker. The current
season always has a **free track** so the community stays full.

### Why there is no Season Pass SKU

The one-time-per-season model was dropped before launch. Three reasons, in order of weight:

1. **Friction.** Seasons run 4–6 weeks, so a pass is 8–11 separate purchase decisions per year — the
   least simple thing in the entire model.
2. **Fee shape.** At the drafted $5–8, the processor takes ~15% of a $5 charge (5% + 50¢ flat). Small
   one-time prices are the worst possible shape under a per-transaction fee.
3. **Operational drag.** A new product to create, price, and retire every six weeks, forever.

Folding them in converts 8–11 friction points a year into one reason to *stay* subscribed. Curation
is a fixed cost that Plus already funds.

There is deliberately **no `season_pass` feature key** — see `FEATURE_KEYS` in
[src/lib/billing-plans.ts](../../src/lib/billing-plans.ts).

---

## 4. Connector — $5/mo · $60/yr

**Separate product, not a Plus tier.** Different buyer: a developer wiring notes into Claude/Cursor is
not a small-group host. Selling distinct products is consistent with simple pricing; tiering *within*
a product is not.

**No annual discount** — $60/yr is exactly 12 × $5. Discount the product you want commitment in (Plus,
where annual is four months free); don't lock a lifetime discount into an add-on whose demand is
unproven. Offering the undiscounted annual is still worth it: one charge instead of twelve saves
eleven flat processor fees (~$5.50/yr), and some buyers prefer a single line item to expense.

**No trial, hard paywall** — a developer already knows whether they want MCP access.

**Product name:** **Connector** (in-app upgrade page). **External / docs name:** **Harvous Connector**
— Claude Connectors Directory listing, npm package, MCP manifest. No **Harvous** prefix on the in-app
SKU (same pattern as **Review**, **Group Sharing**).

**Canonical boundaries:** [CONNECTOR_BOUNDARIES.md](./CONNECTOR_BOUNDARIES.md) — tools, guardrails,
auth, and permanent read-only scope.

**Who pays:** Individual power users who already use Harvous for capture and want to reference their
study from Claude Desktop, Cursor, personal scripts, and MCP-compatible AI assistants.

**Positioning:** *"Reference your Harvous study wherever you already work."* This is an outbound
add-on (Harvous data flowing *out* to other tools), distinct from the deferred inbound Harvous SDK
(other apps writing content *into* Harvous — see
[HARVOUS_SDK_AND_FUTURE_ROADMAP.md](./HARVOUS_SDK_AND_FUTURE_ROADMAP.md)).

### What it unlocks (v1)

- Authenticated **MCP server** at `POST /mcp` (Claude, Cursor, other MCP clients).
- Authenticated **CLI** via `/api/connector/*` and npm package **Harvous Connector**.
- **Read-only, query-shaped** tools only — see [CONNECTOR_BOUNDARIES.md](./CONNECTOR_BOUNDARIES.md)
  for the v1 tool catalog (search, get note, list spaces/threads/notes, study-thread connections,
  optional share-token lookup). **No bulk "export all notes" endpoint.**
- **Hybrid auth:** Clerk OAuth 2.1 for MCP; **1 revocable personal API key** for CLI/scripts (same
  `userId`, same `hasCliMcpAccess` gate).
- Visible **usage counter** on the account page.

### Why read-only, query-shaped (retention safeguard)

The add-on makes Harvous useful as a **live reference layer** for other tools without turning it into
a one-time migration/export tool. If Connector could dump the entire corpus in one call, a power user
could mirror Harvous elsewhere and stop opening the app — killing the reason to keep capturing here.
Query-shaped access preserves the reason to keep capture, organization, and Remember/Review inside
Harvous. Grounded in the "not infrastructure" and "not locked in" principles already in
[HARVOUS_SDK_AND_FUTURE_ROADMAP.md](./HARVOUS_SDK_AND_FUTURE_ROADMAP.md) Section 4.

**Permanent read-only:** Connector does **not** gain create/edit/delete tools in a future tier.
Writes stay in the Harvous app (and deferred inbound SDK for partners).

### Rate limits / fair use (draft — numbers to be finalized before launch)

- **Per-user daily cap:** ~1,000 requests/day. Sized generously for personal agent workflows, not
  scraping.
- **Per-minute burst cap:** ~60 requests/min. Blocks hot-loop and misconfigured-agent abuse without
  interrupting normal interactive use.
- **Max page size:** 25–50 items per list/search page.
- **No bulk export endpoint.** All endpoints scoped and paginated.
- **Revocable key + visible usage counter** on the account page so users can self-manage.
- Fair-use language modeled on the existing "Fair-use soft cap on Review sessions" open item in
  Section 9 — soft caps with a clear message beat hard walls for retention.

### Not in v1 (and never for writes)

- **Write access** (create note, edit note via Connector) — **never**; permanent product boundary.
- **Team/shared keys** under Group Sharing or church org — see Open decisions in Section 9.
- **Bulk export.** If the user wants their data out, that's a separate account-level export feature,
  not the Connector surface.
- **Free tier or trial** — hard paywall; `hasCliMcpAccess` required.

---

## 5. Referral

Today: [REFERRAL_BONUS_IMPLEMENTATION.md](../REFERRAL_BONUS_IMPLEMENTATION.md) — note-limit bonus on
referral signup.

**Future (study-shaped, not growth-hacky):**

- Refer a friend who subscribes to **Review** → both get a short Review trial extension or Season Pass
  discount
- Refer a **host** → Season Pass or Group Sharing trial month
- Small-group milestone (e.g. 5 accounts in a space) → host reward (Season Pass, not free Review for
  the whole group)

Implementation flagged future; rewards should be **access to study**, not cash.

---

## 6. Technical entitlements — **shipped**

The `Entitlements` table is the source of truth for paid access, not `UserMetadata.tier` (that column
is retired and inert; see the `@deprecated` block in
[tier-limits.ts](../../server/utils/tier-limits.ts)). Gates check **feature keys**, never plan names or
providers — see [entitlements.ts](../../server/utils/entitlements.ts).

| Feature key | Gates | Granted by |
|---|---|---|
| `shared_spaces` | Owning shared spaces (`canCreateSharedSpace`) | Plus |
| `review` | AI quiz session generation (when Review ships) | Plus |
| `challenges` | Full seasons, incl. guide + archive | Plus |
| `connector` | Connector API key, MCP OAuth, `/api/connector/*` + `/mcp` reads | Connector (separate product) |

There is no `season_pass` key — Plus includes every season via `challenges`.

**Plus grants `review` and `challenges` from day one**, before those products exist. Nothing gates on
them yet, and issuing the rows now means existing subscribers need no backfill when they ship.

**Sources.** `EntitlementSource` is `'billing' | 'admin_grant' | 'church_seat' | 'trial'`, unique on
`(userId, featureKey, source)`. Provider sync only ever touches `billing` rows, so an `admin_grant`
(scholarship / comp) survives a Polar reconcile. Grant one with
`setFeatureEntitlement(userId, key, true, 'admin_grant')`.

> ⚠️ **Known bug — blocks any future trial.** `listActiveFeatureKeys` filters on `status = 'active'`
> only and never checks `expiresAt`, so a `trial` (or any expiring) entitlement grants access
> **forever**. Not launch-blocking today because there is no trial, but it must be fixed before one
> ships, and `church_seat` rows may want expiry too.

**Founding cap.** `FOUNDING_CAP = 99`, enforced by `countFoundingClaims()` — distinct users with a row
on the founding product, **any status**. Counting canceled rows too is deliberate: the promise is "the
first 99 people", not "99 at a time", so a founder who churns must not free a lifetime-locked slot.
Checked at `/api/billing/plans` (UI) and re-checked at `/api/billing/checkout` (a stale page must not
claim slot 100). Two simultaneous checkouts at slot 99 can both land; selling 101 is not worth a
distributed lock at launch volume.

---

## 7. Church org (future — draft pricing for pilot)

**Vision:** Leader connects church → church adopts Harvous → church pays for org-level curriculum and
leader seats with admin tools. See [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md).

**Review stays individual.** Church may optionally buy **bulk Review seat packs** — each member
**claims** a seat so AI still runs on their notes only (payer ≠ shared AI access).

**Status:** Draft tiers below for friendly-church pilot — not committed in billing until validated.
Supersedes the older $75 / $125 / $200 placeholders in
[CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md) (technical file only).

### Position vs Planning Center

[Planning Center](https://www.planningcenter.com/pricing) is modular, transparent, and à la carte:
People free, products like Groups and Services from ~$15/mo each, no contracts, churches stack only
what they use. Mid-size churches often spend **$100–300/mo** across multiple modules.

**Harvous is not a full ChMS replacement.** We do not compete on check-ins, volunteer scheduling,
giving processing, or facilities. We complement PC on **study memory + curriculum to connected
members**:

| Planning Center | Harvous wedge |
|---|---|
| Groups (roster, events) | Shared study spaces + notes layer |
| Publishing (app, sermon notes) | Curriculum threads pushed to "From your church" |
| People (database) | Optional link via church connection; not a CRM |

**Pitch anchor:** *"Keep Planning Center. Harvous is where your people's Bible study lives — you
publish the guide; they keep personal notes; Review helps each person remember what they learned."*

### Recommended tiers (modular — Option A)

Public pricing for standard plans; no sales call required at entry tiers.

| Tier | Monthly (draft) | Included |
|---|---|---|
| **Church Connect** | **$0** | Link congregation; limited curriculum (e.g. 2 pushes/quarter); current Compete free track |
| **Church Study** | **$29–39** | ~3 **leader seats**, up to **150 connected** members, curriculum to inbox / "From your church" |
| **Church Study Plus** | **$59–79** | ~10 leaders, **500 connected**, unlimited curriculum pushes, **full seasons for all connected members** |
| **Church Network** | **$99–149** | Up to **20 staff** (Clerk org cap), **1,500+ connected**, engagement analytics, group targeting |

**À la carte add-ons:**

| Add-on | Price (draft) | Notes |
|---|---|---|
| **Plus seat pack** | **$2–3/seat/mo** (min 10) | Church pays; each member **claims** an individual Plus seat |
| **Extra leader seat** | **$12–15/mo** | Above tier-included leaders |
| **Plus scholarships** | **$2–3/seat/mo** | Same mechanics; youth / new believers pool |

**The à-la-carte church-wide Season Pass is removed**, alongside the individual one (§3). It was also
the one drafted item that was underwater: Church Study Plus at $69/mo (~$828/yr) bundled "one pass per
active season", and at 8–11 seasons a year against a $79–149 retail pass, that was **$632–1,600 of
passes inside an $828 tier**. Seasons are now a tier benefit, and the inconsistency disappears with
the SKU.

**On the seat discount:** retail Plus is $8/mo, so a $2–3 church seat is a 63–75% bulk break. That is
deliberate — the real per-seat cost is ~$0.10/mo (see §3 fee note and the cost constraint in
[billing-plans.ts](../../src/lib/billing-plans.ts)), so even $2 holds >90% margin. Church procurement
responds to a steep, legible break far better than to a 25% one, and discounting *seats* is much
cheaper than discounting the consumer price.

**Example MRR per church:** Church Study Plus ($69) + 25 Plus seats ($50–75) = **$119–144/mo** — the
org fee is high-margin; seat packs carry the (small) per-active-seat AI cost.

### Alternative: leader-based pricing (Option B)

| Component | Price (draft) |
|---|---|
| Platform base | $19/mo |
| Per leader seat | $12/mo (Group Sharing–class hosting under org) |
| Connected members | Included to 500; tier bump above |

Example: 5 small-group leaders → **$19 + 5×$12 = $79/mo**.

### Features to present (by tier)

**Church Connect (free)**

- Church profile; members link via My Church
- Limited curriculum pushes
- Congregation on Compete free track

**Church Study (paid core)**

- Publish threads/notes to all connected members ("From your church")
- Leader seats — group leaders host shared spaces under the org (members join free)
- Align curriculum with sermon series + small groups
- Optional private church cohort on Compete
- Admin roster (connected members / groups — not private note bodies)
- **Works alongside Planning Center** — no migration

**Church Study Plus**

- Everything in Study
- Church-wide Season Pass for active church series
- Group targeting (men's, youth, ESL, etc.)
- Aggregate engagement analytics (opens, challenge completion — privacy-safe)

**Review add-on (any tier)**

- *"We don't give everyone the same AI — each person reviews their own notes."*
- Church-sponsored seats; optional student scholarships

**Not in scope for church pitch:** CRM, giving, scheduling, check-ins, facilities.

### Rollout for church pricing

1. Pilot **Church Study** at **$29–39** with 2–3 partner churches before publishing tiers.
2. Measure curriculum push engagement and leader adoption.
3. Adjust vs Planning Center Groups entry (~$15–30/mo) — Harvous charges for **curriculum + study
   memory**, not roster alone.

### Open decisions (church)

- [ ] Lock tier prices after pilot (Connect free / Study / Study Plus / Network)
- [ ] Option A (tier bundles) vs Option B (base + per leader)
- [ ] Review seat pack minimum and church discount ($3 vs retail $4)
- [ ] Curriculum SKUs (per quarter vs church-wide Season Pass bundle)
- [ ] Integration story ("works alongside Planning Center" messaging)
- [ ] Clerk Org vs DB-only delivery (see existing church docs)

---

## 8. Rollout sequence

1. **Deterministic Compete + Review product** — UX and grounding builder; Mistral Review endpoint
2. **Review runtime** — no new billing needed; Plus already grants `review`
3. **Challenges** — first themed season, included in Plus
4. **Referral** rewards update
5. **Church org** — research pricing vs Planning Center; pilot with friendly churches

**Deferred:** [Give Me More Context](./GIVE_ME_MORE_CONTEXT.md) — not v1 paid scope.

---

## 9. Open decisions (consumer)

**Closed (July 2026):**

- [x] ~~Trial on signup~~ — **no trial.** 30-day money-back guarantee instead: same de-risking, zero
      entitlement plumbing, and it sidesteps the `expiresAt` bug in §6.
- [x] ~~Season Pass price~~ — **no Season Pass.** Folded into Plus via `challenges` (§3).
- [x] ~~Connector price~~ — **$5/mo · $60/yr**, no annual discount.
- [x] ~~Founding price / cap~~ — **$45/yr, annual only, first 99**, lifetime lock, then straight to
      standard with a "all 99 claimed" sold-out state (no second tier).

**Still open:**

- [ ] Fair-use soft cap on Review sessions — hygiene, not economics: at ~$0.001/session a user needs
      ~4,250 sessions/month to eat one subscription. Decide before Review ships, not before launch.
- [ ] Connector: exact rate limit numbers (requests/day, requests/min, max page size) before launch
- [ ] Connector: whether church tiers get a higher shared limit, or Connector stays purely individual
- [ ] Whether a **bundle product** is worth adding if Plus + Connector dual-buy turns out common —
      two subscriptions means two flat processor fees ($1.65 on $13 vs $1.15 as one charge, ~$6/yr per
      dual customer). Not worth the extra SKU until the data says so.
- [ ] Fix `listActiveFeatureKeys` to honor `expiresAt` (§6) — not launch-blocking without a trial, but
      it blocks ever adding one.

---

## Related docs

- [SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md) — Review runtime AI + grounding
- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — Remember / Learn / Compete pillars
- [CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md) — technical billing
- [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) — church ladder
- [SPACE_MODES_PRODUCT.md](./SPACE_MODES_PRODUCT.md) — sharing limits
- [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) — shared spaces implementation
- [CONNECTOR_BOUNDARIES.md](./CONNECTOR_BOUNDARIES.md) — Connector v1 scope, tools, guardrails, auth
- [HARVOUS_SDK_AND_FUTURE_ROADMAP.md](./HARVOUS_SDK_AND_FUTURE_ROADMAP.md) — Connector vs. the deferred inbound SDK

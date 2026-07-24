# Monetization and Pricing Strategy

Canonical product and pricing model for Harvous paid features. Technical billing (Paddle MoR,
entitlements, webhooks) lives in [`docs/BILLING_ARCHITECTURE.md`](../BILLING_ARCHITECTURE.md). Clerk
auth/orgs: [`docs/CLERK_ARCHITECTURE.md`](../CLERK_ARCHITECTURE.md).

**Status (July 2026):** Ship **one plan — Harvous Plus** (founding **$5/mo · $45/yr**, stepping to
**$9/mo · $79/yr** when Review + Challenges land). À-la-carte SKUs below are historical derivation;
they are **not** sold separately at launch. Shared Spaces hosting is the first Plus feature;
joining spaces stays free.

**Guiding principle:** Notes and passive **Remember** stay free. **Review** is paid (bundled into
Plus when it ships). **Compete** stays free to play. Hosting Shared Spaces is Plus; members join free.

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

Review, Group Sharing, and Connector are **separate, independently stackable subscriptions** — no
bundle SKU in v1. A user can hold any combination at once and pays for each product independently
(e.g. all three à la carte = $16/mo).

### Free tier

- Unlimited notes
- Remember surfaces (themes, cross-refs, passages on Home, etc.)
- Join shared spaces (no cap on memberships)
- **3 owned shared spaces** (enforced in [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts))
- Current Compete season — **free track** (play, basic access)
- Deterministic practice (connection MCQ, etc. from knowledge layer — no LLM)
- **No free AI Review** (no monthly AI credits). Optional **one-time trial** on signup flagged as open
  decision below.

### Review (paid, individual)

- AI-generated quiz sessions from the user's own notes and preferences
- Grounded on [scripture-knowledge layer](./SCRIPTURE_KNOWLEDGE_LAYER.md) (cross-refs, themes, related notes)
- Web-first runtime: **Mistral Small** on server ([SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md))
- Each subscriber's Review is tied to **their account only** — not shareable via Group Sharing or church org

### Group Sharing (paid)

- Unlimited owned shared spaces (today: `UserMetadata.tier === 'unlimited'`)
- 150 members per space cap (invisible, both tiers)
- Host/admin surface: roster view, optional private cohort view on the active Compete season (future — folded in from the deprecated Group Leader SKU)
- Members join owned spaces free; each member who wants AI practice from their own notes subscribes to **Review** individually ($4/mo)

**Onboarding copy (principle):** *"Run the group on Harvous. Everyone brings their own Review."*

---

## 3. Season Pass (Compete)

**Compete** and **Review** are different products:

- **Compete** — Harvous-themed seasons, curated study guides, community leaderboards
- **Review** — "Quiz me on what *I* wrote" — personal, private

**Season Pass** (one-time per season, ~4–6 weeks):

- Full study guide for that theme
- Bonus modules / archive access for that season
- Optional badge or completion marker
- Current season always has a **free track** so the community stays full

Leaders may bulk-buy Season Pass codes for their group later; that does not include member Review.

---

## 4. Connector

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

## 6. Technical entitlements (conceptual — not implemented)

Today: `UserMetadata.tier` is `'free' | 'unlimited'` ([tier-limits.ts](../../server/utils/tier-limits.ts));
`unlimited` maps to **Group Sharing** only.

**Target shape** (schema decision when Review ships):

| Flag / field | Gates |
|---|---|
| `hasReview` | AI quiz session generation (`canUseAiFeature`) |
| `hasGroupSharing` | Unlimited owned shared spaces + host/admin surface (roster, optional cohort Compete) |
| `hasCliMcpAccess` | Connector API key issuance, MCP OAuth handshake, and all `/api/connector/*` + `/mcp` reads |
| `seasonPassIds[]` | Active Season Pass entitlements |
| `reviewSponsor` (optional) | Church bulk seat — still activates **individual** Review on claim |

Stripe / Clerk products: separate plan IDs for Review, Group Sharing, and Connector;
Season Pass as one-time or annual SKU per season.

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
| **Church Study Plus** | **$59–79** | ~10 leaders, **500 connected**, unlimited curriculum pushes, **one church-wide Season Pass** per active season |
| **Church Network** | **$99–149** | Up to **20 staff** (Clerk org cap), **1,500+ connected**, engagement analytics, group targeting |

**À la carte add-ons:**

| Add-on | Price (draft) | Notes |
|---|---|---|
| **Review seat pack** | **$3/seat/mo** (min 10) | Church pays; each member **claims** individual Review |
| **Extra leader seat** | **$12–15/mo** | Above tier-included leaders |
| **Church-wide Season Pass** | **$79–149 once** | Full guide for Lent / Advent / sermon series — all connected members |
| **Review scholarships** | **$3/seat/mo** | Same mechanics; youth / new believers pool |

**Example MRR per church:** Church Study Plus ($69) + 25 Review seats ($75) = **$144/mo** — org fee
is high-margin; Review packs carry Mistral cost per active seat.

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
2. **Review billing** — `hasReview`, upgrade paths
3. **Season Pass** — first themed season
4. **Referral** rewards update
5. **Church org** — research pricing vs Planning Center; pilot with friendly churches

**Deferred:** [Give Me More Context](./GIVE_ME_MORE_CONTEXT.md) — not v1 paid scope.

---

## 9. Open decisions (consumer)

- [ ] One-time Review trial on signup (yes/no, length)
- [ ] Season Pass price per season ($5 vs $8)
- [ ] Fair-use soft cap on Review sessions for paid tier vs truly unlimited
- [ ] Grandfather existing Premium (`unlimited`) users when Review launches
- [ ] Connector: exact rate limit numbers (requests/day, requests/min, max page size) before launch
- [ ] Connector: whether Group Sharing / church tiers get a higher shared limit, or Connector stays purely individual
- [ ] Connector: final price point ($6/mo vs $8/mo) after gauging niche demand

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

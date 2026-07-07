# Monetization and Pricing Strategy

Canonical product and pricing model for Harvous paid features. Complements the technical billing
patterns in [CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md) (Clerk metadata,
Stripe webhooks, org patterns). **Status:** decision doc; pre-launch prices are recommended defaults
until Review ships.

**Guiding principle:** Notes and passive **Remember** stay free. **Review** (personal AI practice) is
always paid and always individual. **Compete** (community challenges) stays free to play; depth via
**Season Pass**. **Group Leader** pays to host; members join spaces free and buy **Review** on their
own if they want it.

---

## 1. Product split

| Area | What it is | Monetization |
|---|---|---|
| **Capture** | Notes, threads, scripture pills | Free (notes unlimited on all plans) |
| **Remember** | Passive resurfacing — nudges, home trend cards, On This Day | Free (deterministic; no runtime AI) |
| **Review** | Active personal practice — AI quizzes from *your* notes, your pace | **Always paid; individual subscription** |
| **Compete** | Themed seasons, study guides, leaderboards | Current season **free track**; **Season Pass** for full guide + archive |
| **Shared Spaces** | Up to **10** owned shared spaces (collaboration) | Paid add-on (`UserMetadata.sharedSpacesAddOn`) — supersedes the retired Group Sharing / `unlimited` tier |
| **Group Leader** | Host/admin for small groups — spaces, roster, cohort Compete | Paid (future SKU); does **not** include member Review |
| **Church org** | Curriculum distribution, multiple leaders, admin | Future; pricing TBD — see Section 7 |

**Naming:** Internal North Star pillar **Learn** powers customer-facing **Review**. **Compete** is a
separate pillar — communal program, not personal memory.

---

## 2. Consumer SKUs (recommended pre-launch)

| SKU | Monthly | Yearly | Buyer |
|---|---|---|---|
| **Review** | $4 | $36 | Individual |
| **Shared Spaces** | $6 | $48 | Individual (matches live [UpgradePage](../../spa/src/pages/UpgradePage.tsx)) |
| **Season Pass** | — | $5–8 one-time | Individual (or leader bulk codes later) |
| **Group Leader** | ~$15–19 | TBD | Small-group / ministry leader |

Review and Shared Spaces are **separate subscriptions** — no bundle SKU. Users who want both pay for each product independently ($10/mo à la carte).

### Free tier

- Unlimited notes
- Remember surfaces (themes, cross-refs, passages on Home, etc.)
- Join shared spaces (no cap on memberships)
- **0 owned shared spaces** (enforced in [server/utils/tier-limits.ts](../../server/utils/tier-limits.ts))
- Current Compete season — **free track** (play, basic access)
- Deterministic practice (connection MCQ, etc. from knowledge layer — no LLM)
- **No free AI Review** (no monthly AI credits). Optional **one-time trial** on signup flagged as open
  decision below.

### Review (paid, individual)

- AI-generated quiz sessions from the user's own notes and preferences
- Grounded on [scripture-knowledge layer](./SCRIPTURE_KNOWLEDGE_LAYER.md) (cross-refs, themes, related notes)
- Web-first runtime: **Mistral Small** on server ([SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md))
- Each subscriber's Review is tied to **their account only** — not shareable via Group Leader or church org

### Shared Spaces (paid add-on)

- Up to **10** owned shared spaces (`UserMetadata.sharedSpacesAddOn === true`); joining a shared space is
  always free, on every plan.
- **30** people per space cap (invisible, every plan).
- **Retired July 2026:** the old `Group Sharing` name and the `UserMetadata.tier === 'unlimited'`
  mechanism. Zero subscribers at retirement — no grandfathering. See
  [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md).

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

## 4. Group Leader

**Who pays:** The person running the small group (leader, facilitator, youth leader).

**What they get:**

- Shared Spaces–class hosting (unlimited or high-cap owned shared spaces)
- Member invites — **join the leader's spaces at no extra sharing cost**
- Leader admin: roster, optional private cohort view on active Compete season
- Optional bulk Season Pass codes (future)

**What invited members do NOT get from the leader's subscription:**

- **Review** — each person who wants AI practice from their own notes subscribes individually ($4/mo)

**Leader onboarding copy (principle):** *"Run the group on Harvous. Everyone brings their own Review."*

**Seat cap:** Limit active members per leader plan (e.g. 12–25) to prevent one subscription replacing
many individual Review subs for AI; sharing seats are the intended subsidy.

**Ladder to church org:** Group Leader is v1 of "someone pays so the group can gather." When a church
formally adopts Harvous, the org may supersede or bundle multiple leader seats — see Section 7.

---

## 5. Referral

Today: [REFERRAL_BONUS_IMPLEMENTATION.md](../REFERRAL_BONUS_IMPLEMENTATION.md) — note-limit bonus on
referral signup.

**Future (study-shaped, not growth-hacky):**

- Refer a friend who subscribes to **Review** → both get a short Review trial extension or Season Pass
  discount
- Refer a **leader** → Season Pass or Group Leader trial month
- Small-group milestone (e.g. 5 accounts in a space) → leader reward (Season Pass, not free Review for
  the whole group)

Implementation flagged future; rewards should be **access to study**, not cash.

---

## 6. Technical entitlements (conceptual — not implemented)

Today: `UserMetadata.sharedSpacesAddOn` (boolean) gates **Shared Spaces**
([tier-limits.ts](../../server/utils/tier-limits.ts)). The legacy `UserMetadata.tier` (`'free' | 'unlimited'`)
column still exists for the retired backfill script but grants nothing as of July 2026.

**Target shape** (schema decision when Review ships):

| Flag / field | Gates |
|---|---|
| `hasReview` | AI quiz session generation (`canUseAiFeature`) |
| `hasGroupSharing` (implemented as `UserMetadata.sharedSpacesAddOn`) | Unlimited owned shared spaces |
| `hasGroupLeader` | Leader admin + member seat pool |
| `seasonPassIds[]` | Active Season Pass entitlements |
| `reviewSponsor` (optional) | Church bulk seat — still activates **individual** Review on claim |

Stripe / Clerk products: separate plan IDs for Review, Shared Spaces, Group Leader; Season Pass as
one-time or annual SKU per season.

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
| Per leader seat | $12/mo (Group Leader–class hosting under org) |
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
4. **Group Leader** SKU + seat enforcement
5. **Referral** rewards update
6. **Church org** — research pricing vs Planning Center; pilot with friendly churches

**Deferred:** [Give Me More Context](./GIVE_ME_MORE_CONTEXT.md) — not v1 paid scope.

---

## 9. Open decisions (consumer)

- [ ] One-time Review trial on signup (yes/no, length)
- [ ] Group Leader exact price and seat cap
- [ ] Season Pass price per season ($5 vs $8)
- [ ] Fair-use soft cap on Review sessions for paid tier vs truly unlimited
- [ ] Grandfather existing Premium (`unlimited`) users when Review launches

---

## Related docs

- [SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md) — Review runtime AI + grounding
- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — Remember / Learn / Compete pillars
- [CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md) — technical billing
- [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) — church ladder
- [SPACE_MODES_PRODUCT.md](./SPACE_MODES_PRODUCT.md) — sharing limits
- [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) — shared spaces implementation

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

**Vision:** Church adopts a Harvous org account → pays a **base** platform fee → optionally stacks
**church add-ons** (same pattern as individual Shared Spaces / Review). See
[CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) and
[CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md).

**Review stays individual.** Church may optionally buy **bulk Review seat packs** — each member
**claims** a seat so AI still runs on their notes only (payer ≠ shared AI access).

**Status:** Draft base + add-ons for friendly-church pilot — not committed in billing until validated.
Supersedes Connect / Study / Study Plus / Network ladder drafts and the older $75 / $125 / $200
placeholders in [CLERK_MONETIZATION_ARCHITECTURE.md](./CLERK_MONETIZATION_ARCHITECTURE.md) (that
file’s Clerk `memberLimit` 100/500 figures are **connected-member targets**, not Clerk org size —
congregants are never Clerk org members).

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

### Clerk COGS (Harvous → Clerk)

| Constraint | Meaning for Harvous |
|---|---|
| **20 members / org** (standard) | Every church base includes up to **20 staff/volunteers** in the Clerk org. Congregants never join Clerk. |
| **100 MRO / app** included | ~100 churches with 2+ retained staff before ~$1/MRO overage. |
| **Enhanced B2B** (~$100/mo app-wide) | Unlocks **unlimited members per org** (plus custom roles, domain restrict, etc.). Buy only when selling **Unlimited staff**; Harvous still gates >20 per church that purchased that add-on. |

**No public free Connect org.** Congregant HMC / “My church” linking does not create a Clerk org or burn an MRO. Pilots = complimentary base via `Churches.isActive`, not a $0 SKU.

### Recommended model: base + church add-ons

Same shape as individual add-ons — one platform fee, optional capabilities.

| SKU | Monthly (draft) | Yearly (draft) | Includes |
|---|---|---|---|
| **Church base** | **$39** | **$390** (~2 mo free) | Clerk org + Harvous `Churches` row; **20 staff**; congregant link / My Church hub for staff. No curriculum publish, church Shared Spaces, or analytics until add-ons. |
| **Curriculum** add-on | **$15** | **$150** | Ministry channels; publish to connected members; “From your church” |
| **Church Shared Spaces** add-on | **$9** | **$90** | Church-scoped Shared Spaces (sponsored; step up from personal $6) |
| **Analytics** add-on | **$9** | **$90** | Privacy-safe engagement aggregates; targeting later |
| **Unlimited staff** add-on | **$25** | **$250** | Staff seats **>20** for that church. Requires Clerk Enhanced on the Harvous app (~4 buyers cover the $100/mo COGS). |

**Example stacks:** base + curriculum = **$54/mo**; + Shared Spaces = **$63/mo**; all add-ons = **$97/mo**.

**À la carte (any church on base):**

| Add-on | Price (draft) | Notes |
|---|---|---|
| **Review seat pack** | **$3/seat/mo** (min 10) | Church pays; each member **claims** individual Review |
| **Church-wide Season Pass** | **$79–149 once** | Full guide for Lent / Advent / sermon series — all connected members |
| **Review scholarships** | **$3/seat/mo** | Same mechanics; youth / new believers pool |

**Schema direction (when billing wires):** `billingPlan` ≈ base subscribed (`'church'` or similar); boolean/JSON flags e.g. `curriculumAddOn`, `churchSharedSpacesAddOn`, `analyticsAddOn`, `unlimitedStaffAddOn`. Pilot: `isActive` implies complimentary base; add-ons off until Stripe/Clerk Billing.

### What base vs add-ons mean in product

**Church base**

- Staff org (≤20 Clerk seats); admin register + HMC directory link
- Congregants connect via Harvous DB (never Clerk) when connect ships
- Works alongside Planning Center — no migration

**Curriculum add-on**

- Publish ministry channels / “From your church”
- Align curriculum with sermon series + small groups

**Church Shared Spaces add-on**

- Create/migrate church-scoped Shared Spaces (`orgId` set); church-sponsored

**Analytics add-on**

- Aggregate engagement (opens, completion — privacy-safe); group targeting later

**Unlimited staff add-on**

- Lift Harvous 20-staff sync/invite cap for that church after Clerk Enhanced is enabled app-wide

**Review packs (any church on base)**

- *"We don't give everyone the same AI — each person reviews their own notes."*

**Not in scope for church pitch:** CRM, giving, scheduling, check-ins, facilities.

### Rollout for church pricing

1. Pilot **Church base** (+ chosen add-ons) with 2–3 partner churches before publishing prices.
2. Measure curriculum push engagement and Shared Spaces adoption.
3. Adjust vs Planning Center Groups entry (~$15–30/mo) — Harvous charges for **curriculum + study
   memory**, not roster alone.
4. Enable Clerk Enhanced only when the first church needs Unlimited staff.

### Open decisions (church)

- [ ] Lock base / add-on prices after pilot ($39 vs $29 base; curriculum in base vs add-on)
- [ ] Review seat pack minimum and church discount ($3 vs retail $4)
- [ ] Curriculum SKUs (per quarter vs church-wide Season Pass bundle)
- [ ] Integration story ("works alongside Planning Center" messaging)
- [ ] Exact `Churches` add-on column shape vs Clerk Billing metadata

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

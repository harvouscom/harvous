# Church Org Accounts & Education Curriculum Management

> **Updated July 2026** against the shared-spaces foundation. Delivery now rides
> the spaces rails (org-owned **ministry education** broadcast spaces), not the
> legacy InboxItems pipe. Schema groundwork has landed: `Churches`,
> `UserMetadata.connectedChurchId/connectedOrgId/connectedChurchAt`,
> `Spaces.orgId`, and `SpaceMemberships.role = 'leader'` (dormant). Admin
> provisioning is built; product UI is still gated — see
> [Locked product decisions](#locked-product-decisions-july-2026).

## Vision

A day when **churches have organization accounts** on Harvous for **education and curriculum management**: staff create and curate study content for specific ministries, and **attendees** receive that content because they're linked to the church org—no need to join every small group or chase a link. Harvous becomes the place where church curriculum is published and consumed by those who attend.

**MyChurchPanel** evolves from "which church do I go to?" (free-text name/city/state) to **syncing with available church organizations** from Clerk: the user sees a list of church orgs (e.g. churches that have signed up for Harvous) and can **link their account** to their church. Once linked, curriculum from the church's ministry channels appears in their experience—e.g. in a "From your church" area (a study feed, not a bulletin inbox).

---

## Two Layers of Sharing

### Layer 1: Shared Spaces (shipped — Planning Center Groups lane)

- **Same product everywhere:** Still called **Shared Spaces**, same chrome/styling (color tile). Placement differs by sponsorship:
  - **Personal** (My Home): `type='shared'` + `orgId` null. **Owner-pays** Shared Spaces add-on (`UserMetadata.sharedSpacesAddOn`): 0 owned without it, up to 10 with it. Counts toward personal owned limit.
  - **Church-scoped** (My Church): `type='shared'` + `orgId` set. **Church-sponsored** — created at the church or **migrated** from a member’s personal Shared Space (UI later). Does **not** count toward the personal owned limit; limits/billing derive from the church. Same UI name and styling as personal Shared Spaces.
- **Joining** is always free and uncapped for the joiner; each shared space holds up to 30 people (`MEMBERS_PER_SPACE_CAP` — shared spaces only; ministry broadcast spaces are exempt).
- **Use case (personal):** "I'm leading a small group and want to share a space with them."
- **Use case (church):** "Our church hosts this small-group Shared Space under My Church."
- **Planning Center:** Harvous **Groups** counterpart. See [CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md](./CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md).
- **Docs:** [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md), [FEATURES.md](../FEATURES.md), `server/utils/tier-limits.ts` (source of truth for limits).

### Layer 2: Church organization — ministry education channels

- **Church org accounts:** Church has a Clerk Organization + a Harvous `Churches` row (landed in schema). Only church staff/volunteers (≤20) are Clerk org members. Congregants are not added to the Clerk org.
- **My Church catalog = two lanes:** (1) church Shared Spaces (Layer 1, church-scoped) and (2) **ministry channels** created by church admins/staff.
- **Ministry channels — not Shared Spaces in UI:** `Spaces.orgId = Churches.orgId` and `type='public'`. A **followable feed** of church-authored content — curriculum first (adult education, sermon companions, leader packs), not limited to “a book”; **not** a bulletin. Staff author (`owner`/`leader`); congregants follow as `role='member'` — read + copy. Never call these “Shared Spaces.”
- **Use case:** "Our adult ministry publishes this quarter's study; everyone connected who follows that channel sees it."
- **Planning Center:** Harvous **Resources** counterpart. Groups stay on Shared Spaces.
- **Docs:** [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md), [PASTOR_FEATURES_ROADMAP.md](./PASTOR_FEATURES_ROADMAP.md).

Personal Shared Spaces stay the "I share my space" / Groups story. Church Shared Spaces are the same product under church sponsorship. Ministry channels are how the church publishes a followable feed (curriculum and other church-authored study content) to connected members.

### Church Shared Spaces vs ministry channels (locked distinction)

Both can appear under **My Church**. They are not the same product.

| | **Church Shared Spaces** | **Ministry channels** |
|---|---|---|
| **One-liner** | We study **together** | The church publishes; we **follow** |
| **UI name** | Shared Spaces (same as personal) | Ministry channels — never “Shared Spaces” |
| **Shape** | Collaborative group | Followable feed / broadcast |
| **Who creates** | At church, or migrate from a member’s personal Shared Space (UI later) | Church org admins / staff |
| **Who writes** | Members compose (same as Family / small group) | Staff author (`owner`/`leader`); followers read + copy / start-from-starter |
| **Data** | `type='shared'` + `orgId` | `type='public'` + `orgId` |
| **Chrome** | Color tile + people icon | Same **color tile behavior** + **RSS** glyph (not people icon) |
| **People / followers** | People count + roster + invites | **No public subscriber count or roster.** Staff (owner/leader) may open Followers for moderation. |
| **Current Thread** | Yes (group study threads) | **No** — feed of notes, not threaded study |
| **Caps** | Up to 30 people per space (`MEMBERS_PER_SPACE_CAP`) | Exempt from that cap (congregation-scale follow) |
| **Billing** | Church-sponsored (not personal owned-count) | Church-owned broadcast; not personal Shared Spaces add-on |
| **PCO analogue** | [Groups](https://www.planningcenter.com/groups) | [Resources](https://www.planningcenter.com/resources) |
| **Examples** | Young adults small group; men’s breakfast study | Adult education; sermon series companion; leader resource pack |

**Mental model:** Shared Space = roster + discussion. Ministry channel = subscribe to a church feed of study material (curriculum first; other staff-authored info feeds are the same rail). Followers are private; only channel staff see who follows for moderation.

### Ministry channel icon (guidance — not fully locked)

Channels are a **followable feed**, so the classic **RSS** glyph (`rss` / `square-rss` in Font Awesome) is a strong fit and reads as “subscribe / updates” without implying announcements.

Other candidates considered:

| Icon | When it fits |
|---|---|
| **`rss`** (prototype) | Feed / follow — glyph on the **same color tile** as Shared Spaces (`ProtoSpaceMenuIcon` + `iconName="rss"`) |
| **`square-rss`** | Same metaphor, boxed variant if we need denser chrome later |
| **`book-open`** | Curriculum / study-first framing (alternate) |
| **`tv`**, **`tower-broadcast`**, **`podcast`** | Broadcast / media — considered, not preferred |

**Do not** use the **church** icon for channel rows — that mark is reserved for My Church / the org. Prefer RSS over megaphone/newspaper so we don’t slide into “bulletin / announcements.”

**Channel dashboard chrome (locked):** No people count / “just you” for followers. No Current Thread section. **Color & background** settings match Shared Spaces (same `SPACE_COVER_PICKER_COLORS` → tile accent + About hero cover); staff edit via Channel settings. Follower list is staff-only moderation. Future cover imagery: [SPACE_COVER_IMAGE_VARIANTS](./SPACE_COVER_IMAGE_VARIANTS.md) (5 colors × 5 thumbs × light/dark).

**Publish cadence (ministry channels):** Staff declare update frequency in Channel settings (`Spaces.publishCadence`: daily / weekly / biweekly / monthly / quarterly / irregular). Primary signal is **intent** (Apple Podcasts–style). Observed lag uses latest curriculum note `createdAt` in the channel; when lag exceeds **2×** the declared interval, surfaces show a soft disclaimer (“May update less often lately” / hub “Quiet lately”) — never punitive “inactive” ranking. Empty channels stay clean (no disclaimer until there is observed activity). Shared Spaces do not get this control. Helpers: `src/utils/channel-publish-cadence.ts`.

---

## Locked product decisions (July 2026)

Decided before any user-facing church surfacing. Do not reopen casually.

| Decision | Lock |
|---|---|
| **v0 audience** | **Staff-only pilot.** Congregant Home / connect stay dark. |
| **v0 identity gate** | Membership on `orgId` + `type='public'` spaces (`owner`/`leader`). Clerk custom roles later for pastor tooling. |
| **v0 surface** | **My Home vs My Church modes**. My Church hub lists **Shared Spaces** (church-scoped) and **Ministry channels** (staff-created; read-only chrome for now). Not Home "From your church" feed yet. |
| **Switcher model** | Church is a mode, not a Shared Space peer of Family. My Home: personal Shared Spaces. My Church: that church’s Shared Spaces + ministry channels. |
| **My Church which church** | Always the **home church** (A). In-mode church picker (B) is later — see CHURCH_CONNECTION_SYSTEM. |
| **Church Shared Spaces** | Same name/styling as personal Shared Spaces. Create-at-church or migrate from a member (UI later). Church-sponsored billing/ownership — not personal owned-count. |
| **Congregant connect** | Deferred. Open UX: church-initiated match vs user search; accept vs `auto_joined`; which ministry channels auto-follow. |
| **Multi-church + home** | Memberships **many**; **one home church**. See [CHURCH_CONNECTION_SYSTEM — Locked: multi-church + home church](./CHURCH_CONNECTION_SYSTEM.md#locked-multi-church--home-church-july-2026). |
| **Home feed** | **"From your church" = home church only.** Non-home churches: Settings (and later picker), not the Home feed. |
| **Permissions** | Ministry: staff author; followers read + Save a copy / start-from-starter. Follower roster staff-only. Church Shared Spaces: collaborative compose as today. |
| **Ministry chrome** | No people count for followers; no Current Thread; same color & background picker as Shared Spaces (RSS on color tile). |
| **Billing (pilot)** | Free while `Churches.isActive`. `billingPlan` not required for pilot surfaces. Church Shared Spaces sponsorship rules land with create/migrate. |
| **Language** | Prefer **ministry / curriculum / study channel** (followable feed). Avoid **announcements**. Never call ministry channels "Shared Spaces" in UI. |
| **Channel icon** | Distinct from Shared Spaces and from My Church. Prototype uses **`rss`**. See [icon guidance](#ministry-channel-icon-guidance--not-fully-locked). |

Surfacing implementation follows these locks; congregant and sermon-calendar product work stay on the roadmap until connect + calendar models are decided. Multi-church cardinality is locked for when connect ships — do not build singular-forever linking.

---

## Role-Gated Feature Model

Pastor/staff tooling (sermon note template, preaching calendar, broadcast publishing, curriculum authoring) is **never a general-app feature**. It is assigned by role under the church org:

- Staff are the ≤20 Clerk org members; **Clerk org custom roles** (e.g. `org:pastor`, `org:teacher`, `org:admin`) carry the assignment — no extra tables.
- The server derives a per-user **feature-set payload** (on the existing user/session bootstrap) from Clerk org membership + role + `Churches.isActive`. Clients render role surfaces only when the payload says so.
- Congregants (`connectedChurchId` only, never Clerk org members) never receive role surfaces.
- Only **general-first features** ship app-wide (passage history, seasonal recall, import, share links, note templates as a mechanism). The sermon template, for example, is an **org-provisioned template** on the general NoteTemplates rails — not pastor-specific UI.
- A solo pastor without an org uses the general features; the free "Church Connect" tier is the future role-assignment entry point.

---

## MyChurchPanel Evolution

### Today

- **Behavior:** User enters church **name**, **city**, **state** (optional **country**). Stored in **UserMetadata** (`churchName`, `churchCity`, `churchState`, `churchCountry`). Purely free-text; no link to an actual organization or content.
- **API:** `POST /api/user/update-church` (and load path) read/write UserMetadata church fields.

### Future (with Clerk Organizations)

- **Sync with "available church organizations":** MyChurchPanel (or a successor flow) lists **churches registered on Harvous** (the `Churches` table), matched against the user's free-text church fields.
- **User selects their church:** Linking = set `UserMetadata.connectedChurchId` / `connectedOrgId` / `connectedChurchAt` in our DB. Congregants are not added to the Clerk org (only staff/volunteers are; see CHURCH_CONNECTION_SYSTEM.md and CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md).
- **Result:** Church-published curriculum is delivered to them (auto-follow of church broadcast spaces, "From your church" surfaces) without touching their personal shared-space limits — joining/following is always free.

The free-text church fields stay for **discovery** (matching when a church first creates an org); the `connected*` columns are the only linkage. Both are represented: "my church name" (for matching) and "my church org" (for content).

---

## Curriculum Flow (future)

ChMS integration provides pipes into **both** layers — see Planning Center split below and [CHMS_INTEGRATION_RESEARCH.md](./CHMS_INTEGRATION_RESEARCH.md).

1. **Church has an org account** (Clerk Organization + `Churches` row keyed by `orgId`).
2. **Staff create ministry education channels** — org-owned spaces (`Spaces.orgId` + `type='public'`), one per ministry or curriculum context. Staff hold `SpaceMemberships` (`owner`/`leader`), synced from the Clerk org by an admin flow — never healed from Clerk at read time.
3. **Publish curriculum:** notes and threads live in those ministry channels. No per-recipient fan-out write.
4. **Delivery to members:** users with `connectedChurchId` follow relevant ministry spaces (`role='member'`; congregation-scale — broadcast spaces are exempt from the 30-person shared-space cap). "From your church" is a **study feed** from those channels (plus `FeaturedItems.contentType='church'` and sermon-calendar starters). Members copy or start-from-starter into their own Harvous via copy-lineage / note-templates rails.

This makes it easy to **share ministry education** with everyone who attends, without each person needing a personal shared-space link.

### Sermon calendar → starter notes (planned)

1. Church maintains a **sermon / service calendar** (series, date, passage, title).
2. Staff attach **resources** and **sermon starter notes** (outline / big idea / application seeds) to a given service — typically in a sermon-series ministry channel.
3. On that service (or that week), connected people get an affordance to **start a new personal note from the starter** — one tap into My Home with structure + passage loaded (note-templates + copy-lineage). No collaborative editing of the pastor's note.

Pairs `/for/pastors` sermon-prep with congregant `sermon-notes`.

### Planning Center: Groups vs Resources

| Planning Center | Harvous | Job |
|---|---|---|
| **Groups** | **Shared Spaces** (`type='shared'`) | Small groups / rosters / discussion — Groups alternative or add-on |
| **Resources** | **Ministry broadcast spaces** (`type='public'` + `orgId`) | Curriculum and lesson materials — utilize or replace PCO Resources |

Open later (document intent now, not blocking staff pilot): whether Harvous **utilizes** PCO Resources via API or becomes the **system of record** for study materials. Groups roster sync can land independently.

---

## Relation to Existing Docs

| Doc | What it covers |
|-----|-----------------|
| **CHURCH_CONNECTION_SYSTEM.md** | Church record creation, matching algorithm (name/city/state), connection requests, accept flow, `connectedChurchId`/`connectedOrgId`, broadcast-space delivery. |
| **COLLABORATIVE_SHARED_SPACES.md** | The shared-spaces foundation this layer extends. |
| **MONETIZATION_AND_PRICING.md** | Canonical SKUs: Review, Group Sharing, Season Pass, Group Leader, church principles. **Note:** limit numbers there predate the add-on refactor — `server/utils/tier-limits.ts` is the source of truth (0 free / 10 add-on / 30-person shared-space cap). |
| **MONETIZATION_SUMMARY.md** | High-level church connection flow and sharing infrastructure. |
| **CLERK_MONETIZATION_ARCHITECTURE.md** | Clerk Organizations, feature gating, Stripe, technical architecture. |
| ~~SHARING_AND_GROUPS_INFRASTRUCTURE.md~~ | Legacy InboxItems `sharingType='organization'` delivery — superseded by broadcast-space delivery above. |

This doc adds: **product vision** (church org accounts for curriculum), **two-layer model** (individual shared spaces vs church org distribution), **role-gated feature model**, and **MyChurchPanel evolution**.

---

## Database / Schema

**Landed (July 2026, shared-spaces foundation branch)** — see `server/db/schema.ts`:

- **`Churches`**: `id` (`chur_<uuid>`), `orgId` (Clerk org id, unique, notNull), `name/city/state/country`, `createdBy` (staff creator; admin roles live in Clerk), `billingPlan` (nullable slug — draft `'connect' | 'study' | 'study_plus' | 'network'`; add-on pattern, not the retired tier enum), `billingPlanUpdatedAt`, `isActive`, `deletedAt`/`recoveryUntil` (Spaces soft-delete parity), `createdAt`, `updatedAt`.
- **`UserMetadata`**: `connectedChurchId`, `connectedOrgId`, `connectedChurchAt` + `UserMetadata_connectedChurchIdIndex` (the congregant fan-out query).
- **`Spaces.orgId`**: church ownership/sponsorship; org-sponsored spaces are exempt from the personal owned-space count (`getSharedSpacesOwnedCount`), and `type='public'` spaces are exempt from the member cap (`canAddMemberToSpace`).
- **`SpaceMemberships.role='leader'`** and **`SpaceInvites.role`**: schema-ready, dormant.

**Deferred (lands with the connect flow):** `ChurchConnectionRequests` — see CHURCH_CONNECTION_SYSTEM.md for the planned shape.

---

## Monetization ladder

Canonical consumer pricing: [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md).

| Stage | Who pays | What members get |
|---|---|---|
| **Group Leader** (v1) | Leader (Shared Spaces add-on today; ~$15–19/mo est. for the fuller SKU) | Join leader's **shared spaces** free; **Review** is individual ($4/mo each if they want AI from their own notes) |
| **Church org** (future) | Church (`Churches.billingPlan`; pricing TBD) | Curriculum to connected members; multiple leader seats; optional **bulk Review seat packs** (each seat still personal) |

**Review is never shared:** AI practice is customized to each person's notes and preferences. A leader or
church pays to **host and distribute curriculum**, not to substitute for each member's Review subscription.
Optional church-purchased Review seats **claim** to individual accounts — same product, church as payer.

### Position vs Planning Center

Harvous is **not** a full church management system. [Planning Center](https://www.planningcenter.com/pricing)
offers modular products (People free, Groups/Services/Resources from modular pricing, transparent, no
contracts). Mid-size churches often spend **$100–300/mo** stacked across modules.

Harvous complements PC on **study memory + ministry education to connected members** — not check-ins,
scheduling, giving, or facilities. Competitive targets:

- **Groups** → Shared Spaces (relational group study)
- **Resources** → ministry broadcast / curriculum channels (utilize or replace)

Not the full PC suite. Church org **pricing is not committed**; principles are public modular tiers, free entry
where possible, and optional Review seat packs. See open decisions in MONETIZATION_AND_PRICING.md Section 7.

**Ladder:** Successful **Group Leader** → church connects → church adopts Harvous org account when
curriculum + admin needs justify it.

**Draft church tiers (pilot):** Church Connect (free), Church Study ($29–39), Church Study Plus
($59–79), Church Network ($99–149), plus Review seat packs and church-wide Season Pass add-ons. Full
detail in [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) Section 7.

---

## Summary

- **Vision:** Church org accounts for ministry education/curriculum; channels per ministry or study context — not an announcements bulletin.
- **Clerk org and 20-person limit:** Staff/volunteers only (≤20). Congregants via `connectedChurchId` + ministry-space membership; never Clerk org members.
- **Delivery = spaces rails:** org-owned ministry broadcast spaces (`Spaces.orgId` + `type='public'`); followers read + copy / start-from-starter — InboxItems pipe retired.
- **Two Harvous lanes vs PCO:** Shared Spaces ↔ Groups; ministry broadcast ↔ Resources. Church may host Shared Spaces under My Church (same product, church-sponsored).
- **Role-gated tooling:** pastor/staff features ride Clerk org custom roles → feature payload (after staff pilot); general users only see general-first features.
- **v0 lock:** staff-only My Home / My Church modes; My Church hub = Shared Spaces + ministry channels; congregant Home/connect dark; pilot free while `isActive`.
- **Multi-church lock:** many church memberships + one home church; My Church mode = home church; Home study feed is home-only; picker later.
- **Schema:** `Churches` + `UserMetadata.connected*` landed (treat as home until memberships table exists); `ChurchMemberships`, `ChurchConnectionRequests`, and congregant/sermon-calendar product remain future work.

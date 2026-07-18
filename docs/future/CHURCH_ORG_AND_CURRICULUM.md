# Church Org Accounts & Education Curriculum Management

> **Updated July 2026** against the shared-spaces foundation. Delivery now rides
> the spaces rails (org-owned broadcast spaces), not the legacy InboxItems pipe.
> Schema groundwork has landed: `Churches`, `UserMetadata.connectedChurchId/
> connectedOrgId/connectedChurchAt`, `Spaces.orgId`, and `SpaceMemberships.role
> = 'leader'` (dormant). Nothing user-facing is active yet.

## Vision

A day when **churches have organization accounts** on Harvous for **education and curriculum management**: staff create and curate threads and notes at the church level, and **attendees** receive that content because they're linked to the church org—no need to join a personal shared space or get a link. Harvous becomes the place where church curriculum is published and consumed by those who attend.

**MyChurchPanel** evolves from "which church do I go to?" (free-text name/city/state) to **syncing with available church organizations** from Clerk: the user sees a list of church orgs (e.g. churches that have signed up for Harvous) and can **link their account** to their church. Once linked, curriculum (threads and notes) from that church appears in their experience—e.g. in a "From your church" area.

---

## Two Layers of Sharing

### Layer 1: Individual (current — shipped in the shared-spaces foundation)

- **Shared spaces:** `Spaces.type='shared'` on the `SpaceMemberships`/`SpaceInvites` rails. **Owning is gated by the owner-pays Shared Spaces add-on** (`UserMetadata.sharedSpacesAddOn`): 0 owned without it, up to 10 with it (`OWNED_SHARED_SPACES_ADDON_LIMIT`). **Joining is always free and uncapped for the joiner**; each shared space holds up to 30 people (`MEMBERS_PER_SPACE_CAP` — shared spaces only; broadcast spaces are exempt).
- **Use case:** "I'm leading a small group and want to share a space with them."
- **Docs:** [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md), [FEATURES.md](../FEATURES.md), `server/utils/tier-limits.ts` (source of truth for limits).

### Layer 2: Church organization (future)

- **Church org accounts:** Church has a Clerk Organization + a Harvous `Churches` row (landed in schema). Only church staff/volunteers (≤20) are Clerk org members; they publish **threads and notes** as org-level curriculum. Congregants are not added to the Clerk org.
- **Distribution — org-owned broadcast spaces, not an inbox pipe:** the church publishes into spaces with `Spaces.orgId = Churches.orgId` and `type='public'`. Staff author (SpaceMemberships `owner`/`leader` rows); **congregants follow as `role='member'` rows** — `canAuthorInSpace` already gives broadcast semantics (members read + copy into their own notes via the copy-lineage rails, they don't post). Connected users (`UserMetadata.connectedChurchId`) can be auto-followed into church broadcast spaces.
- **Use case:** "Our church publishes this quarter's study; everyone who's connected to our church sees it."
- **Docs:** [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md), [COLLABORATIVE_SHARED_SPACES.md](./COLLABORATIVE_SHARED_SPACES.md).

Individual sharing (add-on) stays the "I share my space" story. Church-org is "the church shares curriculum to everyone who's connected."

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

ChMS integration (Planning Center, Breeze, ChurchSoftware.com) provides the **roster and group sync pipe** into this flow — see [CHMS_INTEGRATION_RESEARCH.md](./CHMS_INTEGRATION_RESEARCH.md).

1. **Church has an org account** (Clerk Organization + `Churches` row keyed by `orgId`).
2. **Staff create threads/notes** in the church's org-owned spaces (`Spaces.orgId` set). Staff hold `SpaceMemberships` rows (`owner`/`leader`), synced from the Clerk org by an admin flow — never healed from Clerk at read time.
3. **Publish to the congregation:** publishing = the content lives in a church **broadcast space** (`type='public'` + `orgId`). No per-recipient fan-out write is needed for the content itself.
4. **Delivery to members:** users with `connectedChurchId` matching the church follow the broadcast space (`role='member'` rows; congregation-scale — broadcast spaces are exempt from the 30-person shared-space cap). "From your church" surfaces (and `FeaturedItems.contentType='church'`) read from these spaces. Members copy notes into their own Harvous via the copy-lineage rails (`copiedFromNoteId`/`NoteVersions`).

This makes it easy to **share threads and notes from the church** to everyone who attends, without each person needing a personal shared-space link.

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
offers modular products (People free, Groups/Services from ~$15/mo each, transparent pricing, no
contracts). Mid-size churches often spend **$100–300/mo** stacked across modules.

Harvous complements PC on **study memory + curriculum to connected members** — not check-ins,
scheduling, giving, or facilities. Competitive target: **Groups + curriculum distribution**, not the
full PC suite. Church org **pricing is not committed**; principles are public modular tiers, free entry
where possible, and optional Review seat packs. See open decisions in MONETIZATION_AND_PRICING.md Section 7.

**Ladder:** Successful **Group Leader** → church connects → church adopts Harvous org account when
curriculum + admin needs justify it.

**Draft church tiers (pilot):** Church Connect (free), Church Study ($29–39), Church Study Plus
($59–79), Church Network ($99–149), plus Review seat packs and church-wide Season Pass add-ons. Full
detail in [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) Section 7.

---

## Summary

- **Vision:** Church org accounts for education/curriculum management; curriculum (threads and notes) shared from church to attendees.
- **Clerk org and 20-person limit:** The Clerk org is used only for **church staff/volunteers** (≤20). Congregants get access via our DB (`connectedChurchId`, broadcast-space membership); they are never added to the Clerk org.
- **Delivery = spaces rails:** org-owned broadcast spaces (`Spaces.orgId` + `type='public'`), congregants follow as members and copy with lineage — the InboxItems pipe is retired.
- **Role-gated tooling:** pastor/staff features ride Clerk org custom roles → server-derived feature payload; general users only ever see general-first features.
- **Two layers:** Individual shared spaces (owner-pays add-on) for personal/group sharing; church org layer for church-wide curriculum distribution.
- **Schema:** `Churches` + `UserMetadata.connected*` are landed groundwork; `ChurchConnectionRequests` and all flows/UI/billing are future work.

# Church Org Accounts & Education Curriculum Management

## Vision

A day when **churches have organization accounts** on Harvous for **education and curriculum management**: staff create and curate threads and notes at the church level, and **attendees** receive that content because they’re linked to the church org—no need to join a personal shared space or get a link. Harvous becomes the place where church curriculum is published and consumed by those who attend.

**MyChurchPanel** evolves from “which church do I go to?” (free-text name/city/state) to **syncing with available church organizations** from Clerk: the user sees a list of church orgs (e.g. churches that have signed up for Harvous) and can **link their account** to their church. Once linked, curriculum (threads and notes) from that church appears in their experience—e.g. in a “From your church” area or inbox.

---

## Two Layers of Sharing

### Layer 1: Individual (current)

- **Shared spaces:** User creates a space, gets a link, invites people. Free: 0 owned shared spaces; Harvous Plus: 10 owned, 30 people/space. Joining is always free.
- **Use case:** “I’m leading a small group and want to share a space with them.”
- **Docs:** [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md), [FEATURES.md](../FEATURES.md).

### Layer 2: Church organization (future)

- **Church org accounts:** Church has a Clerk Organization (and corresponding Harvous church/org record). Only church staff/volunteers (≤20) are Clerk org members; they publish **threads and notes** as org-level curriculum. Congregants are not added to the Clerk org.
- **Distribution:** Content is pushed to **connected users** (our DB: `UserMetadata.connectedChurchId`) and/or **members of church-owned shared spaces** (`Members` table). Only staff/volunteers (≤20) are Clerk org members; congregants get access via our DB. Uses existing inbox/sharing infrastructure (e.g. `InboxItem` + `sharingType='organization'` / orgId).
- **Use case:** “Our church publishes this quarter’s study; everyone who’s connected to our church sees it.”
- **Docs:** [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md), [SHARING_AND_GROUPS_INFRASTRUCTURE.md](./SHARING_AND_GROUPS_INFRASTRUCTURE.md).

Individual sharing (3 → unlimited spaces) stays the “I share my space” story. Church-org is “the church shares curriculum to everyone who’s connected.”

---

## MyChurchPanel Evolution

### Today

- **Location:** `src/components/react/MyChurchPanel.tsx`
- **Behavior:** User enters church **name**, **city**, **state** (optional **country**). Stored in **UserMetadata** (`churchName`, `churchCity`, `churchState`). Purely free-text; no link to an actual organization or content.
- **API:** `POST /api/user/update-church` (and load path) read/write UserMetadata church fields.

### Future (with Clerk Organizations)

- **Sync with “available church organizations”:** MyChurchPanel (or a successor flow) calls Clerk (and/or Harvous backend) to list **organizations** the user could join—e.g. churches that have created a Clerk Organization and registered as a church on Harvous.
- **User selects their church:** User picks from that list (or searches). Linking = set `UserMetadata.connectedChurchId` / `connectedOrgId` in our DB. Congregants are not added to the Clerk org (only staff/volunteers are; see CHURCH_CONNECTION_SYSTEM.md and CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md).
- **Result:** User is an org member; church-published curriculum can be delivered to them (inbox, “From your church,” etc.) without counting against their 3 shared spaces.

Optional: keep free-text church fields for **discovery** (matching when a church first creates an org), and add a separate “Link to church organization” block that shows **available orgs** and connects the account. That way both “my church name” (for matching) and “my church org” (for content) are represented.

---

## Curriculum Flow (future)

ChMS integration (Planning Center, Breeze, ChurchSoftware.com) provides the **roster and group sync pipe** into this flow — see [CHMS_INTEGRATION_RESEARCH.md](./CHMS_INTEGRATION_RESEARCH.md).

1. **Church has an org account** (Clerk Organization + Harvous church record, e.g. `Churches` table with `orgId`).
2. **Staff create threads/notes** in an org context (or mark existing content as “church curriculum”). Implementation can use existing note/thread model with an org/church scope or a dedicated curriculum content type.
3. **Publish to org:** When church publishes a thread or note, create an **InboxItem** (or equivalent) with `sharingType='organization'` and link to the church’s `orgId`.
4. **Delivery to members:** All users with `UserMetadata.connectedChurchId` (or `connectedOrgId`) equal to that church get the item (recipients from our DB, not Clerk org membership; congregants are not in the Clerk org)—e.g. auto-add to **UserInboxItems** or show in a “From your church” section. Same pattern as in SHARING_AND_GROUPS_INFRASTRUCTURE.md (church content → InboxItem → UserInboxItems for connected users).

This makes it easy to **share threads and notes from the church** to everyone who attends, without each person needing a personal shared-space link.

---

## Relation to Existing Docs

| Doc | What it covers |
|-----|-----------------|
| **CHURCH_CONNECTION_SYSTEM.md** | Church creates Clerk org, matching algorithm (name/city/state), connection requests, accept flow, UserMetadata `connectedChurchId` / `connectedOrgId`, inbox push to connected members. |
| **SHARING_AND_GROUPS_INFRASTRUCTURE.md** | InboxItem + SharedContent with `sharingType='organization'`, orgId, auto-add to org members’ UserInboxItems. |
| **MONETIZATION_AND_PRICING.md** | Canonical SKUs: Review, Group Sharing, Season Pass, Group Leader, church principles. |
| **MONETIZATION_SUMMARY.md** | High-level church connection flow and sharing infrastructure. |
| **CLERK_ARCHITECTURE.md** / **BILLING_ARCHITECTURE.md** | Clerk auth/orgs; Polar billing + entitlements. |

This doc adds: **product vision** (church org accounts for curriculum), **two-layer model** (individual shared spaces vs church org distribution), and **MyChurchPanel evolution** (sync with available church organizations from Clerk).

---

## Database / Schema (already planned elsewhere)

- **UserMetadata:** `connectedChurchId`, `connectedOrgId` (see CHURCH_CONNECTION_SYSTEM.md; future/README suggests adding when implementing).
- **Churches:** orgId, church name/location, admin, etc. (CHURCH_CONNECTION_SYSTEM.md).
- **ChurchConnectionRequests:** pending connections (CHURCH_CONNECTION_SYSTEM.md).
- **InboxItems / UserInboxItems:** used for church content delivery; link via `sharingType='organization'` and orgId (SHARING_AND_GROUPS_INFRASTRUCTURE.md).

No new schema is proposed here; this doc describes how those pieces support the org + curriculum vision.

---

## Monetization ladder

Canonical consumer pricing: [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md).
Church **billing** uses Polar (same MoR as Harvous Plus); Clerk Organizations stay identity-only — see [BILLING_ARCHITECTURE.md](../BILLING_ARCHITECTURE.md) § church split.

| Stage | Who pays | What members get |
|---|---|---|
| **Group Leader** (v1) | Leader (~$15–19/mo est.) | Join leader's **shared spaces** free; **Review** is individual ($4/mo each if they want AI from their own notes) |
| **Church org** (future) | Church (pricing TBD) | Curriculum to connected members; multiple leader seats; optional **bulk Review seat packs** (each seat still personal) |

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
- **Clerk org and 20-person limit:** The Clerk org is used only for **church staff/volunteers** (≤20). Congregants get access via our DB (`connectedChurchId`, shared space membership); they are never added to the Clerk org.
- **MyChurchPanel:** Evolves to sync with **available church organizations** (Clerk) so users can link to their church and receive that church’s content.
- **Two layers:** Individual shared spaces (3 → unlimited) for personal/group sharing; church org layer for church-wide curriculum distribution (delivery by our DB: connected users + space members).
- **Implementation:** Builds on CHURCH_CONNECTION_SYSTEM.md (connection flow, schema) and SHARING_AND_GROUPS_INFRASTRUCTURE.md (org-scoped content delivery). See CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md for the full 20-person-limit design.

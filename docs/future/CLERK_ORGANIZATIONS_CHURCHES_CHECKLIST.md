# Clerk Organizations for Churches — Implementation Checklist

This doc captures what to think through when implementing **Clerk Organizations for Churches**: church sign-up, users (new and existing) joining a church, and evolution of **MyChurchPanel**. It complements [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) and [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md).

## Decisions (recorded)

The following decisions were captured for implementation. The list of churches on Harvous is **not public** (invite-only; no “Find your church” search of all churches).

### Church sign-up and how users join

- **Church onboarding:** Both — dedicated flow the first time (e.g. “Register your church”), then “Create organization” in profile for creating another later.
- **One church = one org:** Yes, 1:1 for now.
- **Church verification:** Self-serve (no verification).
- **Existing users linking to a church:** Match-first only — we find them when a church joins; they accept a connection request.
- **New users:** Free-text church only; get matched when their church joins.
- **Join route:** Yes — add `/churches/join/[token]` (invite link).

**V1 (20-person limit):** For v1 we should **not** allow any user to freely “join” a church org, given Clerk’s 20-person org limit. Instead the journey is **church-controlled**: the church sees a **list of people who said that is their church** (matched from UserMetadata free-text). The church can **accept all or select which** of those people get access to church content and shared spaces.

**Clerk org = staff/volunteers only:** The 20 Clerk org slots are reserved for **church staff or volunteers** who manage the Bible education side (admins, curriculum authors, small group leaders who need the church dashboard). **Congregants/attendees are never added to the Clerk org.** They get access via (1) **shared space membership** (Groups lane — invite links, join tokens, PCO Groups roster sync) and/or (2) **church memberships** in your DB (many allowed; one **home church**) plus follows on **ministry education channels**. When a user accepts a connection request, create/update a membership row, set home if first connect (`UserMetadata.connectedChurchId`/`connectedOrgId` today = home until renamed), and optionally follow ministry spaces; we do **not** call Clerk to add them to the org. Curriculum and "From your church" **study feed** use the **home church** only (plus that church’s ministry-space follows), not Clerk org membership. See [Locked: multi-church + home church](./CHURCH_CONNECTION_SYSTEM.md#locked-multi-church--home-church-july-2026).

### MyChurchPanel and policies

- **MyChurchPanel:** Primary flow: user is part of a church and gets **invited** → then their free-text church (and link) is updated. Panel stays focused on “my church” (free-text + linked org when they joined via invite).
- **Leave church:** Allowed; remove that church membership. If it was home and others remain, require a new home (or auto-promote). If none remain, clear home (`connectedChurchId`/`connectedOrgId`). Remove from Clerk org only if they were an org member (e.g. staff).
- **One church per user:** Yes, one only.
- **User joins another church:** Block — they must leave the current church first.
- **Matching:** All matches get a connection request (no auto-join).
- **Church deactivated:** Inbox items that referenced that org are kept but marked as from an inactive church (read-only).

### Church curriculum & shared spaces (the magic)

From the church org, admins/leaders can **create and manage multiple shared spaces** and **control who is in each of those spaces**. This is the core value: the church isn’t just “everyone in the org”—they curate distinct spaces (e.g. by ministry, class, or study) and manage membership per space.

- **Multiple shared spaces per church:** Church creates shared spaces (e.g. “Youth Romans Study,” “Women’s Bible Study,” “Sunday School – Grade 3”). Each space has its own roster; church decides who’s in which.
- **Curriculum builder:** When creating threads and notes, church authors can attach **links, PDFs, and docs** so that curriculum is full-featured—not just inline text. That makes Harvous a **full curriculum builder** for church education across ministries and the church as a whole (kids, youth, adults, small groups, etc.).
- **Flow:** Connect-to-church (org + connection requests) gets people “in the church”; then the church uses shared spaces + curriculum (threads/notes + attachments) to deliver and manage actual education.

### Tech and UX

- **Frontend “linked church”:** Own API that returns the user’s linked church from UserMetadata + Churches (no Clerk org context as source of truth in the app).
- **Church dashboard:** Both — visible to Clerk org admins and to users who are church admins in our DB (e.g. `Churches.adminUserId` or equivalent).
- **XP:** Both — free-text add and linking to an org can each award (with no double-dip when both apply).
- **Shared spaces and tier:** The top tier (currently “unlimited”; likely renamed **Max** or **Plus**) would allow more from a group standpoint—i.e. more shared-space functionality or higher limits. PCO integration is limited to **churches** (church orgs), not to shared spaces in general; shared spaces stay as they are, just with more you can do on the higher tier.

### Church billing & Clerk org limits

Clerk’s **free plan for organizations is limited to 20 people**. So for churches (which often exceed that), we need **paid church plans** and will need to set up additional features in **Clerk billing** to support them. For v1, Church Starter effectively lives at this 20-person cap; we should add a **lower plan** (e.g. for very small churches or trial) that fits the 20-person limit before or alongside Starter.

- **Lower plan (TBD name, v1)** — fits 20-person Clerk limit; for small churches or trial. Details TBD.
- **Church Starter**
  - **Monthly:** $19 / org · **Annual (20% off):** $182 / org
  - **Intended size (guideline):** Up to ~75 active adults (v1 may cap at 20 until Clerk billing is in place)
  - **Included:** Unlimited shared spaces, PCO sync, MyChurchPanel content, uploads (PDFs/docs/links), 1–2 admins
- **Church Growth**
  - **Monthly:** $39 / org · **Annual (20% off):** $374 / org
  - **Intended size (guideline):** ~75–300 active adults
  - **Included:** Everything in Church Starter, plus richer analytics, 3–5 admins, priority email support

**Principle:** Unlimited spaces and unlimited notes inside an org; pricing scales by **church size**, not by feature gates. Implementation will require configuring Clerk billing (plans, limits, webhooks) for these church tiers.

### Planning Center (PCO) integration — two products, two Harvous rails

Harvous is not a full ChMS. Map PCO modules to Harvous deliberately:

| Planning Center | Harvous | Job |
|---|---|---|
| **[Groups](https://www.planningcenter.com/groups)** | **Shared Spaces** (`type='shared'`) | Small groups / rosters / discussion — Groups alternative or Bible-study add-on |
| **[Resources](https://www.planningcenter.com/resources)** | **Ministry broadcast spaces** (`type='public'` + `orgId`) | Curriculum, lessons, sermon-series materials — **utilize or replace** PCO Resources |

Canonical vision: [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md). Open later: whether Resources is API-utilized or Harvous becomes the system of record for study materials. Groups roster sync can land independently.

#### Groups → Shared Spaces (roster / relational study)

Fully native **PCO Groups** OAuth is the target for roster sync — pull groups/people, no middleware. Harvous acts as the Bible-study layer on the group.

**Church admin/leader perspective**

1. **Connect once:** Settings → “Connect Planning Center” → OAuth (Groups + People scopes). Store/refresh tokens in Supabase (not Turso).
2. **Auto-sync groups:** List PCO groups → one-click “Enable study space” creates a matching **shared space**.
3. **Manage in PCO:** Create/edit group → Harvous syncs roster into the shared space.
4. **Dashboard:** Shared-space progress for that group (completion, discussion) without replacing PCO attendance.

**Member perspective**

1. **Discovery:** PCO group / Church Center → deep link into the Harvous shared space.
2. **Join:** Auto-invite if on PCO roster → Harvous login (SSO later).
3. **Daily use:** Notes and discussion in the shared space; optional progress signals back to PCO.

#### Resources → ministry education channels

PCO Resources (files, lessons, plans) maps to Harvous **ministry broadcast spaces** — adult ed, students, sermon companions, leader resource packs — **not** an announcements bulletin.

- Staff publish curriculum into `orgId` + `type='public'` channels.
- Connected congregants follow and copy / start-from-starter into personal notes.
- Sermon calendar + starter notes (see [PASTOR_FEATURES_ROADMAP.md](./PASTOR_FEATURES_ROADMAP.md)) live on this rail.

Decide utilize-vs-replace when building the integration; product language and channel model should not wait on that API choice.

---

## 1. Product & User Flows

### Church sign-up (church as org)

- **Who creates the org?** Church admin (staff) signs up as a normal user, then creates a Clerk Organization and links it to a Harvous “church” record.
- **Church onboarding:** Dedicated flow (e.g. “Register your church”) vs. “Create organization” in profile. Your future docs assume: sign up → create org → enter church name/city/state/country.
- **One church = one org:** Decide whether one Clerk org = one church record, or if you’ll support multiple orgs per church later.
- **Verification:** Do you verify churches (manual review, domain, etc.) or allow self-serve?

### Users joining a church

- **Existing users:** Already have free-text church in `UserMetadata`. Two paths:
  - **Match-first (CHURCH_CONNECTION_SYSTEM):** When a church creates an org, find users by name/city/state and create “connection requests”; user accepts → link + add to Clerk org.
  - **User-first:** User goes to My Church → “Find your church” → search/select org → request to join or direct add (if org allows).
- **New users:** Sign up then either set church (free-text) and get matched later, or go straight to “Join a church” and pick an org.
- **Redirects (from AGENTS.md):** Do not set Clerk **Force redirect URL** to `/`; preserve `redirect_url` so users coming from `/spaces/join/[token]` or `/invitations/[token]` (and later e.g. `/churches/join/[token]`) return there. Same for church join/invite links.

---

## 2. Data Model & Schema

### Already in place

- **UserMetadata:** `churchName`, `churchCity`, `churchState`, `churchCountry`, `churchAddedAt` (and profile cache / `get-profile`, `update-church`).
- **No** `connectedChurchId` / `connectedOrgId` yet.

### To add (from future docs)

- **Churches:** `id`, `orgId` (Clerk org), church name/location, `adminUserId`, subscription/plan, `isActive`, timestamps. Optional: slug for URLs.
- **ChurchConnectionRequests (or similar):** Pending “user ↔ church” links (e.g. `churchId`, `userId`, `status`, `matchedBy`, timestamps). Used for match-first flow and/or invite-to-join.
- **UserMetadata:** `connectedChurchId`, `connectedOrgId` (and migration for existing rows).

### Sync with Clerk

- **Source of truth:** Clerk holds org membership **only for staff/volunteers** (≤20). Your DB holds **church memberships (many)** + **home church (one)** and space membership; congregants get content via your DB only—they are not added to the Clerk org. On leave, drop that membership and update/clear home; if the user was in the Clerk org (staff), remove them from the org via Clerk API. 
---

## 3. Auth & Backend

### Clerk

- **Backend:** Use `@clerk/backend` (or existing `createClerkClient`) for:
  - `organizations.createOrganization` (church sign-up),
  - `organizations.createOrganizationInvitation` / `createOrganizationInvitationBulk` (invite staff/volunteers by email),
  - `organizations.createOrganizationMembership` (add **staff/volunteers** to the org only—not when a congregant accepts a connection request; congregants get access via your DB).
- **Frontend:** No `useOrganization` / `OrganizationSwitcher` yet. For “My Church” you’ll need either **Clerk’s org context** (`useOrganization`, `useUser`) so the app knows “current org” when the user is in a church context, or **your own API** that returns “user’s linked church” from `UserMetadata` + Churches (simpler for a single-church-per-user model).
- **Session / JWT:** Confirm whether org membership is in the session (e.g. `sessionClaims`) so the API can enforce “user must be in org X” for church-scoped actions without extra Clerk calls every time.

### Your API

- **New routes (examples):** Churches: create church (after Clerk org created), get church by id/orgId, list (for search), maybe update. Connection/invite: create connection request, accept/decline, list pending for user. Optional: “invite users to church” (creates Clerk org invitations and/or internal invites).
- **Auth middleware:** Today you only resolve `userId`. For church-scoped routes you may need `orgId` or `churchId` (from session or from UserMetadata/Churches). No code changes needed until you add those routes.
- **Netlify / bundle:** All new Clerk org calls must work in the bundled API (no `node_modules` at runtime); `@clerk/backend` is already used, so stay on that pattern.

---

## 4. MyChurchPanel Evolution

- **Today:** Free-text name/city/state; `POST /api/user/update-church`; view/edit/remove.
- **With orgs:**
  - **Option A – Replace:** Panel shows “Your church” = linked org (name, leave church). “Find your church” = search/list Harvous churches (orgs) and “Join” (request or direct add). Optional: keep free-text as “Church name (for matching)” when no org linked.
  - **Option B – Add block:** Keep current form; add a second block “Link to a church on Harvous” (list/search orgs, connect). So you have both “my church name” and “linked org.”
- **Data loading:** Panel already uses `get-profile` and optional `initialChurchData`. Extend get-profile (or a dedicated endpoint) to return `connectedChurchId`, `connectedOrgId`, and church display name so the panel can show “Linked: First Baptist Church” and a “Leave” or “Change church” action.
- **Leave church:** Clear `connectedChurchId`/`connectedOrgId` in UserMetadata and optionally remove user from Clerk org (via backend). Decide if “leave” is allowed and what happens to past church content (e.g. inbox items).

---

## 5. Invites & Join Flows

- **Church invites users (email):** Clerk `createOrganizationInvitation` (and bulk). After user accepts in Clerk, your webhook or post-accept flow can set `UserMetadata.connectedChurchId`/`connectedOrgId` and create/update Churches if needed.
- **User finds church:** List/search churches (by name/location); “Request to join” or “Join” (if open). Backend creates membership (Clerk) and link (UserMetadata).
- **Join link:** Optional `/churches/join/[token]` (like `/spaces/join/[token]`): token could be a public invite token for the org. Same redirect rules as space/invitation (preserve URL through sign-in/sign-up).
- **E2E:** You have join/invite for **spaces**. Add similar tests for church join (and optionally church invite) and respect redirect_url in tests.

---

## 6. Edge Cases & Policies

- **Multi-church + home (locked):** Memberships many; one home. Joining another church adds a membership — it does not remove the previous link. Home changes only via explicit “set home” or leave-home rules. Settings lists all memberships; Home feed is home-only. Shell: **My Home vs My Church** — My Church hub has two lanes: church **Shared Spaces** (collaborate; church-sponsored) vs **ministry channels** (followable staff feed; RSS-leaning icon; not Shared Spaces). Comparison: [CHURCH_ORG_AND_CURRICULUM](./CHURCH_ORG_AND_CURRICULUM.md#church-shared-spaces-vs-ministry-channels-locked-distinction). Schema: future `ChurchMemberships` + home columns (today’s `connected*` = home until migrate). Details: [CHURCH_CONNECTION_SYSTEM](./CHURCH_CONNECTION_SYSTEM.md#locked-multi-church--home-church-july-2026).
- **Church deleted / deactivated:** Remove memberships for that church for all users; if it was someone’s home, auto-promote or clear home; optionally remove Clerk memberships for staff. Decide how to handle existing inbox items that referenced that org.
- **Matching algorithm:** CHURCH_CONNECTION_SYSTEM describes name/city/state scoring. Consider normalizations (trim, case, accents), false positives (same name in different cities), and whether you auto-join only exact matches or also “high” and require confirmation for “medium.”
- **Privacy / GDPR:** Storing church link and org membership; church admins may see “members” in Clerk and in your DB. Document and expose in privacy policy.

---

## 7. UI/UX

- **Church admin experience:** Who sees “Church dashboard” (create curriculum, invite members, see roster)? Only users with an admin role in the Clerk org (or a specific “church admin” in your Churches table).
- **Profile / nav:** My Church lives in Profile and possibly in a bottom sheet. With orgs, you might show “First Baptist Church” with a badge or “Linked” and a way to open church dashboard if the user is admin.
- **Empty state:** “No church linked” → “Find your church” or “Your church not on Harvous? Add its name so we can notify you when it joins.”
- **Notifications:** “First Baptist Church joined Harvous – connect?” (from connection requests). Reuse or extend your existing toast/notification pattern.

---

## 8. Content Delivery (Later)

- **Curriculum / “From your church”:** CHURCH_ORG_AND_CURRICULUM and SHARING_AND_GROUPS_INFRASTRUCTURE describe InboxItem + `sharingType='organization'` and pushing to users with `connectedOrgId`. That’s separate from “church sign-up and join” but depends on it: you need Churches + linked users before you can deliver org-scoped content.
- **Tier/limits:** Churches table has `subscriptionTier` in the design; decide if church features (e.g. curriculum, member count) are gated by a church plan.

---

## 9. Migration & Compatibility

- **Existing church free-text:** Don’t remove `churchName`/`churchCity`/`churchState` (and country); use them for matching and for “church name for discovery” when no org is linked. So: add `connectedChurchId`/`connectedOrgId` alongside existing fields.
- **XP / analytics:** You have `church_added` XP. Define whether “linked to org” also awards something or only the first free-text add. Keep behavior consistent so existing logic doesn’t break.

---

## 10. Summary Checklist

| Area | Things to decide |
|------|-------------------|
| **Flows** | Church sign-up path; user “find church” vs “we match you”; new vs existing users. |
| **Schema** | Churches, ChurchConnectionRequests, ChurchMemberships (many), home via UserMetadata.connected* / homeChurchId. |
| **Clerk** | Backend org APIs; frontend org context vs your own “linked church” API; session claims for org. |
| **API** | Church CRUD, connection request accept/decline, list churches (search), optional invite. |
| **MyChurchPanel** | Replace with org-centric UI vs add “Link to church” block; show linked org + leave/change. |
| **Redirects** | Preserve redirect_url for sign-in/sign-up when coming from church join/invite (and new routes). |
| **Policies** | One church per user; leave/switch church; church deactivation; matching thresholds. |
| **Later** | Curriculum delivery, church dashboard, tiers, E2E for church join/invite. |

---

## Related Docs

| Doc | What it covers |
|-----|-----------------|
| [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) | Vision, two-layer sharing, MyChurchPanel evolution, curriculum flow. |
| [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md) | Schema (Churches, ChurchConnectionRequests), matching algorithm, accept flow, inbox integration. |
| [SHARING_AND_GROUPS_INFRASTRUCTURE.md](./SHARING_AND_GROUPS_INFRASTRUCTURE.md) | InboxItem + org-scoped content delivery. |
| [future/README.md](./README.md) | MyChurchPanel evolution, church connection, curriculum references. |

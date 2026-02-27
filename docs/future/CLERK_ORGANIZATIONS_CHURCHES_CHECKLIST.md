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

**V1 (20-person limit):** For v1 we should **not** allow any user to freely “join” a church org, given Clerk’s 20-person org limit. Instead the journey is **church-controlled**: the church sees a **list of people who said that is their church** (matched from UserMetadata free-text). The church can **accept all or select which** of those people can join their church shared spaces. Only church-accepted users get added to the org / get access; no open join.

### MyChurchPanel and policies

- **MyChurchPanel:** Primary flow: user is part of a church and gets **invited** → then their free-text church (and link) is updated. Panel stays focused on “my church” (free-text + linked org when they joined via invite).
- **Leave church:** Allowed; clear link and remove from Clerk org; keep existing inbox items.
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

### Planning Center (PCO) integration

Fully native integration with **Planning Center (PCO) Groups** via their OAuth API is the target—pull groups/rosters directly, no middleware. From church/member views, it’s seamless “one-click connect” that feels like PCO built it.

- **Product reference:** [Planning Center Groups](https://www.planningcenter.com/groups) — community organization, attendance, group chat, events, and Church Center app; Harvous would act as a “Bible Study add-on” to this flow.
- **API:** The PCO API would need to be researched to implement this integration (OAuth scopes, Groups/People endpoints, token storage/refresh, and any rate limits or webhooks).

**Church admin/leader perspective**

Admins (PCO users) treat Harvous as a “Bible Study add-on” in their PCO dashboard flow.

1. **Connect once:** In Harvous settings → “Connect Planning Center” → OAuth login (PCO prompts scopes: Groups read/write, People read). Gets access token stored in Turso (refresh auto).
2. **Auto-sync groups:** Harvous lists PCO groups (`GET /groups/v2/groups`) → One-click “Enable Bible Hub” creates matching shared space (plan/discussions prepped).
3. **Manage in PCO:** Create/edit group in PCO → Harvous syncs roster (`GET /groups/{id}/people`), adds to space. Track attendance in PCO; Harvous feeds study progress back (`POST /groups/{id}/events` or custom field).
4. **Dashboard view:** Harvous “PCO Groups” tab: Completion %, top discussions. Leaders get notified: “Your Romans group is 80% on plan—start chat!”

**Member perspective**

Zero friction—stays in familiar PCO/Church Center, discovers Harvous organically.

1. **Discovery:** PCO group page → “Join Bible Study Notes” button (Harvous deep link via PCO custom link field). Or Church Center app shows “Study Hub Active.”
2. **Join space:** Auto-invite if on PCO roster → Harvous login (or PCO SSO if you add later). Lands in space with plan loaded (API.Bible verses).
3. **Daily use:** Check verse/read → Log note/discuss. Progress syncs to PCO profile (e.g., badge: “Week 2 Complete”).
4. **Mobile:** PWA from Harvous; optional PCO calendar event links to daily plan.

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

- **Source of truth:** Clerk holds org membership; your DB holds “which church (Harvous record) this user is linked to” and optionally pending requests. On each request you can validate “user in Clerk org X” vs “UserMetadata.connectedOrgId = X” and fix drift (e.g. leave org → clear `connectedChurchId`/`connectedOrgId`).

---

## 3. Auth & Backend

### Clerk

- **Backend:** Use `@clerk/backend` (or existing `createClerkClient`) for:
  - `organizations.createOrganization` (church sign-up),
  - `organizations.createOrganizationInvitation` / `createOrganizationInvitationBulk` (invite by email),
  - `organizations.createOrganizationMembership` (add member, e.g. when user accepts connection request).
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

- **One church per user:** Current design is “linked to one church.” If you later allow multiple churches, schema and UI (e.g. list of churches in MyChurchPanel) need to support it.
- **User already in an org:** If they join another church, do you remove the previous link (and Clerk membership) or support multiple?
- **Church deleted / deactivated:** When a church is removed or deactivated, clear `connectedChurchId`/`connectedOrgId` for all users (and optionally remove Clerk memberships). Decide how to handle existing inbox items that referenced that org.
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
| **Schema** | Churches, ChurchConnectionRequests (or equiv), UserMetadata.connectedChurchId/connectedOrgId. |
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

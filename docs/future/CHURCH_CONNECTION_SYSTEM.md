# Church Connection System Design

> **Shipped in v2.18.0 (August 2026).** The staff-only lock this document
> described is **lifted**: congregant connect, channel follow, and Home's
> "From your church" feed all shipped. Correct the reading below accordingly.
>
> **How connection actually works:** a congregant self-selects their church in
> Settings › My Church from the Here's My Church directory. If that church is
> registered on Harvous, picking it sets `connectedChurchId` / `connectedOrgId`
> directly. There is **no approval step** — `ChurchConnectionRequests` was
> designed here but never built, because self-select is sufficient while
> churches are onboarded one at a time. Build it if churches ever need to vet
> who claims membership.
>
> **Multi-church + home church** is still design-only: `ChurchMemberships`
> exists as a stub table with no writers, and `UserMetadata.connectedChurchId`
> remains the single home pointer.
>
> Operational detail: [CHURCH_ORG_ONBOARDING_AND_BILLING.md](../CHURCH_ORG_ONBOARDING_AND_BILLING.md).
>
> **Here’s My Church (directory SoT):** Stable directory identity is
> `Churches.hmcChurchId` / `UserMetadata.hmcChurchId` (e.g. `TX-123456`).
> Name/city/state on those rows are a **denormalized cache** refreshed from the
> HMC partner API (`server/utils/hmc-partner.ts`). Clerk `Churches.orgId` remains
> the **staff org shell** for ministry spaces — not the directory identity.
> Partner key is server-only; see heresmychurch `docs/future/public-api.md`.
>
> **Operational prerequisite:** the Clerk instance must have the
> **Organizations feature enabled** (Clerk dashboard → Organizations). Until
> then, org lookups return 403 and the admin endpoints answer
> `CLERK_ORGS_NOT_ENABLED`. Connect endpoints, matching code, and congregant UI
> in this doc are design sketches, not shipped code. Code samples are in the
> Hono `server/routes/*` + Drizzle idiom of the current server.

## Overview

This system allows users to set their church, churches to create Clerk Organizations, and connects them when a church joins Harvous so they can receive **ministry education** (curriculum channels) — not a bulletin of announcements. Shared Spaces remain the small-group / PCO Groups lane; ministry broadcast spaces are the PCO Resources lane.

## User Flow

### 1. User Sets Their Church (HMC picker ✅ + outside-US manual ✅)
- User goes to Settings → My Church
- **U.S. directory:** state-scoped typeahead against Here’s My Church (`GET /api/user/churches/hmc/search`)
- On HMC pick: store `UserMetadata.hmcChurchId` + denormalized `churchName/churchCity/churchState` from HMC (`churchCountry` cleared)
- **Outside U.S. / not listed:** manual name + city + region + country via `POST /api/user/update-church` (server clears any prior HMC link). Name required.
- **U.S. but not in directory:** same manual form with US state + city. Server **also submits** the church to Here’s My Church (`POST …/churches/add` after geocode). On success (or duplicate match), Harvous stores the returned `hmcChurchId` so the pick becomes directory-backed. Geocode/add failures still save free-text on Harvous.
- Free-text / denorm fields are **matching input / display**, not org linkage (`connectedChurchId` stays separate).

### 2. Church Creates Organization
- Church admin signs up for Harvous
- Creates a Clerk Organization (staff/volunteers only, ≤20)
- Admin registers the org and **links an HMC church** (`Churches.hmcChurchId`) so hub name/location stay accurate
- System matches existing users and invites them to connect (future)

### 3. Automatic Connection
- System finds users with matching church info
- Sends connection request (invitation to link to church)
- User accepts → linked in our DB (`UserMetadata.connectedChurchId`/`connectedOrgId`/`connectedChurchAt`); church content appears via church broadcast spaces
- **Congregants are not added to the Clerk org.** Only church staff/volunteers (≤20) are Clerk org members; congregants get access via our DB and membership in church broadcast spaces (see CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md).

## Clerk Organization Limits (20 staff + 100 MRO)

Clerk’s standard Organizations allowance: **20 members per org** and **~100 Monthly Retained Organizations (MRO) per app** (an MRO ≈ org with ≥2 members and ≥1 retained user). We stay within the **20** by **reserving the Clerk org for church staff/volunteers only** (admins, curriculum authors, small group leaders who need the church dashboard). **Congregants/attendees are never added to the Clerk org.** When a user accepts a connection request, write a `ChurchMemberships` row, set home via `UserMetadata.connectedChurchId`/`connectedOrgId`/`connectedChurchAt` (temporary singular home until home pointer moves onto memberships), and optionally call `followMinistryChannel` for broadcast spaces (`SpaceMemberships` role=`member` — public spaces are exempt from the 30-person cap). Curriculum and "From your church" delivery read from those spaces, not Clerk org membership.

**Billing model:** paid **Church base** ($39/mo draft) creates the Clerk org; optional church add-ons (curriculum, church Shared Spaces, analytics, unlimited staff). There is **no public free Connect org** — congregant HMC “My church” does not create an org or burn an MRO. Staff seats above 20 require the **Unlimited staff** add-on and Clerk’s **Enhanced** B2B add-on (~$100/mo app-wide). Canonical prices: [MONETIZATION_AND_PRICING.md §7](./MONETIZATION_AND_PRICING.md). Sync-staff refuses Clerk rosters over 20 (`CLERK_ORG_MEMBER_LIMIT`) until unlimited staff ships.

## Database Schema

### Landed — `server/db/schema.ts`

```ts
// Churches — one row per church with a Clerk Organization on Harvous.
export const Churches = pgTable('Churches', {
  id: text('id').primaryKey(),              // chur_<uuid>
  orgId: text('orgId').notNull(),           // Clerk organization id — unique
  name: text('name').notNull(),
  city: text('city'),
  state: text('state'),
  country: text('country'),
  createdBy: text('createdBy').notNull(),   // staff creator; admin roles live in Clerk org roles
  billingPlan: text('billingPlan'),         // nullable slug — draft 'church' (base); legacy connect/study/* ignored
  billingPlanUpdatedAt: ts('billingPlanUpdatedAt'),
  // Future add-on flags (same spirit as UserMetadata.sharedSpacesAddOn):
  // curriculumAddOn, churchSharedSpacesAddOn, analyticsAddOn, unlimitedStaffAddOn (+ *UpdatedAt)
  isActive: boolean('isActive').notNull().default(true),
  deletedAt: ts('deletedAt'),               // soft-delete lifecycle (Spaces parity)
  recoveryUntil: ts('recoveryUntil'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  uniqueIndex('Churches_orgId_unique').on(table.orgId),
  index('Churches_createdByIndex').on(table.createdBy),
]);

// UserMetadata home (landed — temporary singular home until connect writers)
connectedChurchId: text('connectedChurchId'),   // Churches.id home
connectedOrgId: text('connectedOrgId'),         // denormalized Clerk org id
connectedChurchAt: ts('connectedChurchAt'),
// get-profile exposes these; no congregant accept writer yet

// ChurchMemberships — stub landed (no writers yet); chmem_<uuid>
// churchId, userId, role='member', joinedAt — unique(churchId, userId)
```

Notable decisions vs. earlier drafts: `createdBy` replaces `adminUserId` (admin is a Clerk org role, possibly plural); nullable `billingPlan` + future boolean church add-ons replace tier ladders (`connect`/`study`/`network`, `starter`/`growth`/`enterprise`) — same spirit as `sharedSpacesAddOn`. **`connected*` is temporary home-only** until connect populates `ChurchMemberships` and (later) a dedicated home pointer.

### Planned — lands with the connect flow

```ts
// ChurchConnectionRequests — pending connections (shape may still evolve with the UX)
export const ChurchConnectionRequests = pgTable('ChurchConnectionRequests', {
  id: text('id').primaryKey(),              // chreq_<uuid>
  churchId: text('churchId').notNull(),     // Churches.id
  userId: text('userId').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined' | 'auto_joined'
  matchedBy: text('matchedBy').notNull(),   // 'name_city_state' | 'name_city' | 'name_only' | 'manual'
  createdAt: ts('createdAt').notNull(),
  respondedAt: ts('respondedAt'),
}, (table) => [
  uniqueIndex('ChurchConnectionRequests_church_user_unique').on(table.churchId, table.userId),
  index('ChurchConnectionRequests_userId_statusIndex').on(table.userId, table.status),
]);
```

Open UX questions that keep this deferred: church-initiated matching vs. user-initiated search; whether `auto_joined` survives; request expiry.

## Matching Algorithm (design sketch)

When a church creates an organization, the system searches `UserMetadata` free-text church fields for likely members. Scoring (out of 100): exact name 40 (partial word-overlap 20), city 30, state 20, country 10. Users scoring ≥50 are candidates; `exact` (≥90) / `high` (≥70) matches get connection requests automatically; users already connected (`connectedChurchId` set) are excluded.

```ts
// server/utils/church-matching.ts (planned)
export interface ChurchMatch {
  userId: string;
  matchScore: number;                        // 0–100
  matchType: 'exact' | 'high' | 'medium' | 'low';
  matchedFields: string[];
}
export async function findMatchingUsers(church: {
  name: string; city?: string; state?: string; country?: string;
}): Promise<ChurchMatch[]> { /* normalize + score UserMetadata church fields */ }
```

## Implementation Flow (design sketches — Hono + Drizzle idiom)

### 1. Church Creates Organization

```ts
// server/routes/churches.ts (planned)
route.post('/api/churches', requireAuth, rateLimit('write'), async (c) => {
  // 1. Verify caller is an admin of the Clerk org (auth.orgId + org role)
  // 2. Insert Churches row: { id: `chur_${crypto.randomUUID()}`, orgId, name, city, state, country,
  //    createdBy: auth.userId, isActive: true, createdAt: now }
  // 3. findMatchingUsers(...) → insert ChurchConnectionRequests for exact/high matches
  // 4. Return { churchId, matchesFound, connectionRequestsCreated }
});
```

### 2. User Accepts Connection

```ts
// server/routes/churches.ts (planned)
route.post('/api/churches/connections/:requestId/accept', requireAuth, async (c) => {
  // 1. Load pending ChurchConnectionRequests row for auth.userId (404 otherwise)
  // 2. Load the church (must be isActive, not deleted)
  // 3. Mark request accepted (respondedAt = now)
  // 4. Update UserMetadata: connectedChurchId, connectedOrgId, connectedChurchAt
  //    — do NOT add the user to the Clerk org (staff-only, ≤20)
  // 5. Optionally insert SpaceMemberships role='member' rows into the church's
  //    broadcast spaces (Spaces.orgId = church.orgId, type='public')
});
```

### 3. Content Delivery — ministry education channels, not inbox fan-out

The retired design pushed per-user `InboxItems`/`UserInboxItems` rows on every publish. The foundation makes that unnecessary:

- Church curriculum lives in **org-owned ministry broadcast spaces** (`Spaces.orgId` set, `type='public'`) — adult ed, students, sermon series companions, leader resources, etc. **Not** an announcements bulletin as the lead metaphor.
- Staff author via `owner`/`leader` membership rows; `canAuthorInSpace` already denies congregant authoring into the channel.
- **Publishing writes nothing per recipient** — connected users follow ministry spaces (`role='member'`), and "From your church" is a **study feed** from those spaces (plus `FeaturedItems.contentType='church'` and future sermon-calendar starters).
- Members copy or start-from-starter into their own Harvous via copy-lineage / note-templates — same privacy model as any public space (their notes stay theirs).
- The congregant fan-out query ("all users connected to church X") is served by `UserMetadata_connectedChurchIdIndex`.

**Still open before shipping connect** (do not invent defaults in product UI):

- Church-initiated matching vs user-initiated search
- Whether `auto_joined` survives or everything is accept/decline
- Request expiry
- Auto-follow **all** ministry channels vs opted ministry tracks

## User Experience

### For Users Who Set Their Church

1. **User sets church** in Profile → My Church
2. **Church joins Harvous** later
3. **User sees notification**: "First Baptist Church joined Harvous! Connect?"
4. **User clicks "Connect"** → Linked to church in our DB (not added to Clerk org); followed into ministry education channels (scope TBD)
5. **Study content appears** in "From your church" (ministry-space membership, not Clerk org membership) — curriculum feed, not announcements

### For Churches

1. **Church admin signs up** for Harvous
2. **Creates organization** with church info (staff/volunteers are added to Clerk org, ≤20)
3. **System finds matching users** automatically
4. **Sends connection requests** to high-confidence matches
5. **Users accept** → Linked in our DB; followed into ministry channels (congregants are not Clerk org members)
6. **Church publishes** curriculum into ministry broadcast spaces → visible to connected followers of those channels

## UI Components Needed (planned, SPA)

1. **Church connection notification** — shown when a church matching the user's church info joins (Home banner or similar)
2. **Church connection request panel** — pending requests in settings/My Church
3. **Church dashboard** — SPA route for church staff (role-gated via Clerk org roles): manage **ministry education channels**, sermon calendar, aggregate connection counts

## Benefits

✅ **Automatic Discovery**: Users don't need to search for their church
✅ **Seamless Connection**: One-click to connect
✅ **Content Delivery**: Ministry curriculum appears via followed education channels — no per-user fan-out writes
✅ **Privacy**: Users control their connection; their notes stay theirs
✅ **Scalable**: Congregants via our DB + ministry spaces; only staff count toward the 20-person Clerk org limit; broadcast spaces are exempt from the 30-person shared-space cap

## Locked: multi-church + home church (July 2026)

Decided with the staff pilot; do not reopen casually. **No schema/UI in v0** — congregant connect remains dark. When connect ships, implement this model (not singular “one linked church forever”).

| Decision | Lock |
|---|---|
| **Belonging** | Explicit **church membership** (connect/accept). Ministry channel follows are separate and only make sense under a membership. |
| **Cardinality** | A user may hold **many** church memberships. |
| **Home church** | Exactly **one** home church among those memberships. |
| **Home UI** | **"From your church" = home church only.** Other churches appear in Settings — not on the Home feed. |
| **Shell modes** | Top-level **My Home** vs **My Church**. My Church is always the **home church** (A). An in-mode church picker (**B**) is a later enhancement — do not build yet. |
| **My Church catalog** | Two lanes: **Shared Spaces** (church-scoped; same name/styling as personal) and **ministry channels** (staff followable feeds). Full comparison: [CHURCH_ORG_AND_CURRICULUM — distinction](./CHURCH_ORG_AND_CURRICULUM.md#church-shared-spaces-vs-ministry-channels-locked-distinction). Sidebar scope (core vs later vs anti-goals): [MY_CHURCH_SIDEBAR.md](./MY_CHURCH_SIDEBAR.md). |
| **Shared under both** | Personal Shared Spaces under My Home (`orgId` null, owner-pays). Church Shared Spaces under My Church (`orgId` set) — **create-at-church or migrate** from a member (UI later). Church-sponsored; leave personal owned-count on migrate. Collaborative compose; 30-person cap. |
| **Ministry channels** | Followable church feed (`type='public'` + `orgId`) — curriculum and other staff-authored study info. Staff write; followers read + copy. Distinct UI/icon (RSS preferred); never called Shared Spaces. |
| **First connect** | First accepted membership becomes home automatically. |
| **Change home** | Allowed anytime among current memberships (settings). |
| **Leave home** | If other memberships remain, user must pick a new home in the leave flow; if a choice cannot be collected (e.g. church deactivated), auto-promote the earliest remaining membership. If none remain, clear home. |
| **Clerk org** | Unchanged: staff/volunteers ≤20; congregants never Clerk org members. |
| **Staff pilot** | My Church lists ministry channels **and** church Shared Spaces for the home church; staff bridge when home not connected; ministry channel open stays read-only for now. See [MY_CHURCH_SIDEBAR.md](./MY_CHURCH_SIDEBAR.md) Layer 1. |

**Schema direction (document only — no migration yet):**

- `ChurchMemberships` (or equivalent): `(userId, churchId, status, joinedAt)` unique per pair
- Clarify today’s singular `UserMetadata.connectedChurchId` / `connectedOrgId` as **home** (`homeChurchId` / `homeOrgId`, or keep names and treat them as home only)
- Ministry channel follows stay as `SpaceMemberships` on `type='public'` + `orgId` spaces; joining a channel requires (or implies) church membership
- Church-scoped Shared Space: `type='shared'` + `orgId` (church-sponsored); personal Shared Space: `type='shared'` + `orgId` null (owner-pays)

Fan-out “all congregants of church X” becomes membership-table indexed, not “everyone whose home is X only,” once memberships exist. Home still drives the Home study feed.

## Future Enhancements

1. **Church Search**: Let users search for their church if not auto-matched
2. **My Church picker (B)**: When the user belongs to multiple churches, pick which church My Church mode shows (home remains the default)
3. **Church Verification**: Verify churches are legitimate
4. **Church Directory**: Public directory of churches on Harvous
5. **Church Analytics**: Aggregate only — N connected, N following a study; never individual note content ("Review is never shared" is the privacy principle)

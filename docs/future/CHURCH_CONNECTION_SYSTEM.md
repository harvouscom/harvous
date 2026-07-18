# Church Connection System Design

> **Current schema status (July 2026):** `Churches` and
> `UserMetadata.connectedChurchId/connectedOrgId/connectedChurchAt` are **landed**
> in `server/db/schema.ts` (shared-spaces foundation). `ChurchConnectionRequests`
> is **planned** — it lands with the connect flow. All endpoints, matching code,
> and UI in this doc are design sketches, not shipped code. Code samples are in
> the Hono `server/routes/*` + Drizzle idiom of the current server (the original
> Astro DB / `APIRoute` sketches are retired).

## Overview

This system allows users to set their church, churches to create Clerk Organizations, and automatically connects them when a church joins Harvous.

## User Flow

### 1. User Sets Their Church (Already Implemented ✅)
- User goes to Profile → My Church
- Enters: Church Name, City, State/Province, Country
- Stored in `UserMetadata` (`churchName/churchCity/churchState/churchCountry` — free-text, kept as **matching input only**; never repurposed for linkage)

### 2. Church Creates Organization
- Church admin signs up for Harvous
- Creates a Clerk Organization (staff/volunteers only, ≤20)
- Enters matching church info (name, city, state, country) → creates the `Churches` row
- System matches existing users and invites them to connect

### 3. Automatic Connection
- System finds users with matching church info
- Sends connection request (invitation to link to church)
- User accepts → linked in our DB (`UserMetadata.connectedChurchId`/`connectedOrgId`/`connectedChurchAt`); church content appears via church broadcast spaces
- **Congregants are not added to the Clerk org.** Only church staff/volunteers (≤20) are Clerk org members; congregants get access via our DB and membership in church broadcast spaces (see CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md).

## Clerk Organization Limit (20 People)

Clerk's free plan limits organizations to 20 members. We stay within this by **reserving the Clerk org for church staff/volunteers only** (admins, curriculum authors, small group leaders who need the church dashboard). **Congregants/attendees are never added to the Clerk org.** When a user accepts a connection request, we only update `UserMetadata.connectedChurchId`/`connectedOrgId` and optionally add them as `role='member'` rows in the church's broadcast spaces (`SpaceMemberships` — broadcast spaces are exempt from the 30-person shared-space cap, so congregation scale is fine). Curriculum and "From your church" delivery read from those spaces, not Clerk org membership.

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
  billingPlan: text('billingPlan'),         // nullable slug: 'connect' | 'study' | 'study_plus' | 'network' (draft)
  billingPlanUpdatedAt: ts('billingPlanUpdatedAt'),
  isActive: boolean('isActive').notNull().default(true),
  deletedAt: ts('deletedAt'),               // soft-delete lifecycle (Spaces parity)
  recoveryUntil: ts('recoveryUntil'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  uniqueIndex('Churches_orgId_unique').on(table.orgId),
  index('Churches_createdByIndex').on(table.createdBy),
]);

// UserMetadata additions (landed)
connectedChurchId: text('connectedChurchId'),   // Churches.id once linked
connectedOrgId: text('connectedOrgId'),         // denormalized Clerk org id
connectedChurchAt: ts('connectedChurchAt'),
// + index('UserMetadata_connectedChurchIdIndex') — the congregant fan-out query
```

Notable decisions vs. earlier drafts: `createdBy` replaces `adminUserId` (admin is a Clerk org role, possibly plural); nullable `billingPlan` slug replaces the `subscriptionTier 'starter'|'growth'|'enterprise'` enum (follows the `sharedSpacesAddOn` add-on pattern; survives tier renames without migration).

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

### 3. Content Delivery — broadcast spaces, not inbox fan-out

The retired design pushed per-user `InboxItems`/`UserInboxItems` rows on every publish. The foundation makes that unnecessary:

- Church curriculum lives in **org-owned broadcast spaces** (`Spaces.orgId` set, `type='public'`). Staff author via `owner`/`leader` membership rows; `canAuthorInSpace` already denies congregant authoring.
- **Publishing writes nothing per recipient** — connected users follow the space (`role='member'`), and "From your church" surfaces read from the followed spaces (plus `FeaturedItems.contentType='church'` for curated highlights).
- Members copy notes into their own Harvous via the copy-lineage rails (`copiedFromNoteId`/`NoteVersions`) — same flow as any public space.
- The congregant fan-out query ("all users connected to church X", e.g. to backfill follows or notify) is served by `UserMetadata_connectedChurchIdIndex`.

## User Experience

### For Users Who Set Their Church

1. **User sets church** in Profile → My Church
2. **Church joins Harvous** later
3. **User sees notification**: "First Baptist Church joined Harvous! Connect?"
4. **User clicks "Connect"** → Linked to church in our DB (not added to Clerk org); auto-followed into church broadcast spaces
5. **Church content appears** in "From your church" (delivery via broadcast-space membership, not Clerk org membership)

### For Churches

1. **Church admin signs up** for Harvous
2. **Creates organization** with church info (staff/volunteers are added to Clerk org, ≤20)
3. **System finds matching users** automatically
4. **Sends connection requests** to high-confidence matches
5. **Users accept** → Linked in our DB; followed into church broadcast spaces (congregants are not Clerk org members)
6. **Church publishes** into its broadcast spaces → visible to all connected followers

## UI Components Needed (planned, SPA)

1. **Church connection notification** — shown when a church matching the user's church info joins (prototype SPA surface, e.g. a Home banner or inbox-style card)
2. **Church connection request panel** — pending requests in settings/My Church
3. **Church dashboard** — SPA route for church staff (role-gated via Clerk org roles): manage broadcast spaces, view aggregate connection counts

## Benefits

✅ **Automatic Discovery**: Users don't need to search for their church
✅ **Seamless Connection**: One-click to connect
✅ **Content Delivery**: Church content appears via followed broadcast spaces — no per-user fan-out writes
✅ **Privacy**: Users control their connection
✅ **Scalable**: Works for churches of any size (congregants access via our DB and broadcast spaces; only staff count toward the 20-person Clerk org limit; broadcast spaces are exempt from the 30-person shared-space cap)

## Future Enhancements

1. **Church Search**: Let users search for their church if not auto-matched
2. **Multiple Churches**: Support users who attend multiple churches
3. **Church Verification**: Verify churches are legitimate
4. **Church Directory**: Public directory of churches on Harvous
5. **Church Analytics**: Aggregate only — N connected, N following a study; never individual note content ("Review is never shared" is the privacy principle)

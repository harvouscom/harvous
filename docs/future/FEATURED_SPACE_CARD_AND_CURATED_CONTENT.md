# Featured Space Card & Curated Content System

This doc describes the full design for surfacing Harvous-curated content (spaces, threads, notes) to users inside the app — starting with a rich dismissible card on the My Home dashboard, and evolving toward a Recall/Review/notifications system. The first use case is a Holy Week study space for Easter 2026.

See also: [ADMIN_LINK_BASED_SHARED_CONTENT.md](./ADMIN_LINK_BASED_SHARED_CONTENT.md) for the underlying admin + system-user model this builds on.

---

## 1. The Core Concept

Harvous can act as a publisher — creating official spaces, threads, and notes owned by a system user (`HARVOUS_SYSTEM_USER_ID`) and distributing them to users via:

- **A card on the dashboard** — rich, dismissible, seasonal or topical
- **A join link** — shared externally (email, Harvous.com, social) → existing join flow
- **A reverse Webflow sync** — Harvous-authored content pushed to the public website for discovery outside the app (future)

These three surfaces work together. The card reaches signed-in users; the external link reaches everyone else.

---

## 2. The Featured Space Card (MVP)

### What It Is

A rich, dismissible card inserted on the My Home dashboard between the tab bar and the user's content list. Appears when a Harvous-curated space is marked as featured. Design inspired by Claude's update card: clean white card, colored header strip, icon, title, description, single primary CTA.

### Where It Lives in the Dashboard

```
CardStack: "My Home"
├── TabNav: All | Threads | Notes | Scripture
├── [FeaturedSpaceCard] ← new, only when a featured space exists
└── OrganizedContentList
```

### Card Anatomy

- Colored header strip using the space's color CSS variable (same system as CardStack)
- Seasonal/topical label (e.g. "Holy Week · April 2026")
- Space title as the headline
- Space description as body copy
- Primary CTA button: "Join this study" → navigates to `/spaces/join/:shareToken` (existing join flow, no new visitor code needed)
- Dismiss (×) in the top-right corner

### Dismiss Behavior

`localStorage.setItem('dismissed_featured_${space.id}', '1')` — persists across sessions but automatically resets when a new space is featured (different `id`).

### Data Flow

```mermaid
flowchart LR
  subgraph admin [Admin Setup]
    A["POST /api/admin/spaces"] --> B["Spaces row\nuserId=HARVOUS_SYSTEM_USER_ID\nisFeatured=true\nisPublic=true\nshareToken=..."]
  end
  subgraph dashboard [Dashboard]
    C["GET /api/featured/space\n(public, no auth)"] --> D[FeaturedSpaceCard]
    D -->|"Join this study"| E["/spaces/join/:shareToken\n(existing join flow)"]
    D -->|Dismiss| F["localStorage"]
  end
  B --> C
```

---

## 3. Implementation Plan

### 3.1 Schema — `server/db/schema.ts`

Add `isFeatured` to the `Spaces` table (matches the existing pattern on `Notes`):

```typescript
isFeatured: boolean('isFeatured').notNull().default(false),
```

Run `npm run db:push` after.

### 3.2 Admin API — `server/routes/admin.ts`

New endpoints, all guarded by `isHarvousAdmin()`:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/admin/spaces` | Create a space as system user; auto-generates `shareToken`; sets `isPublic: true`; body: `{ title, description, color, isFeatured }` |
| `POST /api/admin/spaces/:spaceId/threads` | Create a thread in a system space |
| `POST /api/admin/threads/:threadId/notes` | Create a note in a system thread |

`isHarvousAdmin()` checks either:
- `auth.userId` is in `HARVOUS_ADMIN_USER_IDS` (comma-separated env list of Clerk user IDs), or
- `Authorization: Bearer HARVOUS_ADMIN_SECRET` header

New environment variables (Netlify + `.env`):
- `HARVOUS_SYSTEM_USER_ID` — Clerk user ID of the Harvous admin account
- `HARVOUS_ADMIN_USER_IDS` — comma-separated Clerk IDs of staff who can call admin endpoints
- `HARVOUS_ADMIN_SECRET` — bearer token for curl/script access

### 3.3 Featured Space Endpoint

`GET /api/featured/space` — **public, no auth required**. Queries `Spaces` for:
- `isFeatured = true`
- `isPublic = true`
- `userId = HARVOUS_SYSTEM_USER_ID`
- Ordered by `createdAt DESC`, limit 1

Returns `{ id, title, description, color, shareToken, joinUrl }` or `null` (200) when nothing is featured — card simply doesn't render.

### 3.4 Frontend Files

| File | Role |
|------|------|
| `spa/src/hooks/queries/useFeaturedSpace.ts` | React Query hook; `staleTime: 5min`; key `['featured-space']` |
| `spa/src/components/FeaturedSpaceCard.tsx` | The card component |
| `src/styles/cards.css` | `.featured-space-card` styles using existing CSS variables |
| `spa/src/pages/DashboardPage.tsx` | Insert card between `<TabNav>` and `<OrganizedContentList>` |

### 3.5 Deployment Order for Holy Week

1. Schema change + `npm run db:push`
2. Deploy updated API (admin endpoints + featured endpoint)
3. Call `POST /api/admin/spaces` + threads/notes endpoints to create the Holy Week space
4. Deploy frontend with `FeaturedSpaceCard`
5. Card appears on next dashboard load for all signed-in users
6. Share the join link externally for users not yet signed in

---

## 4. Reverse Webflow Sync (Future)

The current Webflow integration is **Webflow → Harvous** (curated content synced into the inbox). The reverse direction — **Harvous → Webflow** — would allow admin-created content to be published on the public Harvous website for discovery outside the app.

### How It Would Work

```
Admin creates note/thread in Harvous
  → marks isFeatured = true on a Note or Thread
  → POST /api/admin/sync-to-webflow triggers
  → Webflow CMS item created/updated via Webflow Write API
  → public Harvous.com page shows the content
  → "Add to Harvous" CTA deep-links to /shared/:shareToken
  → user signs up or signs in → content copied to their account
```

### What Already Exists to Support This

- `isFeatured` on Notes (in schema today)
- `shareToken` + `isPublic` on Notes and Threads
- `GET /api/shared/note/:shareToken` and `GET /api/shared/thread/:shareToken` (public preview endpoints, already built)
- `POST /api/shared/add-note-to-harvous` and `POST /api/shared/add-to-harvous` (already built)
- `WEBFLOW_INBOX_API_TOKEN` already in env
- `verifyInboxItemInWebflow` in `src/utils/webflow-verification.ts` shows the Webflow API call pattern

### What Needs Building

- `POST /api/admin/sync-to-webflow` — takes a Harvous note/thread (by ID), calls Webflow Write API to create/update a CMS item, stores the returned `webflowItemId` back on the record
- Webflow CMS collection configured with a `shareToken` field so the "Add to Harvous" deep link is embedded in each published item
- Optional: a "Publish to Harvous.com" toggle in the future admin dashboard UI

---

## 5. UX Surfaces for Suggested / Curated Content

These were considered for where Harvous-curated content could appear. The Featured Space Card (Option 2) is being built first.

| Option | Description | Best For |
|--------|-------------|---------|
| **1. Discover tab** | New tab in the My Home TabNav alongside All/Threads/Notes/Scripture | Active browsing of curated content; evolves into Recall/Review tab |
| **2. Pinned dashboard card** *(building now)* | Rich dismissible card between the tab bar and the user's content list; seasonal/topical; campaign-driven | Time-sensitive content (Holy Week, Advent, etc.) and editorial moments |
| **3. Dedicated `/discover` route** | New page in the nav; replaces or augments the "My Home" nav button; most room for future growth | Long-term home for Recall + Review + curated feed once nav hierarchy redesign is done |
| **4. Nav badge + panel** | `inboxCount`-style badge on the home nav button; clicking opens a panel/bottom sheet with suggestions | Passive awareness; notifications; Recall pings — always visible regardless of current page |
| **5. Empty state injection** | Curated suggestion shown when user has no content yet | New user onboarding only |

### Long-Term: Recall / Review / Notifications

Options 1, 3, and 4 above are the natural future home for:

- **Recall** — "You wrote a note on Isaiah 53 last week. Want to revisit it?"
- **Review** — Spaced repetition surfacing of the user's own notes on a schedule
- **Notifications** — Browser/PWA push for new Harvous spaces, seasonal study prompts, review reminders

The nav badge (Option 4) + a panel is the right pattern for passive notification-style awareness. A Discover tab (Option 1) or dedicated route (Option 3) is right for active browsing. Both would eventually merge into a single "For You" destination that combines curated Harvous content and personalized Recall suggestions.

The `inboxCount` badge infrastructure is already wired in `NavigationColumn.tsx` — it just shows 0 because the inbox UI is hidden. This becomes the natural driver for the future notification/recall badge count.

---

## 6. Relation to the Broken Inbox

The inbox system (Webflow → `InboxItems` → `UserInboxItems` → push to all users) is fully built on the server but its dashboard UI (`CollapsibleInboxSection`) was disabled due to duplication bugs and was never ported to the SPA. See `docs/archive/INBOX_DUPLICATION_ISSUES.md`.

The featured card approach deliberately sidesteps the inbox's push model:

| | Inbox (broken/hidden) | Featured Card (building now) |
|---|---|---|
| Distribution | Push: auto-assigned to all users | Pull: user sees card, chooses to join |
| Content model | `InboxItems` + `UserInboxItems` tables | System-owned `Spaces` with `isFeatured` |
| UI state | Component exists, not mounted | New card component on dashboard |
| Join mechanism | "Add to Harvous" copies content | Join space → becomes member |

The inbox could be revisited later as a separate channel for broadcast content (e.g. "For You" study notes pushed to everyone), while the featured card handles campaign/seasonal join moments. They serve different purposes and can coexist.

# Featured Item System

This document describes the Harvous Featured Item notification system — what it is, how it differs from the original Webflow inbox, and how it is designed to grow.

---

## Background: The Original Inbox System

The first iteration of Harvous notifications was a **Webflow-driven editorial inbox**. Content was authored in Webflow CMS, synced to the `InboxItems` database table via a webhook (`POST /api/webflow/sync-inbox`), and pushed to each user's `UserInboxItems` row. The UI showed an inbox count in the navigation shell and a preview panel accessible from the dashboard.

This system was built with external editorial publishing in mind — Webflow as the CMS, Harvous as the delivery layer. While the data model was solid, the system had several limitations in practice:

- **Webflow dependency**: Every notification required a Webflow CMS item. Non-editorial, admin-triggered content (e.g. a curated study space) had no natural home.
- **Push-only delivery**: Items were assigned to users in bulk via `POST /api/inbox/assign-to-users`. There was no concept of a targeted, real-time single-item nudge.
- **UI was hidden**: The inbox panel UI was never shipped to users because the experience wasn't fully defined.
- **No content-type extensibility**: `InboxItems` used `webflowItemId` as a required unique key, making it structurally tied to Webflow.

The system still exists and is untouched. Its auto-archive and auto-delete jobs continue to run. But it is no longer the primary notification path.

---

## The New Approach: FeaturedItem System

Instead of pushing editorial content from Webflow, the Featured Item system is **admin-created, content-type-aware, and user-state-tracked**. It is designed to surface one timely, relevant nudge to the user on the dashboard — and to let that nudge be anything.

### Core idea

A single `FeaturedCard` component sits at the top of the dashboard (above the tab nav). It shows one item at a time. The item can be any content type. When the user closes it, the card disappears from the dashboard — but the item is recorded server-side and resurfaces in a **My Inbox** profile panel where the user can return to it later.

---

## Content Types

The system is built around a `contentType` field that drives everything: the icon, the CTA label, and the action taken when the user taps the primary button.

| contentType | Meaning | CTA label | Primary action |
|---|---|---|---|
| `space` | A Harvous-curated public space to join | Join this space | Navigate to `/spaces/join/:shareToken` |
| `recall` | A review or recall action step | Review now | Open recall flow |
| `challenge` | A study challenge to try | Start challenge | Open challenge |
| `church` | An in-person church moment or interaction | Open | Context-specific |

New types can be added by extending the `contentType` union — no schema migration needed, just new handling in the card and inbox panel.

---

## Data Model

Two new tables in `server/db/schema.ts`:

### `FeaturedItems`

Admin-managed. One row per featured notification. Not tied to Webflow.

| Column | Type | Description |
|---|---|---|
| `id` | text PK | Generated ID |
| `contentType` | text | `space` \| `recall` \| `challenge` \| `church` |
| `title` | text | Displayed in the card header |
| `description` | text? | Displayed below the title |
| `refId` | text? | ID of the linked object (e.g. spaceId) |
| `shareToken` | text? | Join token for space-type items |
| `color` | text? | Thread color name for accent gradient |
| `isActive` | bool | Whether this item is eligible to show |
| `startsAt` | timestamp? | Optional scheduling |
| `endsAt` | timestamp? | Optional expiry |
| `createdAt` | timestamp | |

### `UserFeaturedItems`

Per-user state. Tracks whether a user has dismissed or completed a featured item.

| Column | Type | Description |
|---|---|---|
| `id` | text PK | |
| `userId` | text | Clerk user ID |
| `featuredItemId` | text | FK to `FeaturedItems.id` |
| `status` | text | `active` \| `dismissed` \| `completed` |
| `dismissedAt` | timestamp? | Set when user closes the card |
| `completedAt` | timestamp? | Set when user takes the primary action |
| `createdAt` | timestamp | |

---

## API Endpoints

All live in `server/routes/featured.ts`.

### `GET /api/featured/current` (public, soft-auth)
Returns the most recent active `FeaturedItem` the requesting user has not already dismissed or completed. Returns `null` if nothing qualifies. Used by the dashboard to decide whether to show the `FeaturedCard`.

### `POST /api/featured/dismiss` (auth required)
Body: `{ featuredItemId }`. Upserts a `UserFeaturedItems` row with `status: 'dismissed'`. Idempotent. Called when the user taps "Close" on the dashboard card.

### `GET /api/featured/dismissed` (auth required)
Returns the user's dismissed featured items ordered by `dismissedAt desc`. Used by the My Inbox profile panel.

### `POST /api/admin/featured` (admin bearer token required)
Body: `{ contentType, title, description?, refId?, shareToken?, color?, startsAt?, endsAt? }`. Creates a new `FeaturedItems` row and makes it available immediately via `GET /api/featured/current`.

---

## Dashboard: FeaturedCard

The `FeaturedCard` component (`spa/src/components/FeaturedCard.tsx`) is a generic card that renders differently based on `contentType`. It does not know about spaces specifically — it just knows how to display any `FeaturedItem`.

**Visual structure:**
- A 44×44px accent block with a deterministic 3-color mesh gradient (generated from the item ID via `generateAccentMeshGradient`) and a contextual icon per `contentType`
- Title and description text
- Full-width split button group: primary CTA (left, bold) and "Close" (right, muted)

**Close behavior:**
1. Optimistic: `dismissed` state set immediately, card hides
2. localStorage key written as a fast local check (prevents flash on re-mount)
3. `POST /api/featured/dismiss` fires in the background — this is the durable record

---

## Profile: My Inbox Panel

A new `MyInboxPanel` component is accessible from the profile options list ("My Inbox", above "My Spaces"). It fetches `GET /api/featured/dismissed` and renders a scrollable list of previously closed featured items.

Each row mirrors the `FeaturedCard` visual language — same accent gradient, same contextual icon — but in a more compact list format with a single CTA button rather than the full-width split group. Users can still take the primary action from here (join the space, start the challenge, etc.).

Empty state: "Nothing here yet — featured suggestions you close will appear here."

---

## What the Webflow Inbox System Still Does

The original `InboxItems` / `UserInboxItems` system is untouched. Its auto-archive and auto-delete scheduled jobs continue to run. If Webflow editorial content is ever surfaced to users in the future, it would likely appear as a second section in the My Inbox panel rather than on the dashboard — the dashboard `FeaturedCard` is reserved for the admin-driven `FeaturedItems` system.

---

## Related Files

| File | Role |
|---|---|
| `server/db/schema.ts` | `FeaturedItems` and `UserFeaturedItems` table definitions |
| `server/routes/featured.ts` | All Featured Item API endpoints |
| `server/utils/harvous-admin.ts` | `requireHarvousAdmin` — used by `POST /api/admin/featured` |
| `spa/src/components/FeaturedCard.tsx` | Dashboard card component |
| `spa/src/hooks/queries/useFeaturedItems.ts` | React Query hook for featured items feed |
| `src/components/react/MyInboxPanel.tsx` | Profile inbox panel |
| `src/components/react/ProfileOptionsList.tsx` | Exposes "My Inbox" profile option |
| `src/utils/colors.ts` | `generateAccentMeshGradient` — deterministic 3-color gradient for card accents |
| `docs/AUTO_ARCHIVE_SETUP.md` | Original Webflow inbox auto-archive docs (still active) |

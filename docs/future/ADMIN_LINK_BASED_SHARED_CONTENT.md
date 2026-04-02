# Admin Experience for Link-Based Shared Content (Alternative to Inbox)

This doc describes a Harvous-team admin experience where curated spaces, threads, and notes are created and shared via links so anyone with the link can join a space or add content to their account—positioned as an alternative to the current inbox push model.

---

## Current State (Brief)

- **Inbox:** Harvous content lives in `InboxItems` (Webflow sync or manual). `assign-to-users` pushes items to everyone via `UserInboxItems`. Users see them in the collapsible "For You" section and can "Add to Harvous" (copy) or archive. No per-item share link.
- **Shared spaces (user-owned):** `Spaces` have `shareToken` and `isPublic`. Owner gets invite link; `POST /api/spaces/join/:token` lets anyone with the link join as a `Member`. `JoinSpacePage` handles the flow.
- **Thread/Note sharing:** Schema has `isPublic` and `shareToken` on `Threads` and `Notes` but they are **unused**. See `SHARING_SYSTEM_DESIGN.md` for public share links (preview + "Add to My Harvous" copy) and collaborative shared threads; `SHARING_AND_GROUPS_INFRASTRUCTURE.md` notes these are not implemented.

So today: **inbox = push to all users**; **spaces = link-based join**, but only for **user-owned** spaces.

---

## Target Model: Harvous as Publisher, Link-Based Access

- **Admin** = Harvous team (internal). They create and manage **official** spaces, threads, and notes.
- **Content** is "owned" by Harvous (not a random user). Anyone with the link can:
  - **Join a space** → become a member of that one shared space (same as today's join flow).
  - **Add a thread or note** → copy into their account (like inbox "Add to Harvous"; no membership).
- No push to everyone's inbox; distribution is **by link only**.

---

## 1. Ownership: Who "Owns" Harvous Content?

Spaces/threads/notes today are keyed by `userId`. For Harvous-managed content you need a stable owner identity.

**Option A — System user (recommended for MVP)**

- Env: `HARVOUS_SYSTEM_USER_ID` (Clerk user ID of a dedicated "Harvous" account, or a synthetic ID if you ever support system-owned content without a real Clerk user).
- All admin-created spaces/threads/notes use this as `userId`.
- Pros: No schema change; existing space-join and permission logic (e.g. `requireSpaceAccess`) work.
- Cons: That user shows up as "owner" in UI unless you special-case it (e.g. "From Harvous" label).

**Option B — Flag on content**

- Add `createdByHarvous: boolean` (or `ownerType: 'user' | 'harvous'`) to Spaces (and optionally Threads/Notes).
- Requires schema + migration and updating all "owner" checks to treat Harvous-owned content differently.

**Recommendation:** Start with **Option A**. Reserve one Clerk user (or a well-known test user) as the Harvous system identity. Later you can add a flag or org model if you need multiple "channels" or clearer UX.

---

## 2. Admin Capabilities (What the Admin Can Do)

| Capability | Description |
|------------|-------------|
| Create space | Create a space owned by the system user; set title, description, color. |
| Create thread | Create a thread in that space (or in "unorganized" for system user). |
| Create note | Create notes in a thread (or attach to thread/space as today). |
| Generate space link | Set `isPublic = true`, ensure `shareToken` exists (reuse existing logic for generating/regenerating share token). Link: `https://app.harvous.com/spaces/join/:shareToken` (or current join URL pattern). |
| (Optional) Generate thread/note link | Per-thread or per-note share link: preview + "Add to My Harvous" (copy). Requires new routes and possibly SharedContent or use of Thread/Note `shareToken` (see `SHARING_SYSTEM_DESIGN.md`). |

MVP can be **space-only**: admin creates a space (and its threads/notes) as system user, turns on sharing, copies the join link. No new schema for SharedContent or thread/note share links.

---

## 3. Admin Experience (Where and How)

**Auth:** Only the Harvous Admin account should act as "admin":

- **System user match:** `isHarvousAdmin(c)` passes when `auth.userId` equals `HARVOUS_SYSTEM_USER_ID` (the Harvous Admin Clerk account).
- **Optional:** `Authorization: Bearer HARVOUS_ADMIN_SECRET` for server-to-server or script use.

**Where admin operates:**

- **Option 1 — Internal dashboard (new):** New area (e.g. `/admin` or separate subdomain) with: list of Harvous-owned spaces; create space/thread/note; edit; "Copy join link" per space. Uses existing API + new admin-only routes (e.g. `POST /api/admin/spaces` creating as system user, `POST /api/admin/spaces/:id/share-link`).
- **Option 2 — Scripts + API only:** No UI. Scripts or Postman/cron call admin endpoints (protected by allowlist or secret) to create spaces/threads/notes and generate links; links are pasted into emails, blog, etc.
- **Option 3 — Webflow + link generation:** Keep creating "content" in Webflow (or CMS), but instead of (or in addition to) inbox sync: script that creates a Space/Thread/Note from CMS item and returns a join link or add link. Admin copies link from script output or a simple internal page.

For "instead of inbox for now", **Option 2** is enough to validate: admin creates one shared space with threads/notes, gets join link, shares link. **Option 1** improves once you want non-devs to manage multiple spaces/links.

---

## 4. Visitor Experience (Anyone With the Link)

- **Space link (e.g. `/spaces/join/:token`):** Already implemented. User opens link → JoinSpacePage → sign-in if needed → POST join → becomes Member → redirect to space. No change needed; only the space's `userId` is now the system user.
- **Thread/note link (if you add it later):** New route, e.g. `/shared/:token`. Public preview (no auth); CTA "Add to My Harvous" → sign-in/sign-up → POST add → copy thread/note into user's account (same idea as inbox add-to-harvous), then redirect to dashboard or the new thread/note.

So for MVP: **no visitor-side changes**; only the space is Harvous-owned and the link is shared by Harvous instead of a user.

---

## 5. Data Flow (MVP: Space-Only, Link-Based)

```mermaid
sequenceDiagram
  participant Admin
  participant API
  participant DB
  participant Visitor

  Admin->>API: Create space (as system user)
  API->>DB: Insert Space (userId = HARVOUS_SYSTEM_USER_ID)
  Admin->>API: Create threads/notes in space
  API->>DB: Insert Threads/Notes (userId = system)
  Admin->>API: Enable sharing / get share link
  API->>DB: Set isPublic, shareToken
  API-->>Admin: Join URL

  Admin-->>Visitor: Share link (email, site, etc.)
  Visitor->>API: GET join preview then POST join
  API->>DB: Insert Member(spaceId, visitor userId)
  API-->>Visitor: Redirect to space
```

---

## 6. Implementation Outline (MVP)

1. **Env and auth**
   - Add `HARVOUS_SYSTEM_USER_ID` (Harvous Admin Clerk user ID).
   - Add a small helper (e.g. `isHarvousAdmin(c)` and `getHarvousSystemUserId()`) used only in admin paths.

2. **Admin API (minimal)**
   - `POST /api/admin/spaces` — create space (body: title, description, color). Insert with `userId = HARVOUS_SYSTEM_USER_ID`. Return `{ spaceId, shareToken, joinUrl }` (join URL = existing join route with this space's `shareToken`).
   - Ensure space can get a share token (reuse or extract existing "generate invite" logic so the space has `isPublic` and `shareToken`).
   - Optional: `POST /api/admin/spaces/:spaceId/threads`, `POST /api/admin/threads/:threadId/notes` to create threads/notes as system user.

3. **Access control**
   - All of the above routes: require signed-in Harvous Admin (`auth.userId === HARVOUS_SYSTEM_USER_ID`) or a valid secret header (`Authorization: Bearer HARVOUS_ADMIN_SECRET`). Do not expose to normal users.

4. **UI (optional for MVP)**
   - If you skip internal dashboard: use scripts or one-off API calls to create a space, add threads/notes, then copy join URL from response.
   - If you add a dashboard: one page that lists Harvous-owned spaces (where `userId === systemUserId`), "New space", and "Copy join link" per space.

5. **Visitor**
   - No code change; existing join flow and JoinSpacePage work. Only the space is now Harvous-owned.

6. **Docs**
   - Short internal doc: how to create a Harvous shared space, get the link, and share it (and that this replaces or complements inbox for that use case).

---

## 7. Later: Thread/Note Share Links (Optional)

If you want "anyone with the link can **add this thread or note** to their account" (copy, not join):

- Reuse or add `shareToken` (and optionally `isPublic`) on Threads/Notes.
- Add public `GET /api/shared/:token` (preview) and auth `POST /api/shared/:token/add` (copy into user's account, similar to inbox add-to-harvous).
- Add SPA route `/shared/:token` (preview + CTA).
- Optionally introduce `SharedContent` (see SHARING_AND_GROUPS_INFRASTRUCTURE.md) if you want analytics (view/add counts) or multiple share types; otherwise storing token on Thread/Note can suffice.

That gives you both: **join a Harvous space** (existing) and **add this Harvous thread/note** (new).

---

## 8. Inbox vs Link-Based (Positioning)

| | Inbox (current) | Link-based (this doc) |
|--|------------------|-------------------------|
| How content reaches users | Push: assign to all (or targetAudience) | Pull: user opens link |
| Who sees it | Everyone (or segment) | Only people who get the link |
| Best for | Broadcast, "For You" discovery | Campaigns, email, blog, social, specific groups |
| Admin creates | InboxItems (Webflow/manual) → UserInboxItems | Spaces/Threads/Notes (system user) + share link |

You can keep both: inbox for broad discovery, link-based for "join this study" or "add this resource" from a specific campaign or partner.

---

## Summary

- **Admin** = Harvous team, allowed via allowlist or secret; creates spaces (and threads/notes) as a **system user** and gets **join links** for spaces.
- **Visitor** = anyone with the link; uses **existing join flow** to become a member of that space (no inbox).
- MVP = env (system user + admin auth), minimal admin API (create space + share link; optionally create thread/note), no new visitor UI. Optional later: thread/note share links (preview + add copy) and a simple internal admin dashboard.

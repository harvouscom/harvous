# Shared Spaces — Development Notes & Decisions

**Status: v1 complete (February 2026).** Shared spaces are fully implemented and in a good place. The feature is complete for v1: invite via link, join/leave, member view, tier limits, locked notes excluded. Future work focuses on performance and quality-of-life improvements.

This document captures design decisions, rules, and implementation details for the collaborative shared spaces feature. It is a living reference for continued development.

---

## Visibility Rules

### Two Independent Layers

Shared spaces use two separate visibility systems that do not override each other:

**Layer 1 — Space-level visibility**
Whether someone with the space's share link (or who is a member) can see content in the space. This is governed entirely by the space's `isPublic` flag and `shareToken`. The individual `isPublic` or `shareToken` on threads/notes inside the space is **irrelevant** to space-level access — if it's in the space, space members/visitors can see it.

**Layer 2 — Item-level visibility**
Whether a specific note or thread has its own independent share link (`shareToken`). This is completely independent of space membership. Adding an item to a space does not revoke or change its individual share link. Making a space private does not affect item-level share links.

### Practical Rules

| Situation | Visible via space? | Individual link still works? |
|---|---|---|
| Private thread in shared space | ✅ Yes | N/A (no individual link) |
| Shared thread in shared space | ✅ Yes | ✅ Yes |
| Thread removed from space | ❌ No | ✅ Yes (if it had one) |
| Space goes private | ❌ No | ✅ Yes (individual links unaffected) |

### Locked Notes

**Locked notes (`contentEncrypted: true`) must never appear in shared space contexts.**

- They are excluded from the join page (`/spaces/join/[token].astro`) via `eq(Notes.contentEncrypted, false)` in the query.
- The owner viewing their own space can still see locked notes — the filter only applies to unauthenticated/non-owner views.
- When the authenticated member view is built, the same `contentEncrypted: false` filter must be applied to notes queries for non-owners.

---

## Content Display in Shared Contexts

### Individual Sharing UI Is Hidden

When a thread or note is displayed within a shared space context (join page, future member view), its individual sharing controls (share button, share link UI) should **not be shown**. The space's sharing is what matters. Don't expose per-item share state to space viewers.

### Icon for Threads

In shared space contexts, always use the **layer-group icon** for threads, regardless of whether the thread itself is private or has its own share token. The thread's individual privacy state is irrelevant inside a shared space.

The `CardThread.astro` component already supports `icon="layer-group"` for this purpose.

---

## Permission Model

### Roles

There are two effective roles:

- **Owner** — the user who created the space, identified by `Spaces.userId`. All elevated permissions derive from this field directly.
- **Member** — any user added to the `Members` table. The `Members.role` column always defaults to `'member'`.

> The DB schema has `'admin'` and `'owner'` as possible `Members.role` values, but **neither is used in code**. All owner checks compare `Spaces.userId === currentUserId`, not the Members table. These are dead code reserved for a future ownership-transfer or admin-promotion feature.

### What each role can do

| Action | Owner | Member |
|--------|-------|--------|
| View space, see member list | ✅ | ✅ |
| See pending invitations | ✅ | ❌ |
| Edit title, color, visibility | ✅ | ❌ |
| Toggle Public ↔ Private | ✅ | ❌ |
| Generate / refresh share link | ✅ | ❌ |
| Invite via link | ✅ | ❌ |
| Remove any member | ✅ | ❌ |
| Remove any thread/note from space | ✅ (via remove-items API) | Only own items |
| Leave space (remove self) | ❌ (blocked) | ✅ |
| Add/remove own notes & threads | ✅ | ✅ |
| Delete the space | ✅ | ❌ |

When a member leaves, an in-app confirmation dialog explains that anything they added to the space will remain in the space unless they remove it; they can rejoin later with the same link.

### Access enforcement

All space API routes use `requireSpaceAccess(spaceId, userId, requireOwner?)` from `src/utils/space-permissions.ts`:
- Default (no flag) → passes for owner **or** member
- `requireOwner: true` → owner only, returns 403 for members

Owner-only endpoints: `update`, `share-link` (POST), `members/invite`, `delete`.

### Tier limits (simplified)

**User-facing:** One metric only. Free: 3 shared spaces (spaces you create and invite people to). Paid: unlimited shared spaces. No join limit; users can join as many spaces as they like on both tiers.

**Invisible cap:** 150 people per space (both tiers), not shown in UI—like YouVersion. Enforced in `canAddMemberToSpace` / `canAddMemberToSpaceByOwnerId`; when hit, user sees "This space has reached its people limit."

Implementation: `src/utils/tier-limits.ts` (`TIER_LIMITS`, `canCreateSharedSpace`, `canOwnerAddOneMoreSharedSpace`, `canAddMemberToSpace`, etc.).

---

## Current Architecture

### What's Implemented

| Feature | Status |
|---------|--------|
| Space creation (private) | ✅ Done |
| Toggle Public / Private | ✅ Done |
| Permanent share link (join via link) | ✅ Done |
| Join page preview (`/spaces/join/[token]`) | ✅ Done |
| Join API (`POST /api/spaces/join/[token]`) | ✅ Done |
| Members list API with full metadata | ✅ Done |
| Remove member (owner removes others) | ✅ Done |
| People list in EditSpacePanel | ✅ Done |
| "Make Private" confirmation when others are in space | ✅ Done |
| Real-time space content update on add/remove | ✅ Done |
| TabNav in EditSpacePanel (Added / Add / People) | ✅ Done |
| TabNav in EditThreadPanel (Added / Add) | ✅ Done |
| Member view (same route as owner: `/space/{id}` via [...slug].astro) | ✅ Done |
| Email invitations | ⏸ Out of scope for now — link-based joining only |
| Leave space (member self-removal UI) | ✅ Done (SpaceCardStackHeader when spaceRole === 'member') |

### Key Files

| File | Role |
|---|---|
| `db/config.ts` | Schema: `Spaces`, `Members`, `SpaceInvitations` tables |
| `src/pages/spaces/join/[token].astro` | Public join page (unauthenticated preview + join CTA) |
| `src/pages/api/spaces/join/[token].ts` | POST: adds authenticated user as member |
| `src/pages/api/spaces/[spaceId]/share-link.ts` | GET: returns share URL; POST: refreshes token |
| `src/pages/api/spaces/[spaceId]/members/index.ts` | GET: lists members + pending invitations |
| `src/pages/api/spaces/[spaceId]/members/invite.ts` | POST: creates invitation record (link method only) |
| `src/pages/api/spaces/[spaceId]/members/[userId].ts` | DELETE: removes a member |
| `src/pages/api/spaces/[spaceId]/update.ts` | PATCH: updates space (title, color, isPublic, etc.) |
| `src/components/react/EditSpacePanel.tsx` | Owner UI: edit space, manage members, share link, tab nav |
| `src/components/react/SpaceMembersList.tsx` | Standalone panel: view/remove members |
| `src/utils/space-permissions.ts` | `requireSpaceAccess()` — enforces owner/member access |
| `src/utils/tier-limits.ts` | Shared-space count (3 / unlimited) and invisible 150 people/space cap |

### Join Flow (Permanent Share Link — current approach)

1. Owner toggles space to Shared in `EditSpacePanel` → `POST /api/spaces/[spaceId]/update`
2. Share link auto-generated via `GET /api/spaces/[spaceId]/share-link`
3. Owner copies link and shares it manually
4. Recipient visits `/spaces/join/[token]`
5. Page shows space preview: owner name, title/color, condensed notes & threads (locked notes excluded)
6. CTA: "Join this space on Harvous" → if authenticated, POSTs to `/api/spaces/join/[token]`; if not, redirects to sign-up then returns
7. On success: redirected to canonical space URL (`/space/{id}` via `idToUrl(space.id)`). Same [...slug].astro route serves both owners and members; members see space content with locked notes excluded.

### Language: People, Not Members

All user-facing text uses **"person/people"** (not "member/members") when referring to people in a space. This applies to:
- Join page people count
- `SpaceMembersList` panel header
- `EditSpacePanel` member count display
- `SharedSpaceIndicator` badge

---

## Known Issues & Gaps

### Member View (Implemented in [...slug].astro)

The join API redirects to the canonical space URL via `idToUrl(space.id)` (e.g. `/space/1770777786201`). The same [...slug].astro route serves both owners and members:

- When the space is not in the user's owned list, `requireSpaceAccess(spaceId, userId)` is called. If the user is owner or member, the space and content are loaded.
- For **members**: threads and notes are loaded by `spaceId` only; notes with `contentEncrypted: true` are excluded (`getNotesForSpaceForMember`). Helpers: `getThreadsForSpaceBySpaceId(spaceId)` and `getNotesForSpaceForMember(spaceId, ownerUserId, limit?, offset?)` in `dashboard-data.ts`.
- For **owners**: existing `getThreadsForSpace` and `getNotesForSpace` are used. No separate member-view page; the same template renders for both.

### Members Insert (Fixed)

In `join/[token].ts`, the `Members` insert includes both `createdAt: new Date()` and `joinedAt: new Date()`, satisfying the schema requirement for `createdAt` and recording join time.

### Invitation Already-Exists Check (Fixed)

In `invite.ts`, the existing-invitation check now wraps the three conditions in `and(...)` so the query is valid. Email invitations are still out of scope; the fix is in place for when they are enabled.

---

## Outstanding Work

Shared spaces v1 is complete and in a good place. The items below are future enhancements or quality-of-life improvements, not required for the feature to be considered complete.

### High Priority

None at this time.

### Medium Priority

**NewSpacePanel Shared mode**: When the user selects "Shared", the create request correctly sends `isPublic: true` (formData and JSON body use `selectedType === 'Shared'`). No change needed.

**Leave space UI**: Implemented in `SpaceCardStackHeader`: when the viewer is a member (`spaceRole === 'member'`), a "Leave space" control is shown. It calls `DELETE /api/spaces/[spaceId]/members/[userId]` with the current user's id, then redirects to `/`. [...slug].astro passes `spaceRole` and `currentUserId` to the header.

### Future / Not Needed Yet

5. **Email invitations** — infrastructure exists (`SpaceInvitations` table, `invite.ts` endpoint, `/invitations/[token]` page) but email sending is not implemented and this path is not being pursued right now. Link-based joining is the only active flow.
6. **Notification when space content is updated** — members have no way to know when new notes are added.
7. **Member-contributed content** — currently only the owner's notes/threads appear in the space (filtered by `userId`). Design intent includes members adding their own content.
8. **Role expansion** — schema supports `admin` role but nothing uses it. No UI for promoting members or transferring ownership.
9. **Space deletion cleanup** — when a space is deleted, `Members` and `SpaceInvitations` records are not cleaned up (orphaned rows).
10. **Invitation expiration** — `expiresAt` is stored on `SpaceInvitations` but never validated.

---

## Local Dev Testing Guide

### Testing the "Make Private" confirmation dialog

The dialog only fires when `memberCount > 1`. Seed a fake member directly into the DB:

```bash
# Insert
npx astro db shell --query "INSERT INTO Members (id, spaceId, userId, role, createdAt, joinedAt) VALUES ('member_test_001', 'YOUR_SPACE_ID_HERE', 'user_test_fake_001', 'member', datetime('now'), datetime('now'));"

# Verify
npx astro db shell --query "SELECT * FROM Members WHERE id = 'member_test_001';"

# Clean up when done
npx astro db shell --query "DELETE FROM Members WHERE id = 'member_test_001';"
```

With the fake member inserted, open that space's `EditSpacePanel` → it should show "2 people in this space" and the People tab. Clicking "Turn off sharing" should trigger the confirmation dialog.

### Testing the full end-to-end join flow

**Requirement**: Two Clerk accounts (or a second browser profile).

1. Chrome → your profile avatar → Add Profile → create a second profile
2. Sign into your main account in Profile 1, a test Clerk account in Profile 2
3. In Profile 1: create a Shared space, open `EditSpacePanel`, copy the share link
4. In Profile 2: paste the share link → join page appears with preview
5. Click "Join this space on Harvous" → will join and redirect to the space URL (same route as owner; member view is implemented)
6. Back in Profile 1: open `EditSpacePanel` → should now show 2 people and the People tab

### What's testable without a second account

- ✅ Join page preview (`/spaces/join/[token]`) — use incognito
- ✅ `EditSpacePanel` share link generation and copy
- ✅ "Make Private" dialog (seed a DB member per above)
- ✅ People tab in `EditSpacePanel` (seed a DB member per above)
- ❌ Actual join flow (requires second account)
- ❌ Email invitation delivery (not implemented, out of scope)

---

## Data Model Quick Reference

```
Spaces
  id, title, color, userId (owner), isPublic, shareToken, shareTokenCreatedAt

Members
  id, userId, spaceId, role ('member' in practice; 'admin'/'owner' unused), createdAt, joinedAt

SpaceInvitations  [infrastructure exists, email flow out of scope for now]
  id, spaceId, invitedBy, invitedEmail, invitedUserId, inviteToken (unique),
  role, status ('pending'|'accepted'|'declined'|'expired'|'cancelled'),
  message, expiresAt, createdAt, acceptedAt
```

Notes and Threads belong to a space via `spaceId` (optional column on both tables). There is no separate junction table — `Notes.spaceId` and `Threads.spaceId` are the relationship.

Note counts per thread use the `NoteThreads` junction table (many-to-many), not `Notes.threadId` directly.

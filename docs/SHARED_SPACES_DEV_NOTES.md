# Shared Spaces — Development Notes & Decisions

This document captures design decisions, rules, and outstanding work for the collaborative shared spaces feature. It is a living reference for continued development.

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

## Current Architecture

### Key Files

| File | Role |
|---|---|
| `db/config.ts` | Schema: `Spaces`, `Members`, `SpaceInvitations` tables |
| `src/pages/spaces/join/[token].astro` | Public join page (unauthenticated preview + join CTA) |
| `src/pages/invitations/[token].astro` | Email invitation acceptance page |
| `src/pages/api/spaces/join/[token].ts` | POST: adds authenticated user as member |
| `src/pages/api/spaces/[spaceId]/share-link.ts` | GET: returns share URL; POST: refreshes token |
| `src/pages/api/spaces/[spaceId]/members/index.ts` | GET: lists members + pending invitations |
| `src/pages/api/spaces/[spaceId]/members/invite.ts` | POST: creates invitation (email or link method) |
| `src/pages/api/spaces/[spaceId]/members/[userId].ts` | DELETE: removes a member |
| `src/pages/api/spaces/[spaceId]/update.ts` | PATCH: updates space (title, color, isPublic, etc.) |
| `src/components/react/EditSpacePanel.tsx` | Owner UI: edit space, manage members, share link |
| `src/components/react/InviteMemberPanel.tsx` | Modal: invite via email or link |
| `src/components/react/SpaceMembersList.tsx` | Modal: view/remove members |
| `src/utils/space-permissions.ts` | `requireSpaceAccess()` — enforces owner/member access |
| `src/utils/tier-limits.ts` | `canAddMemberToSpace()` — enforces member count limits |

### Join Page Flow (Permanent Share Link)

1. User visits `/spaces/join/[token]`
2. Page fetches space by `shareToken`, checks `isPublic: true`
3. Shows space preview: owner name, space title/color, condensed notes & threads (locked notes excluded)
4. Shows member count ("X people in this space")
5. CTA: "Join this space on Harvous" → if authenticated, POSTs to `/api/spaces/join/[token]`; if not, redirects to sign-up then returns
6. On success: redirected to `/spaces/[spaceId]` (not yet built — see Outstanding Work below)

### Invitation Flow (Email Invite)

1. Owner sends invite from `InviteMemberPanel` → `POST /api/spaces/[spaceId]/members/invite`
2. Invitation record created in `SpaceInvitations` with `status: 'pending'`, 7-day expiration
3. Invite URL: `/invitations/[inviteToken]`
4. Recipient visits invite page, sees space details and inviter name
5. On accept: `POST /api/spaces/[spaceId]/members` → member added, invitation marked `accepted`
6. **Email sending is not yet implemented** — the invite URL must be shared manually (see TODO in `invite.ts:124`)

### Language: People, Not Members

All user-facing text uses "person/people" (not "member/members") when referring to people in a space. This applies to:
- Join page people count
- Invitation page
- SpaceMembersList panel header and count
- EditSpacePanel member count display

---

## Known Issues & Gaps

### Members API Only Fetches First User's Metadata

In `src/pages/api/spaces/[spaceId]/members/index.ts` line 58–64, the `UserMetadata` query only fetches the first userId's metadata due to a missing `inArray` call. All other members will have `null` names/emails/avatars.

```typescript
// Current (broken for >1 member):
.where(eq(UserMetadata.userId, memberUserIds[0]))

// Should use:
.where(inArray(UserMetadata.userId, memberUserIds))
// (requires importing `inArray` from 'astro:db')
```

### Member View Page Not Built

The join API returns `redirectUrl: '/spaces/${space.id}'` but there is no `/spaces/[spaceId]` page yet. Members who join are redirected to a non-existent page. This is the most critical missing piece.

The member view page needs to:
- Require authentication
- Verify the user is a member or owner of the space
- Query notes/threads by `spaceId` (not `userId`) — **exclude** `contentEncrypted: true` notes for non-owners
- Hide individual sharing UI on notes and threads
- Show layer-group icon on threads (no per-thread privacy state)
- Use `getNotesForSpace` only for the owner; write a separate member query for non-owners

### Email Sending Not Implemented

`POST /api/spaces/[spaceId]/members/invite` with `method: 'email'` creates the invitation record but does not send an email. The invite URL is returned in the API response but never delivered. Needs integration with Clerk, Resend, or similar.

### Invitation Already-Exists Check Has a Bug

In `invite.ts` line 79, `.where()` is called with three separate arguments instead of wrapping them in `and()`:
```typescript
// Current (incorrect):
.where(
  eq(SpaceInvitations.spaceId, spaceId),
  eq(SpaceInvitations.invitedEmail, email),
  eq(SpaceInvitations.status, 'pending')
)

// Should be:
.where(and(
  eq(SpaceInvitations.spaceId, spaceId),
  eq(SpaceInvitations.invitedEmail, email),
  eq(SpaceInvitations.status, 'pending')
))
```

### `createdAt` Missing from Members Insert

In `join/[token].ts` line 84–91, the `Members` insert does not include `createdAt`. The schema requires it (it's a non-optional `column.date()`). Should add `createdAt: new Date()` to the insert values.

---

## Outstanding Work

### High Priority

1. **Build `/spaces/[spaceId]` member view page** — the redirect target after joining. See member view requirements above.
2. **Fix `inArray` bug in members API** — members past the first won't show names/photos.
3. **Fix `createdAt` missing from member insert** — will cause DB errors in production.
4. **Fix `and()` missing in invitation duplicate-check query**.

### Medium Priority

5. **Implement email sending** for invitations (Clerk or Resend).
6. **NewSpacePanel: fix Shared mode** — currently hardcodes `isPublic: 'false'` regardless of user selection. See plan notes.
7. **InviteMemberPanel / SpaceMembersList visual redesign** — currently use inline styles with hardcoded hex colors instead of design system variables. See plan notes.

### Low Priority / Future

8. **Notification when space content is updated** — members have no way to know when new notes are added. Could be email digest or in-app badge.
9. **Member-contributed content** — currently only the owner's notes/threads appear in the space (filtered by `userId`). The design intent includes members adding their own content to a shared space.
10. **Role expansion** — schema supports `admin` role but only `owner` and `member` are used. No UI for promoting members.
11. **Leave space** — members have no way to leave a space. Only the owner can remove them.
12. **Space deletion** — when a space is deleted, `Members` and `SpaceInvitations` records are not cleaned up.

---

## Data Model Quick Reference

```
Spaces
  id, title, color, userId (owner), isPublic, shareToken, shareTokenCreatedAt

Members
  id, userId, spaceId, role ('owner'|'member'|'admin'), createdAt, joinedAt

SpaceInvitations
  id, spaceId, invitedBy, invitedEmail, invitedUserId, inviteToken (unique),
  role, status ('pending'|'accepted'|'declined'|'expired'|'cancelled'),
  message, expiresAt, createdAt, acceptedAt
```

Notes and Threads belong to a space via `spaceId` (optional column on both tables). There is no separate junction table — `Notes.spaceId` and `Threads.spaceId` are the relationship.

Note counts per thread use the `NoteThreads` junction table (many-to-many), not `Notes.threadId` directly.

# What's Left - Collaborative Shared Spaces

## ✅ Completed with Opus 4.6 (HARD STUFF DONE!)

### Foundation
- ✅ Database: SpaceInvitations table + indexes
- ✅ Utilities: space-permissions.ts (6 functions)
- ✅ Utilities: tier-limits.ts (complete tier system)

### APIs (7 of 10 complete)
- ✅ POST /api/spaces/[spaceId]/members/invite (email + link)
- ✅ GET /api/invitations/[token] (public view)
- ✅ POST /api/invitations/[token]/accept (with tier checks)
- ✅ POST /api/invitations/[token]/decline
- ✅ GET /api/spaces/[spaceId]/members (complex joins!)
- ✅ GET /api/user/limits (tier info)
- ✅ UPDATED: spaces/[spaceId]/items.ts (permission pattern shown)

### UI (2 of 5 complete)
- ✅ AcceptInvitationPage.astro (full-stack page!)
- ✅ InviteMemberPanel.tsx (complex React component)

---

## 🎯 Remaining Work (Easy with Sonnet 4.5!)

All complex logic is DONE. What's left is **copy-paste pattern application**.

### Simple APIs (3 remaining) - ~1 hour

#### 1. DELETE /api/spaces/[spaceId]/members/[userId]
Copy from: accept.ts (similar validation)
```typescript
// Allow owner OR self-removal
const isOwner = space.userId === userId;
const isSelf = params.userId === userId;

if (!isOwner && !isSelf) {
  return forbiddenResponse();
}

// Prevent owner self-removal
if (isOwner && isSelf) {
  return errorResponse('Cannot remove yourself as owner');
}

await db.delete(Members)
  .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, params.userId)));
```

#### 2. GET /api/user/can-create-space
```typescript
const canCreate = await canCreateSharedSpace(userId, locals.auth());
return successResponse(canCreate);
```

#### 3. GET /api/user/can-join-space
```typescript
const canJoin = await canJoinSpace(userId, locals.auth());
return successResponse(canJoin);
```

### Update Existing APIs (3 remaining) - ~30 min

Pattern shown in spaces/[spaceId]/items.ts - just add:

```typescript
import { requireSpaceAccess } from '@/utils/space-permissions';

// Replace owner-only check with:
await requireSpaceAccess(spaceId, userId); // Allows owner OR member
```

Files to update:
- ✏️ spaces/[spaceId]/update.ts (add requireOwner: true)
- ✏️ spaces/[spaceId]/add-note.ts
- ✏️ spaces/[spaceId]/add-thread.ts

### Simple UI Components (3 remaining) - ~2 hours

#### 1. SpaceMembersList.tsx
**API:** GET /api/spaces/[spaceId]/members (already built!)

Copy patterns from:
- InviteMemberPanel.tsx (modal structure)
- MySpacesPanel.tsx (list rendering)

```tsx
// Pseudo-code
const { members, pendingInvitations } = await fetch(`/api/spaces/${spaceId}/members`);

return (
  <div className="members-list">
    {members.map(member => (
      <div key={member.userId} className="member-row">
        <img src={member.profileImageUrl} />
        <span>{member.firstName} {member.lastName}</span>
        <span className="role-badge">{member.role}</span>
        {isOwner && member.role !== 'owner' && (
          <button onClick={() => removeMember(member.userId)}>Remove</button>
        )}
      </div>
    ))}
  </div>
);
```

#### 2. SharedSpaceIndicator.tsx
**Simplest component!**

```tsx
export default function SharedSpaceIndicator({ memberCount }: { memberCount: number }) {
  return (
    <span className="shared-space-badge">
      👥 {memberCount} {memberCount === 1 ? 'member' : 'members'}
    </span>
  );
}
```

#### 3. Integrate into EditSpacePanel.tsx
Add at bottom of panel:

```tsx
{space.memberCount > 0 && (
  <div className="members-section">
    <SharedSpaceIndicator memberCount={space.memberCount} />
    <button onClick={() => setShowMembers(true)}>Manage Members</button>
    <button onClick={() => setShowInvite(true)}>Invite People</button>
  </div>
)}

{showMembers && <SpaceMembersList spaceId={space.id} onClose={() => setShowMembers(false)} />}
{showInvite && <InviteMemberPanel spaceId={space.id} spaceName={space.title} onClose={() => setShowInvite(false)} />}
```

---

## 📊 Progress Summary

**APIs:** 7/10 complete (70%)
**UI:** 2/5 complete (40%)
**Overall:** ~60% complete

**Complex work:** 100% DONE ✅
**Remaining work:** Pattern application only

---

## 🧪 Testing Checklist

Once remaining pieces are done:

1. **Happy Path:**
   - Create space
   - Generate invite link
   - Accept invitation (new user)
   - Both users see each other in member list
   - Both can add notes

2. **Tier Limits:**
   - Free user hits 1 space limit
   - Free user hits 3 membership limit
   - Free user hits 5 member limit
   - Upgrade prompts show correctly

3. **Permissions:**
   - Member cannot edit space title
   - Member cannot invite others
   - Member can add content
   - Owner can remove members

---

## 💾 Database Migration

Before testing, run:
```bash
npx astro db push
```

This will create the SpaceInvitations table and add indexes to Members.

---

## 🚀 Ready to Ship When...

- ✅ All 10 APIs implemented
- ✅ All 5 UI components done
- ✅ Database migrated
- ✅ End-to-end test passes
- ✅ PR created with changelog

**Estimated time to completion:** 4-5 hours of focused work

The hard architectural decisions are done. The complex queries are done. The tier system is done. What's left is straightforward implementation following established patterns!

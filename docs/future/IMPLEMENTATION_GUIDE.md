# Collaborative Shared Spaces - Implementation Guide

## ✅ What's Completed

### Phase 1: Foundation (DONE)
- ✅ Database schema with SpaceInvitations table
- ✅ space-permissions.ts utility (all permission helpers)
- ✅ tier-limits.ts utility (tier checking and limits)
- ✅ 3 core invitation APIs (templates for all others)

### Core APIs Implemented
1. **POST /api/spaces/[spaceId]/members/invite** - Create invitations
2. **GET /api/invitations/[token]** - View invitation (public)
3. **POST /api/invitations/[token]/accept** - Accept invitation

---

## 🚧 Remaining APIs to Implement

Use the 3 implemented APIs as templates. They demonstrate all patterns you need.

### Member Management APIs

#### GET /api/spaces/[spaceId]/members
**Pattern:** Like `/invitations/[token]` but requires space member access

**Key points:**
```typescript
// Use requireSpaceAccess (not requireOwner)
const { role, space } = await requireSpaceAccess(spaceId, userId);

// Query Members table
const members = await db.select()
  .from(Members)
  .where(eq(Members.spaceId, spaceId))
  .all();

// Join with UserMetadata for display names
// Return: { members: [...], pendingInvitations: [...] }
```

#### DELETE /api/spaces/[spaceId]/members/[userId]
**Pattern:** Like invite.ts but delete instead

**Key points:**
```typescript
// Allow owner OR self-removal
const isOwner = space.userId === userId;
const isSelf = params.userId === userId;

if (!isOwner && !isSelf) {
  return forbiddenResponse('Cannot remove other members');
}

// Prevent owner self-removal
if (isOwner && isSelf) {
  return errorResponse('Cannot remove yourself as owner');
}

await db.delete(Members)
  .where(and(
    eq(Members.spaceId, spaceId),
    eq(Members.userId, params.userId)
  ));
```

#### POST /api/invitations/[token]/decline
**Pattern:** Almost identical to accept.ts

```typescript
// Just update status instead of creating member
await db.update(SpaceInvitations)
  .set({ status: 'declined' })
  .where(eq(SpaceInvitations.inviteToken, token));
```

### Thread Sharing API

#### POST /api/threads/[threadId]/share-to-space
**Pattern:** Combines permission checks

```typescript
// 1. Verify thread ownership
const thread = await db.select()
  .from(Threads)
  .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
  .get();

// 2. Verify space membership
await requireSpaceAccess(spaceId, userId); // Not requireOwner!

// 3. Update thread
await db.update(Threads)
  .set({ spaceId, updatedAt: new Date() })
  .where(eq(Threads.id, threadId));
```

### Tier Limit Check APIs

#### GET /api/user/limits
**Pattern:** Simple query, no complex logic

```typescript
const limitsInfo = await getUserLimitsInfo(userId, locals.auth());
return successResponse(limitsInfo);
```

#### GET /api/user/can-create-space
```typescript
const canCreate = await canCreateSharedSpace(userId, locals.auth());
return successResponse(canCreate);
```

#### GET /api/user/can-join-space
```typescript
const canJoin = await canJoinSpace(userId, locals.auth());
return successResponse(canJoin);
```

---

## 🔄 Modifying Existing Space APIs

### Pattern: Add Permission Check

**Current pattern (owner-only):**
```typescript
const space = await db.select()
  .from(Spaces)
  .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
  .get();
```

**New pattern (owner or member):**
```typescript
const { role, space } = await requireSpaceAccess(spaceId, userId);

// For owner-only actions:
const { role, space } = await requireSpaceAccess(spaceId, userId, true);
```

### APIs to Update

1. **spaces/[spaceId]/update.ts** - Keep owner-only (requireOwner: true)
2. **spaces/[spaceId]/items.ts** - Allow members (requireOwner: false)
3. **spaces/[spaceId]/add-note.ts** - Allow members
4. **spaces/[spaceId]/add-thread.ts** - Allow members

---

## 📱 UI Components to Build

### 1. SpaceMembersList.tsx
**Props:** `{ spaceId: string, isOwner: boolean }`

**API calls:**
- `GET /api/spaces/[spaceId]/members`
- `DELETE /api/spaces/[spaceId]/members/[userId]`

**Reuse patterns from:**
- MySpacesPanel.tsx (list rendering)
- ShareSettingsModal.tsx (modal structure)

### 2. InviteMemberPanel.tsx
**Props:** `{ spaceId: string, spaceName: string, onSuccess?: () => void }`

**Features:**
- Tab switcher: Email vs Link
- Email input (for email method)
- Message textarea (optional)
- Expiration dropdown
- Copy button (for link method)

**API call:**
- `POST /api/spaces/[spaceId]/members/invite`

**Reuse patterns from:**
- NewSpacePanel.tsx (form structure)
- ShareSettingsModal.tsx (link copy button)

### 3. AcceptInvitationPage.astro
**Path:** `/src/pages/invitations/[token].astro`

**Server-side:**
```typescript
const { token } = Astro.params;
const response = await fetch(`${Astro.url.origin}/api/invitations/${token}`);
const data = await response.json();
```

**Client-side:**
```typescript
async function acceptInvitation() {
  const response = await fetch(`/api/invitations/${token}/accept`, {
    method: 'POST',
  });
  const data = await response.json();
  if (data.success) {
    window.location.href = data.redirectUrl;
  }
}
```

### 4. Modify EditSpacePanel.tsx
Add "Members" section:

```tsx
{space.memberCount > 0 && (
  <div className="space-members-section">
    <div className="member-count">
      {space.memberCount} members
    </div>
    <button onClick={() => setShowMembersList(true)}>
      Manage Members
    </button>
    <button onClick={() => setShowInvitePanel(true)}>
      Invite People
    </button>
  </div>
)}
```

### 5. Modify MySpacesPanel.tsx
Add member count badge:

```tsx
{space.memberCount > 0 && (
  <span className="badge">
    👥 {space.memberCount} members
  </span>
)}
```

---

## 🧪 Testing Checklist

### Invitation Flow
1. Create space as User A
2. Click "Invite People" in EditSpacePanel
3. Generate invite link
4. Open link in incognito/different browser
5. Sign in as User B
6. Accept invitation
7. Verify User B sees space in MySpacesPanel
8. Verify User A sees User B in member list

### Tier Limits
1. Create 1 shared space as free user
2. Try to invite 6th member (should fail)
3. Try to create 2nd shared space (should fail)
4. See upgrade prompt
5. Test same with unlimited tier

### Permissions
1. User B (member) tries to edit space title (should fail)
2. User B tries to invite User C (should fail)
3. User B adds note to space (should succeed)
4. User A removes User B (should succeed)
5. User B no longer sees space

---

## 📝 Next Steps

1. **Implement remaining APIs** (use 3 templates as reference)
2. **Update existing space APIs** (add permission checks)
3. **Build UI components** (3-4 components)
4. **Integration testing** (follow checklist above)
5. **Push branch and create PR**

---

## 🔍 Key Files Reference

### Utilities
- `/src/utils/space-permissions.ts` - Permission helpers
- `/src/utils/tier-limits.ts` - Tier checking
- `/src/utils/api-responses.ts` - Response helpers
- `/src/utils/ids.ts` - Token generation

### Template APIs
- `/src/pages/api/spaces/[spaceId]/members/invite.ts` - CREATE pattern
- `/src/pages/api/invitations/[token]/index.ts` - READ pattern
- `/src/pages/api/invitations/[token]/accept.ts` - UPDATE pattern

### Database
- `/db/config.ts` - SpaceInvitations table

### Documentation
- `/docs/future/COLLABORATIVE_SHARED_SPACES.md` - Full plan

---

## 💡 Common Patterns

### Error Handling
```typescript
try {
  // ... your code
} catch (error: any) {
  if (error instanceof Response) {
    return error; // Permission error
  }
  const standardError = handleAPIError(error, {
    endpoint: '/api/your/endpoint',
    action: 'action_name',
  });
  return errorResponse(standardError.message, standardError.code, 500);
}
```

### Rate Limiting
```typescript
const ip = getClientIP(request);
const rateLimit = rateLimitMiddleware(userId, endpoint, 'write', ip);
if (!rateLimit.allowed) {
  return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
}
```

### Tier Checks
```typescript
const canDo = await canDoAction(userId, locals.auth());
if (!canDo.allowed) {
  return forbiddenResponse(canDo.reason);
}
```

---

## 🎯 Estimated Time Remaining

- Remaining APIs: 3-4 hours
- UI Components: 4-5 hours
- Integration & Testing: 2-3 hours
- **Total: ~10 hours**

The foundation is solid! All complex logic is done. The rest is applying these patterns.

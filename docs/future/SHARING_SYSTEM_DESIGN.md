# Sharing System Design

> **Superseded July 2026.** This February/Classic design predates the clean-break Shared Spaces model. The
> membership, personal-to-public toggle, copy-in, and shared-container ownership proposals below are retired.
> Retain this file only as history. Use [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) for current
> behavior and [SHARED_SPACES_ROADMAP.md](./SHARED_SPACES_ROADMAP.md) for future work. Current user-facing feature
> language is **Thread** or **Threads**.

## Two Types of Sharing

### Type 1: Public Share Links (Copy-Based)
**Anyone can visit** → See preview → Join Harvous to add it

### Type 2: Collaborative Shared Threads (Real-Time)
**Multiple people contribute** to the same thread in real-time

---

## Type 1: Public Share Links

### Overview
Any Harvous user can share a note or thread as a **unique public link**. Anyone (even non-users) can visit the link, see a beautiful preview, and be invited to join Harvous to add it to their account.

### User Flow

**For the Sharer:**
1. Click "Share" button on note/thread
2. Choose sharing type:
   - 🌍 **Public Link** (anyone can view)
   - 📧 **Email-Specific** (only that person can view)
3. Get unique shareable link: `https://harvous.com/shared/abc123xyz`
4. Share link anywhere (social media, email, forums, etc.)

**For the Visitor (Non-User):**
1. Clicks shared link
2. Sees beautiful preview of content (read-only)
3. Sees call-to-action: **"Join Harvous to add this to your study"**
4. Clicks "Sign Up" → Creates account
5. Content automatically appears in their "For You" inbox
6. They can organize it into their spaces/threads

**For the Visitor (Existing User):**
1. Clicks shared link
2. Sees preview
3. Sees button: **"Add to My Harvous"**
4. Clicks button → Content appears in their inbox
5. They can organize it

### Database Schema

```typescript
// db/config.ts additions

// Shared content - tracks shared notes/threads with public links
const SharedContent = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    originalContentId: column.text(), // ID of original note/thread
    contentType: column.text(), // 'note' | 'thread'
    sharedBy: column.text(), // User ID who shared
    sharingType: column.text(), // 'public' | 'email_specific'
    emailRestriction: column.text({ optional: true }), // For email_specific sharing
    shareToken: column.text({ unique: true }), // Unique token for URL (e.g., 'abc123xyz')
    isActive: column.boolean({ default: true }),
    viewCount: column.number({ default: 0 }), // How many times viewed
    addCount: column.number({ default: 0 }), // How many people added it
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
});

// Tracks which users have added shared content
const UserSharedContent = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // User who added the content
    sharedContentId: column.text(), // Reference to SharedContent
    addedAt: column.date(),
    addedToSpaceId: column.text({ optional: true }), // Where they added it
    addedToThreadId: column.text({ optional: true }), // Which thread they added it to
  }
});
```

### API Endpoints

```typescript
// POST /api/sharing/share
// Creates a share link for a note or thread
// Returns: { shareToken: 'abc123xyz', shareUrl: 'https://harvous.com/shared/abc123xyz' }

// GET /api/sharing/[token]
// Gets shared content preview (public, no auth required)
// Returns: { content: {...}, sharedBy: {...}, canAdd: boolean }

// POST /api/sharing/[token]/add
// Adds shared content to user's Harvous (requires auth)
// Creates copy in user's account
// Returns: { success: true, noteId/threadId: '...' }
```

### Implementation Details

**Share Link Generation:**
```typescript
// Generate unique token
const shareToken = generateUniqueToken(); // e.g., 'abc123xyz'

// Store in SharedContent
await db.insert(SharedContent).values({
  id: `shared_${Date.now()}`,
  originalContentId: noteId,
  contentType: 'note',
  sharedBy: userId,
  sharingType: 'public',
  shareToken,
  isActive: true,
  viewCount: 0,
  addCount: 0,
  createdAt: new Date()
});

// Return share URL
return `https://harvous.com/shared/${shareToken}`;
```

**Public Preview Page:**
```typescript
// src/pages/shared/[token].astro
// - No authentication required
// - Shows beautiful preview
// - Shows "Join Harvous" or "Add to My Harvous" button
// - Tracks viewCount
```

**Add to Harvous:**
```typescript
// When user clicks "Add to My Harvous"
// 1. Get original content
// 2. Create copy in user's account
// 3. Add to UserSharedContent
// 4. Increment addCount
// 5. Content appears in their inbox
```

---

## Type 2: Collaborative Shared Threads

### Overview
Multiple people can **contribute to the same thread** in real-time. This is different from sharing a link - everyone works on the same thread, not copies.

### Current State
- ✅ `Threads.isPublic` field exists (currently unused)
- ✅ `Members` table exists (currently only for Spaces)
- ❌ No thread membership system
- ❌ No UI for creating/managing shared threads

### Database Schema Updates

```typescript
// db/config.ts additions

// Thread members - who can access and contribute to a shared thread
const ThreadMembers = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    threadId: column.text(), // Reference to Thread
    userId: column.text(), // Clerk user ID
    role: column.text({ default: "member" }), // 'owner' | 'admin' | 'member'
    invitedBy: column.text({ optional: true }), // User who invited them
    joinedAt: column.date(),
    lastActiveAt: column.date({ optional: true }),
  }
});

// Thread invitations - for inviting users to shared threads
const ThreadInvitations = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    threadId: column.text(), // Reference to Thread
    invitedBy: column.text(), // User who sent invitation
    invitedUserId: column.text({ optional: true }), // If inviting specific user
    invitedEmail: column.text({ optional: true }), // If inviting by email
    role: column.text({ default: "member" }), // Role they'll have
    status: column.text(), // 'pending' | 'accepted' | 'declined'
    inviteToken: column.text({ unique: true }), // Unique token for invite link
    expiresAt: column.date({ optional: true }),
    createdAt: column.date(),
    respondedAt: column.date({ optional: true }),
  }
});
```

### How It Works

**Creating a Shared Thread:**
1. User creates thread
2. Sets `isPublic: true` (or adds "Make Shared" option)
3. Thread becomes collaborative
4. Creator automatically becomes `owner` in `ThreadMembers`

**Adding Members:**
1. Thread owner/admin clicks "Invite Members"
2. Can invite by:
   - **User search** (find Harvous users)
   - **Email** (sends invitation)
   - **Share link** (generates invite link)
3. Invitation created in `ThreadInvitations`
4. User accepts → Added to `ThreadMembers`

**Contributing to Shared Thread:**
1. Any member can add notes to the thread
2. Notes show who created them (`Notes.userId`)
3. All members see all notes in real-time
4. Members can edit their own notes
5. Admins can edit any note

**Permissions:**
- **Owner**: Full control (edit thread, manage members, delete thread)
- **Admin**: Can manage members, edit any note
- **Member**: Can add/edit own notes, view all notes

### API Endpoints

```typescript
// POST /api/threads/[id]/make-shared
// Converts private thread to shared thread
// Creates ThreadMembers entry for owner

// POST /api/threads/[id]/invite
// Invites user to shared thread
// Creates ThreadInvitation

// GET /api/threads/[id]/members
// Lists all members of shared thread

// POST /api/threads/[id]/members/[userId]/update-role
// Updates member role (owner/admin only)

// POST /api/threads/[id]/members/[userId]/remove
// Removes member from thread (owner/admin only)

// GET /api/threads/invitations/[token]
// Gets invitation details (public)

// POST /api/threads/invitations/[token]/accept
// Accepts invitation and joins thread
```

### UI Components Needed

**1. Share Thread Button**
```typescript
// In thread view
<button onClick={makeThreadShared}>
  Make Thread Shared
</button>
```

**2. Thread Members Panel**
```typescript
// Shows who has access
<ThreadMembersPanel threadId={threadId} />
// - List of members
// - Invite button
// - Role management (for owners/admins)
```

**3. Invite Members Dialog**
```typescript
<InviteMembersDialog threadId={threadId} />
// - Search for users
// - Enter email
// - Generate share link
```

**4. Shared Thread Indicator**
```typescript
// Visual indicator that thread is shared
<Badge>Shared Thread</Badge>
// Shows member count
```

### Integration with Existing Features

**Notes in Shared Threads:**
- Notes already have `userId` field ✅
- Can show "Created by [User]" on notes
- Members can edit their own notes
- Admins can edit any note

**Comments:**
- Comments already exist ✅
- Work naturally with shared threads
- Show who commented

**Activity Feed:**
- Track who added notes
- Track who joined/left
- Show recent activity

---

## Comparison: Share Links vs Shared Threads

| Feature | Share Links | Shared Threads |
|---------|-------------|-----------------|
| **Purpose** | Viral growth, sharing insights | Collaborative study |
| **Access** | Anyone with link | Invited members only |
| **Content** | Copy of content | Same thread, real-time |
| **Use Case** | "Check out this insight" | "Let's study together" |
| **Growth** | High (public links) | Medium (invite-based) |
| **Privacy** | Public or email-specific | Private to members |

## Implementation Priority

### Phase 1: Public Share Links (High Priority)
- ✅ Highest growth potential
- ✅ Relatively simple to implement
- ✅ Enables viral sharing
- **Timeline**: 1-2 weeks

### Phase 2: Collaborative Shared Threads (Medium Priority)
- ✅ Better collaboration features
- ✅ Uses existing `isPublic` field
- ✅ Natural extension of shared spaces
- **Timeline**: 2-3 weeks

## User Experience Examples

### Example 1: Share Link
```
Sarah creates a note about John 3:16
→ Clicks "Share" → Gets link: harvous.com/shared/abc123
→ Posts on Twitter: "Check out this insight! [link]"
→ 50 people click link
→ 20 sign up for Harvous
→ 15 add the note to their account
→ Viral growth! 🚀
```

### Example 2: Shared Thread
```
Pastor creates "Romans Study" thread
→ Makes it shared
→ Invites small group members
→ Everyone adds their insights
→ Real-time collaboration
→ Everyone sees everyone's notes
→ Better group study! 📖
```

## Security Considerations

**Share Links:**
- Unique tokens (hard to guess)
- Optional expiration dates
- View tracking
- Can disable sharing per content

**Shared Threads:**
- Invitation-only access
- Role-based permissions
- Owner controls membership
- Can make thread private again

## Benefits

✅ **Viral Growth**: Public share links enable word-of-mouth
✅ **Better Collaboration**: Shared threads for group study
✅ **Flexible**: Two different use cases, both valuable
✅ **Privacy Options**: Public links or private shared threads
✅ **Natural Extension**: Builds on existing infrastructure

Both systems work together to create a powerful sharing and collaboration platform! 🎉


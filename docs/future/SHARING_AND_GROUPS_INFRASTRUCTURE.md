# Sharing and Groups Infrastructure Analysis

## Current State Analysis

### ✅ What Exists

#### 1. **Shared Spaces** (Partially Implemented)
- **Database**: `Spaces` table with `isPublic` boolean
- **Members Table**: `Members` table for space membership
- **Roles**: `member`, `admin`, `owner` roles defined
- **Status**: Basic structure exists, but needs enhancement

#### 2. **Many-to-Many Relationships**
- **NoteThreads**: Junction table for notes ↔ threads (many-to-many)
- **NoteTags**: Junction table for notes ↔ tags (many-to-many)
- **Status**: ✅ Fully implemented and working

#### 3. **Inbox System** (For External Content)
- **InboxItems**: Table for external content
- **UserInboxItems**: Tracks user's inbox items
- **Status**: ✅ Fully implemented for Harvous team content

### ❌ What's Missing

#### 1. **Content Sharing System** (Two Types)
The architecture document describes sharing, but needs implementation:

**Type 1: Public Share Links** (Copy-Based)
- No `SharedContent` table
- No `UserSharedContent` table
- No sharing API endpoints
- No share link generation
- **Goal**: Anyone can visit link → See preview → Join to add it

**Type 2: Collaborative Shared Threads** (Real-Time)
- `Threads.isPublic` field exists but unused
- No `ThreadMembers` table (only `Members` for spaces)
- No `ThreadInvitations` table
- No thread membership system
- **Goal**: Multiple people contribute to same thread

See `SHARING_SYSTEM_DESIGN.md` for complete design of both types.

#### 2. **Group Management**
- No dedicated `Groups` table (only `Members` for spaces)
- No group-specific features (group settings, group permissions)
- No group discovery/search
- No group invitations system

#### 3. **Enhanced Collaboration**
- Comments exist but may need enhancement
- No real-time collaboration features
- No activity feed for shared spaces
- No notifications for shared content

## Database Schema Additions Needed

### 1. Sharing Tables

**Type 1: Public Share Links**

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
    shareToken: column.text({ unique: true }), // Unique token for URL
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

**Type 2: Collaborative Shared Threads**

```typescript
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

### 2. Enhanced Groups/Spaces

```typescript
// Enhanced Members table (already exists, but document usage)
const Members = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // Clerk user ID
    spaceId: column.text(), // Reference to Space
    role: column.text({ default: "member" }), // 'member' | 'admin' | 'owner'
    invitedBy: column.text({ optional: true }), // User who invited them
    joinedAt: column.date(),
    // Could add: notificationPreferences, lastActiveAt, etc.
  }
});

// Group invitations (for inviting users to shared spaces)
const SpaceInvitations = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    spaceId: column.text(), // Reference to Space
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

### 3. Activity Feed (For Collaboration)

```typescript
// Activity feed for shared spaces
const SpaceActivity = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    spaceId: column.text(), // Reference to Space
    userId: column.text(), // User who performed action
    activityType: column.text(), // 'note_created' | 'thread_created' | 'note_updated' | 'member_joined'
    relatedId: column.text({ optional: true }), // ID of related note/thread
    metadata: column.text({ optional: true }), // JSON for additional data
    createdAt: column.date(),
  }
});
```

## Implementation Plan

### Phase 1: Public Share Links (High Priority)

**Goal**: Allow users to share notes/threads via public links (anyone can visit)

**Tasks**:
1. Create `SharedContent` and `UserSharedContent` tables
2. Create share API endpoint (`/api/sharing/share`)
3. Create public preview page (`/shared/[token]`) - no auth required
4. Add "Share" button to note/thread UI
5. Implement "Add to Harvous" functionality
6. Track views and adds for analytics

**User Flow**: Share link → Anyone visits → See preview → Join Harvous → Add to account

### Phase 1.5: Collaborative Shared Threads (Medium Priority)

**Goal**: Enable multiple people to contribute to the same thread

**Tasks**:
1. Create `ThreadMembers` and `ThreadInvitations` tables
2. Implement thread sharing (use existing `isPublic` field)
3. Create "Make Thread Shared" UI
4. Build invitation system for threads
5. Add member management UI
6. Show "Shared Thread" indicators

**User Flow**: Create thread → Make shared → Invite members → Everyone contributes

**API Endpoints Needed**:
```typescript
// POST /api/sharing/share
// - Creates SharedContent record
// - Generates share token
// - Returns shareable link

// GET /api/sharing/[token]
// - Gets shared content preview
// - Returns read-only content

// POST /api/sharing/[token]/add
// - Adds shared content to user's Harvous
// - Creates copy in user's account
```

### Phase 2: Enhanced Groups (Medium Priority)

**Goal**: Improve shared spaces with invitations and activity

**Tasks**:
1. Create `SpaceInvitations` table
2. Create invitation API endpoints
3. Add "Invite Members" UI to shared spaces
4. Create activity feed component
5. Add notifications for space activity

**API Endpoints Needed**:
```typescript
// POST /api/spaces/[id]/invite
// - Creates invitation
// - Sends email (if email provided)
// - Returns invite link

// GET /api/spaces/[id]/invitations
// - Lists pending invitations

// POST /api/spaces/[id]/invitations/[token]/accept
// - Accepts invitation
// - Adds user to space

// GET /api/spaces/[id]/activity
// - Returns activity feed for space
```

### Phase 3: Advanced Collaboration (Lower Priority)

**Goals**: Real-time features, advanced permissions

**Tasks**:
1. Real-time collaboration (WebSockets/SSE)
2. Advanced permissions (view-only, edit, admin)
3. Content versioning
4. Comments on shared content
5. Mentions and notifications

## Current Database Readiness

### ✅ Ready for Sharing
- **Notes table**: Has all needed fields (`id`, `title`, `content`, `userId`)
- **Threads table**: Has all needed fields (`id`, `title`, `userId`)
- **UserMetadata**: Can track sharing preferences

### ✅ Ready for Groups
- **Spaces table**: Has `isPublic` flag
- **Members table**: Exists with roles
- **NoteThreads**: Many-to-many already works

### ⚠️ Needs Enhancement
- **Sharing tables**: Need to be created
- **Invitation system**: Need to be built
- **Activity tracking**: Need to be added
- **Permissions**: Basic roles exist, but need fine-grained control

## Integration with Church System

### Church Content = Special Type of Sharing

Church content distribution can leverage the sharing infrastructure:

```typescript
// When church pushes content:
1. Create InboxItem (already exists)
2. Create SharedContent with sharingType='organization'
3. Link to church's orgId
4. Auto-add to all org members' UserInboxItems
```

This allows:
- Church content uses same infrastructure as user sharing
- Consistent inbox experience
- Easy to track engagement
- Can add church-specific features later

## Recommended Implementation Order

1. **Sharing System** (Phase 1)
   - Most requested feature
   - Enables viral growth
   - Relatively simple to implement
   - Uses existing content structure

2. **Church Connection** (From previous doc)
   - High-value feature
   - Leverages Clerk Organizations
   - Enables B2B revenue

3. **Enhanced Groups** (Phase 2)
   - Improves existing shared spaces
   - Adds invitations
   - Better collaboration

4. **Advanced Collaboration** (Phase 3)
   - Nice-to-have features
   - Requires more infrastructure
   - Can be added incrementally

## Summary

### ✅ What Works Now
- Shared spaces (basic)
- Many-to-many relationships
- Inbox system
- Church fields in user metadata

### 🔨 What Needs Building
- Sharing tables and APIs
- Share link generation
- Invitation system
- Activity feed
- Enhanced permissions

### 🎯 Quick Wins
1. **Sharing**: Add tables + basic share API (1-2 weeks)
2. **Invitations**: Add invitation table + API (1 week)
3. **Activity Feed**: Add table + basic feed (1 week)

The database structure is **mostly ready** - you just need to add the sharing-specific tables and build the APIs. The existing structure (Notes, Threads, Spaces, Members) supports sharing and groups well!


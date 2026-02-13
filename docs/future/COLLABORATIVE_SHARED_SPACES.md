# Collaborative Shared Spaces Implementation Plan

**v1 complete (February 2026).** The implementation described below has been completed. Shared spaces are in a good place and complete for v1. For current design, behavior, and implementation details, see [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md). Future work: performance and quality-of-life improvements.

## Implementation status: member UX (current)

- **Member-added content in My Home**  
  When a member adds a thread or note to a shared space (Space details → Add tab, or add-thread/add-note APIs), the item stays **owned by the member** (`userId` unchanged; only `spaceId` is set). It appears in the space and in the member’s **My Home** (dashboard).  
  - `POST /api/spaces/[spaceId]/add-items` uses `requireSpaceAccess(spaceId, userId)` so both owners and members can add items; it only updates notes/threads that belong to the current user.  
  - `add-thread` and `add-note` already used `requireSpaceAccess` and the same ownership rules.

- **Edit name and space color: owners only; members see tab nav only**  
  In **EditSpacePanel**:  
  - **Owners** see: header “Edit Space”, editable space name, space color swatches, visibility dropdown (Private/Shared), tab nav (Added, Add, People), and tab content.  
  - **Members** see: header “Space details” (with space color from props), **only** the tab nav (Added, Add, People) and tab content—no space title block and no color/visibility controls.

## Overview
Implement collaborative shared spaces where users can invite specific members (via email or shareable link) to view and contribute content together. Built on existing Members table and Clerk authentication.

### Two Collaboration Scenarios

**Scenario 1: Personal → Group Sharing**
- User studies Romans independently during the week
- Has breakthrough insight on justification
- Shares that specific thread to the group space
- Others add reactions, questions, or related thoughts
- Original thread stays owned by creator
- Group conversation layer added on top

**Use Case:** "Check out what I discovered" or "Need help understanding this passage"

**Scenario 2: Group-Native Collaborative Threads**
- Small group decides to study Philippians together over 8 weeks
- Leader creates shared "Philippians Study - Spring 2026" thread directly in group space
- Everyone contributes observations directly into shared thread
- Truly collaborative from the start - no single owner beyond space owner
- Ongoing, collective exploration

**Use Case:** Structured group studies, sermon discussion threads, accountability check-ins

Both scenarios supported within the same collaborative space architecture.

## User Requirements
- **Invitation methods**: Both email-based invitations AND shareable invite links
- **Permissions**: Simple two-tier (Owner + Member)
- **Content model**: Keep current architecture (Spaces → Threads → Notes)
- **Collaboration types**: Support BOTH scenarios:
  - **Scenario 1**: Personal thread shared to group (owner retains ownership, others add notes/reactions)
  - **Scenario 2**: Group-native collaborative thread (created in shared space, truly collaborative from start)
- **Collaboration mode**: Async only (no real-time presence indicators)
- **Sync strategy**: Poll on focus/navigation for member changes

## Current State
✅ **Already Built:**
- `Members` table exists with role field (currently unused)
- Clerk authentication with user metadata
- Spaces CRUD infrastructure
- Token-based public sharing for read-only access
- Auto-save, offline support, optimistic updates

❌ **Missing:**
- Member invitation system (email + link-based)
- Permission checks in space/content endpoints
- Member management APIs and UI
- Space member queries
- Invitation expiration/acceptance flow

---

## Database Schema Changes

### 1. New Table: SpaceInvitations

```typescript
// Add to db/config.ts

const SpaceInvitations = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    spaceId: column.text(), // References Spaces.id
    invitedBy: column.text(), // Clerk userId who sent invite
    invitedEmail: column.text({ optional: true }), // Email if email-based
    invitedUserId: column.text({ optional: true }), // If inviting existing user
    inviteToken: column.text({ unique: true }), // Unique token for invite links
    role: column.text({ default: "member" }), // Role they'll receive
    status: column.text(), // 'pending' | 'accepted' | 'declined' | 'expired'
    message: column.text({ optional: true }), // Optional invite message
    expiresAt: column.date({ optional: true }), // Optional expiration (7 days default)
    createdAt: column.date(),
    acceptedAt: column.date({ optional: true }),
  },
  indexes: {
    tokenIndex: { on: ['inviteToken'], unique: true },
    spaceStatusIndex: { on: ['spaceId', 'status'] },
    emailIndex: { on: ['invitedEmail'] },
  }
});
```

### 2. Update Members Table Usage
Current `Members` table is perfect - just needs to be actively used:
- `id`: Primary key
- `userId`: Clerk user ID
- `spaceId`: Space reference
- `role`: 'owner' | 'member' (admin not needed per requirements)
- `createdAt`: Join timestamp

**Changes needed:**
- Add index on `spaceId` for efficient queries
- Add index on `userId` for user's spaces lookup

### 3. Thread Ownership Model

**How to distinguish Personal vs Group-Native threads:**

Use existing `Threads.userId` field:
- **Personal thread shared to group**: `userId` = original creator (not space owner)
- **Group-native thread**: `userId` = space owner OR special marker

**Implementation approach:**
```typescript
// When creating thread in shared space
const thread = await db.insert(Threads).values({
  id: generateThreadId(),
  title,
  spaceId,
  userId: isGroupNative ? spaceOwnerId : currentUserId,
  // ... other fields
});
```

**UI Distinction:**
- Personal threads show "Shared by [Name]" badge
- Group-native threads show "Collaborative" badge
- Thread detail shows appropriate edit permissions based on type

---

## API Endpoints

### Member Management

#### `POST /api/spaces/[spaceId]/members/invite`
**Purpose:** Invite user to space (email or generate link)

**Auth:** Requires space ownership (only owner can invite)

**Request Body:**
```typescript
{
  method: 'email' | 'link';
  email?: string; // Required if method='email'
  message?: string; // Optional personal message
  expiresIn?: number; // Days until expiration (default: 7)
}
```

**Response:**
```typescript
// Email method
{ success: true, invitationId: string, invitedEmail: string }

// Link method
{ success: true, inviteToken: string, inviteUrl: string, expiresAt: Date }
```

**Logic:**
1. Verify user owns space
2. If email: Check if user exists in Clerk, create invitation, send email via Clerk
3. If link: Generate unique token, create invitation with no email
4. Set expiration (default 7 days)

---

#### `GET /api/spaces/[spaceId]/members`
**Purpose:** List all members of a space with their details

**Auth:** Requires member access (owner or member)

**Response:**
```typescript
{
  members: Array<{
    userId: string;
    role: 'owner' | 'member';
    firstName?: string;
    lastName?: string;
    email?: string;
    profileImageUrl?: string;
    joinedAt: Date;
  }>;
  pendingInvitations: Array<{
    id: string;
    invitedEmail?: string;
    status: string;
    createdAt: Date;
  }>;
}
```

**Logic:**
1. Verify user has access (is owner or member)
2. Query Members table for space
3. Join with UserMetadata for user details
4. Query pending invitations

---

#### `DELETE /api/spaces/[spaceId]/members/[userId]`
**Purpose:** Remove member from space

**Auth:** Requires ownership OR self-removal

**Logic:**
1. Verify caller is owner OR userId === caller
2. Prevent owner from removing themselves (must transfer ownership first)
3. Delete from Members table
4. Return success

---

#### `GET /api/spaces/[spaceId]/invitations`
**Purpose:** List pending invitations for a space

**Auth:** Requires ownership

**Response:**
```typescript
{
  invitations: Array<{
    id: string;
    invitedEmail?: string;
    invitedUserId?: string;
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    inviteToken: string;
    inviteUrl: string;
    createdAt: Date;
    expiresAt?: Date;
  }>
}
```

---

#### `DELETE /api/spaces/[spaceId]/invitations/[invitationId]`
**Purpose:** Cancel/revoke an invitation

**Auth:** Requires ownership

**Logic:**
1. Verify ownership
2. Update invitation status to 'cancelled'
3. Return success

---

### Invitation Acceptance

#### `GET /api/invitations/[token]`
**Purpose:** Get invitation details (public endpoint for invite links)

**Auth:** None required (but user must be signed in to accept)

**Response:**
```typescript
{
  invitation: {
    spaceTitle: string;
    spaceColor?: string;
    invitedBy: {
      firstName?: string;
      lastName?: string;
    };
    message?: string;
    expiresAt?: Date;
    isExpired: boolean;
    status: string;
  };
  canAccept: boolean;
  alreadyMember: boolean;
}
```

---

#### `POST /api/invitations/[token]/accept`
**Purpose:** Accept invitation and join space

**Auth:** Requires authenticated user

**Logic:**
1. Get userId from Clerk auth
2. Verify invitation is pending and not expired
3. Check if user is already a member
4. Add to Members table with 'member' role
5. Update invitation status to 'accepted'
6. Return space details

**Response:**
```typescript
{
  success: true;
  space: { id, title, color };
  redirectUrl: string; // URL to navigate to space
}
```

---

#### `POST /api/invitations/[token]/decline`
**Purpose:** Decline invitation

**Auth:** Requires authenticated user

**Logic:**
1. Update invitation status to 'declined'
2. Return success

---

### Space Access Control Updates

#### `POST /api/spaces/[spaceId]/update` (MODIFY EXISTING)
**Update:** Add member permission check

**Current:** Only owner can update
**New:** Only owner can update (keep same, but use member check helper)

---

#### `GET /api/spaces/[spaceId]/items` (MODIFY EXISTING)
**Update:** Allow members to view

**Current:** Only owner can view
**New:** Owner OR members can view

---

#### `POST /api/spaces/[spaceId]/add-note` (MODIFY EXISTING)
**Update:** Allow members to add notes

**Current:** Only owner
**New:** Owner OR members can add

---

#### `POST /api/spaces/[spaceId]/add-thread` (MODIFY EXISTING)
**Update:** Allow members to add threads

---

### Share Settings

#### `POST /api/spaces/[spaceId]/share`
**Purpose:** Manage public share link for space (existing pattern from threads/notes)

**Auth:** Requires ownership

**Request Body:**
```typescript
{
  action: 'enable' | 'disable' | 'refresh';
}
```

**Logic:**
- enable: Generate shareToken, set isPublic=true
- disable: Clear shareToken, set isPublic=false
- refresh: Generate new token (invalidates old)

---

#### `POST /api/threads/[threadId]/share-to-space`
**Purpose:** Share personal thread to collaborative space (Scenario 1)

**Auth:** Requires thread ownership

**Request Body:**
```typescript
{
  spaceId: string;
}
```

**Logic:**
1. Verify user owns thread
2. Verify user is member of target space
3. Add thread to space (update spaceId field)
4. Thread remains owned by original creator
5. Return success

**Response:**
```typescript
{
  success: true;
  thread: { id, title, spaceId };
}
```

---

## Permission Helper Utilities

### `src/utils/space-permissions.ts` (NEW FILE)

```typescript
/**
 * Check if user is owner of space
 */
async function isSpaceOwner(spaceId: string, userId: string): Promise<boolean>

/**
 * Check if user is member (or owner) of space
 */
async function isSpaceMember(spaceId: string, userId: string): Promise<boolean>

/**
 * Get user's role in space
 */
async function getSpaceRole(spaceId: string, userId: string): Promise<'owner' | 'member' | null>

/**
 * Verify user has access and return role
 * Throws 403/404 errors if no access
 */
async function requireSpaceAccess(spaceId: string, userId: string, requireOwner = false): Promise<{ role: 'owner' | 'member', space: Space }>
```

---

## UI Components

### 1. `SpaceMembersList.tsx` (NEW)
**Purpose:** Display members of a space with role badges

**Location:** `/src/components/react/SpaceMembersList.tsx`

**Props:**
```typescript
interface Props {
  spaceId: string;
  isOwner: boolean;
}
```

**Features:**
- List of members with avatars (from Clerk)
- Show role badges (Owner, Member)
- Remove member button (if owner)
- Pending invitations section
- Revoke invitation button

**API Calls:**
- `GET /api/spaces/[spaceId]/members`
- `DELETE /api/spaces/[spaceId]/members/[userId]`

---

### 2. `InviteMemberPanel.tsx` (NEW)
**Purpose:** Panel for inviting members to space

**Location:** `/src/components/react/InviteMemberPanel.tsx`

**Props:**
```typescript
interface Props {
  spaceId: string;
  spaceName: string;
  onSuccess?: () => void;
}
```

**Features:**
- Tab switcher: "Invite by Email" / "Create Invite Link"
- Email input with validation
- Optional personal message textarea
- Expiration dropdown (7, 14, 30 days, Never)
- Generate link button with copy functionality
- Send invite button (for email)
- Success/error toast feedback

**API Calls:**
- `POST /api/spaces/[spaceId]/members/invite`

**Reuses:**
- Similar pattern to `ShareSettingsModal.tsx`
- Same button/input styles from `NewSpacePanel.tsx`

---

### 3. `AcceptInvitationPage.astro` (NEW)
**Purpose:** Public page to view and accept space invitation

**Location:** `/src/pages/invitations/[token].astro`

**Features:**
- Show space details (title, color, invited by)
- Show invitation message if present
- "Accept Invitation" button (requires sign-in)
- "Decline" button
- Expiration warning if close to expiry
- Already member message if applicable

**API Calls:**
- `GET /api/invitations/[token]`
- `POST /api/invitations/[token]/accept`
- `POST /api/invitations/[token]/decline`

---

### 4. Modify `EditSpacePanel.tsx`
**Add:** "Members" section with:
- Member count badge
- "Manage Members" button (opens SpaceMembersList)
- "Invite People" button (opens InviteMemberPanel)

**Show only if:** Space has members OR user is owner

---

### 5. Modify `MySpacesPanel.tsx`
**Add:** Visual indicator for shared spaces:
- User-group icon if space has multiple members
- Member count badge (e.g., "3 members")

---

### 6. `SharedSpaceIndicator.tsx` (NEW)
**Purpose:** Small badge component showing space is shared

**Usage:**
```tsx
<SharedSpaceIndicator memberCount={5} />
```

**Renders:**
```
[👥 5 members]
```

---

### 7. `ThreadCollaborationBadge.tsx` (NEW)
**Purpose:** Badge showing thread collaboration type

**Usage:**
```tsx
<ThreadCollaborationBadge
  type="personal-shared"
  ownerName="Sarah"
/>
// or
<ThreadCollaborationBadge type="group-native" />
```

**Renders:**
```
[📤 Shared by Sarah]  // For personal shared
[🤝 Collaborative]     // For group-native
```

---

## Email Notifications

Use Clerk's email system to send invitations.

### Email Template: Space Invitation

**Subject:** `{inviterName} invited you to join "{spaceName}" on Harvous`

**Body:**
```
Hi there,

{inviterName} has invited you to collaborate on the space "{spaceName}" in Harvous.

{personalMessage} (if provided)

[Accept Invitation Button] → Links to /invitations/[token]

This invitation will expire on {expiresAt}.

---
Harvous - Study the Bible Together
```

**Implementation:**
- Use Clerk's email API or custom SMTP
- Store invite token for tracking
- Include unsubscribe link per legal requirements

---

## Member Sync Strategy

**Approach:** Poll on focus/navigation (per requirements)

### Implementation:
1. Add `visibilitychange` event listener in `EditSpacePanel.tsx`
2. When tab gains focus, refetch members
3. Show subtle toast if new members joined ("2 new members joined")
4. Update member list without full page reload

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      refetchMembers();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [spaceId]);
```

---

## Content Access Control

### Two Collaboration Models

**Model 1: Personal Thread Shared to Group**
- Thread owner retains ownership (created in personal space, shared to group)
- Members can ADD notes to the thread (their own insights/reactions)
- Members CANNOT edit the original thread or owner's notes
- Owner can edit/delete their own content
- Space owner can remove entire thread from space if needed

**Model 2: Group-Native Collaborative Thread**
- Thread created directly in shared space (no single owner beyond space owner)
- All members can view, add notes, and contribute
- Thread.userId = space owner initially
- Members can edit their own notes only
- Space owner can moderate (edit/delete any content)

### Permission Matrix

#### Spaces
- **View:** Owner or members
- **Edit title/color:** Owner only
- **Delete:** Owner only
- **Add content:** Owner or members
- **Remove content:** Owner or members (only their own content)
- **Invite members:** Owner only
- **Remove members:** Owner only (members can leave)

#### Threads (Personal → Shared)
- **View:** All space members
- **Edit thread details:** Original thread creator only
- **Delete thread:** Original creator OR space owner
- **Add notes to thread:** All space members
- **Edit notes:** Original note creator OR space owner

#### Threads (Group-Native)
- **View:** All space members
- **Edit thread details:** Space owner OR thread creator
- **Delete thread:** Space owner OR thread creator
- **Add notes to thread:** All space members
- **Edit notes:** Original note creator OR space owner

#### Notes in Shared Spaces
- **View:** All space members
- **Edit:** Original creator OR space owner
- **Delete:** Original creator OR space owner
- **Comment:** All space members (if comments enabled)

---

## Security Considerations

1. **Invitation Token Security:**
   - Use `generateShareToken()` from `/src/utils/ids.ts` (secure random)
   - 12-character alphanumeric = 62^12 possibilities
   - Unique index on token column
   - Expire after 7 days default

2. **Email Validation:**
   - Validate email format before sending
   - Check if email is already a member
   - Prevent spam with rate limiting

3. **Permission Checks:**
   - Every endpoint checks membership via `requireSpaceAccess()`
   - No endpoint exposes data without permission check
   - Use AND conditions in queries: `eq(spaceId), eq(userId)`

4. **Member Limits:**
   - Free tier: 5 members max per space, 1 shared space max
   - Unlimited tier: 10 members max per space, 3 shared spaces max
   - Show upgrade prompt when limits reached

5. **Rate Limiting:**
   - Invitations: 10 per hour per user
   - Member operations: 20 per minute per user

6. **Space Membership Limits:**
   - Free tier: Can join up to 3 spaces as member
   - Unlimited tier: Unlimited space membership
   - Check membership count before accepting invitations

---

## Monetization & Tier Limits

### Free Tier
- **Notes:** 300 notes (personal + shared combined)
- **Space Membership:** Join up to 3 Spaces as a member
- **Owned Spaces:** Create 1 shared Space, 5 members max
- **Note Templates:** Access to built-in templates only

### Unlimited Tier ($9.99/month)
- **Notes:** Unlimited notes
- **Space Membership:** Join unlimited Spaces
- **Owned Spaces:** Create 3 shared Spaces, 10 members each
- **Note Templates:** Custom templates + space templates

### Implementation Requirements

**Database Additions:**
- No new tables needed - use existing Clerk user metadata
- Query counts from existing tables (Notes count, Members count, Spaces count)

**New API Endpoints:**
- `GET /api/user/limits` - Get current usage vs limits
- `GET /api/user/can-create-space` - Check if can create shared space
- `GET /api/user/can-join-space` - Check if can join another space
- `GET /api/spaces/[spaceId]/can-add-member` - Check if space can add more members

**Permission Checks to Add:**
```typescript
// Before creating shared space
const sharedSpacesCount = await getSharedSpacesOwnedCount(userId);
const tier = await getUserTier(userId); // from Clerk metadata

if (tier === 'free' && sharedSpacesCount >= 1) {
  return errorResponse('Free tier limited to 1 shared space. Upgrade to create more.');
}

if (tier === 'unlimited' && sharedSpacesCount >= 3) {
  return errorResponse('Unlimited tier limited to 3 shared spaces.');
}

// Before accepting invitation
const membershipCount = await getSpaceMembershipCount(userId);

if (tier === 'free' && membershipCount >= 3) {
  return errorResponse('Free tier limited to 3 space memberships. Upgrade to join more.');
}

// Before inviting member to space
const space = await getSpace(spaceId);
const memberCount = await getSpaceMemberCount(spaceId);

if (space.ownerTier === 'free' && memberCount >= 5) {
  return errorResponse('This space has reached the member limit. Space owner needs to upgrade.');
}

if (space.ownerTier === 'unlimited' && memberCount >= 10) {
  return errorResponse('This space has reached the member limit (10 members).');
}
```

**UI Upgrade Prompts:**
- Show upgrade CTA when limits reached
- Display current usage in EditSpacePanel (e.g., "3/5 members")
- Show limit warning at 80% capacity
- Link to Clerk customer portal for upgrades

**Helper Functions to Create:**
```typescript
// src/utils/tier-limits.ts
async function getUserTier(userId: string): Promise<'free' | 'unlimited'>
async function getSharedSpacesOwnedCount(userId: string): Promise<number>
async function getSpaceMembershipCount(userId: string): Promise<number>
async function getSpaceMemberCount(spaceId: string): Promise<number>
async function canCreateSharedSpace(userId: string): Promise<boolean>
async function canJoinSpace(userId: string): Promise<boolean>
async function canAddMemberToSpace(spaceId: string, spaceOwnerId: string): Promise<boolean>
```

---

## Git Workflow

**Branch Strategy:**
1. Create feature branch: `feature/collaborative-shared-spaces`
2. All work happens on this branch
3. Regular commits with clear messages
4. PR to main when complete and tested

**Initial Setup:**
```bash
git checkout -b feature/collaborative-shared-spaces
git push -u origin feature/collaborative-shared-spaces
```

**Commit Strategy:**
- Phase 1: Database & API commits
- Phase 2: Member management commits
- Phase 3: UI component commits
- Phase 4: Integration commits
- Phase 5: Testing & polish commits

---

## Documentation

**Create comprehensive documentation at:**
`/docs/future/COLLABORATIVE_SHARED_SPACES.md`

**Copy this plan file to docs:**
```bash
cp /Users/heyderekj/.claude/plans/smooth-conjuring-ritchie.md \
   /Users/heyderekj/harvous/docs/future/COLLABORATIVE_SHARED_SPACES.md
```

**Keep updated throughout implementation:**
- Mark sections as completed
- Add implementation notes
- Document design decisions made
- Add screenshots/demos when ready
- Update with any architecture changes

---

## Design Considerations

### Reuse Existing Patterns

**From Share Settings (ShareSettingsModal.tsx):**
- Globe/Lock icon toggle pattern
- Share link display with copy button
- "Refresh link" confirmation pattern
- Success toast feedback

**From Space Management (NewSpacePanel.tsx, EditSpacePanel.tsx):**
- Color selection button grid
- Private/Shared button group styling
- Auto-save with debouncing
- Unsaved changes dialog
- Offline mutation support

**From Dialogs (UnsavedChangesDialog.tsx):**
- Portal-based rendering
- Overlay backdrop pattern
- Three-button layout (Cancel, Discard, Save)
- Click-outside-to-close

**From Lists (MySpacesPanel.tsx):**
- Card items with badges
- Search functionality
- Optimistic updates
- Custom event listeners for updates

**Visual Consistency:**
- Use existing `space-switcher-dropdown__*` classes for member lists
- Reuse `ButtonSmall` components
- Use existing color system from `colors.ts`
- Follow existing modal z-index patterns
- Match existing badge styles for member counts

**Icons:**
- 👥 User-group icon for shared spaces (existing pattern)
- 🔒 Lock icon for private (existing)
- 🌍 Globe icon for public sharing (existing)
- 📤 Share icon for personal→group sharing (new)
- 🤝 Handshake icon for collaborative threads (new)

**Responsive Design:**
- Mobile: Use existing bottom sheet patterns
- Desktop: Use existing panel system
- Safe area insets for mobile
- Touch-friendly button sizes (44px minimum)

**Note for Future Design Updates:**
- Current implementation uses existing patterns as foundation
- Can be refined with designer input later
- Prioritize functionality and consistency first
- Design polish can come in follow-up PRs

---

## Implementation Order

### Phase 0: Setup (Day 1 Morning)
1. Create feature branch `feature/collaborative-shared-spaces`
2. Copy plan to `/docs/future/COLLABORATIVE_SHARED_SPACES.md`
3. Commit initial documentation
4. Set up task tracking

### Phase 1: Database & API Foundation (Days 1-2)
1. Add `SpaceInvitations` table to `db/config.ts`
2. Run database migration
3. Create `src/utils/space-permissions.ts` helper functions
4. Create `src/utils/tier-limits.ts` helper functions
5. Implement tier limit checking APIs:
   - GET /api/user/limits
   - GET /api/user/can-create-space
   - GET /api/user/can-join-space
6. Implement invitation APIs:
   - POST /api/spaces/[spaceId]/members/invite
   - GET /api/invitations/[token]
   - POST /api/invitations/[token]/accept

### Phase 2: Member Management APIs (Day 3)
1. Implement GET /api/spaces/[spaceId]/members
2. Implement DELETE /api/spaces/[spaceId]/members/[userId]
3. Implement POST /api/threads/[threadId]/share-to-space
4. Update existing space APIs to use permission helpers
5. Add permission checks to content APIs
6. Add tier limit checks to all relevant endpoints

### Phase 3: Core UI Components (Days 4-5)
1. Create `SpaceMembersList.tsx`
2. Create `InviteMemberPanel.tsx`
3. Create `AcceptInvitationPage.astro`
4. Create `ThreadCollaborationBadge.tsx`
5. Add member indicators to `MySpacesPanel.tsx`
6. Add upgrade prompts and usage displays

### Phase 4: Integration & Polish (Day 6)
1. Update `EditSpacePanel.tsx` with member section
2. Update `NewSpacePanel.tsx` to check tier limits
3. Implement visibility change polling
4. Add email notifications via Clerk
5. Create shared space badge indicator
6. Add tier limit warnings throughout UI

### Phase 5: Testing & Refinement (Day 7)
1. Test invitation flow end-to-end
2. Test permission boundaries
3. Test both collaboration scenarios (personal sharing + group-native)
4. Test tier limits enforcement
5. Test member sync on focus
6. Polish UI/UX
7. Add error states and loading indicators

### Phase 6: Documentation & PR (Day 7 Evening)
1. Update `/docs/future/COLLABORATIVE_SHARED_SPACES.md` with implementation notes
2. Add screenshots to documentation
3. Update CHANGELOG.md
4. Create comprehensive PR description
5. Tag for review

---

## Key Files to Modify

### Database
- ✏️ `/db/config.ts` - Add SpaceInvitations table

### API Endpoints (New)
- ✏️ `/src/pages/api/spaces/[spaceId]/members/invite.ts`
- ✏️ `/src/pages/api/spaces/[spaceId]/members/index.ts`
- ✏️ `/src/pages/api/spaces/[spaceId]/members/[userId].ts`
- ✏️ `/src/pages/api/invitations/[token]/index.ts`
- ✏️ `/src/pages/api/invitations/[token]/accept.ts`
- ✏️ `/src/pages/api/invitations/[token]/decline.ts`
- ✏️ `/src/pages/api/threads/[threadId]/share-to-space.ts`
- ✏️ `/src/pages/api/user/limits.ts`
- ✏️ `/src/pages/api/user/can-create-space.ts`
- ✏️ `/src/pages/api/user/can-join-space.ts`

### API Endpoints (Modify)
- ✏️ `/src/pages/api/spaces/[spaceId]/update.ts` - Add permission check
- ✏️ `/src/pages/api/spaces/[spaceId]/items.ts` - Allow member access
- ✏️ `/src/pages/api/spaces/[spaceId]/add-note.ts` - Allow member access
- ✏️ `/src/pages/api/spaces/[spaceId]/add-thread.ts` - Allow member access

### Utilities (New)
- ✏️ `/src/utils/space-permissions.ts` - Permission helper functions
- ✏️ `/src/utils/tier-limits.ts` - Tier limit checking functions

### UI Components (New)
- ✏️ `/src/components/react/SpaceMembersList.tsx`
- ✏️ `/src/components/react/InviteMemberPanel.tsx`
- ✏️ `/src/components/react/SharedSpaceIndicator.tsx`
- ✏️ `/src/components/react/ThreadCollaborationBadge.tsx`
- ✏️ `/src/pages/invitations/[token].astro`

### UI Components (Modify)
- ✏️ `/src/components/react/EditSpacePanel.tsx` - Add members section
- ✏️ `/src/components/react/MySpacesPanel.tsx` - Add shared space indicators
- ✏️ `/src/components/react/NewSpacePanel.tsx` - Update Private/Shared button to work

---

## Testing Strategy

### Manual Testing Checklist

**Invitation Flow:**
- [ ] Owner can send email invitation
- [ ] Owner can generate invite link
- [ ] Invited user receives email with link
- [ ] Non-user can view invitation details
- [ ] User can accept invitation and join space
- [ ] User can decline invitation
- [ ] Expired invitations show error
- [ ] Already-member shows appropriate message

**Permission Checks:**
- [ ] Members can view space content
- [ ] Members can add notes/threads to space
- [ ] Members cannot edit space title/color
- [ ] Members cannot invite others
- [ ] Members cannot remove other members
- [ ] Members can leave space
- [ ] Owner can remove members
- [ ] Non-members cannot access space

**Personal Thread Sharing:**
- [ ] User can share personal thread to collaborative space
- [ ] Members can add notes to shared thread
- [ ] Members cannot edit original thread title/details
- [ ] Members cannot edit thread owner's notes
- [ ] Thread owner retains full control of thread
- [ ] Badge shows "Shared by [Name]"

**Group-Native Threads:**
- [ ] Thread created directly in shared space
- [ ] All members can add notes
- [ ] Members can edit only their own notes
- [ ] Space owner can moderate all content
- [ ] Badge shows "Collaborative"

**UI Updates:**
- [ ] Member count shows correctly
- [ ] Shared space badge appears
- [ ] Member list loads and displays
- [ ] Remove member button works
- [ ] Poll on focus updates member list
- [ ] Toast shows when new members join

**Error Handling:**
- [ ] Invalid invitation token returns 404
- [ ] Expired invitation shows clear message
- [ ] Permission denied returns 403
- [ ] Rate limit blocks excessive invites
- [ ] Email validation catches bad emails

**Tier Limits:**
- [ ] Free user cannot create 2nd shared space
- [ ] Free user cannot join 4th space
- [ ] Free user cannot add 6th member to space
- [ ] Unlimited user cannot create 4th shared space
- [ ] Unlimited user cannot add 11th member to space
- [ ] Upgrade prompt shows at limits
- [ ] Usage display shows correct counts

---

## Verification Steps

After implementation, verify end-to-end:

1. **Create shared space:**
   - Create new space as User A
   - Note space ID

2. **Send invitation:**
   - Open EditSpacePanel
   - Click "Invite People"
   - Send email invitation to User B
   - Generate invite link for User C

3. **Accept invitations:**
   - Sign in as User B
   - Click email link
   - Accept invitation
   - Verify redirect to space
   - Sign in as User C
   - Use invite link
   - Accept invitation

4. **Verify collaboration (Personal → Shared):**
   - User A creates thread in personal space
   - User A shares thread to collaborative space
   - User B adds note to User A's thread (reaction/insight)
   - User A sees User B's note
   - User B cannot edit thread title or User A's notes
   - User A can still edit thread and own notes

5. **Verify collaboration (Group-Native):**
   - User A creates new thread directly in shared space
   - User B adds notes to thread
   - User C adds notes to thread
   - All notes visible to all members
   - Each user can edit only their own notes
   - Space owner (User A) can moderate all content

5. **Test permissions:**
   - User B tries to edit space title (should fail)
   - User B tries to invite User D (should fail)
   - User A removes User C
   - User C no longer sees space

6. **Test member sync:**
   - User A opens space
   - User D joins via link (in another browser)
   - User A switches tabs and back
   - User A sees User D in member list

---

## Future Enhancements (Out of Scope)

### Near-Term Possibilities
- Real-time collaboration indicators
- Admin role (three-tier permissions)
- Thread-level sharing (beyond space-level)
- Activity feed for space changes
- Member usage analytics
- Bulk invitation (CSV import)
- Guest access (limited permissions)

### Medium-Term Roadmap
- **Learning Challenges in Shared Spaces:** Gamification layer where spaces can have challenges/goals
- **Space Templates:** Pre-configured space templates with members
- Granular permissions (custom roles per member)

### Long-Term Vision
- **Church Tier via Clerk Organizations:**
  - MyChurchPanel for church-wide management
  - Organization-level shared spaces
  - Church admin controls
  - Multi-campus support
  - Bulk member management at org level
  - Church-wide content library
- SSO/SAML for organizations
- Advanced analytics and reporting
- Integration with ChMS systems

---

## Architecture Decisions

**Why simple Owner + Member model?**
- Easier to understand and use
- Covers 90% of use cases
- Can add Admin role later if needed
- Sets up clean foundation for Church tier (organization-level roles)

**Why both email + link invitations?**
- Email: Controlled, trackable, professional
- Link: Fast, flexible, works for groups
- Users requested both methods
- Prepares for organization-wide invitations in Church tier

**Why async collaboration?**
- No infrastructure overhead (WebSockets/SSE)
- Works offline
- Simpler to implement and maintain
- Poll-on-focus is responsive enough
- Can upgrade to real-time later if needed

**Why keep Spaces → Threads → Notes?**
- Already built and understood
- Natural organization hierarchy
- Threads provide useful grouping
- Supports both personal-shared and group-native collaboration
- Can add thread-level sharing later if needed
- Scales to organization-level spaces in Church tier

**Why tier limits now?**
- Creates upgrade incentive
- Manages server costs and scalability
- Establishes clear value proposition
- Foundation for Church tier pricing

---

## Risks & Mitigations

**Risk:** Email delivery failures
**Mitigation:** Store invitation with token, user can accept via link if email fails

**Risk:** Token collisions
**Mitigation:** Use 62^12 token space + unique index

**Risk:** Member limit abuse
**Mitigation:** Rate limit invitations, set max members per space

**Risk:** Permission check gaps
**Mitigation:** Centralize checks in helper functions, audit all endpoints

**Risk:** UX confusion around roles
**Mitigation:** Clear labels, tooltips, and onboarding for space owners

---

## Success Criteria

✅ Owner can invite users via email
✅ Owner can generate shareable invite link
✅ Users can accept invitations and join space
✅ Members can view and contribute content
✅ Only owner can manage space settings and members
✅ Member changes sync on focus/navigation
✅ Permission checks prevent unauthorized access
✅ UI clearly shows shared spaces and member counts
✅ Invitation flow is smooth and intuitive

---

## Timeline Estimate

**Total:** 7-8 days (full-time development)
- Setup & Documentation: 0.5 days
- Database & API: 2.5 days
- UI Components: 2.5 days
- Testing & Polish: 1.5 days
- Final Documentation & PR: 0.5 days

**Could be compressed to 5-6 days** if focusing on MVP without polish and full documentation.

---

## Summary

This plan implements a comprehensive collaborative shared spaces system that:
- ✅ Supports both personal-shared and group-native collaboration models
- ✅ Uses email and link-based invitations
- ✅ Enforces tier limits (Free vs Unlimited)
- ✅ Maintains simple Owner + Member permissions
- ✅ Works async (no real-time infrastructure needed)
- ✅ Reuses existing UI/UX patterns for consistency
- ✅ Sets foundation for future Church tier
- ✅ Includes comprehensive testing strategy
- ✅ Fully documented for future reference

The implementation follows a phased approach with clear milestones, leverages existing infrastructure, and prioritizes functionality over design perfection (which can be refined later).

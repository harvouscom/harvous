# Sharing System Quick Reference

> **Retired July 2026.** This quick reference describes the February/Classic model and is not a current product
> or engineering reference. Personal-to-public toggles, `Members`, and copy-in ownership were replaced by
> dedicated Shared Spaces, `SpaceMemberships`, canonical My Home notes, and reusable `SpaceNotes`. See
> [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md). Current user-facing feature language is
> **Thread** or **Threads**.

## Two Types of Sharing

### 🌍 Type 1: Public Share Links
**Purpose**: Viral growth, sharing insights with anyone

**How it works:**
- User clicks "Share" on note/thread
- Gets unique link: `harvous.com/shared/abc123`
- **Anyone can visit** (even non-users)
- See beautiful preview
- "Join Harvous to add this" call-to-action
- Content appears in their inbox when they join

**Use Case**: "Check out this amazing insight about John 3:16!"

**Database Tables:**
- `SharedContent` - Tracks shared content
- `UserSharedContent` - Who added it

---

### 👥 Type 2: Collaborative Shared Threads
**Purpose**: Real-time collaboration, group study

**How it works:**
- User creates thread
- Clicks "Make Thread Shared"
- Invites members (by user search, email, or link)
- **Everyone contributes to the same thread**
- All members see all notes in real-time

**Use Case**: "Let's study Romans together as a group"

**Database Tables:**
- `ThreadMembers` - Who has access
- `ThreadInvitations` - Pending invitations
- Uses existing `Threads.isPublic` field

---

## Quick Comparison

| Feature | Share Links | Shared Threads |
|---------|------------|----------------|
| **Access** | Anyone with link | Invited members only |
| **Content** | Copy of content | Same thread, real-time |
| **Growth** | High (viral) | Medium (invite-based) |
| **Privacy** | Public | Private to members |
| **Use Case** | Sharing insights | Group collaboration |

---

## Implementation Status

### ✅ Ready
- `Threads.isPublic` field exists (for shared threads)
- `Members` table exists (pattern for ThreadMembers)
- Inbox system (for share link adds)
- Notes/Threads structure (for sharing)

### 🔨 Needs Building
- **Share Links**: Tables + API + Public preview page
- **Shared Threads**: ThreadMembers table + Invitation system

---

## Key Files

- `SHARING_SYSTEM_DESIGN.md` - Complete design for both types
- `SHARING_AND_GROUPS_INFRASTRUCTURE.md` - Database schema and implementation plan

---

## User Experience Examples

### Share Link Flow
```
Sarah creates note → Shares → Gets link
→ Posts on Twitter
→ 50 people click
→ 20 sign up
→ 15 add to account
→ Viral growth! 🚀
```

### Shared Thread Flow
```
Pastor creates "Romans Study" thread
→ Makes it shared
→ Invites small group
→ Everyone adds insights
→ Real-time collaboration
→ Better group study! 📖
```

Both systems work together to create powerful sharing and collaboration! 🎉


# Achievements and Badges System

**Status:** Future Feature  
**Last Updated:** February 2026

---

## Overview

Expand the current achievements panel to include a comprehensive badges and milestones system that gamifies user engagement and celebrates their Bible study journey. This builds on the existing XP system and milestone tracking already partially implemented.

## Current State (Reference)

For what is **currently** implemented—season date ranges, seasonal vs lifetime XP, past seasons, and the achievements panel—see **[XP and Achievements](../XP_AND_ACHIEVEMENTS.md)** in `docs/`. That doc also documents the calendar boundaries for each XP season (Spring, Summer, Fall, Winter).

**Existing infrastructure this plan builds on:**
- XP tracking system (`UserXP`, `UserSeasonalXP`, `UserLifetimeXP` tables)
- Activity types tracked: sessions, creation bonuses, church added, monthly attendance, weekly streaks
- Milestone checking function (`checkLifetimeMilestones()`)
- Achievements API endpoint (`/api/user/achievements`)
- UI placeholder: “Milestones and Badges coming soon”

## Proposed Badge Categories

### 1. XP Milestones (Extend Existing)

**Current Milestones:**
- First Steps (100 XP)
- Growing Strong (500 XP)
- Thousand Club (1,000 XP)
- Five Thousand Club (5,000 XP)
- Ten Thousand Club (10,000 XP)
- Twenty-Five Thousand Club (25,000 XP)
- Fifty Thousand Club (50,000 XP)

**Additional Milestones:**
- Hundred Thousand Club (100,000 XP)
- Quarter Million Club (250,000 XP)
- Half Million Club (500,000 XP)
- Million Club (1,000,000 XP)

**Seasonal Milestones:**
- Season Starter (100 seasonal XP)
- Season Champion (1,000 seasonal XP)
- Season Legend (5,000 seasonal XP)
- Perfect Season (10,000+ seasonal XP)

### 2. Content Creation Badges

**Notes Created:**
- 📝 **First Note** - Create your first note
- 📝 **Novice Notetaker** - 10 notes created
- 📝 **Dedicated Scholar** - 50 notes created
- 📝 **Prolific Writer** - 100 notes created
- 📝 **Master Scribe** - 500 notes created
- 📝 **Legendary Chronicler** - 1,000 notes created
- 📝 **Epic Historian** - 5,000 notes created

**Threads Created:**
- 🧵 **Thread Starter** - Create your first thread
- 🧵 **Organizer** - 5 threads created
- 🧵 **Curator** - 10 threads created
- 🧵 **Architect** - 25 threads created
- 🧵 **Master Builder** - 50 threads created
- 🧵 **Grand Architect** - 100 threads created

**Spaces Created:**
- 🏛️ **Space Creator** - Create your first space
- 🏛️ **Multi-Space Master** - 5 spaces created
- 🏛️ **Organization Expert** - 10 spaces created

**Scripture Notes:**
- 📖 **Scripture Scholar** - Create your first scripture note
- 📖 **Verse Collector** - 10 scripture notes created
- 📖 **Chapter Explorer** - 50 scripture notes created
- 📖 **Book Master** - 100 scripture notes created
- 📖 **Bible Navigator** - Notes from all 66 books of the Bible

**Resource Notes:**
- 🔗 **Resource Hunter** - Create your first resource note
- 🔗 **Link Collector** - 10 resource notes created
- 🔗 **Knowledge Seeker** - 50 resource notes created

### 3. Engagement & Consistency Badges

**Sessions:**
- ⚡ **First Session** - Complete your first study session
- ⚡ **Daily Devotion** - 3 sessions in a single day
- ⚡ **Week Warrior** - 7 sessions in a week
- ⚡ **Monthly Momentum** - 20 sessions in a month
- ⚡ **Session Master** - 100 total sessions completed

**Weekly Streaks:**
- 🔥 **Three Day Streak** - 3-4 days with sessions in a week
- 🔥 **Five Day Streak** - 5-6 days with sessions in a week
- 🔥 **Perfect Week** - 7 days with sessions in a week
- 🔥 **Consistent Scholar** - 4 perfect weeks in a row
- 🔥 **Unstoppable** - 8 perfect weeks in a row
- 🔥 **Legendary Streak** - 12 perfect weeks in a row

**Monthly Attendance:**
- 📅 **Monthly Visitor** - Visit in 3 different months
- 📅 **Quarterly Devotee** - Visit in 6 different months
- 📅 **Yearly Faithful** - Visit in 12 different months
- 📅 **Two Year Veteran** - Visit in 24 different months

**Daily Habits:**
- 🌅 **Early Bird** - Create a note before 8 AM
- 🌙 **Night Owl** - Create a note after 10 PM
- ☕ **Daily Dose** - Create a note every day for 7 days
- 📚 **Study Habit** - Create a note every day for 30 days
- 🎯 **Perfect Month** - Create a note every day for 30 days
- 🏆 **Perfect Quarter** - Create a note every day for 90 days

### 4. Organization & Mastery Badges

**Tags:**
- 🏷️ **Tag Master** - Create 10 tags
- 🏷️ **Categorization Expert** - Create 25 tags
- 🏷️ **Organization Pro** - Create 50 tags

**Organization:**
- 📋 **Getting Organized** - Add 10 notes to threads
- 📋 **Well Organized** - Add 50 notes to threads
- 📋 **Perfectly Organized** - Add 100 notes to threads
- 📋 **Thread Master** - Create a thread with 10+ notes
- 📋 **Mega Thread** - Create a thread with 50+ notes

**Scripture Engagement:**
- 📜 **Scripture Detector** - Detect 10 scripture references
- 📜 **Verse Hunter** - Detect 50 scripture references
- 📜 **Reference Master** - Detect 100 scripture references
- 📜 **OT Explorer** - Notes referencing all 39 Old Testament books
- 📜 **NT Explorer** - Notes referencing all 27 New Testament books
- 📜 **Complete Bible** - Notes referencing all 66 books

### 5. Special Achievement Badges

**Firsts:**
- 🎯 **First Steps** - Complete onboarding
- 🎯 **Profile Complete** - Add your church
- 🎯 **Sharing Started** - Share your first note/thread
- 🎯 **Community Member** - Comment on a shared note

**Milestone Moments:**
- 🎉 **One Week Old** - Account created 7 days ago
- 🎉 **One Month Old** - Account created 30 days ago
- 🎉 **Three Month Veteran** - Account created 90 days ago
- 🎉 **Half Year Hero** - Account created 180 days ago
- 🎉 **One Year Champion** - Account created 365 days ago
- 🎉 **Two Year Legend** - Account created 730 days ago

**Special Combinations:**
- ⭐ **Balanced Scholar** - Create notes, threads, and spaces
- ⭐ **Scripture Specialist** - 50%+ of notes are scripture notes
- ⭐ **Resource Researcher** - 25%+ of notes are resource notes
- ⭐ **All-Rounder** - Create all note types (default, scripture, resource)
- ⭐ **Power User** - 1,000+ XP in a single season
- ⭐ **Season Champion** - Top XP in a season (if leaderboards exist)

**Hidden/Easter Egg Badges:**
- 🎁 **Quick Learner** - Create 5 notes in your first day
- 🎁 **Early Adopter** - Account created in first 3 months of launch
- 🎁 **Night Shift** - Create notes between 2-5 AM
- 🎁 **Weekend Warrior** - Create 10 notes in a weekend
- 🎁 **Marathon Session** - Complete 3 sessions in one day

## Implementation Plan

### Phase 1: Badge System Infrastructure

**1. Database Schema**

Create a new `UserBadges` table to track earned badges:

```typescript
const UserBadges = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // Clerk user id
    badgeId: column.text(), // Unique badge identifier (e.g., 'first_note', 'hundred_notes')
    badgeCategory: column.text(), // 'xp_milestone', 'content_creation', 'engagement', etc.
    earnedAt: column.date(), // When badge was earned
    metadata: column.text({ optional: true }), // JSON for additional data (e.g., count when earned)
  }
})
```

**2. Badge Definitions**

Create a badge definitions file (`src/utils/badge-definitions.ts`) that contains:
- All badge metadata (id, name, description, icon, category, requirements)
- Badge checking logic
- Badge unlock conditions

**3. Badge Checking System**

Create utility functions to check and award badges:
- `checkAndAwardBadges(userId, activityType, context)` - Called after XP events
- `getUserBadges(userId)` - Retrieve all earned badges
- `getBadgeProgress(userId, badgeId)` - Get progress toward unlocking a badge

### Phase 2: Badge Categories Implementation

**Priority Order:**
1. **XP Milestones** (easiest - already partially implemented)
2. **Content Creation** (straightforward - count existing records)
3. **Engagement & Consistency** (use existing session/streak data)
4. **Organization** (query junction tables and tags)
5. **Special Achievements** (requires additional tracking)

### Phase 3: UI Updates

**1. Achievements Panel Enhancement**

Update `MyAchievementsPanel.tsx` to show:
- Badge grid/list view
- Filter by category
- Progress indicators for locked badges
- Badge details modal
- Recent badges earned

**2. Badge Display Components**

- `BadgeCard.tsx` - Individual badge display
- `BadgeCategory.tsx` - Category grouping
- `BadgeProgress.tsx` - Progress bar for locked badges
- `BadgeNotification.tsx` - Toast/notification when badge earned

**3. Profile Integration**

- Show recent badges in profile
- Badge count in profile stats
- Link to full achievements panel

## Technical Considerations

### Badge Checking Strategy

**Real-time Checking:**
- Check badges immediately after relevant actions (note created, session completed, etc.)
- Use database triggers or application-level checks
- Award badges synchronously or asynchronously

**Batch Checking:**
- Periodic job to check for badges that might have been missed
- Useful for badges based on aggregates (total notes, total XP, etc.)
- Run daily or weekly

**Hybrid Approach (Recommended):**
- Real-time for action-based badges (first note, perfect week, etc.)
- Batch checking for aggregate badges (total notes, all books, etc.)

### Performance Considerations

**Caching:**
- Cache user's earned badges in `UserMetadata` or separate cache table
- Invalidate cache when new badge is earned
- Reduce database queries for badge display

**Query Optimization:**
- Use aggregate queries for counts (notes, threads, etc.)
- Index `UserBadges` table on `userId` and `badgeId`
- Consider materialized views for complex badge checks

### Badge Unlock Logic

**Example: First Note Badge**
```typescript
async function checkFirstNoteBadge(userId: string, noteId: string) {
  // Check if user already has this badge
  const existing = await db.select()
    .from(UserBadges)
    .where(and(
      eq(UserBadges.userId, userId),
      eq(UserBadges.badgeId, 'first_note')
    ))
    .limit(1);
  
  if (existing.length > 0) return; // Already earned
  
  // Check if this is actually the first note
  const noteCount = await db.select({ count: count() })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .get();
  
  if (noteCount?.count === 1) {
    // Award badge
    await awardBadge(userId, 'first_note', {
      noteId,
      earnedAt: new Date()
    });
  }
}
```

**Example: Perfect Week Badge**
```typescript
async function checkPerfectWeekBadge(userId: string) {
  // Check if already earned this week
  const weekStart = getWeekStart(new Date());
  const existing = await db.select()
    .from(UserBadges)
    .where(and(
      eq(UserBadges.userId, userId),
      eq(UserBadges.badgeId, 'perfect_week'),
      gte(UserBadges.earnedAt, weekStart)
    ))
    .limit(1);
  
  if (existing.length > 0) return; // Already earned this week
  
  // Check weekly streak
  const streak = await db.select()
    .from(WeeklyStreaks)
    .where(and(
      eq(WeeklyStreaks.userId, userId),
      eq(WeeklyStreaks.weekStart, weekStart),
      eq(WeeklyStreaks.daysWithSessions, 7)
    ))
    .limit(1);
  
  if (streak.length > 0) {
    await awardBadge(userId, 'perfect_week', {
      weekStart: weekStart.toISOString(),
      earnedAt: new Date()
    });
  }
}
```

## Data Requirements

### Already Tracked (No Additional Work)
- ✅ XP totals (lifetime, seasonal)
- ✅ Session completion
- ✅ Weekly streaks
- ✅ Monthly attendance
- ✅ Church added
- ✅ Note/thread/space creation (via Notes, Threads, Spaces tables)
- ✅ Scripture note detection (via ScriptureMetadata)
- ✅ Activity types (via UserXP table)

### Needs Additional Tracking
- ⚠️ Account creation date (check UserMetadata or Clerk)
- ⚠️ First note/thread/space timestamps (can query from existing tables)
- ⚠️ Tag creation count (query Tags table)
- ⚠️ Notes organized into threads (query NoteThreads junction table)
- ⚠️ Scripture references detected (query NoteScriptureReferences)
- ⚠️ All Bible books referenced (aggregate query on ScriptureMetadata)
- ⚠️ Note type distribution (query Notes table with noteType filter)
- ⚠️ Sharing activity (check if Notes/Threads have share tokens)
- ⚠️ Comments made (query Comments table)

### New Tracking Needed
- 🔴 Daily note creation streak (new table or UserMetadata field)
- 🔴 Time-based badges (early bird, night owl) - can derive from createdAt timestamps
- 🔴 Perfect month/quarter streaks - requires tracking

## API Changes

### Extend `/api/user/achievements`

**Current Response:**
```json
{
  "seasonalXP": 1250,
  "lifetimeXP": 5430,
  "seasonName": "Winter 2026",
  "milestones": [...],
  "allSeasons": [...]
}
```

**Enhanced Response:**
```json
{
  "seasonalXP": 1250,
  "lifetimeXP": 5430,
  "seasonName": "Winter 2026",
  "milestones": [...],
  "allSeasons": [...],
  "badges": {
    "earned": [
      {
        "id": "first_note",
        "name": "First Note",
        "description": "Create your first note",
        "category": "content_creation",
        "earnedAt": "2026-01-15T10:30:00Z",
        "icon": "📝"
      },
      ...
    ],
    "locked": [
      {
        "id": "hundred_notes",
        "name": "Prolific Writer",
        "description": "Create 100 notes",
        "category": "content_creation",
        "progress": {
          "current": 47,
          "target": 100,
          "percentage": 47
        },
        "icon": "📝"
      },
      ...
    ]
  },
  "badgeStats": {
    "totalEarned": 12,
    "totalAvailable": 85,
    "byCategory": {
      "xp_milestones": 3,
      "content_creation": 5,
      "engagement": 2,
      "organization": 1,
      "special": 1
    }
  }
}
```

## UI/UX Design

### Achievements Panel Layout

```
┌─────────────────────────────────────────┐
│  My Achievements                    [X] │
├─────────────────────────────────────────┤
│                                         │
│  [XP Summary Cards - existing]          │
│                                         │
│  ┌──────────┐  ┌──────────┐            │
│  │ 1,250 XP │  │ 5,430 XP │            │
│  │ Winter   │  │ All Time │            │
│  └──────────┘  └──────────┘            │
│                                         │
│  [Badge Categories Tabs]               │
│  All | XP | Content | Engagement | ... │
│                                         │
│  [Badge Grid]                           │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│  │ 📝 │ │ 🧵 │ │ ⚡ │ │ 🔥 │          │
│  │ ✓  │ │ ✓  │ │ ✓  │ │ 🔒 │          │
│  └────┘ └────┘ └────┘ └────┘          │
│                                         │
│  [Badge Details - when clicked]        │
│  ┌─────────────────────────────┐        │
│  │ 📝 First Note               │        │
│  │ Create your first note      │        │
│  │ Earned: Jan 15, 2026        │        │
│  └─────────────────────────────┘        │
│                                         │
└─────────────────────────────────────────┘
```

### Badge States

**Earned Badge:**
- Full color icon
- Checkmark overlay
- Clickable to see details
- Shows earned date

**Locked Badge:**
- Grayscale/muted icon
- Progress indicator (if applicable)
- Shows "Locked" or progress percentage
- Clickable to see requirements

**Recently Earned:**
- Highlighted with animation
- "New!" badge
- Shown in "Recent" section

### Badge Notification

When a badge is earned, show a toast notification:

```
┌─────────────────────────────────────┐
│  🎉 Badge Earned!                   │
│                                     │
│  📝 First Note                      │
│  Create your first note             │
│                                     │
│  [View All] [Dismiss]               │
└─────────────────────────────────────┘
```

## Migration Strategy

### For Existing Users

**Backfill Badges:**
1. Run migration script to check all existing users
2. Award badges based on current data (total notes, XP, etc.)
3. Set `earnedAt` to approximate date based on first relevant activity
4. Batch process to avoid performance issues

**Example Migration:**
```typescript
async function backfillUserBadges(userId: string) {
  // Check content creation badges
  const noteCount = await getNoteCount(userId);
  if (noteCount >= 1) await awardBadge(userId, 'first_note', { backfilled: true });
  if (noteCount >= 10) await awardBadge(userId, 'novice_notetaker', { backfilled: true });
  // ... etc
  
  // Check XP milestones (already tracked)
  const lifetimeXP = await getLifetimeXP(userId);
  if (lifetimeXP >= 100) await awardBadge(userId, 'first_hundred', { backfilled: true });
  // ... etc
}
```

## Testing Strategy

### Unit Tests
- Badge checking logic for each badge type
- Badge unlock conditions
- Progress calculation
- Badge aggregation queries

### Integration Tests
- Badge awarding after user actions
- Badge display in achievements panel
- Badge notifications
- Badge filtering and search

### User Testing
- A/B test badge designs
- Test notification timing and frequency
- Gather feedback on badge categories
- Test badge motivation impact

## Future Enhancements

### Phase 4: Advanced Features

**Badge Rarity:**
- Common, Rare, Epic, Legendary tiers
- Visual distinction (border colors, effects)

**Badge Collections:**
- Group related badges into collections
- Reward for completing collections
- Collection progress tracking

**Badge Sharing:**
- Share earned badges
- Badge showcase in profile
- Social sharing integration

**Badge Challenges:**
- Time-limited badge challenges
- Seasonal badge events
- Community challenges

**Leaderboards:**
- Badge count leaderboards
- Category-specific leaderboards
- Friend comparisons

## Related Files

- [`src/components/react/MyAchievementsPanel.tsx`](../../src/components/react/MyAchievementsPanel.tsx) - Current achievements panel
- [`src/pages/api/user/achievements.ts`](../../src/pages/api/user/achievements.ts) - Achievements API endpoint
- [`src/utils/xp-system.ts`](../../src/utils/xp-system.ts) - XP system and milestone checking
- [`db/config.ts`](../../db/config.ts) - Database schema
- [`src/utils/dashboard-data.ts`](../../src/utils/dashboard-data.ts) - User data queries

## Notes

- Start with high-value, easy-to-implement badges (XP milestones, first note, etc.)
- Prioritize badges that encourage desired behaviors (daily engagement, organization)
- Consider badge fatigue - don't award too many at once
- Make locked badges aspirational but achievable
- Use badges to guide users toward best practices (organization, consistency)
- Consider seasonal/limited-time badges for special events
- Badge system should complement, not replace, the core study experience

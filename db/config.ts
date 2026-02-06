import { defineDb, defineTable, column } from 'astro:db';

const Spaces = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    title: column.text(),
    description: column.text({ optional: true }),
    color: column.text({ optional: true }),
    backgroundGradient: column.text({ optional: true }),
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
    userId: column.text(), // Clerk user id
    isPublic: column.boolean({ default: false }),
    isActive: column.boolean({ default: true }),
    order: column.number({ default: 0 }),
  }
})

const Threads = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    title: column.text(),
    subtitle: column.text({ optional: true }),
    spaceId: column.text({ optional: true }), // Space this thread belongs to (optional)
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
    lastVisited: column.date({ optional: true }), // Last time the thread was opened/visited
    userId: column.text(), // Clerk user id
    isPublic: column.boolean({ default: false }),
    isPinned: column.boolean({ default: false }), // Whether the thread is pinned
    color: column.text({ optional: true }), // Store the color name or value
    order: column.number({ default: 0 }), // Display order
    shareToken: column.text({ optional: true }), // Unique token for sharing (null = private)
    shareTokenCreatedAt: column.date({ optional: true }), // When the share token was created
  }
})

const Notes = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    title: column.text({ optional: true }),
    content: column.text(),
    threadId: column.text(), // Required: every note must belong to a thread (default: "thread_unorganized")
    spaceId: column.text({ optional: true }), // Optional: direct reference to space
    simpleNoteId: column.number({ optional: true }), // User-friendly sequential note ID (1, 2, 3, etc.)
    noteType: column.text({ default: 'default' }), // 'default', 'scripture', 'resource'
    addedBy: column.text({ default: 'user' }), // 'user', 'harvous', etc. - tracks source/creator of note
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
    lastVisited: column.date({ optional: true }), // Last time the note was opened/visited
    userId: column.text(), // Clerk user id
    isPublic: column.boolean({ default: false }),
    isFeatured: column.boolean({ default: false }),
    order: column.number({ default: 0 }),
    shareToken: column.text({ optional: true }), // Unique token for sharing (null = private)
    shareTokenCreatedAt: column.date({ optional: true }), // When the share token was created
    contentEncrypted: column.boolean({ default: false }), // When true, content holds client-encrypted ciphertext
  }
})

// Junction table for many-to-many relationship between notes and threads
const NoteThreads = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    noteId: column.text(), // Reference to note
    threadId: column.text(), // Reference to thread
    createdAt: column.date(),
  },
  indexes: {
    uniqueNoteThread: {
      on: ['noteId', 'threadId'],
      unique: true
    }
  }
})

const Comments = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    content: column.text(),
    noteId: column.text(),
    userId: column.text(),
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

const Members = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    spaceId: column.text(),
    role: column.text({ default: "member" }), // member, admin, owner
    createdAt: column.date(),
  },
  indexes: {
    spaceIdIndex: {
      on: ['spaceId']
    },
    userIdIndex: {
      on: ['userId']
    }
  }
})

const SpaceInvitations = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    spaceId: column.text(), // References Spaces.id
    invitedBy: column.text(), // Clerk userId who sent invite
    invitedEmail: column.text({ optional: true }), // Email if email-based
    invitedUserId: column.text({ optional: true }), // If inviting existing user
    inviteToken: column.text({ unique: true }), // Unique token for invite links
    role: column.text({ default: "member" }), // Role they'll receive
    status: column.text(), // 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
    message: column.text({ optional: true }), // Optional invite message
    expiresAt: column.date({ optional: true }), // Optional expiration (7 days default)
    createdAt: column.date(),
    acceptedAt: column.date({ optional: true }),
  },
  indexes: {
    tokenIndex: {
      on: ['inviteToken'],
      unique: true
    },
    spaceStatusIndex: {
      on: ['spaceId', 'status']
    },
    emailIndex: {
      on: ['invitedEmail']
    }
  }
})

// User metadata table to track highest simpleNoteId used per user
const UserMetadata = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text({ unique: true }), // Clerk user id
    highestSimpleNoteId: column.number({ default: 0 }), // Highest simpleNoteId ever used by this user
    userColor: column.text({ default: 'paper' }), // User's preferred color for profile/avatar
    // Cached Clerk user data to avoid API calls
    firstName: column.text({ optional: true }),
    lastName: column.text({ optional: true }),
    email: column.text({ optional: true }),
    profileImageUrl: column.text({ optional: true }),
    clerkDataUpdatedAt: column.date({ optional: true }), // When we last fetched from Clerk
    // Church information
    churchName: column.text({ optional: true }),
    churchCity: column.text({ optional: true }),
    churchState: column.text({ optional: true }), // State/Province/Region (full name, not abbreviation)
    churchCountry: column.text({ optional: true }), // ISO 3-letter country code (e.g., 'USA', 'CAN')
    // XP and season tracking
    currentSeason: column.text({ optional: true }), // Track current season (e.g., "spring-2025")
    lastMonthlyVisit: column.date({ optional: true }), // For monthly attendance tracking
    churchAddedAt: column.date({ optional: true }), // Track when church was added (for XP award)
    // Referral bonus
    referralBonusNotes: column.number({ default: 0 }), // Bonus note allowance from referrals (+100 per signup)
    referralCode: column.text({ optional: true, unique: true }), // Autogenerated code for referral links (e.g. JOHN-X7K2)
    // Account-level lock PIN (one PIN for all locked notes)
    lockPinSalt: column.text({ optional: true }), // Per-user salt for PIN hashing (server-only, never sent to client)
    lockPinHash: column.text({ optional: true }), // Hash of PIN for verification (server-only, never sent to client)
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

// XP tracking table to track user activities and XP earned
const UserXP = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // Clerk user id
    activityType: column.text(), // 'session_completed', 'creation_bonus', 'church_added', 'monthly_attendance', 'weekly_streak', etc.
    xpAmount: column.number(), // XP earned for this activity
    relatedId: column.text({ optional: true }), // ID of related note/thread (optional)
    season: column.text({ optional: true }), // Season identifier (e.g., "spring-2025", "summer-2025") - optional for backwards compatibility
    createdAt: column.date(),
    metadata: column.text({ optional: true }), // JSON string for additional data (e.g., daily caps)
  }
})

// Aggregated seasonal XP totals for quick lookup
const UserSeasonalXP = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // Clerk user id
    season: column.text(), // Season identifier (e.g., "spring-2025")
    totalXP: column.number({ default: 0 }), // Total XP for this season
    sessionCount: column.number({ default: 0 }), // Number of sessions this season
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

// Aggregated lifetime XP total for quick lookup and milestones
const UserLifetimeXP = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text({ unique: true }), // Clerk user id
    totalXP: column.number({ default: 0 }), // Total lifetime XP
    lastUpdated: column.date(), // Last time this was updated
  }
})

// Weekly streak tracking
const WeeklyStreaks = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // Clerk user id
    weekStart: column.date(), // Monday of the week (ISO week)
    daysWithSessions: column.number({ default: 0 }), // Days 0-7 with sessions
    xpAwarded: column.number({ default: 0 }), // XP awarded for this week
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

// Tags table for storing tag definitions
const Tags = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    name: column.text(), // e.g., "prayer", "faith", "forgiveness", "Genesis", "Jesus"
    color: column.text({ optional: true }), // Tag color for UI
    category: column.text({ optional: true }), // e.g., "spiritual", "biblical", "character", "place", "book"
    userId: column.text(), // User who created the tag (or 'system' for auto-generated)
    isSystem: column.boolean({ default: false }), // System-generated vs user-created
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

// Junction table for many-to-many relationship between notes and tags
const NoteTags = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    noteId: column.text(), // Reference to note
    tagId: column.text(), // Reference to tag
    isAutoGenerated: column.boolean({ default: false }), // AI-generated vs user-assigned
    confidence: column.number({ optional: true }), // AI confidence score (0-1)
    createdAt: column.date(),
  }
})

// Scripture metadata table for scripture note type
const ScriptureMetadata = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    noteId: column.text(), // Foreign key to Notes
    reference: column.text(), // e.g., "John 3:16"
    book: column.text(), // e.g., "John"
    chapter: column.number(), // e.g., 3
    verse: column.number(), // e.g., 16 (or start of range)
    verseEnd: column.number({ optional: true }), // End of range if applicable
    translation: column.text(), // "NET" for MVP, extensible for future translations
    originalText: column.text(), // Full verse text
    createdAt: column.date(),
  }
})

// Resource metadata table for resource note type
const ResourceMetadata = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    noteId: column.text(), // Foreign key to Notes
    sourceUrl: column.text(), // Required - the actual URL
    sourceDomain: column.text({ optional: true }), // Auto-extracted domain from sourceUrl (e.g., "youtube.com")
    sourceName: column.text({ optional: true }), // From og:site_name - the website's official name (e.g., "YouTube", "The Gospel Coalition")
    sourceTitle: column.text({ optional: true }), // From og:title
    sourceDescription: column.text({ optional: true }), // From og:description
    sourceImage: column.text({ optional: true }), // From og:image
    createdAt: column.date(),
  }
})

// Junction table for many-to-many relationship between notes and scripture references
// Tracks which notes reference which scripture notes (for the "Notes" tab in scripture note details)
const NoteScriptureReferences = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    noteId: column.text(), // Note that contains the reference
    scriptureNoteId: column.text(), // The scripture note being referenced
    createdAt: column.date(),
  },
  indexes: {
    uniqueNoteScripture: {
      on: ['noteId', 'scriptureNoteId'],
      unique: true
    }
  }
})

// Inbox items from Harvous team (synced from Webflow CMS)
const InboxItems = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    webflowItemId: column.text({ unique: true }), // Unique ID from Webflow CMS
    contentType: column.text(), // 'thread' | 'note'
    title: column.text(),
    subtitle: column.text({ optional: true }), // Optional, for threads
    content: column.text({ optional: true }), // For notes, optional for threads
    imageUrl: column.text({ optional: true }),
    color: column.text({ optional: true }), // Thread color (optional)
    threadType: column.text({ optional: true }), // Thread type from CMS (e.g., 'Default')
    targetAudience: column.text(), // 'all_users' | 'specific_users'
    isActive: column.boolean({ default: true }),
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

// Notes within inbox threads (for threads containing multiple notes)
const InboxItemNotes = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    inboxItemId: column.text(), // Foreign key to InboxItems
    title: column.text({ optional: true }),
    content: column.text(),
    order: column.number({ default: 0 }), // Display order
    createdAt: column.date(),
  }
})

// Tracks user's inbox items and their status
const UserInboxItems = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // Clerk user ID
    inboxItemId: column.text(), // Foreign key to InboxItems
    status: column.text(), // 'inbox' | 'archived' | 'added'
    addedAt: column.date({ optional: true }), // When added to user's Harvous
    archivedAt: column.date({ optional: true }), // When archived
    createdAt: column.date(), // When item appeared in user's inbox
  }
})

// Monthly analytics for anonymous tracking of popular books and tags
const MonthlyAnalytics = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    month: column.text(), // Format: "YYYY-MM" (e.g., "2025-01")
    bookName: column.text({ optional: true }), // Bible book name (null for tag entries)
    tagName: column.text({ optional: true }), // Tag name (null for book entries)
    category: column.text(), // 'book' | 'tag'
    count: column.number({ default: 0 }), // Number of times this book/tag was used
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

// https://astro.build/db/config
export default defineDb({
  tables: {
    Spaces,
    Threads,
    Notes,
    NoteThreads,
    Comments,
    Members,
    SpaceInvitations,
    UserMetadata,
    UserXP,
    UserSeasonalXP,
    UserLifetimeXP,
    WeeklyStreaks,
    Tags,
    NoteTags,
    ScriptureMetadata,
    NoteScriptureReferences,
    ResourceMetadata,
    InboxItems,
    InboxItemNotes,
    UserInboxItems,
    MonthlyAnalytics
  }
});
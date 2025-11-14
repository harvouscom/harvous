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
    userId: column.text(), // Clerk user id
    isPublic: column.boolean({ default: false }),
    isPinned: column.boolean({ default: false }), // Whether the thread is pinned
    color: column.text({ optional: true }), // Store the color name or value
    order: column.number({ default: 0 }), // Display order
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
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
    userId: column.text(), // Clerk user id
    isPublic: column.boolean({ default: false }),
    isFeatured: column.boolean({ default: false }),
    order: column.number({ default: 0 }),
  }
})

// Junction table for many-to-many relationship between notes and threads
const NoteThreads = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    noteId: column.text(), // Reference to note
    threadId: column.text(), // Reference to thread
    createdAt: column.date(),
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
    createdAt: column.date(),
    updatedAt: column.date({ optional: true }),
  }
})

// XP tracking table to track user activities and XP earned
const UserXP = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(), // Clerk user id
    activityType: column.text(), // 'thread_created', 'note_created', 'note_opened', 'first_note_daily'
    xpAmount: column.number(), // XP earned for this activity
    relatedId: column.text({ optional: true }), // ID of related note/thread (optional)
    createdAt: column.date(),
    metadata: column.text({ optional: true }), // JSON string for additional data (e.g., daily caps)
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
    targetAudience: column.text(), // 'all_new_users' | 'all_users' | 'specific_users'
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

// https://astro.build/db/config
export default defineDb({
  tables: {
    Spaces,
    Threads,
    Notes,
    NoteThreads,
    Comments,
    Members,
    UserMetadata,
    UserXP,
    Tags,
    NoteTags,
    ScriptureMetadata,
    InboxItems,
    InboxItemNotes,
    UserInboxItems
  }
});
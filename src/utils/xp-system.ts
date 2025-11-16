import { db, UserXP, Notes, Threads, eq, and, gte, desc } from 'astro:db';

// XP values for different activities
export const XP_VALUES = {
  THREAD_CREATED: 10,
  NOTE_CREATED: 10,
  SCRIPTURE_NOTE_CREATED: 3,
  NOTE_OPENED: 1,
  FIRST_NOTE_DAILY_BONUS: 5,
} as const;

// Daily caps to prevent gaming
export const DAILY_CAPS = {
  NOTE_OPENED: 50, // Max 50 XP per day from opening notes
} as const;

// Minimum content length requirements
export const MIN_CONTENT_LENGTHS = {
  NOTE: 10, // Minimum 10 characters for notes
  THREAD: 3, // Minimum 3 characters for threads
} as const;

// Rate limits to prevent spam
export const RATE_LIMITS = {
  THREADS_PER_HOUR: 5, // Max 5 threads per hour
  NOTES_PER_HOUR: 20, // Max 20 notes per hour
} as const;

// Quick deletion window (2 minutes)
export const QUICK_DELETION_WINDOW_MS = 2 * 60 * 1000;

// Activity types
export const ACTIVITY_TYPES = {
  THREAD_CREATED: 'thread_created',
  NOTE_CREATED: 'note_created',
  NOTE_OPENED: 'note_opened',
  FIRST_NOTE_DAILY_BONUS: 'first_note_daily',
} as const;

/**
 * Check if content meets minimum length requirements
 */
export function checkContentLength(content: string, type: 'note' | 'thread'): boolean {
  const minLength = type === 'note' ? MIN_CONTENT_LENGTHS.NOTE : MIN_CONTENT_LENGTHS.THREAD;
  return content.trim().length >= minLength;
}

/**
 * Check if user has exceeded rate limits
 */
export async function checkRateLimit(
  userId: string, 
  activityType: 'thread_created' | 'note_created',
  excludeScriptureNotes: boolean = false
): Promise<boolean> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // Get all XP records for this activity type in the last hour
    const recentXP = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, activityType),
        gte(UserXP.createdAt, oneHourAgo)
      ));
    
    // If excluding scripture notes, filter them out
    let count = recentXP.length;
    if (excludeScriptureNotes && activityType === 'note_created') {
      // Filter out scripture notes by checking metadata
      count = recentXP.filter(record => {
        if (!record.metadata) return true; // Include if no metadata (assume not scripture)
        try {
          const metadata = JSON.parse(record.metadata);
          return !metadata.isScriptureNote;
        } catch {
          return true; // Include if metadata parse fails
        }
      }).length;
    }
    
    const limit = activityType === 'thread_created' 
      ? RATE_LIMITS.THREADS_PER_HOUR 
      : RATE_LIMITS.NOTES_PER_HOUR;
    
    return count < limit;
  } catch (error) {
    console.error('Error checking rate limit:', error);
    return true; // Allow if check fails (fail open)
  }
}

/**
 * Revoke XP for items deleted within quick deletion window
 */
export async function revokeXPOnDeletion(
  userId: string,
  relatedId: string,
  itemCreatedAt: Date
): Promise<number> {
  try {
    const now = new Date();
    const timeDiff = now.getTime() - itemCreatedAt.getTime();
    
    // Only revoke if deleted within quick deletion window
    if (timeDiff > QUICK_DELETION_WINDOW_MS) {
      return 0; // Not within window, don't revoke
    }
    
    // Find all XP records for this item
    const xpRecords = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.relatedId, relatedId)
      ));
    
    let revokedAmount = 0;
    for (const record of xpRecords) {
      revokedAmount += record.xpAmount;
      await db.delete(UserXP).where(eq(UserXP.id, record.id));
    }
    
    if (revokedAmount > 0) {
      console.log(`Revoked ${revokedAmount} XP for quick deletion (${timeDiff}ms): ${relatedId}`);
    }
    
    return revokedAmount;
  } catch (error) {
    console.error('Error revoking XP on deletion:', error);
    return 0;
  }
}

/**
 * Revoke all XP for a deleted item (regardless of deletion time)
 */
export async function revokeAllXPForItem(
  userId: string,
  relatedId: string
): Promise<number> {
  try {
    // Find all XP records for this item
    const xpRecords = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.relatedId, relatedId)
      ));
    
    let revokedAmount = 0;
    for (const record of xpRecords) {
      revokedAmount += record.xpAmount;
      await db.delete(UserXP).where(eq(UserXP.id, record.id));
    }
    
    if (revokedAmount > 0) {
      console.log(`Revoked ${revokedAmount} XP for deleted item: ${relatedId}`);
    }
    
    return revokedAmount;
  } catch (error) {
    console.error('Error revoking all XP for item:', error);
    return 0;
  }
}

/**
 * Award XP for creating a new thread
 */
export async function awardThreadCreatedXP(
  userId: string, 
  threadId: string, 
  title?: string,
  subtitle?: string | null
): Promise<void> {
  try {
    // Check if XP has already been awarded for this thread
    const existingXP = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.THREAD_CREATED),
        eq(UserXP.relatedId, threadId)
      ))
      .limit(1);
    
    if (existingXP.length > 0) {
      console.log(`XP already awarded for thread creation: ${threadId}`);
      return;
    }
    
    // Check content length if title provided
    if (title && !checkContentLength(title, 'thread')) {
      console.log(`Thread title too short for XP: ${threadId}`);
      return;
    }
    
    // Check rate limit
    const withinRateLimit = await checkRateLimit(userId, 'thread_created', false);
    if (!withinRateLimit) {
      console.log(`Rate limit exceeded for thread creation: ${threadId}`);
      return;
    }
    
    // Store metadata
    const metadata = JSON.stringify({
      contentLength: title?.length || 0,
    });
    
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType: ACTIVITY_TYPES.THREAD_CREATED,
      xpAmount: XP_VALUES.THREAD_CREATED,
      relatedId: threadId,
      metadata,
      createdAt: new Date(),
    });
    console.log(`Awarded ${XP_VALUES.THREAD_CREATED} XP for thread creation: ${threadId}`);
  } catch (error) {
    console.error('Error awarding thread creation XP:', error);
  }
}

/**
 * Award XP for creating a new note
 */
export async function awardNoteCreatedXP(
  userId: string, 
  noteId: string, 
  isScriptureNote: boolean = false,
  content?: string
): Promise<void> {
  try {
    // Check if XP has already been awarded for this note
    const existingXP = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.NOTE_CREATED),
        eq(UserXP.relatedId, noteId)
      ))
      .limit(1);
    
    if (existingXP.length > 0) {
      console.log(`XP already awarded for note creation: ${noteId}`);
      return;
    }
    
    // Check content length (skip for scripture notes)
    if (!isScriptureNote && content && !checkContentLength(content, 'note')) {
      console.log(`Note content too short for XP: ${noteId}`);
      return;
    }
    
    // Check rate limit (skip for scripture notes)
    if (!isScriptureNote) {
      const withinRateLimit = await checkRateLimit(userId, 'note_created', true);
      if (!withinRateLimit) {
        console.log(`Rate limit exceeded for note creation: ${noteId}`);
        return;
      }
    }
    
    // Determine XP amount based on note type
    const xpAmount = isScriptureNote ? XP_VALUES.SCRIPTURE_NOTE_CREATED : XP_VALUES.NOTE_CREATED;
    
    // Check if this is the first note of the day for bonus XP (only for non-scripture notes)
    let isFirstNoteToday = false;
    if (!isScriptureNote) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayNotes = await db.select()
        .from(Notes)
        .where(and(
          eq(Notes.userId, userId),
          gte(Notes.createdAt, today)
        ))
        .limit(1);
      
      isFirstNoteToday = todayNotes.length === 0;
    }
    
    // Store metadata
    const metadata = JSON.stringify({
      isScriptureNote,
      contentLength: content?.length || 0,
    });
    
    // Award base XP for note creation
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType: ACTIVITY_TYPES.NOTE_CREATED,
      xpAmount,
      relatedId: noteId,
      metadata,
      createdAt: new Date(),
    });
    
    // Award bonus XP if this is the first note of the day (non-scripture only)
    if (isFirstNoteToday) {
      // Check if bonus XP has already been awarded for this note
      const existingBonusXP = await db.select()
        .from(UserXP)
        .where(and(
          eq(UserXP.userId, userId),
          eq(UserXP.activityType, ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS),
          eq(UserXP.relatedId, noteId)
        ))
        .limit(1);
      
      if (existingBonusXP.length === 0) {
        await db.insert(UserXP).values({
          id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_bonus`,
          userId,
          activityType: ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS,
          xpAmount: XP_VALUES.FIRST_NOTE_DAILY_BONUS,
          relatedId: noteId,
          createdAt: new Date(),
        });
        console.log(`Awarded ${xpAmount + XP_VALUES.FIRST_NOTE_DAILY_BONUS} XP for first note of day: ${noteId}`);
      } else {
        console.log(`Awarded ${xpAmount} XP for note creation: ${noteId} (bonus already awarded)`);
      }
    } else {
      console.log(`Awarded ${xpAmount} XP for note creation: ${noteId}${isScriptureNote ? ' (scripture)' : ''}`);
    }
  } catch (error) {
    console.error('Error awarding note creation XP:', error);
  }
}

/**
 * Award XP for opening a note (with daily cap and cooldown)
 */
export async function awardNoteOpenedXP(userId: string, noteId: string): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if XP has already been awarded for this note today (cooldown)
    const existingXPForNote = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.NOTE_OPENED),
        eq(UserXP.relatedId, noteId),
        gte(UserXP.createdAt, today)
      ))
      .limit(1);
    
    if (existingXPForNote.length > 0) {
      console.log(`XP already awarded for opening note today: ${noteId}`);
      return;
    }
    
    // Check daily cap for note opening XP
    const todayNoteOpenedXP = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.NOTE_OPENED),
        gte(UserXP.createdAt, today)
      ));
    
    const todayXPFromNoteOpened = todayNoteOpenedXP.reduce((sum, record) => sum + record.xpAmount, 0);
    
    // Check if we've hit the daily cap
    if (todayXPFromNoteOpened >= DAILY_CAPS.NOTE_OPENED) {
      console.log(`Daily cap reached for note opening XP (${DAILY_CAPS.NOTE_OPENED})`);
      return;
    }
    
    // Award XP (but not more than the daily cap)
    const xpToAward = Math.min(XP_VALUES.NOTE_OPENED, DAILY_CAPS.NOTE_OPENED - todayXPFromNoteOpened);
    
    if (xpToAward > 0) {
      await db.insert(UserXP).values({
        id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        activityType: ACTIVITY_TYPES.NOTE_OPENED,
        xpAmount: xpToAward,
        relatedId: noteId,
        createdAt: new Date(),
      });
      console.log(`Awarded ${xpToAward} XP for note opening: ${noteId}`);
    }
  } catch (error) {
    console.error('Error awarding note opening XP:', error);
  }
}

/**
 * Calculate total XP for a user
 */
export async function calculateTotalXP(userId: string): Promise<number> {
  try {
    const xpRecords = await db.select()
      .from(UserXP)
      .where(eq(UserXP.userId, userId));
    
    const totalXP = xpRecords.reduce((sum, record) => sum + record.xpAmount, 0);
    return totalXP;
  } catch (error) {
    console.error('Error calculating total XP:', error);
    return 0;
  }
}

/**
 * Get XP breakdown for a user (for debugging/display purposes)
 */
export async function getXPBreakdown(userId: string): Promise<{
  totalXP: number;
  breakdown: {
    threadCreated: number;
    noteCreated: number;
    noteOpened: number;
    firstNoteDailyBonus: number;
  };
}> {
  try {
    const xpRecords = await db.select()
      .from(UserXP)
      .where(eq(UserXP.userId, userId));
    
    const breakdown = {
      threadCreated: 0,
      noteCreated: 0,
      noteOpened: 0,
      firstNoteDailyBonus: 0,
    };
    
    xpRecords.forEach(record => {
      switch (record.activityType) {
        case ACTIVITY_TYPES.THREAD_CREATED:
          breakdown.threadCreated += record.xpAmount;
          break;
        case ACTIVITY_TYPES.NOTE_CREATED:
          breakdown.noteCreated += record.xpAmount;
          break;
        case ACTIVITY_TYPES.NOTE_OPENED:
          breakdown.noteOpened += record.xpAmount;
          break;
        case ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS:
          breakdown.firstNoteDailyBonus += record.xpAmount;
          break;
      }
    });
    
    const totalXP = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    
    return {
      totalXP,
      breakdown,
    };
  } catch (error) {
    console.error('Error getting XP breakdown:', error);
    return {
      totalXP: 0,
      breakdown: {
        threadCreated: 0,
        noteCreated: 0,
        noteOpened: 0,
        firstNoteDailyBonus: 0,
      },
    };
  }
}

/**
 * Check if XP has already been awarded for a specific activity
 */
export async function hasXPBeenAwarded(userId: string, activityType: string, relatedId: string): Promise<boolean> {
  try {
    const existingXP = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, activityType),
        eq(UserXP.relatedId, relatedId)
      ))
      .limit(1);
    
    return existingXP.length > 0;
  } catch (error) {
    console.error('Error checking if XP has been awarded:', error);
    return false; // Assume not awarded if there's an error
  }
}

/**
 * Clean up duplicate XP records (keeps the first one, removes duplicates)
 * This is a utility function to fix any existing duplicates
 */
export async function cleanupDuplicateXP(userId: string): Promise<{ removed: number; total: number }> {
  try {
    console.log(`Starting duplicate XP cleanup for user: ${userId}`);
    
    // Get all XP records for the user
    const allXP = await db.select()
      .from(UserXP)
      .where(eq(UserXP.userId, userId));
    
    // Group by activity type and related ID to find duplicates
    const groupedXP = allXP.reduce((acc, record) => {
      const key = `${record.activityType}_${record.relatedId}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(record);
      return acc;
    }, {} as Record<string, typeof allXP>);
    
    let removedCount = 0;
    const totalCount = allXP.length;
    
    // Remove duplicates (keep the first one, remove the rest)
    for (const [key, records] of Object.entries(groupedXP)) {
      if (records.length > 1) {
        // Sort by createdAt to keep the oldest record
        const sortedRecords = records.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const toRemove = sortedRecords.slice(1); // Remove all but the first
        
        for (const record of toRemove) {
          await db.delete(UserXP).where(eq(UserXP.id, record.id));
          removedCount++;
        }
        
        console.log(`Removed ${toRemove.length} duplicate XP records for ${key}`);
      }
    }
    
    console.log(`Duplicate XP cleanup completed. Removed ${removedCount} duplicates out of ${totalCount} total records.`);
    return { removed: removedCount, total: totalCount };
  } catch (error) {
    console.error('Error during duplicate XP cleanup:', error);
    return { removed: 0, total: 0 };
  }
}

/**
 * Retroactively calculate XP for existing user data
 * This function can be used to backfill XP for users who existed before the XP system
 * It uses the duplicate-safe award functions to prevent double-awarding XP
 */
export async function backfillUserXP(userId: string): Promise<void> {
  try {
    console.log(`Starting XP backfill for user: ${userId}`);
    
    // First, clean up any existing duplicates
    const cleanupResult = await cleanupDuplicateXP(userId);
    if (cleanupResult.removed > 0) {
      console.log(`Cleaned up ${cleanupResult.removed} duplicate XP records before backfill`);
    }
    
    // Get all threads created by user
    const userThreads = await db.select()
      .from(Threads)
      .where(eq(Threads.userId, userId));
    
    // Get all notes created by user
    const userNotes = await db.select()
      .from(Notes)
      .where(eq(Notes.userId, userId));
    
    console.log(`Found ${userThreads.length} threads and ${userNotes.length} notes for backfill`);
    
    // Award XP for existing threads (using duplicate-safe function)
    let threadsProcessed = 0;
    for (const thread of userThreads) {
      await awardThreadCreatedXP(userId, thread.id, thread.title, thread.subtitle || null);
      threadsProcessed++;
    }
    console.log(`Processed ${threadsProcessed} threads for XP backfill`);
    
    // Award XP for existing notes (using duplicate-safe function)
    let notesProcessed = 0;
    for (const note of userNotes) {
      const isScriptureNote = note.noteType === 'scripture';
      await awardNoteCreatedXP(userId, note.id, isScriptureNote, note.content || '');
      notesProcessed++;
    }
    console.log(`Processed ${notesProcessed} notes for XP backfill`);
    
    console.log(`XP backfill completed for user: ${userId}`);
  } catch (error) {
    console.error('Error during XP backfill:', error);
  }
}

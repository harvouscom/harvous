import { db, UserXP, Notes, Threads, eq, and, gte, desc } from 'astro:db';

// XP values for different activities
export const XP_VALUES = {
  THREAD_CREATED: 10,
  NOTE_CREATED: 10,
  NOTE_OPENED: 1,
  FIRST_NOTE_DAILY_BONUS: 5,
} as const;

// Daily caps to prevent gaming
export const DAILY_CAPS = {
  NOTE_OPENED: 50, // Max 50 XP per day from opening notes
} as const;

// Activity types
export const ACTIVITY_TYPES = {
  THREAD_CREATED: 'thread_created',
  NOTE_CREATED: 'note_created',
  NOTE_OPENED: 'note_opened',
  FIRST_NOTE_DAILY_BONUS: 'first_note_daily',
} as const;

/**
 * Award XP for creating a new thread
 */
export async function awardThreadCreatedXP(userId: string, threadId: string): Promise<void> {
  try {
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType: ACTIVITY_TYPES.THREAD_CREATED,
      xpAmount: XP_VALUES.THREAD_CREATED,
      relatedId: threadId,
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
export async function awardNoteCreatedXP(userId: string, noteId: string): Promise<void> {
  try {
    // Check if this is the first note of the day for bonus XP
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayNotes = await db.select()
      .from(Notes)
      .where(and(
        eq(Notes.userId, userId),
        gte(Notes.createdAt, today)
      ))
      .limit(1);
    
    const isFirstNoteToday = todayNotes.length === 0;
    
    // Award base XP for note creation
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType: ACTIVITY_TYPES.NOTE_CREATED,
      xpAmount: XP_VALUES.NOTE_CREATED,
      relatedId: noteId,
      createdAt: new Date(),
    });
    
    // Award bonus XP if this is the first note of the day
    if (isFirstNoteToday) {
      await db.insert(UserXP).values({
        id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_bonus`,
        userId,
        activityType: ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS,
        xpAmount: XP_VALUES.FIRST_NOTE_DAILY_BONUS,
        relatedId: noteId,
        createdAt: new Date(),
      });
      console.log(`Awarded ${XP_VALUES.NOTE_CREATED + XP_VALUES.FIRST_NOTE_DAILY_BONUS} XP for first note of day: ${noteId}`);
    } else {
      console.log(`Awarded ${XP_VALUES.NOTE_CREATED} XP for note creation: ${noteId}`);
    }
  } catch (error) {
    console.error('Error awarding note creation XP:', error);
  }
}

/**
 * Award XP for opening a note (with daily cap)
 */
export async function awardNoteOpenedXP(userId: string, noteId: string): Promise<void> {
  try {
    // Check daily cap for note opening XP
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
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
 * Retroactively calculate XP for existing user data
 * This function can be used to backfill XP for users who existed before the XP system
 */
export async function backfillUserXP(userId: string): Promise<void> {
  try {
    console.log(`Starting XP backfill for user: ${userId}`);
    
    // Get all threads created by user
    const userThreads = await db.select()
      .from(Threads)
      .where(eq(Threads.userId, userId));
    
    // Get all notes created by user
    const userNotes = await db.select()
      .from(Notes)
      .where(eq(Notes.userId, userId));
    
    // Award XP for existing threads
    for (const thread of userThreads) {
      await awardThreadCreatedXP(userId, thread.id);
    }
    
    // Award XP for existing notes (with first note of day bonus logic)
    const notesByDate = userNotes.reduce((acc, note) => {
      const dateKey = note.createdAt.toISOString().split('T')[0];
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(note);
      return acc;
    }, {} as Record<string, typeof userNotes>);
    
    for (const [dateKey, notes] of Object.entries(notesByDate)) {
      // Sort notes by creation time for the day
      const sortedNotes = notes.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      for (let i = 0; i < sortedNotes.length; i++) {
        const note = sortedNotes[i];
        const isFirstNoteOfDay = i === 0;
        
        // Award base XP for note creation
        await db.insert(UserXP).values({
          id: `xp_backfill_${note.id}_${Date.now()}`,
          userId,
          activityType: ACTIVITY_TYPES.NOTE_CREATED,
          xpAmount: XP_VALUES.NOTE_CREATED,
          relatedId: note.id,
          createdAt: new Date(),
        });
        
        // Award bonus XP if this was the first note of the day
        if (isFirstNoteOfDay) {
          await db.insert(UserXP).values({
            id: `xp_backfill_${note.id}_bonus_${Date.now()}`,
            userId,
            activityType: ACTIVITY_TYPES.FIRST_NOTE_DAILY_BONUS,
            xpAmount: XP_VALUES.FIRST_NOTE_DAILY_BONUS,
            relatedId: note.id,
            createdAt: new Date(),
          });
        }
      }
    }
    
    console.log(`XP backfill completed for user: ${userId}`);
  } catch (error) {
    console.error('Error during XP backfill:', error);
  }
}

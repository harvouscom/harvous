import { db, UserXP, UserSeasonalXP, UserLifetimeXP, WeeklyStreaks, UserMetadata, Notes, Threads, eq, and, gte, desc } from 'astro:db';
import { getCurrentSeason } from './season-helpers';

// XP values for different activities
export const XP_VALUES = {
  SESSION_BASE: 15,
  SESSION_MAX: 40,
  CREATION_BONUS: 5,
  CHURCH_ADDED: 50,
  MONTHLY_ATTENDANCE: 25,
  WEEKLY_STREAK_3_4_DAYS: 15,
  WEEKLY_STREAK_5_6_DAYS: 25,
  WEEKLY_STREAK_7_DAYS: 35,
  // Legacy values (kept for backward compatibility)
  THREAD_CREATED: 10,
  NOTE_CREATED: 10,
  SCRIPTURE_NOTE_CREATED: 3,
  NOTE_OPENED: 1,
  FIRST_NOTE_DAILY_BONUS: 5,
} as const;

// Daily caps to prevent gaming
export const DAILY_CAPS = {
  SESSIONS: 3, // Max 3 sessions per day
  CREATION_BONUS: 20, // Max 20 XP/day from creation bonuses
  // Legacy caps
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
  SESSION_COMPLETED: 'session_completed',
  CREATION_BONUS: 'creation_bonus',
  CHURCH_ADDED: 'church_added',
  MONTHLY_ATTENDANCE: 'monthly_attendance',
  WEEKLY_STREAK: 'weekly_streak',
  // Legacy activity types (kept for backward compatibility)
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
    
    // XP revoked silently
    
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
    
    // XP revoked silently
    
    return revokedAmount;
  } catch (error) {
    console.error('Error revoking all XP for item:', error);
    return 0;
  }
}

// ============================================================================
// NEW SESSION-BASED XP SYSTEM FUNCTIONS
// ============================================================================

/**
 * Core function to award XP (records to both lifetime and seasonal)
 */
export async function awardXP(
  userId: string,
  activityType: string,
  xpAmount: number,
  relatedId?: string,
  metadata?: any
): Promise<void> {
  try {
    const season = getCurrentSeason();
    const now = new Date();

    // Insert into UserXP (detailed record)
    await db.insert(UserXP).values({
      id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      activityType,
      xpAmount,
      relatedId: relatedId || null,
      season,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: now,
    });

    // Update seasonal XP aggregate
    await updateSeasonalXP(userId, season, xpAmount);

    // Update lifetime XP aggregate
    await updateLifetimeXP(userId, xpAmount);
  } catch (error) {
    console.error('Error awarding XP:', error);
  }
}

/**
 * Update seasonal XP aggregate
 */
async function updateSeasonalXP(
  userId: string,
  season: string,
  xpAmount: number
): Promise<void> {
  try {
    const existing = await db.select()
      .from(UserSeasonalXP)
      .where(and(
        eq(UserSeasonalXP.userId, userId),
        eq(UserSeasonalXP.season, season)
      ))
      .limit(1);

    if (existing.length > 0) {
      await db.update(UserSeasonalXP)
        .set({
          totalXP: existing[0].totalXP + xpAmount,
          sessionCount: existing[0].sessionCount + (xpAmount > 0 && existing[0].sessionCount !== undefined ? 1 : 0),
          updatedAt: new Date(),
        })
        .where(eq(UserSeasonalXP.id, existing[0].id));
    } else {
      await db.insert(UserSeasonalXP).values({
        id: `seasonal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        season,
        totalXP: xpAmount,
        sessionCount: 0,
        createdAt: new Date(),
      });
    }
  } catch (error) {
    console.error('Error updating seasonal XP:', error);
  }
}

/**
 * Update lifetime XP aggregate
 */
async function updateLifetimeXP(
  userId: string,
  xpAmount: number
): Promise<void> {
  try {
    const existing = await db.select()
      .from(UserLifetimeXP)
      .where(eq(UserLifetimeXP.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      await db.update(UserLifetimeXP)
        .set({
          totalXP: existing[0].totalXP + xpAmount,
          lastUpdated: new Date(),
        })
        .where(eq(UserLifetimeXP.id, existing[0].id));
    } else {
      await db.insert(UserLifetimeXP).values({
        id: `lifetime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        totalXP: xpAmount,
        lastUpdated: new Date(),
      });
    }
  } catch (error) {
    console.error('Error updating lifetime XP:', error);
  }
}

/**
 * Get seasonal XP for current season (or specified season)
 */
export async function getSeasonalXP(userId: string, season?: string): Promise<number> {
  try {
    const currentSeason = season || getCurrentSeason();
    
    const seasonal = await db.select()
      .from(UserSeasonalXP)
      .where(and(
        eq(UserSeasonalXP.userId, userId),
        eq(UserSeasonalXP.season, currentSeason)
      ))
      .limit(1);

    return seasonal.length > 0 ? seasonal[0].totalXP : 0;
  } catch (error) {
    console.error('Error getting seasonal XP:', error);
    return 0;
  }
}

/**
 * Get lifetime XP total
 */
export async function getLifetimeXP(userId: string): Promise<number> {
  try {
    const lifetime = await db.select()
      .from(UserLifetimeXP)
      .where(eq(UserLifetimeXP.userId, userId))
      .limit(1);

    return lifetime.length > 0 ? lifetime[0].totalXP : 0;
  } catch (error) {
    console.error('Error getting lifetime XP:', error);
    return 0;
  }
}

/**
 * Check if season has changed and needs reset
 */
export async function checkSeasonChange(userId: string): Promise<boolean> {
  try {
    const currentSeason = getCurrentSeason();
    
    const userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1);

    if (userMetadata.length === 0) {
      // First time, set current season
      await db.update(UserMetadata)
        .set({ currentSeason: currentSeason })
        .where(eq(UserMetadata.userId, userId));
      return false;
    }

    const storedSeason = userMetadata[0].currentSeason;
    
    if (storedSeason !== currentSeason) {
      // Season changed! Update stored season
      await db.update(UserMetadata)
        .set({ currentSeason: currentSeason })
        .where(eq(UserMetadata.userId, userId));
      return true; // Season changed
    }

    return false; // Same season
  } catch (error) {
    console.error('Error checking season change:', error);
    return false;
  }
}

/**
 * Award XP for completing a session
 */
export async function awardSessionXP(
  userId: string,
  sessionXP: number
): Promise<boolean> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check daily session count
    const todaySessions = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.SESSION_COMPLETED),
        gte(UserXP.createdAt, today)
      ));
    
    if (todaySessions.length >= DAILY_CAPS.SESSIONS) {
      return false; // Already hit daily cap
    }

    await awardXP(
      userId,
      ACTIVITY_TYPES.SESSION_COMPLETED,
      sessionXP,
      null,
      { sessionNumber: todaySessions.length + 1 }
    );

    return true;
  } catch (error) {
    console.error('Error awarding session XP:', error);
    return false;
  }
}

/**
 * Award creation bonus XP
 */
export async function awardCreationBonusXP(
  userId: string,
  itemType: 'note' | 'thread' | 'space'
): Promise<boolean> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check daily creation bonus cap
    const todayCreationXP = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.CREATION_BONUS),
        gte(UserXP.createdAt, today)
      ));

    const todayTotal = todayCreationXP.reduce((sum, r) => sum + r.xpAmount, 0);
    if (todayTotal >= DAILY_CAPS.CREATION_BONUS) {
      return false; // Already hit daily cap
    }

    const xpToAward = Math.min(
      XP_VALUES.CREATION_BONUS,
      DAILY_CAPS.CREATION_BONUS - todayTotal
    );

    if (xpToAward > 0) {
      await awardXP(
        userId,
        ACTIVITY_TYPES.CREATION_BONUS,
        xpToAward,
        null,
        { itemType }
      );
    }

    return xpToAward > 0;
  } catch (error) {
    console.error('Error awarding creation bonus XP:', error);
    return false;
  }
}

/**
 * Award church addition bonus (one-time)
 */
export async function awardChurchAddedXP(userId: string): Promise<boolean> {
  try {
    // Check if already awarded
    const existing = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.CHURCH_ADDED)
      ))
      .limit(1);

    if (existing.length > 0) {
      return false; // Already awarded
    }

    await awardXP(
      userId,
      ACTIVITY_TYPES.CHURCH_ADDED,
      XP_VALUES.CHURCH_ADDED,
      null,
      null
    );

    return true;
  } catch (error) {
    console.error('Error awarding church addition XP:', error);
    return false;
  }
}

/**
 * Award monthly attendance XP (first visit of the month)
 */
export async function awardMonthlyAttendanceXP(userId: string): Promise<boolean> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Check if already awarded this month
    const existing = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.MONTHLY_ATTENDANCE),
        gte(UserXP.createdAt, startOfMonth)
      ))
      .limit(1);

    if (existing.length > 0) {
      return false; // Already awarded this month
    }

    await awardXP(
      userId,
      ACTIVITY_TYPES.MONTHLY_ATTENDANCE,
      XP_VALUES.MONTHLY_ATTENDANCE,
      null,
      {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      }
    );

    // Update UserMetadata.lastMonthlyVisit
    await db.update(UserMetadata)
      .set({ lastMonthlyVisit: now })
      .where(eq(UserMetadata.userId, userId));

    return true;
  } catch (error) {
    console.error('Error awarding monthly attendance XP:', error);
    return false;
  }
}

/**
 * Get week start date (Monday of the week)
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Calculate and award weekly streak XP
 */
export async function calculateAndAwardWeeklyStreak(userId: string): Promise<number> {
  try {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

    // Check if already calculated for this week
    const existing = await db.select()
      .from(WeeklyStreaks)
      .where(and(
        eq(WeeklyStreaks.userId, userId),
        eq(WeeklyStreaks.weekStart, weekStart)
      ))
      .limit(1);

    if (existing.length > 0 && existing[0].xpAwarded > 0) {
      return existing[0].xpAwarded; // Already awarded
    }

    // Count days with sessions this week
    const weekSessions = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, userId),
        eq(UserXP.activityType, ACTIVITY_TYPES.SESSION_COMPLETED),
        gte(UserXP.createdAt, weekStart)
      ));

    // Group by day
    const daysWithSessions = new Set<string>();
    weekSessions.forEach(session => {
      const day = session.createdAt.toISOString().split('T')[0];
      daysWithSessions.add(day);
    });

    const dayCount = daysWithSessions.size;

    // Determine XP based on days
    let streakXP = 0;
    if (dayCount >= 7) {
      streakXP = XP_VALUES.WEEKLY_STREAK_7_DAYS;
    } else if (dayCount >= 5) {
      streakXP = XP_VALUES.WEEKLY_STREAK_5_6_DAYS;
    } else if (dayCount >= 3) {
      streakXP = XP_VALUES.WEEKLY_STREAK_3_4_DAYS;
    }

    // Award XP if eligible
    if (streakXP > 0) {
      await awardXP(
        userId,
        ACTIVITY_TYPES.WEEKLY_STREAK,
        streakXP,
        null,
        {
          weekStart: weekStart.toISOString(),
          daysWithSessions: dayCount,
        }
      );
    }

    // Update or create WeeklyStreaks record
    if (existing.length > 0) {
      await db.update(WeeklyStreaks)
        .set({
          daysWithSessions: dayCount,
          xpAwarded: streakXP,
          updatedAt: new Date(),
        })
        .where(eq(WeeklyStreaks.id, existing[0].id));
    } else {
      await db.insert(WeeklyStreaks).values({
        id: `streak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        weekStart,
        daysWithSessions: dayCount,
        xpAwarded: streakXP,
        createdAt: new Date(),
      });
    }

    return streakXP;
  } catch (error) {
    console.error('Error calculating weekly streak:', error);
    return 0;
  }
}

/**
 * Check lifetime milestones
 */
export async function checkLifetimeMilestones(userId: string): Promise<string[]> {
  try {
    const lifetimeXP = await getLifetimeXP(userId);
    const milestones: string[] = [];

    // Milestone thresholds
    if (lifetimeXP >= 100) milestones.push('first_hundred');
    if (lifetimeXP >= 500) milestones.push('five_hundred');
    if (lifetimeXP >= 1000) milestones.push('thousand');
    if (lifetimeXP >= 5000) milestones.push('five_thousand');
    if (lifetimeXP >= 10000) milestones.push('ten_thousand');
    if (lifetimeXP >= 25000) milestones.push('twenty_five_thousand');
    if (lifetimeXP >= 50000) milestones.push('fifty_thousand');

    return milestones;
  } catch (error) {
    console.error('Error checking lifetime milestones:', error);
    return [];
  }
}

// ============================================================================
// LEGACY FUNCTIONS (kept for backward compatibility)
// ============================================================================

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
      return;
    }
    
    // Check content length if title provided
    if (title && !checkContentLength(title, 'thread')) {
      return;
    }
    
    // Check rate limit
    const withinRateLimit = await checkRateLimit(userId, 'thread_created', false);
    if (!withinRateLimit) {
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
      return;
    }
    
    // Check content length (skip for scripture notes)
    if (!isScriptureNote && content && !checkContentLength(content, 'note')) {
      return;
    }
    
    // Check rate limit (skip for scripture notes)
    if (!isScriptureNote) {
      const withinRateLimit = await checkRateLimit(userId, 'note_created', true);
      if (!withinRateLimit) {
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
      }
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
    }
  } catch (error) {
    console.error('Error awarding note opening XP:', error);
  }
}

/**
 * Calculate total XP for a user (DEPRECATED: Use getLifetimeXP instead)
 * Kept for backward compatibility
 */
export async function calculateTotalXP(userId: string): Promise<number> {
  try {
    // Try to use lifetime aggregate first (faster)
    const lifetimeXP = await getLifetimeXP(userId);
    if (lifetimeXP > 0) {
      return lifetimeXP;
    }
    
    // Fallback: calculate from UserXP records (for migration period)
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
    sessionCompleted: number;
    creationBonus: number;
    churchAdded: number;
    monthlyAttendance: number;
    weeklyStreak: number;
    // Legacy activity types
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
      sessionCompleted: 0,
      creationBonus: 0,
      churchAdded: 0,
      monthlyAttendance: 0,
      weeklyStreak: 0,
      // Legacy
      threadCreated: 0,
      noteCreated: 0,
      noteOpened: 0,
      firstNoteDailyBonus: 0,
    };
    
    xpRecords.forEach(record => {
      switch (record.activityType) {
        case ACTIVITY_TYPES.SESSION_COMPLETED:
          breakdown.sessionCompleted += record.xpAmount;
          break;
        case ACTIVITY_TYPES.CREATION_BONUS:
          breakdown.creationBonus += record.xpAmount;
          break;
        case ACTIVITY_TYPES.CHURCH_ADDED:
          breakdown.churchAdded += record.xpAmount;
          break;
        case ACTIVITY_TYPES.MONTHLY_ATTENDANCE:
          breakdown.monthlyAttendance += record.xpAmount;
          break;
        case ACTIVITY_TYPES.WEEKLY_STREAK:
          breakdown.weeklyStreak += record.xpAmount;
          break;
        // Legacy activity types
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
        sessionCompleted: 0,
        creationBonus: 0,
        churchAdded: 0,
        monthlyAttendance: 0,
        weeklyStreak: 0,
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
      }
    }
    
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
    // First, clean up any existing duplicates
    await cleanupDuplicateXP(userId);
    
    // Get all threads created by user
    const userThreads = await db.select()
      .from(Threads)
      .where(eq(Threads.userId, userId));
    
    // Get all notes created by user
    const userNotes = await db.select()
      .from(Notes)
      .where(eq(Notes.userId, userId));
    
    // Award XP for existing threads (using duplicate-safe function)
    for (const thread of userThreads) {
      await awardThreadCreatedXP(userId, thread.id, thread.title, thread.subtitle || null);
    }
    
    // Award XP for existing notes (using duplicate-safe function)
    for (const note of userNotes) {
      const isScriptureNote = note.noteType === 'scripture';
      await awardNoteCreatedXP(userId, note.id, isScriptureNote, note.content || '');
    }
  } catch (error) {
    console.error('Error during XP backfill:', error);
  }
}

import { db, UserXP, eq, and, gte } from 'astro:db';

export interface SessionActivity {
  actionType: 'note_opened' | 'thread_opened' | 'space_opened' | 'note_edited' | 'content_created';
  timestamp: Date;
  relatedId?: string;
}

export interface SessionData {
  userId: string;
  startTime: Date;
  activities: SessionActivity[];
  lastActivityTime: Date;
}

// In-memory session storage (or use database for persistence)
const activeSessions = new Map<string, SessionData>();

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MIN_SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes minimum
const MIN_ACTIVITY_COUNT = 2; // At least 2 different action types

/**
 * Start a new session for a user
 */
export function startSession(userId: string): void {
  activeSessions.set(userId, {
    userId,
    startTime: new Date(),
    activities: [],
    lastActivityTime: new Date(),
  });
}

/**
 * Record an activity in the current session
 */
export function recordActivity(
  userId: string,
  actionType: SessionActivity['actionType'],
  relatedId?: string
): void {
  const session = activeSessions.get(userId);
  if (!session) {
    startSession(userId);
    return;
  }

  session.activities.push({
    actionType,
    timestamp: new Date(),
    relatedId,
  });
  session.lastActivityTime = new Date();
}

/**
 * End a session and return the session data
 */
export function endSession(userId: string): SessionData | null {
  const session = activeSessions.get(userId);
  if (!session) return null;

  activeSessions.delete(userId);
  return session;
}

/**
 * Check if a session is currently active (not timed out)
 */
export function isSessionActive(userId: string): boolean {
  const session = activeSessions.get(userId);
  if (!session) return false;

  const timeSinceLastActivity = Date.now() - session.lastActivityTime.getTime();
  return timeSinceLastActivity < SESSION_TIMEOUT_MS;
}

/**
 * Get session duration in milliseconds
 */
export function getSessionDuration(session: SessionData): number {
  return session.lastActivityTime.getTime() - session.startTime.getTime();
}

/**
 * Get unique activity types from a session
 */
export function getUniqueActivityTypes(session: SessionData): string[] {
  return [...new Set(session.activities.map(a => a.actionType))];
}

/**
 * Calculate XP for a completed session
 */
export function calculateSessionXP(session: SessionData): number {
  const duration = getSessionDuration(session);
  
  // Check minimum requirements
  if (duration < MIN_SESSION_DURATION_MS) return 0;
  if (getUniqueActivityTypes(session).length < MIN_ACTIVITY_COUNT) return 0;

  let xp = 15; // Base XP

  // Count activities
  const notesOpened = session.activities.filter(a => a.actionType === 'note_opened').length;
  const threadsOpened = session.activities.filter(a => a.actionType === 'thread_opened').length;
  const spacesOpened = session.activities.filter(a => a.actionType === 'space_opened').length;
  const notesEdited = session.activities.filter(a => a.actionType === 'note_edited').length;
  const contentCreated = session.activities.filter(a => a.actionType === 'content_created').length;

  // Activity bonuses
  if (notesOpened >= 3) xp += 5;
  if (threadsOpened >= 2) xp += 3;
  if (spacesOpened >= 1) xp += 2;
  if (notesEdited >= 1) xp += 5;
  if (contentCreated >= 1) xp += 10; // One-time per session

  return Math.min(xp, 40); // Cap at 40 XP per session
}

/**
 * Get count of completed sessions today for a user
 */
export async function getTodaySessionCount(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count completed sessions today from UserXP table
  const todaySessions = await db.select()
    .from(UserXP)
    .where(and(
      eq(UserXP.userId, userId),
      eq(UserXP.activityType, 'session_completed'),
      gte(UserXP.createdAt, today)
    ));

  return todaySessions.length;
}


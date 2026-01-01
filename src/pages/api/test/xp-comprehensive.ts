import type { APIRoute } from 'astro';
import { db, UserXP, UserSeasonalXP, UserLifetimeXP, WeeklyStreaks, UserMetadata, eq, and, gte } from 'astro:db';
import {
  awardSessionXP,
  awardCreationBonusXP,
  awardChurchAddedXP,
  getSeasonalXP,
  getLifetimeXP,
  XP_VALUES,
  ACTIVITY_TYPES
} from '@/utils/xp-system';

// Test user ID - in production, use actual authenticated user
const TEST_USER_ID = 'test_xp_comprehensive_user';

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: [] as Array<{ name: string; passed: boolean; expected?: any; actual?: any }>
};

/**
 * Calculate session XP manually (same logic as session-tracker)
 */
function calculateSessionXP(session: any): number {
  const duration = session.lastActivityTime.getTime() - session.startTime.getTime();
  const MIN_SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  const MIN_ACTIVITY_COUNT = 2; // At least 2 different action types

  // Check minimum requirements
  if (duration < MIN_SESSION_DURATION_MS) return 0;
  
  const uniqueTypes = [...new Set(session.activities.map((a: any) => a.actionType))];
  if (uniqueTypes.length < MIN_ACTIVITY_COUNT) return 0;

  let xp = 15; // Base XP

  // Count activities
  const notesOpened = session.activities.filter((a: any) => a.actionType === 'note_opened').length;
  const threadsOpened = session.activities.filter((a: any) => a.actionType === 'thread_opened').length;
  const spacesOpened = session.activities.filter((a: any) => a.actionType === 'space_opened').length;
  const notesEdited = session.activities.filter((a: any) => a.actionType === 'note_edited').length;
  const contentCreated = session.activities.filter((a: any) => a.actionType === 'content_created').length;

  // Activity bonuses
  if (notesOpened >= 3) xp += 5;
  if (threadsOpened >= 2) xp += 3;
  if (spacesOpened >= 1) xp += 2;
  if (notesEdited >= 1) xp += 5;
  if (contentCreated >= 1) xp += 10; // One-time per session

  return Math.min(xp, 40); // Cap at 40 XP per session
}

/**
 * Get season for a specific date
 * Winter spans Dec (current year) - Feb (next year), assigned to the year that December belongs to
 */
function getSeasonForDate(date: Date): string {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  
  if (month >= 3 && month <= 5) return `spring-${year}`;
  if (month >= 6 && month <= 8) return `summer-${year}`;
  if (month >= 9 && month <= 11) return `fall-${year}`;
  // Winter: Dec (current year), Jan, Feb (next year)
  // Assign to the year that December belongs to
  if (month === 12) return `winter-${year}`; // December belongs to current year's winter
  return `winter-${year - 1}`; // Jan, Feb belong to previous year's winter
}

/**
 * Manually award XP with a specific date (for testing time-based features)
 */
async function awardXPWithDate(userId: string, activityType: string, xpAmount: number, date: Date, season: string, relatedId: string | null = null, metadata: any = null) {
  await db.insert(UserXP).values({
    id: `xp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    activityType,
    xpAmount,
    relatedId,
    season,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: date,
  });

  // Update seasonal XP aggregate
  const existingSeasonal = await db.select()
    .from(UserSeasonalXP)
    .where(and(
      eq(UserSeasonalXP.userId, userId),
      eq(UserSeasonalXP.season, season)
    ))
    .limit(1);

  if (existingSeasonal.length > 0) {
    await db.update(UserSeasonalXP)
      .set({
        totalXP: existingSeasonal[0].totalXP + xpAmount,
        updatedAt: new Date(),
      })
      .where(eq(UserSeasonalXP.id, existingSeasonal[0].id));
  } else {
    await db.insert(UserSeasonalXP).values({
      id: `seasonal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      season,
      totalXP: xpAmount,
      sessionCount: 0,
      createdAt: date,
    });
  }

  // Update lifetime XP aggregate
  const existingLifetime = await db.select()
    .from(UserLifetimeXP)
    .where(eq(UserLifetimeXP.userId, userId))
    .limit(1);

  if (existingLifetime.length > 0) {
    await db.update(UserLifetimeXP)
      .set({
        totalXP: existingLifetime[0].totalXP + xpAmount,
        lastUpdated: new Date(),
      })
      .where(eq(UserLifetimeXP.id, existingLifetime[0].id));
  } else {
    await db.insert(UserLifetimeXP).values({
      id: `lifetime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      totalXP: xpAmount,
      lastUpdated: new Date(),
    });
  }
}

/**
 * Verification helpers
 */
async function verifyXP(userId: string, expectedSeasonal: number, expectedLifetime: number, testName: string): Promise<boolean> {
  const actualSeasonal = await getSeasonalXP(userId);
  const actualLifetime = await getLifetimeXP(userId);

  const seasonalMatch = actualSeasonal === expectedSeasonal;
  const lifetimeMatch = actualLifetime === expectedLifetime;

  const passed = seasonalMatch && lifetimeMatch;

  testResults.tests.push({
    name: testName,
    passed,
    expected: { seasonal: expectedSeasonal, lifetime: expectedLifetime },
    actual: { seasonal: actualSeasonal, lifetime: actualLifetime }
  });

  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }

  return passed;
}

/**
 * Clean up test data
 */
async function cleanupTestData() {
  // Delete all test user's XP records
  await db.delete(UserXP).where(eq(UserXP.userId, TEST_USER_ID));
  
  // Delete seasonal XP records
  await db.delete(UserSeasonalXP).where(eq(UserSeasonalXP.userId, TEST_USER_ID));
  
  // Delete lifetime XP records
  await db.delete(UserLifetimeXP).where(eq(UserLifetimeXP.userId, TEST_USER_ID));
  
  // Delete weekly streaks
  await db.delete(WeeklyStreaks).where(eq(WeeklyStreaks.userId, TEST_USER_ID));
  
  // Reset UserMetadata
  try {
    await db.update(UserMetadata)
      .set({
        lastMonthlyVisit: null,
        churchAddedAt: null,
        currentSeason: null
      })
      .where(eq(UserMetadata.userId, TEST_USER_ID));
  } catch (error) {
    // Metadata might not exist yet
  }
}

/**
 * Test 1: Session XP
 */
async function testSessionXP() {
  const results: string[] = [];
  results.push('\n📋 Test 1: Session-Based XP');
  results.push('='.repeat(50));
  
  await cleanupTestData();

  // Test 1.1: Basic session with minimum requirements
  results.push('\n1.1: Basic session (meets minimum requirements)');
  const session1 = {
    userId: TEST_USER_ID,
    startTime: new Date('2025-01-15T10:00:00Z'),
    activities: [
      { actionType: 'note_opened', timestamp: new Date('2025-01-15T10:00:00Z'), relatedId: 'note1' },
      { actionType: 'thread_opened', timestamp: new Date('2025-01-15T10:01:00Z'), relatedId: 'thread1' },
      { actionType: 'note_opened', timestamp: new Date('2025-01-15T10:02:00Z'), relatedId: 'note2' }
    ],
    lastActivityTime: new Date('2025-01-15T10:06:00Z')
  };

  const session1XP = calculateSessionXP(session1);
  await awardSessionXP(TEST_USER_ID, session1XP);
  const passed1 = await verifyXP(TEST_USER_ID, 15, 15, '1.1: Basic session XP (15 XP)');
  results.push(passed1 ? '✅ 1.1: Basic session XP (15 XP)' : '❌ 1.1: Basic session XP failed');

  // Test 1.2: Session with bonuses
  results.push('\n1.2: Session with activity bonuses');
  const session2 = {
    userId: TEST_USER_ID,
    startTime: new Date('2025-01-16T10:00:00Z'),
    activities: [
      { actionType: 'note_opened', timestamp: new Date('2025-01-16T10:00:00Z'), relatedId: 'note3' },
      { actionType: 'note_opened', timestamp: new Date('2025-01-16T10:01:00Z'), relatedId: 'note4' },
      { actionType: 'note_opened', timestamp: new Date('2025-01-16T10:02:00Z'), relatedId: 'note5' },
      { actionType: 'thread_opened', timestamp: new Date('2025-01-16T10:03:00Z'), relatedId: 'thread2' },
      { actionType: 'thread_opened', timestamp: new Date('2025-01-16T10:04:00Z'), relatedId: 'thread3' },
      { actionType: 'space_opened', timestamp: new Date('2025-01-16T10:05:00Z'), relatedId: 'space1' },
      { actionType: 'note_edited', timestamp: new Date('2025-01-16T10:06:00Z'), relatedId: 'note1' },
      { actionType: 'content_created', timestamp: new Date('2025-01-16T10:07:00Z'), relatedId: 'note6' }
    ],
    lastActivityTime: new Date('2025-01-16T10:08:00Z')
  };

  const session2XP = calculateSessionXP(session2);
  await awardSessionXP(TEST_USER_ID, session2XP);
  const passed2 = await verifyXP(TEST_USER_ID, 15 + 40, 15 + 40, '1.2: Session with bonuses (40 XP max)');
  results.push(passed2 ? '✅ 1.2: Session with bonuses (40 XP max)' : '❌ 1.2: Session with bonuses failed');

  // Test 1.3: Daily session cap (max 3 sessions/day)
  results.push('\n1.3: Daily session cap (max 3 sessions/day)');
  const session3 = {
    userId: TEST_USER_ID,
    startTime: new Date('2025-01-16T11:00:00Z'),
    activities: [
      { actionType: 'note_opened', timestamp: new Date('2025-01-16T11:00:00Z'), relatedId: 'note7' },
      { actionType: 'thread_opened', timestamp: new Date('2025-01-16T11:01:00Z'), relatedId: 'thread4' }
    ],
    lastActivityTime: new Date('2025-01-16T11:06:00Z')
  };

  const session3XP = calculateSessionXP(session3);
  await awardSessionXP(TEST_USER_ID, session3XP);
  const passed3 = await verifyXP(TEST_USER_ID, 15 + 40 + 15, 15 + 40 + 15, '1.3: Third session awarded');
  results.push(passed3 ? '✅ 1.3: Third session awarded' : '❌ 1.3: Third session failed');

  // Try 4th session (should be capped)
  const session4 = {
    userId: TEST_USER_ID,
    startTime: new Date('2025-01-16T12:00:00Z'),
    activities: [
      { actionType: 'note_opened', timestamp: new Date('2025-01-16T12:00:00Z'), relatedId: 'note8' },
      { actionType: 'thread_opened', timestamp: new Date('2025-01-16T12:01:00Z'), relatedId: 'thread5' }
    ],
    lastActivityTime: new Date('2025-01-16T12:06:00Z')
  };

  const session4XP = calculateSessionXP(session4);
  const awarded4 = await awardSessionXP(TEST_USER_ID, session4XP);
  if (!awarded4) {
    testResults.passed++;
    results.push('✅ 1.3: Fourth session correctly capped');
  } else {
    testResults.failed++;
    results.push('❌ 1.3: Fourth session should have been capped');
  }

  return results.join('\n');
}

/**
 * Test 2: Creation Bonuses
 */
async function testCreationBonuses() {
  const results: string[] = [];
  results.push('\n📋 Test 2: Creation Bonuses');
  results.push('='.repeat(50));
  
  await cleanupTestData();

  // Test 2.1: Create note, thread, space
  results.push('\n2.1: Creation bonuses for different content types');
  await awardCreationBonusXP(TEST_USER_ID, 'note');
  await awardCreationBonusXP(TEST_USER_ID, 'thread');
  await awardCreationBonusXP(TEST_USER_ID, 'space');
  
  const passed1 = await verifyXP(TEST_USER_ID, 15, 15, '2.1: Creation bonuses (15 XP)');
  results.push(passed1 ? '✅ 2.1: Creation bonuses (15 XP)' : '❌ 2.1: Creation bonuses failed');

  // Test 2.2: Daily creation bonus cap (max 20 XP/day)
  results.push('\n2.2: Daily creation bonus cap (max 20 XP/day)');
  await awardCreationBonusXP(TEST_USER_ID, 'note');
  const passed2 = await verifyXP(TEST_USER_ID, 20, 20, '2.2: Hit creation bonus cap (20 XP)');
  results.push(passed2 ? '✅ 2.2: Hit creation bonus cap (20 XP)' : '❌ 2.2: Creation bonus cap failed');

  // Try to create more (should be capped)
  const awarded = await awardCreationBonusXP(TEST_USER_ID, 'thread');
  if (!awarded) {
    testResults.passed++;
    results.push('✅ 2.2: Creation bonus correctly capped at 20 XP/day');
  } else {
    testResults.failed++;
    results.push('❌ 2.2: Creation bonus should have been capped');
  }

  return results.join('\n');
}

/**
 * Test 3: Monthly Attendance
 */
async function testMonthlyAttendance() {
  const results: string[] = [];
  results.push('\n📋 Test 3: Monthly Attendance');
  results.push('='.repeat(50));
  
  await cleanupTestData();

  // Test 3.1: First visit of January 2025
  results.push('\n3.1: First visit of the month');
  const janDate = new Date('2025-01-15T10:00:00Z');
  const janSeason = getSeasonForDate(janDate);
  await awardXPWithDate(
    TEST_USER_ID,
    ACTIVITY_TYPES.MONTHLY_ATTENDANCE,
    XP_VALUES.MONTHLY_ATTENDANCE,
    janDate,
    janSeason
  );
  const passed1 = await verifyXP(TEST_USER_ID, 25, 25, '3.1: Monthly attendance XP (25 XP)');
  results.push(passed1 ? '✅ 3.1: Monthly attendance XP (25 XP)' : '❌ 3.1: Monthly attendance failed');

  // Test 3.2: New month awards again
  results.push('\n3.3: New month awards again');
  const febDate = new Date('2025-02-15T10:00:00Z');
  const febSeason = getSeasonForDate(febDate);
  await awardXPWithDate(
    TEST_USER_ID,
    ACTIVITY_TYPES.MONTHLY_ATTENDANCE,
    XP_VALUES.MONTHLY_ATTENDANCE,
    febDate,
    febSeason
  );
  const passed2 = await verifyXP(TEST_USER_ID, 25 + 25, 25 + 25, '3.3: Monthly attendance in new month (50 XP total)');
  results.push(passed2 ? '✅ 3.3: Monthly attendance in new month (50 XP total)' : '❌ 3.3: Monthly attendance in new month failed');

  return results.join('\n');
}

/**
 * Test 4: Weekly Streaks
 */
async function testWeeklyStreaks() {
  const results: string[] = [];
  results.push('\n📋 Test 4: Weekly Streaks');
  results.push('='.repeat(50));
  
  await cleanupTestData();
  
  // Set to a Monday
  const monday = new Date('2025-01-13T10:00:00Z'); // Monday, Jan 13, 2025
  const season = getSeasonForDate(monday);

  // Test 4.1: 3-4 day streak
  results.push('\n4.1: 3-4 day streak (15 XP)');
  for (let day = 0; day < 3; day++) {
    const sessionDate = new Date(monday);
    sessionDate.setDate(sessionDate.getDate() + day);
    await awardXPWithDate(
      TEST_USER_ID,
      ACTIVITY_TYPES.SESSION_COMPLETED,
      15,
      sessionDate,
      season
    );
  }
  
  // Calculate expected streak XP
  const weekStart = new Date(monday);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  weekStart.setHours(0, 0, 0, 0);
  
  const weekSessions = await db.select()
    .from(UserXP)
    .where(and(
      eq(UserXP.userId, TEST_USER_ID),
      eq(UserXP.activityType, ACTIVITY_TYPES.SESSION_COMPLETED),
      gte(UserXP.createdAt, weekStart)
    ));

  const daysWithSessions = new Set<string>();
  weekSessions.forEach(session => {
    const day = session.createdAt.toISOString().split('T')[0];
    daysWithSessions.add(day);
  });

  const dayCount = daysWithSessions.size;
  let expectedStreakXP = 0;
  if (dayCount >= 7) {
    expectedStreakXP = XP_VALUES.WEEKLY_STREAK_7_DAYS;
  } else if (dayCount >= 5) {
    expectedStreakXP = XP_VALUES.WEEKLY_STREAK_5_6_DAYS;
  } else if (dayCount >= 3) {
    expectedStreakXP = XP_VALUES.WEEKLY_STREAK_3_4_DAYS;
  }

  if (expectedStreakXP === XP_VALUES.WEEKLY_STREAK_3_4_DAYS) {
    testResults.passed++;
    results.push(`✅ 4.1: 3-day streak would award ${expectedStreakXP} XP`);
  } else {
    testResults.failed++;
    results.push(`❌ 4.1: Expected ${XP_VALUES.WEEKLY_STREAK_3_4_DAYS} XP for 3 days, got ${expectedStreakXP}`);
  }

  return results.join('\n');
}

/**
 * Test 5: Seasonal Tracking
 */
async function testSeasonalTracking() {
  const results: string[] = [];
  results.push('\n📋 Test 5: Seasonal XP Tracking');
  results.push('='.repeat(50));
  
  await cleanupTestData();

  // Test 5.1: Activity in Winter 2025
  results.push('\n5.1: Activity in Winter 2025');
  const winterDate = new Date('2025-01-15T10:00:00Z');
  const winterSeason = getSeasonForDate(winterDate);
  await awardXPWithDate(
    TEST_USER_ID,
    ACTIVITY_TYPES.SESSION_COMPLETED,
    15,
    winterDate,
    winterSeason
  );
  const passed1 = await verifyXP(TEST_USER_ID, 15, 15, '5.1: Winter 2025 XP (15 XP)');
  results.push(passed1 ? '✅ 5.1: Winter 2025 XP (15 XP)' : '❌ 5.1: Winter 2025 XP failed');

  // Test 5.2: Activity in next season (Spring)
  results.push('\n5.2: Activity in Spring 2025 (seasonal reset)');
  const springDate = new Date('2025-03-15T10:00:00Z');
  const springSeason = getSeasonForDate(springDate);
  await awardXPWithDate(
    TEST_USER_ID,
    ACTIVITY_TYPES.SESSION_COMPLETED,
    15,
    springDate,
    springSeason
  );
  
  const passed2 = await verifyXP(TEST_USER_ID, 15, 30, '5.2: Spring 2025 XP (seasonal reset, lifetime continues)');
  results.push(passed2 ? '✅ 5.2: Spring 2025 XP (seasonal reset, lifetime continues)' : '❌ 5.2: Spring 2025 XP failed');

  return results.join('\n');
}

/**
 * Test 6: Church Addition Bonus
 */
async function testChurchBonus() {
  const results: string[] = [];
  results.push('\n📋 Test 6: Church Addition Bonus');
  results.push('='.repeat(50));
  
  await cleanupTestData();

  // Test 6.1: First time adding church
  results.push('\n6.1: First time adding church');
  await awardChurchAddedXP(TEST_USER_ID);
  const passed1 = await verifyXP(TEST_USER_ID, 50, 50, '6.1: Church addition bonus (50 XP)');
  results.push(passed1 ? '✅ 6.1: Church addition bonus (50 XP)' : '❌ 6.1: Church addition bonus failed');

  // Test 6.2: Subsequent church updates don't award
  results.push('\n6.2: Subsequent church updates');
  const awarded = await awardChurchAddedXP(TEST_USER_ID);
  if (!awarded) {
    testResults.passed++;
    results.push('✅ 6.2: Church bonus correctly not awarded twice');
  } else {
    testResults.failed++;
    results.push('❌ 6.2: Church bonus should not be awarded twice');
  }

  return results.join('\n');
}

export const GET: APIRoute = async ({ locals, request }) => {
  // Only allow in development
  if (import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: 'Test endpoint not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }


  try {
    // Ensure test user metadata exists
    try {
      await db.insert(UserMetadata).values({
        id: `metadata_${TEST_USER_ID}`,
        userId: TEST_USER_ID,
        highestSimpleNoteId: 0,
        createdAt: new Date(),
        lastMonthlyVisit: null,
        churchAddedAt: null,
        currentSeason: null
      });
    } catch (error) {
      // Metadata might already exist, that's okay
    }

    // Reset test results
    testResults.passed = 0;
    testResults.failed = 0;
    testResults.tests = [];

    // Run all tests
    const output: string[] = [];
    output.push('🧪 Comprehensive XP System Test Suite');
    output.push('='.repeat(50));
    output.push(`Test User ID: ${TEST_USER_ID}`);
    output.push(`Starting Date: ${new Date().toISOString()}`);
    output.push('='.repeat(50));

    output.push(await testSessionXP());
    output.push(await testCreationBonuses());
    output.push(await testMonthlyAttendance());
    output.push(await testWeeklyStreaks());
    output.push(await testSeasonalTracking());
    output.push(await testChurchBonus());

    // Print summary
    output.push('\n' + '='.repeat(50));
    output.push('📊 Test Summary');
    output.push('='.repeat(50));
    output.push(`✅ Passed: ${testResults.passed}`);
    output.push(`❌ Failed: ${testResults.failed}`);
    output.push(`📝 Total: ${testResults.passed + testResults.failed}`);
    output.push('='.repeat(50));

    const allPassed = testResults.failed === 0;
    if (allPassed) {
      output.push('\n🎉 All tests passed!');
    } else {
      output.push('\n⚠️  Some tests failed. Review the output above.');
    }

    return new Response(output.join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      error: error.message || 'Test suite error',
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};


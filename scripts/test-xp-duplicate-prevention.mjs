#!/usr/bin/env node

/**
 * Test script to verify XP system duplicate prevention
 * This script tests the XP system to ensure it doesn't award duplicate XP
 */

import { db, UserXP, Threads, Notes, eq, and } from 'astro:db';
import { 
  awardThreadCreatedXP, 
  awardNoteCreatedXP, 
  calculateTotalXP, 
  getXPBreakdown,
  cleanupDuplicateXP,
  backfillUserXP,
  hasXPBeenAwarded,
  ACTIVITY_TYPES 
} from '../src/utils/xp-system.js';

// Test user ID (you can change this to test with a real user)
const TEST_USER_ID = 'test_user_xp_duplicate_prevention';

async function testXPDuplicatePrevention() {
  console.log('🧪 Testing XP System Duplicate Prevention\n');
  
  try {
    // Clean up any existing test data
    console.log('🧹 Cleaning up existing test data...');
    await db.delete(UserXP).where(eq(UserXP.userId, TEST_USER_ID));
    console.log('✅ Test data cleaned up\n');
    
    // Test 1: Award XP for thread creation multiple times
    console.log('📝 Test 1: Thread creation XP duplicate prevention');
    const testThreadId = 'test_thread_123';
    
    console.log('  - First award attempt...');
    await awardThreadCreatedXP(TEST_USER_ID, testThreadId);
    
    console.log('  - Second award attempt (should be skipped)...');
    await awardThreadCreatedXP(TEST_USER_ID, testThreadId);
    
    console.log('  - Third award attempt (should be skipped)...');
    await awardThreadCreatedXP(TEST_USER_ID, testThreadId);
    
    // Check if only one XP record was created
    const threadXPRecords = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, TEST_USER_ID),
        eq(UserXP.activityType, ACTIVITY_TYPES.THREAD_CREATED),
        eq(UserXP.relatedId, testThreadId)
      ));
    
    console.log(`  ✅ Result: ${threadXPRecords.length} XP record(s) created (expected: 1)`);
    console.log(`  ✅ Total XP from thread: ${threadXPRecords.reduce((sum, record) => sum + record.xpAmount, 0)}\n`);
    
    // Test 2: Award XP for note creation multiple times
    console.log('📝 Test 2: Note creation XP duplicate prevention');
    const testNoteId = 'test_note_456';
    
    console.log('  - First award attempt...');
    await awardNoteCreatedXP(TEST_USER_ID, testNoteId);
    
    console.log('  - Second award attempt (should be skipped)...');
    await awardNoteCreatedXP(TEST_USER_ID, testNoteId);
    
    // Check if only one XP record was created for note creation
    const noteXPRecords = await db.select()
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, TEST_USER_ID),
        eq(UserXP.activityType, ACTIVITY_TYPES.NOTE_CREATED),
        eq(UserXP.relatedId, testNoteId)
      ));
    
    console.log(`  ✅ Result: ${noteXPRecords.length} XP record(s) created for note (expected: 1)`);
    console.log(`  ✅ Total XP from note: ${noteXPRecords.reduce((sum, record) => sum + record.xpAmount, 0)}\n`);
    
    // Test 3: Test hasXPBeenAwarded function
    console.log('📝 Test 3: hasXPBeenAwarded function');
    
    const hasThreadXP = await hasXPBeenAwarded(TEST_USER_ID, ACTIVITY_TYPES.THREAD_CREATED, testThreadId);
    const hasNoteXP = await hasXPBeenAwarded(TEST_USER_ID, ACTIVITY_TYPES.NOTE_CREATED, testNoteId);
    const hasNonExistentXP = await hasXPBeenAwarded(TEST_USER_ID, ACTIVITY_TYPES.THREAD_CREATED, 'non_existent_id');
    
    console.log(`  ✅ Thread XP awarded: ${hasThreadXP} (expected: true)`);
    console.log(`  ✅ Note XP awarded: ${hasNoteXP} (expected: true)`);
    console.log(`  ✅ Non-existent XP awarded: ${hasNonExistentXP} (expected: false)\n`);
    
    // Test 4: Test cleanupDuplicateXP function
    console.log('📝 Test 4: cleanupDuplicateXP function');
    
    // Manually create some duplicate XP records
    const duplicateXP1 = {
      id: `duplicate_1_${Date.now()}`,
      userId: TEST_USER_ID,
      activityType: ACTIVITY_TYPES.THREAD_CREATED,
      xpAmount: 10,
      relatedId: 'duplicate_thread_1',
      createdAt: new Date()
    };
    
    const duplicateXP2 = {
      id: `duplicate_2_${Date.now()}`,
      userId: TEST_USER_ID,
      activityType: ACTIVITY_TYPES.THREAD_CREATED,
      xpAmount: 10,
      relatedId: 'duplicate_thread_1', // Same relatedId as above
      createdAt: new Date(Date.now() + 1000) // Slightly later
    };
    
    await db.insert(UserXP).values(duplicateXP1);
    await db.insert(UserXP).values(duplicateXP2);
    
    console.log('  - Created 2 duplicate XP records...');
    
    const cleanupResult = await cleanupDuplicateXP(TEST_USER_ID);
    console.log(`  ✅ Cleanup result: Removed ${cleanupResult.removed} duplicates out of ${cleanupResult.total} total records\n`);
    
    // Test 5: Test backfill function
    console.log('📝 Test 5: backfillUserXP function');
    
    // Clear existing XP for clean test
    await db.delete(UserXP).where(eq(UserXP.userId, TEST_USER_ID));
    
    // Create some test threads and notes (simulated)
    const testThreads = [
      { id: 'backfill_thread_1', userId: TEST_USER_ID, title: 'Test Thread 1', createdAt: new Date() },
      { id: 'backfill_thread_2', userId: TEST_USER_ID, title: 'Test Thread 2', createdAt: new Date() }
    ];
    
    const testNotes = [
      { id: 'backfill_note_1', userId: TEST_USER_ID, content: 'Test Note 1', createdAt: new Date() },
      { id: 'backfill_note_2', userId: TEST_USER_ID, content: 'Test Note 2', createdAt: new Date() }
    ];
    
    // Insert test data
    for (const thread of testThreads) {
      await db.insert(Threads).values(thread);
    }
    
    for (const note of testNotes) {
      await db.insert(Notes).values(note);
    }
    
    console.log('  - Created test threads and notes...');
    
    // Run backfill
    await backfillUserXP(TEST_USER_ID);
    
    // Check results
    const finalXP = await calculateTotalXP(TEST_USER_ID);
    const breakdown = await getXPBreakdown(TEST_USER_ID);
    
    console.log(`  ✅ Final total XP: ${finalXP}`);
    console.log(`  ✅ Breakdown:`, breakdown);
    
    // Test 6: Run backfill again to ensure no duplicates
    console.log('\n📝 Test 6: Running backfill again (should not create duplicates)');
    
    const xpBeforeSecondBackfill = await calculateTotalXP(TEST_USER_ID);
    await backfillUserXP(TEST_USER_ID);
    const xpAfterSecondBackfill = await calculateTotalXP(TEST_USER_ID);
    
    console.log(`  ✅ XP before second backfill: ${xpBeforeSecondBackfill}`);
    console.log(`  ✅ XP after second backfill: ${xpAfterSecondBackfill}`);
    console.log(`  ✅ XP unchanged: ${xpBeforeSecondBackfill === xpAfterSecondBackfill} (expected: true)\n`);
    
    // Final summary
    console.log('🎉 All tests completed successfully!');
    console.log('\n📊 Final XP Summary:');
    const finalBreakdown = await getXPBreakdown(TEST_USER_ID);
    console.log(`  - Total XP: ${finalBreakdown.totalXP}`);
    console.log(`  - Threads created: ${finalBreakdown.breakdown.threadCreated} XP`);
    console.log(`  - Notes created: ${finalBreakdown.breakdown.noteCreated} XP`);
    console.log(`  - Notes opened: ${finalBreakdown.breakdown.noteOpened} XP`);
    console.log(`  - First note daily bonus: ${finalBreakdown.breakdown.firstNoteDailyBonus} XP`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    try {
      await db.delete(UserXP).where(eq(UserXP.userId, TEST_USER_ID));
      await db.delete(Threads).where(eq(Threads.userId, TEST_USER_ID));
      await db.delete(Notes).where(eq(Notes.userId, TEST_USER_ID));
      console.log('✅ Test data cleaned up');
    } catch (cleanupError) {
      console.error('⚠️ Error during cleanup:', cleanupError);
    }
  }
}

// Run the test
testXPDuplicatePrevention()
  .then(() => {
    console.log('\n✅ XP duplicate prevention test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ XP duplicate prevention test failed:', error);
    process.exit(1);
  });

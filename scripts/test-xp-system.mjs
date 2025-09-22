#!/usr/bin/env node

/**
 * Test script for the XP system
 * This script demonstrates how the XP system works and can be used for testing
 */

import { db } from 'astro:db';
import { 
  calculateTotalXP, 
  getXPBreakdown, 
  backfillUserXP,
  XP_VALUES,
  ACTIVITY_TYPES 
} from '../src/utils/xp-system.js';

// Mock user ID for testing
const TEST_USER_ID = 'test_user_123';

async function testXPSystem() {
  console.log('🧪 Testing XP System...\n');
  
  try {
    // Test 1: Calculate XP for a user (should be 0 initially)
    console.log('1. Testing initial XP calculation...');
    const initialXP = await calculateTotalXP(TEST_USER_ID);
    console.log(`   Initial XP: ${initialXP}`);
    
    // Test 2: Get XP breakdown (should be empty initially)
    console.log('\n2. Testing XP breakdown...');
    const initialBreakdown = await getXPBreakdown(TEST_USER_ID);
    console.log('   Initial breakdown:', initialBreakdown);
    
    // Test 3: Test backfill function (this would normally be called with real user data)
    console.log('\n3. Testing backfill function...');
    console.log('   Note: Backfill requires existing notes/threads in database');
    console.log('   To test backfill, create some notes/threads first, then call:');
    console.log(`   await backfillUserXP('${TEST_USER_ID}');`);
    
    // Test 4: Show XP values and activity types
    console.log('\n4. XP System Configuration:');
    console.log('   XP Values:', XP_VALUES);
    console.log('   Activity Types:', ACTIVITY_TYPES);
    
    console.log('\n✅ XP System test completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Create some notes and threads in the app');
    console.log('   2. Visit the profile page to see dynamic XP');
    console.log('   3. Use the backfill API endpoint if needed: /api/user/xp?backfill=true');
    
  } catch (error) {
    console.error('❌ Error testing XP system:', error);
  }
}

// Run the test
testXPSystem();

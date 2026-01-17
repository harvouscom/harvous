/**
 * Test script to set note count for testing freemium limits
 * 
 * Usage:
 *   npx tsx scripts/test-note-limit.ts <count>
 * 
 * Examples:
 *   npx tsx scripts/test-note-limit.ts 999  # Set to 999 (can create 1 more)
 *   npx tsx scripts/test-note-limit.ts 1000 # Set to 1000 (at limit, blocked)
 *   npx tsx scripts/test-note-limit.ts 50   # Set to 50 (well under limit)
 */

import { db, UserMetadata, eq } from 'astro:db';

// Get userId from command line args or prompt
const targetCountArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const userIdArg = process.argv[3];

if (!targetCountArg || isNaN(targetCountArg)) {
  console.error('Usage: npx tsx scripts/test-note-limit.ts <count> [userId]');
  console.error('Example: npx tsx scripts/test-note-limit.ts 999');
  process.exit(1);
}

// After the check above, we know targetCountArg is a valid number
const targetCount: number = targetCountArg;

async function setNoteCount() {
  try {
    // If userId provided, use it; otherwise we'll need to get it from the user
    let userId = userIdArg;

    if (!userId) {
      console.log('\n⚠️  No userId provided. Here are ways to find it:\n');
      console.log('   Option 1: Check browser console');
      console.log('   - Open your app in browser');
      console.log('   - Open DevTools (F12)');
      console.log('   - Go to Application/Storage > Cookies');
      console.log('   - Look for __clerk_db_jwt cookie');
      console.log('   - Decode it or check Network tab for API requests\n');
      console.log('   Option 2: Check Clerk Dashboard');
      console.log('   - Go to https://dashboard.clerk.com');
      console.log('   - Navigate to Users');
      console.log('   - Find your user and copy the User ID\n');
      console.log('   Option 3: Use the API');
      console.log('   - In browser console, run:');
      console.log('     fetch("/api/user/get-profile").then(r => r.json()).then(console.log)');
      console.log('   - Then check Network tab for the request URL which contains userId\n');
      
      // Try to get from environment or prompt
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      userId = await new Promise<string>((resolve) => {
        readline.question('Enter your Clerk userId (or press Ctrl+C to cancel): ', (answer: string) => {
          readline.close();
          resolve(answer.trim());
        });
      });

      if (!userId) {
        console.error('❌ userId is required');
        process.exit(1);
      }
    }

    console.log(`\n🔧 Setting note count to ${targetCount} for user: ${userId.substring(0, 20)}...\n`);

    // Get or create user metadata
    let userMetadata = await db
      .select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    const previousCount = userMetadata?.highestSimpleNoteId || 0;

    if (!userMetadata) {
      console.log('📝 Creating UserMetadata record...');
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: targetCount,
        userColor: 'paper',
        createdAt: new Date()
      });
      console.log(`✅ Created UserMetadata with highestSimpleNoteId = ${targetCount}`);
    } else {
      console.log(`📊 Current count: ${previousCount}`);
      console.log(`🔄 Updating to: ${targetCount}...`);
      
      await db.update(UserMetadata)
        .set({ 
          highestSimpleNoteId: targetCount,
          updatedAt: new Date()
        })
        .where(eq(UserMetadata.userId, userId));
      
      console.log(`✅ Updated highestSimpleNoteId from ${previousCount} to ${targetCount}`);
    }

    console.log('\n📋 Test Scenarios:');
    if (targetCount < 1000) {
      const remaining = 1000 - targetCount;
      console.log(`   ✅ You can create ${remaining} more note(s) before hitting the limit`);
      console.log(`   🧪 Try creating a note - it should work!`);
    } else if (targetCount === 1000) {
      console.log(`   ⚠️  You're at the limit (1000 notes)`);
      console.log(`   🧪 Try creating a note - it should be BLOCKED with upgrade prompt`);
    } else {
      console.log(`   🚫 You're over the limit (${targetCount} > 1000)`);
      console.log(`   🧪 Try creating a note - it should be BLOCKED`);
    }

    console.log('\n💡 To reset, run this script again with a lower number (e.g., 50)');
    console.log('   Or manually create notes to increase the count naturally\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

setNoteCount();


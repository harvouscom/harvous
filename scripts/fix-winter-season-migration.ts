/**
 * Migration Script: Fix Winter Season Assignment
 * 
 * This script fixes existing XP records where January/February were incorrectly assigned
 * to the current year instead of the previous year's winter season.
 * 
 * Example: January 2025 records should be "winter-2024" not "winter-2025"
 * 
 * Run with: npx tsx scripts/fix-winter-season-migration.ts
 */

import { db, UserXP, UserSeasonalXP, eq, and } from 'astro:db';

async function fixWinterSeasonMigration() {
  try {
    console.log('Starting Winter Season Fix Migration...');
    console.log('This will fix January/February records to belong to the previous year\'s winter season.\n');

    // Find all December records that need fixing
    const allXP = await db.select().from(UserXP);
    
    let fixed = 0;
    let errors = 0;
    const seasonMap = new Map<string, { oldSeason: string; newSeason: string; xpAmount: number }[]>();

    for (const record of allXP) {
      try {
        const createdDate = new Date(record.createdAt);
        const month = createdDate.getMonth() + 1; // 1-12
        const year = createdDate.getFullYear();
        
        // Process January and February records (they should belong to previous year's winter)
        if (month === 1 || month === 2) {
          const currentSeason = record.season;
          const correctSeason = `winter-${year - 1}`;
          
          // Check if it needs fixing
          if (currentSeason && currentSeason !== correctSeason) {
            const key = `${record.userId}:${currentSeason}`;
            if (!seasonMap.has(key)) {
              seasonMap.set(key, []);
            }
            seasonMap.get(key)!.push({
              oldSeason: currentSeason,
              newSeason: correctSeason,
              xpAmount: record.xpAmount
            });

            // Update the record
            await db.update(UserXP)
              .set({ season: correctSeason })
              .where(eq(UserXP.id, record.id));
            
            fixed++;
          }
        }
      } catch (error) {
        console.error(`Error processing record ${record.id}:`, error);
        errors++;
      }
    }

    console.log(`\nFixed ${fixed} January/February XP records`);
    console.log(`Errors: ${errors}`);

    // Now update seasonal aggregates
    console.log('\nUpdating seasonal XP aggregates...');
    
    let aggregateFixed = 0;
    let aggregateErrors = 0;

    for (const [key, records] of seasonMap.entries()) {
      try {
        const [userId, oldSeason] = key.split(':');
        
        // Calculate total XP to move
        const totalXP = records.reduce((sum, r) => sum + r.xpAmount, 0);
        const newSeason = records[0].newSeason;

        // Get old seasonal aggregate
        const oldSeasonal = await db.select()
          .from(UserSeasonalXP)
          .where(and(
            eq(UserSeasonalXP.userId, userId),
            eq(UserSeasonalXP.season, oldSeason)
          ))
          .limit(1);

        // Get new seasonal aggregate (or create it)
        const newSeasonal = await db.select()
          .from(UserSeasonalXP)
          .where(and(
            eq(UserSeasonalXP.userId, userId),
            eq(UserSeasonalXP.season, newSeason)
          ))
          .limit(1);

        if (oldSeasonal.length > 0) {
          // Remove XP from old season
          const newTotal = Math.max(0, oldSeasonal[0].totalXP - totalXP);
          
          if (newTotal === 0) {
            // Delete the old seasonal record if it's now zero
            await db.delete(UserSeasonalXP)
              .where(eq(UserSeasonalXP.id, oldSeasonal[0].id));
          } else {
            // Update the old seasonal record
            await db.update(UserSeasonalXP)
              .set({
                totalXP: newTotal,
                updatedAt: new Date()
              })
              .where(eq(UserSeasonalXP.id, oldSeasonal[0].id));
          }
        }

        if (newSeasonal.length > 0) {
          // Add XP to existing new season
          await db.update(UserSeasonalXP)
            .set({
              totalXP: newSeasonal[0].totalXP + totalXP,
              updatedAt: new Date()
            })
            .where(eq(UserSeasonalXP.id, newSeasonal[0].id));
        } else {
          // Create new seasonal aggregate
          await db.insert(UserSeasonalXP).values({
            id: `seasonal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            season: newSeason,
            totalXP: totalXP,
            sessionCount: 0,
            createdAt: new Date(),
          });
        }

        aggregateFixed++;
      } catch (error) {
        console.error(`Error updating aggregates for ${key}:`, error);
        aggregateErrors++;
      }
    }

    console.log(`\nFixed ${aggregateFixed} seasonal aggregates`);
    console.log(`Aggregate errors: ${aggregateErrors}`);

    console.log('\n✅ Migration complete!');
    console.log(`- Fixed ${fixed} December XP records`);
    console.log(`- Updated ${aggregateFixed} seasonal aggregates`);
    console.log(`- Total errors: ${errors + aggregateErrors}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
fixWinterSeasonMigration()
  .then(() => {
    console.log('\nMigration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });


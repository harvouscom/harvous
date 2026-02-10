/**
 * Migration Script: XP to Seasonal System
 * 
 * This script migrates existing UserXP records to include season data
 * and populates UserSeasonalXP and UserLifetimeXP aggregate tables.
 * 
 * Run with: npx tsx scripts/migrate-xp-to-seasonal.ts
 */

import { db, UserXP, UserSeasonalXP, UserLifetimeXP, UserMetadata, eq, and } from 'astro:db';
import { getCurrentSeason } from '../src/utils/season-helpers';

interface SeasonXP {
  season: string;
  totalXP: number;
}

async function migrateXPToSeasonal() {
  try {
    console.log('Starting XP to Seasonal migration...');

    // Get all unique user IDs
    const allXP = await db.select().from(UserXP);
    const userIds = [...new Set(allXP.map(xp => xp.userId))];

    console.log(`Found ${userIds.length} users to migrate`);

    let migrated = 0;
    let errors = 0;

    for (const userId of userIds) {
      try {
        // Get all XP records for this user
        const userXPRecords = allXP.filter(xp => xp.userId === userId);

        // Group by season (or assign current season if no season field exists)
        const seasonMap = new Map<string, number>();

        let lifetimeTotal = 0;

        for (const record of userXPRecords) {
          // If record doesn't have season, assign based on createdAt
          let season = (record as any).season;
          if (!season) {
            const createdDate = new Date(record.createdAt);
            const month = createdDate.getMonth() + 1;
            const year = createdDate.getFullYear();
            
            if (month >= 3 && month <= 5) season = `spring-${year}`;
            else if (month >= 6 && month <= 8) season = `summer-${year}`;
            else if (month >= 9 && month <= 11) season = `fall-${year}`;
            else {
              // Winter: Dec (current year), Jan, Feb (next year)
              // Assign to the year that December belongs to
              if (month === 12) season = `winter-${year}`; // December belongs to current year's winter
              else season = `winter-${year - 1}`; // Jan, Feb belong to previous year's winter
            }

            // Update the record with season (if the column exists)
            // Note: This assumes the migration has already added the season column
            try {
              await db.update(UserXP)
                .set({ season: season as any })
                .where(eq(UserXP.id, record.id));
            } catch (e) {
              // Column might not exist yet, that's okay
              console.warn(`Could not update season for record ${record.id}:`, e);
            }
          }

          const current = seasonMap.get(season) || 0;
          seasonMap.set(season, current + record.xpAmount);
          lifetimeTotal += record.xpAmount;
        }

        // Update/create seasonal aggregates
        for (const [season, totalXP] of seasonMap.entries()) {
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
                totalXP: totalXP,
                updatedAt: new Date()
              })
              .where(eq(UserSeasonalXP.id, existing[0].id));
          } else {
            await db.insert(UserSeasonalXP).values({
              id: `seasonal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              userId,
              season,
              totalXP: totalXP,
              sessionCount: 0,
              createdAt: new Date(),
            });
          }
        }

        // Update/create lifetime aggregate
        const existingLifetime = await db.select()
          .from(UserLifetimeXP)
          .where(eq(UserLifetimeXP.userId, userId))
          .limit(1);

        if (existingLifetime.length > 0) {
          await db.update(UserLifetimeXP)
            .set({
              totalXP: lifetimeTotal,
              lastUpdated: new Date()
            })
            .where(eq(UserLifetimeXP.id, existingLifetime[0].id));
        } else {
          await db.insert(UserLifetimeXP).values({
            id: `lifetime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            totalXP: lifetimeTotal,
            lastUpdated: new Date(),
          });
        }

        // Update UserMetadata with current season
        const userMetadata = await db.select()
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, userId))
          .limit(1);

        if (userMetadata.length > 0) {
          await db.update(UserMetadata)
            .set({ currentSeason: getCurrentSeason() })
            .where(eq(UserMetadata.userId, userId));
        }

        migrated++;
        if (migrated % 10 === 0) {
          console.log(`Migrated ${migrated}/${userIds.length} users...`);
        }
      } catch (error) {
        console.error(`Error migrating user ${userId}:`, error);
        errors++;
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`- Migrated: ${migrated} users`);
    console.log(`- Errors: ${errors} users`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Default export for: npx astro db execute scripts/migrate-xp-to-seasonal.ts [--remote]
export default async function () {
  await migrateXPToSeasonal();
  console.log('Migration script completed successfully');
}


import { db, eq, first } from '../db';
import { UserMetadata } from '../db/schema';
import { normalizeTradition, type Tradition } from '@/utils/tradition';

/** User's preferred Bible translation code, defaulting to NET when unset. */
export async function getUserDefaultTranslation(userId: string): Promise<string> {
  const row = first(
    await db
      .select({ defaultTranslation: UserMetadata.defaultTranslation })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  return row?.defaultTranslation?.trim() || 'NET';
}

/** Translation and tradition in one read, for Today's passage (Catholics get Today's readings). */
export async function getUserReadingPrefs(userId: string): Promise<{ translation: string; tradition: Tradition }> {
  const row = first(
    await db
      .select({ defaultTranslation: UserMetadata.defaultTranslation, tradition: UserMetadata.tradition })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  return {
    translation: row?.defaultTranslation?.trim() || 'NET',
    tradition: normalizeTradition(row?.tradition),
  };
}

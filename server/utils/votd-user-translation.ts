import { db, eq, first } from '../db';
import { UserMetadata } from '../db/schema';

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

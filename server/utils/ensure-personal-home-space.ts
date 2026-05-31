/**
 * Ensures every user has a personal "My Home" space row (native HarvousSpaceBootstrap parity).
 * Prototype and space-scoped APIs expect an owned space even when the user only uses the dashboard pile.
 */
import { generateSpaceId } from '@/utils/ids';
import { getThreadGradientCSS } from '@/utils/colors';
import { db, Spaces, Notes, eq, and, isNull, ne } from '../db';
import { nowISO } from '../db/dates';

const MY_HOME_TITLE = 'My Home';

function isMyHomeTitle(title: string | null | undefined): boolean {
  return title?.trim().toLowerCase() === MY_HOME_TITLE.toLowerCase();
}

async function findMyHomeSpaceId(userId: string): Promise<string | null> {
  const owned = await db
    .select({ id: Spaces.id, title: Spaces.title })
    .from(Spaces)
    .where(eq(Spaces.userId, userId));
  return owned.find((s) => isMyHomeTitle(s.title))?.id ?? null;
}

async function createMyHomeSpace(userId: string, now: string): Promise<string> {
  const id = generateSpaceId();
  const backgroundGradient = getThreadGradientCSS('paper');

  await db.insert(Spaces).values({
    id,
    title: MY_HOME_TITLE,
    description: null,
    color: 'paper',
    backgroundGradient,
    userId,
    isPublic: false,
    isActive: true,
    order: 0,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export type EnsurePersonalHomeSpaceResult = {
  myHomeSpaceId: string;
  nullNotesBackfilled: number;
  createdMyHome: boolean;
};

/**
 * Find or create "My Home" and backfill notes with null spaceId for prototype / space-scoped APIs.
 * Classic scripture notes (`noteType: scripture`) are not backfilled — they remain classic-only.
 */
export async function ensurePersonalHomeSpace(
  userId: string,
  options?: { dryRun?: boolean },
): Promise<string> {
  const result = await ensurePersonalHomeSpaceDetailed(userId, options);
  return result.myHomeSpaceId;
}

/** Same as ensurePersonalHomeSpace but returns backfill stats (for scripts / debug). */
export async function ensurePersonalHomeSpaceDetailed(
  userId: string,
  options?: { dryRun?: boolean },
): Promise<EnsurePersonalHomeSpaceResult> {
  const dryRun = options?.dryRun === true;
  const now = nowISO();

  let myHomeSpaceId = await findMyHomeSpaceId(userId);
  let createdMyHome = false;
  if (!myHomeSpaceId) {
    createdMyHome = true;
    if (dryRun) {
      myHomeSpaceId = '(would-create-my-home)';
    } else {
      myHomeSpaceId = await createMyHomeSpace(userId, now);
    }
  }

  const backfillWhere = and(
    eq(Notes.userId, userId),
    isNull(Notes.spaceId),
    ne(Notes.noteType, 'scripture'),
  );
  const nullNotes = await db.select({ id: Notes.id }).from(Notes).where(backfillWhere);
  const nullNotesBackfilled = nullNotes.length;

  if (!dryRun && nullNotesBackfilled > 0 && myHomeSpaceId && !myHomeSpaceId.startsWith('(')) {
    await db.update(Notes).set({ spaceId: myHomeSpaceId, updatedAt: now }).where(backfillWhere);
  }

  return {
    myHomeSpaceId: myHomeSpaceId!,
    nullNotesBackfilled,
    createdMyHome,
  };
}

export type UnscopeLegacyScriptureFromMyHomeResult = {
  myHomeSpaceId: string | null;
  scriptureNotesUnscoped: number;
};

/** Clear spaceId on classic scripture notes wrongly scoped to My Home (reverse of legacy backfill). */
export async function unscopeLegacyScriptureNotesFromMyHomeDetailed(
  userId: string,
  options?: { dryRun?: boolean },
): Promise<UnscopeLegacyScriptureFromMyHomeResult> {
  const dryRun = options?.dryRun === true;
  const now = nowISO();
  const myHomeSpaceId = await findMyHomeSpaceId(userId);
  if (!myHomeSpaceId) {
    return { myHomeSpaceId: null, scriptureNotesUnscoped: 0 };
  }

  const unscopeWhere = and(
    eq(Notes.userId, userId),
    eq(Notes.spaceId, myHomeSpaceId),
    eq(Notes.noteType, 'scripture'),
  );
  const scriptureInMyHome = await db.select({ id: Notes.id }).from(Notes).where(unscopeWhere);
  const scriptureNotesUnscoped = scriptureInMyHome.length;

  if (!dryRun && scriptureNotesUnscoped > 0) {
    await db.update(Notes).set({ spaceId: null, updatedAt: now }).where(unscopeWhere);
  }

  return { myHomeSpaceId, scriptureNotesUnscoped };
}

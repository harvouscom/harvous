/**
 * Everything that has to happen when an account is deleted — one routine for the Settings
 * button (`DELETE /api/user/delete-account`) and for a deletion made in Clerk's dashboard (the
 * `user.deleted` webhook), so the two can never disagree about what "deleted" means.
 *
 * Before this, deletion removed notes, threads, owned spaces, tags, XP, the metadata row and
 * search history — and left reading history, note visits, Review items, reminders and their
 * device addresses, Connector keys, Discover listings (still public, with the byline), support
 * tickets, imports, templates and more, plus every copy outside the database: the nightly backup
 * files, the Audienceful contact, the PostHog person, and the Polar customer — whose live
 * subscription went on charging an account that no longer existed.
 *
 * **What stays, on purpose:** things a church or another person owns that this account helped
 * make — a church, its series, services, ministries, join links, review exercises and library
 * items, and a space owner's records of an invite. They belong to the church or the owner, and
 * keep only the deleted account's opaque id as their creator.
 *
 * Every step is attempted even when an earlier one fails, and the failures are returned (and
 * logged): a deletion that stops at the first error leaves more behind than one that finishes
 * and reports. The database steps are idempotent, so a retry — or the webhook arriving after
 * the button already ran — is harmless.
 */
import {
  db,
  first,
  Families,
  FamilyMembers,
  FamilyInvites,
  FamilyRoleRequests,
  FamilyEvents,
  eq,
  and,
  or,
  inArray,
  Notes,
  Threads,
  Spaces,
  SpaceMemberships,
  SpaceInvites,
  Members,
  Tags,
  UserXP,
  UserMetadata,
  Challenges,
  ChurchMemberships,
  ChurchMinistryStaff,
  ChurchContentSubmissions,
  Comments,
  ConnectorApiKeys,
  ConnectorClients,
  ConnectorPreferences,
  ConnectorUsageDays,
  DiscoverInstalls,
  DiscoverListings,
  Entitlements,
  ImportSessionItems,
  ImportSessions,
  LegalAcknowledgments,
  LibraryItemSuggestions,
  LibraryItems,
  ResourceLibraries,
  NoteChatOrigins,
  NoteConnections,
  NoteFingerprints,
  NoteTemplates,
  NoteVisitEvents,
  PushSubscriptions,
  ReadingEvents,
  RecallEvents,
  ReminderDeliveries,
  ReviewEvents,
  ReviewItems,
  StudyThreadEntries,
  StudyThreadMemberOrders,
  SupportTicketNotes,
  SupportTickets,
  SyncDeletedEntities,
  ThreadProgress,
  UserFeaturedItems,
  UserInboxItems,
  UserLifetimeXP,
  UserNodeStates,
  UserSeasonalXP,
  WeeklyStreaks,
  ClerkUserMapping,
} from '../db';
import { dissolveFamily } from './family-lifecycle';
import { reconcileFamilyCoverage } from './family-entitlements';
import { deleteNotesCascadeForUser } from './delete-note-cascade';
import { deleteSearchEventsForUser } from './record-search-event';
import { getPolarClient, isPolarConfigured } from './polar-client';
import {
  deleteUserExports,
  isUserExportBackupConfigured,
  listUserExportKeysForUser,
} from './user-export-backup-store';
import { isPgUndefinedRelation } from './pg-undefined-relation';

export interface AccountDeletionReport {
  /** Steps that failed, by name; empty when everything went. */
  failures: string[];
}

type Step = [name: string, run: () => Promise<unknown>];

/** A table not yet created on this database has nothing in it to delete. */
function missingTable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /relation "[^"]+" does not exist/.test(msg) || isPgUndefinedRelation(error, '');
}

/** Every row the account owns in the database, children before parents. */
function databaseSteps(userId: string): Step[] {
  const byUser = <T extends { userId: unknown }>(table: T & Parameters<typeof db.delete>[0]) =>
    db.delete(table).where(eq((table as unknown as { userId: Parameters<typeof eq>[0] }).userId, userId));

  return [
    [
      'notes',
      async () => {
        const rows = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, userId));
        await deleteNotesCascadeForUser(userId, rows.map((row) => row.id));
      },
    ],
    ['threads', () => db.delete(Threads).where(eq(Threads.userId, userId))],
    /* Before owned spaces: an owner's family is dissolved (coverage ends for everyone it
       covered) while its rows can still be found; a member just leaves. Invite links this
       account made go too — nobody is left to vouch for them. */
    [
      'family',
      async () => {
        const owned = first(await db.select().from(Families).where(eq(Families.ownerUserId, userId)).limit(1));
        if (owned) await db.transaction((tx) => dissolveFamily(tx, owned, new Date()));
        const membership = first(
          await db.select({ familyId: FamilyMembers.familyId }).from(FamilyMembers).where(eq(FamilyMembers.userId, userId)).limit(1),
        );
        await db.delete(FamilyInvites).where(eq(FamilyInvites.createdBy, userId));
        await db.delete(FamilyRoleRequests).where(eq(FamilyRoleRequests.userId, userId));
        await db.delete(FamilyEvents).where(or(eq(FamilyEvents.actorUserId, userId), eq(FamilyEvents.targetUserId, userId)));
        await db.delete(FamilyMembers).where(eq(FamilyMembers.userId, userId));
        if (membership?.familyId) await reconcileFamilyCoverage(membership.familyId);
      },
    ],
    [
      'owned spaces',
      async () => {
        const spaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, userId));
        const ids = spaces.map((space) => space.id);
        if (ids.length > 0) {
          await db.delete(SpaceMemberships).where(inArray(SpaceMemberships.spaceId, ids));
          await db.delete(SpaceInvites).where(inArray(SpaceInvites.spaceId, ids));
          await db.delete(Members).where(inArray(Members.spaceId, ids));
        }
        await db.delete(Spaces).where(eq(Spaces.userId, userId));
      },
    ],
    ['space memberships', () => db.delete(SpaceMemberships).where(eq(SpaceMemberships.userId, userId))],
    ['members (v1)', () => db.delete(Members).where(eq(Members.userId, userId))],
    /* Invite links this account made in someone else's space: a working link to a room the
       account can no longer vouch for. The owner's own invites are untouched. */
    ['space invites created', () => db.delete(SpaceInvites).where(eq(SpaceInvites.createdBy, userId))],
    ['tags', () => byUser(Tags)],
    ['xp', () => byUser(UserXP)],
    ['seasonal xp', () => byUser(UserSeasonalXP)],
    ['lifetime xp', () => byUser(UserLifetimeXP)],
    ['weekly streaks', () => byUser(WeeklyStreaks)],
    ['search history', () => deleteSearchEventsForUser(userId)],
    ['reading history', () => byUser(ReadingEvents)],
    ['note visits', () => byUser(NoteVisitEvents)],
    ['recall events', () => byUser(RecallEvents)],
    ['note fingerprints', () => byUser(NoteFingerprints)],
    ['study bible layer', () => byUser(UserNodeStates)],
    ['review events', () => byUser(ReviewEvents)],
    ['review items', () => byUser(ReviewItems)],
    ['challenges', () => byUser(Challenges)],
    ['highlights', () => byUser(StudyThreadEntries)],
    ['thread member orders', () => byUser(StudyThreadMemberOrders)],
    ['thread progress', () => byUser(ThreadProgress)],
    ['note connections', () => byUser(NoteConnections)],
    ['chat origins', () => byUser(NoteChatOrigins)],
    ['comments', () => byUser(Comments)],
    ['note templates', () => byUser(NoteTemplates)],
    ['import items', () => byUser(ImportSessionItems)],
    ['imports', () => byUser(ImportSessions)],
    ['reminder deliveries', () => byUser(ReminderDeliveries)],
    ['push subscriptions', () => byUser(PushSubscriptions)],
    ['connector keys', () => byUser(ConnectorApiKeys)],
    ['connector clients', () => byUser(ConnectorClients)],
    ['connector preferences', () => byUser(ConnectorPreferences)],
    ['connector usage', () => byUser(ConnectorUsageDays)],
    /* Withdrawn from Discover: the public page goes. Copies other people already added are
       snapshots in their own accounts and stay theirs — which is what the listing promised. */
    ['discover listings', () => db.delete(DiscoverListings).where(eq(DiscoverListings.submittedByUserId, userId))],
    ['discover installs', () => byUser(DiscoverInstalls)],
    ['church memberships', () => byUser(ChurchMemberships)],
    ['ministry staff', () => byUser(ChurchMinistryStaff)],
    [
      'church submissions',
      () => db.delete(ChurchContentSubmissions).where(eq(ChurchContentSubmissions.authorUserId, userId)),
    ],
    [
      'library suggestions',
      () => db.delete(LibraryItemSuggestions).where(eq(LibraryItemSuggestions.suggestedByUserId, userId)),
    ],
    [
      'personal resource library',
      async () => {
        const libraries = await db
          .select({ id: ResourceLibraries.id })
          .from(ResourceLibraries)
          .where(and(eq(ResourceLibraries.ownerKind, 'user'), eq(ResourceLibraries.ownerId, userId)));
        const ids = libraries.map((library) => library.id);
        if (ids.length === 0) return;
        await db.delete(LibraryItems).where(inArray(LibraryItems.libraryId, ids));
        await db.delete(ResourceLibraries).where(inArray(ResourceLibraries.id, ids));
      },
    ],
    [
      'support tickets',
      async () => {
        const tickets = await db.select({ id: SupportTickets.id }).from(SupportTickets).where(eq(SupportTickets.userId, userId));
        const ids = tickets.map((ticket) => ticket.id);
        if (ids.length > 0) await db.delete(SupportTicketNotes).where(inArray(SupportTicketNotes.ticketId, ids));
        await db.delete(SupportTickets).where(eq(SupportTickets.userId, userId));
      },
    ],
    ['inbox items', () => byUser(UserInboxItems)],
    ['featured items', () => byUser(UserFeaturedItems)],
    ['sync tombstones', () => byUser(SyncDeletedEntities)],
    ['legal acknowledgments', () => byUser(LegalAcknowledgments)],
    ['entitlements', () => byUser(Entitlements)],
    [
      'clerk user mapping',
      () => db.delete(ClerkUserMapping).where(or(eq(ClerkUserMapping.devUserId, userId), eq(ClerkUserMapping.liveUserId, userId))),
    ],
    ['metadata', () => byUser(UserMetadata)],
  ];
}

/**
 * Polar: cancel any live subscription at once and anonymize the customer. Polar keeps its own
 * tax records as the merchant of record; the customer's personal details are scrubbed.
 */
async function deletePolarCustomer(userId: string): Promise<void> {
  if (!isPolarConfigured()) return;
  try {
    await getPolarClient().customers.deleteExternal({ externalId: userId, anonymize: true });
  } catch (error) {
    // No Polar customer for an account that never paid.
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 404) return;
    throw error;
  }
}

/** Audienceful: remove the contact. v2 endpoint; 404 means there was none. */
async function deleteAudiencefulContact(email: string | null): Promise<void> {
  const apiKey = process.env.AUDIENCEFUL_API_KEY?.trim();
  if (!apiKey || !email) return;
  const response = await fetch('https://api.audienceful.com/v2/people/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ email }),
  });
  if (response.status === 404 || response.ok) return;
  throw new Error(`Audienceful delete failed: ${response.status}`);
}

/**
 * PostHog: delete the person and their events. Needs a personal API key with person write
 * access and the project id — the capture key the app already holds cannot delete anything.
 * Skipped, with a warning, until `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are set.
 */
async function deletePostHogPerson(userId: string): Promise<void> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
  if (!apiKey || !projectId) {
    console.warn('[delete-account] PostHog person not deleted: POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID unset');
    return;
  }
  const host = (process.env.POSTHOG_API_HOST?.trim() || 'https://us.posthog.com').replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${apiKey}` };
  const lookup = await fetch(
    `${host}/api/projects/${encodeURIComponent(projectId)}/persons/?distinct_id=${encodeURIComponent(userId)}`,
    { headers },
  );
  if (!lookup.ok) throw new Error(`PostHog lookup failed: ${lookup.status}`);
  const body = (await lookup.json()) as { results?: Array<{ id: string }> };
  for (const person of body.results ?? []) {
    const del = await fetch(
      `${host}/api/projects/${encodeURIComponent(projectId)}/persons/${encodeURIComponent(person.id)}/?delete_events=true`,
      { method: 'DELETE', headers },
    );
    if (!del.ok && del.status !== 404) throw new Error(`PostHog delete failed: ${del.status}`);
  }
}

/** The nightly backup files kept in the private `user-exports` bucket. */
async function deleteBackups(userId: string): Promise<void> {
  if (!isUserExportBackupConfigured()) return;
  await deleteUserExports(await listUserExportKeysForUser(userId));
}

/**
 * Delete everything this account owns, here and with the services that hold a copy.
 * Does not delete the Clerk user — the caller does that (or Clerk already has, for the webhook).
 */
export async function deleteAccountData(userId: string): Promise<AccountDeletionReport> {
  // Read before the metadata row goes: Audienceful is keyed by email.
  let email: string | null = null;
  try {
    const [row] = await db.select({ email: UserMetadata.email }).from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1);
    email = row?.email ?? null;
  } catch {
    /* without an email the Audienceful step is skipped and reported below */
  }

  const steps: Step[] = [
    // Billing first: stop the charge before anything else, so a failure later cannot leave a
    // deleted account paying.
    ['polar customer', () => deletePolarCustomer(userId)],
    ...databaseSteps(userId),
    ['backups', () => deleteBackups(userId)],
    ['audienceful contact', () => deleteAudiencefulContact(email)],
    ['posthog person', () => deletePostHogPerson(userId)],
  ];

  const failures: string[] = [];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (error) {
      if (missingTable(error)) continue;
      failures.push(name);
      console.error(`[delete-account] ${name} failed for ${userId}:`, error instanceof Error ? error.message : error);
    }
  }
  return { failures };
}

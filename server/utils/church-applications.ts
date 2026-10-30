/**
 * Church applications — "bring my church to Harvous", the front half of concierge onboarding.
 *
 * A staff member picks their church from Here's My Church (or types it, for a church the
 * directory doesn't have), says who they are, and waits. A Harvous admin approves in one step,
 * which does everything that used to be four hand-made steps in two dashboards:
 *
 *   1. creates the church's Clerk organization, the applicant its admin;
 *   2. registers the `Churches` row, linked to the directory listing, with a 30-day pilot;
 *   3. seeds its service times from the listing, when the listing has parseable ones;
 *   4. connects the applicant to it — and everyone who had already picked this church from the
 *      directory is connected on their next profile load, as they always were.
 *
 * Nothing pending grants anything. A declined or withdrawn request is just a status.
 *
 * Requests also arrive from the harvous.com form (`source: 'site'`), sent by someone who may
 * have no Harvous account. Those wait in the same queue with no applicant; the first time
 * someone signs in with that email, `claimSiteApplications` attaches the request to them, and
 * only then can it be approved — approval makes the applicant the church's admin, and that has to
 * be a real account.
 *
 * The table may not exist yet (code ships ahead of `npm run church-pilot:schema:apply`): reads
 * answer "no requests", writes answer a clear 503.
 */
import {
  db,
  first,
  and,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  ChurchApplications,
  Churches,
  UserMetadata,
} from '../db';
import { isPgUndefinedRelation } from './pg-undefined-relation';
import { isUniqueViolation } from './db-unique-violation';
import { hmcDenormFields, hmcGetChurchByIdForDenorm, hmcGetChurchProfile, isHmcConfigured } from './hmc-partner';
import { deriveChurchCountry } from './church-country';
import { normalizeChurchTimezone } from './church-service-time';
import { extendedPilotUntil } from './church-entitlement';
import { createClerkOrganization, deleteClerkOrganization } from './clerk-org';
import { connectUserToChurch } from './church-selection-write';
import { seedServiceTimesFromDirectory } from './church-service-choice';
import { createClerkClient } from '@clerk/backend';

export type ChurchApplicationRow = typeof ChurchApplications.$inferSelect;
export type ApplicationStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

/** The pilot every approved church starts on. */
export const APPLICATION_PILOT_DAYS = 30;

const NAME_MAX = 120;
const SHORT_MAX = 80;
const NOTES_MAX = 1000;

const clean = (raw: unknown, max: number): string | null => {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
};

export type ApplicationInput = {
  hmcChurchId: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  applicantRole: string | null;
  contactEmail: string | null;
  timezone: string | null;
  notes: string | null;
};

export type CleanResult = { ok: true; value: ApplicationInput } | { ok: false; error: string; code: string };

/** Pure: read and validate what an applicant sent. A directory pick needs no typed name. */
export function cleanApplicationInput(body: Record<string, unknown>): CleanResult {
  const hmcChurchId = clean(body.hmcChurchId, SHORT_MAX);
  const name = clean(body.name, NAME_MAX);
  if (!hmcChurchId && !name) return { ok: false, error: 'Pick your church, or type its name', code: 'CHURCH_REQUIRED' };
  const applicantRole = clean(body.applicantRole, SHORT_MAX);
  if (!applicantRole) return { ok: false, error: 'Say what you do at the church', code: 'ROLE_REQUIRED' };
  const contactEmail = clean(body.contactEmail, 254);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { ok: false, error: 'That email doesn’t look right', code: 'EMAIL_INVALID' };
  }
  const tz = normalizeChurchTimezone(body.timezone ?? null);
  return {
    ok: true,
    value: {
      hmcChurchId,
      name,
      city: clean(body.city, SHORT_MAX),
      state: clean(body.state, SHORT_MAX),
      country: clean(body.country, 2)?.toUpperCase() ?? null,
      applicantRole,
      contactEmail,
      timezone: tz.ok ? tz.value : null,
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, NOTES_MAX) || null : null,
    },
  };
}

/** Pure: may this person act on this application, and how? */
export function canWithdraw(row: Pick<ChurchApplicationRow, 'applicantUserId' | 'status'>, userId: string): boolean {
  return row.applicantUserId === userId && row.status === 'pending';
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The applicant's most recent request, or null (including before the table exists). */
export async function latestApplicationFor(userId: string): Promise<ChurchApplicationRow | null> {
  try {
    return (
      first(
        await db
          .select()
          .from(ChurchApplications)
          .where(eq(ChurchApplications.applicantUserId, userId))
          .orderBy(desc(ChurchApplications.createdAt))
          .limit(1),
      ) ?? null
    );
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchApplications')) return null;
    throw error;
  }
}

/** The admin queue: requests of one status, newest first, with how many people already picked each church. */
export async function listApplications(status: ApplicationStatus): Promise<
  Array<ChurchApplicationRow & { interestCount: number }>
> {
  let rows: ChurchApplicationRow[] = [];
  try {
    rows = await db
      .select()
      .from(ChurchApplications)
      .where(eq(ChurchApplications.status, status))
      .orderBy(desc(ChurchApplications.createdAt))
      .limit(200);
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchApplications')) return [];
    throw error;
  }
  const ids = [...new Set(rows.map((row) => row.hmcChurchId).filter((id): id is string => Boolean(id)))];
  const counts = new Map<string, number>();
  if (ids.length) {
    const interest = await db
      .select({ hmcChurchId: UserMetadata.hmcChurchId, n: sql<number>`count(*)::int` })
      .from(UserMetadata)
      .where(inArray(UserMetadata.hmcChurchId, ids))
      .groupBy(UserMetadata.hmcChurchId);
    for (const row of interest) if (row.hmcChurchId) counts.set(row.hmcChurchId, Number(row.n));
  }
  return rows.map((row) => ({ ...row, interestCount: row.hmcChurchId ? counts.get(row.hmcChurchId) ?? 0 : 0 }));
}

// ─── From harvous.com ────────────────────────────────────────────────────────

/** Mirrors the site form's role select (harvous.com src/lib/church-interest.ts). */
const SITE_ROLE_LABEL: Record<string, string> = {
  pastor: 'Pastor',
  staff: 'Church staff',
  'group-leader': 'Group leader',
  teacher: 'Teacher',
};

/** Mirrors the site form's interest checkboxes. */
const SITE_INTEREST_LABEL: Record<string, string> = {
  'shared-spaces': 'Shared Spaces',
  'church-org-curriculum': 'Church curriculum',
  'chms-integrations': 'ChMS integrations',
  'getting-set-up': 'Help getting set up',
};

export type SiteIntake = {
  applicantName: string;
  contactEmail: string;
  applicantRole: string;
  churchName: string;
  churchCity: string | null;
  churchState: string | null;
  churchCountry: string | null;
  hmcChurchId: string | null;
  notes: string | null;
};

export type SiteIntakeResult = { ok: true; value: SiteIntake } | { ok: false; error: string };

/**
 * Pure: read a submission the harvous.com Worker forwards. The site already validated it; this
 * re-checks only what the queue needs, because the request crossed a network boundary.
 */
export function cleanSiteIntake(body: Record<string, unknown>): SiteIntakeResult {
  const applicantName = clean(body.name, NAME_MAX);
  const contactEmail = clean(body.email, 254)?.toLowerCase() ?? null;
  const churchName = clean(body.churchName, NAME_MAX);
  if (!applicantName || !contactEmail || !churchName) return { ok: false, error: 'name, email and churchName are required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { ok: false, error: 'email is invalid' };
  const roleKey = clean(body.role, SHORT_MAX) ?? 'other';
  const applicantRole =
    roleKey === 'other' ? clean(body.roleOther, SHORT_MAX) ?? 'Other' : SITE_ROLE_LABEL[roleKey] ?? roleKey;
  const interests = (clean(body.interests, 400) ?? '')
    .split(',')
    .map((key) => SITE_INTEREST_LABEL[key.trim()])
    .filter(Boolean);
  const denomination = clean(body.churchDenomination, SHORT_MAX);
  const notes = [
    interests.length ? `Interested in: ${interests.join(', ')}` : null,
    denomination ? `Denomination: ${denomination}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const countryRaw = clean(body.churchCountry, 16)?.toUpperCase() ?? null;
  // 'OTHER' is the site form's "not in the list" sentinel; only a real ISO code is kept.
  const country = countryRaw && /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : null;
  return {
    ok: true,
    value: {
      applicantName,
      contactEmail,
      applicantRole,
      churchName,
      churchCity: clean(body.churchCity, SHORT_MAX),
      churchState: clean(body.churchState, SHORT_MAX),
      churchCountry: country,
      hmcChurchId: clean(body.hmcChurchId, SHORT_MAX),
      notes: notes || null,
    },
  };
}

/**
 * Queue a harvous.com request. Idempotent in effect: the same email asking again while a request
 * is waiting refreshes nothing and creates nothing, and a church someone else already asked for
 * is answered "already queued" — the site has saved its own copy either way.
 */
export async function submitSiteApplication(
  input: SiteIntake,
  now = new Date(),
): Promise<{ ok: true; id: string; duplicate: boolean } | { ok: false; status: 409 | 503; code: string; error: string }> {
  try {
    const waiting = first(
      await db
        .select({ id: ChurchApplications.id })
        .from(ChurchApplications)
        .where(
          and(
            eq(ChurchApplications.status, 'pending'),
            sql`lower(${ChurchApplications.contactEmail}) = ${input.contactEmail}`,
          ),
        )
        .limit(1),
    );
    if (waiting) return { ok: true, id: waiting.id, duplicate: true };

    let { churchName: name, churchCity: city, churchState: state, churchCountry: country } = input;
    let hmcChurchId: string | null = null;
    if (input.hmcChurchId) {
      // The directory's own record wins over what was typed, as it does in the app.
      const hmc = await hmcGetChurchByIdForDenorm(input.hmcChurchId).catch(() => null);
      if (hmc) {
        const denorm = hmcDenormFields(hmc);
        hmcChurchId = hmc.id;
        name = denorm.name;
        city = denorm.city;
        state = denorm.state;
        country = denorm.country;
      }
    }
    const row = first(
      await db
        .insert(ChurchApplications)
        .values({
          id: `capp_${crypto.randomUUID()}`,
          source: 'site',
          hmcChurchId,
          name,
          city,
          state,
          country: deriveChurchCountry(country, state),
          applicantUserId: null,
          applicantName: input.applicantName,
          applicantRole: input.applicantRole,
          contactEmail: input.contactEmail,
          notes: input.notes,
          status: 'pending',
          createdAt: now,
        })
        .returning({ id: ChurchApplications.id }),
    )!;
    return { ok: true, id: row.id, duplicate: false };
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchApplications')) {
      return { ok: false, status: 503, code: 'APPLICATIONS_UNAVAILABLE', error: 'Requests aren’t open yet' };
    }
    if (isUniqueViolation(error, 'ChurchApplications_hmc_pending_unique')) {
      // Someone else from this church already asked; the site keeps this person's copy.
      return { ok: true, id: '', duplicate: true };
    }
    throw error;
  }
}

/** Every verified email on a Clerk account, lowercased. Empty when Clerk can't say. */
async function verifiedEmailsFor(userId: string): Promise<string[]> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return [];
  try {
    const user = await createClerkClient({ secretKey }).users.getUser(userId);
    return (user.emailAddresses ?? [])
      .filter((entry) => entry.verification?.status === 'verified')
      .map((entry) => entry.emailAddress.trim().toLowerCase());
  } catch {
    return [];
  }
}

/**
 * Attach waiting harvous.com requests to the account now signed in with their email. Verified
 * emails only: whoever controls the address is who asked. Returns how many it attached.
 */
export async function claimSiteApplications(userId: string, now = new Date()): Promise<number> {
  const emails = await verifiedEmailsFor(userId);
  if (!emails.length) return 0;
  try {
    const rows = await db
      .update(ChurchApplications)
      .set({ applicantUserId: userId, updatedAt: now })
      .where(
        and(
          eq(ChurchApplications.status, 'pending'),
          isNull(ChurchApplications.applicantUserId),
          inArray(sql`lower(${ChurchApplications.contactEmail})`, emails),
        ),
      )
      .returning({ id: ChurchApplications.id });
    return rows.length;
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchApplications')) return 0;
    throw error;
  }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type SubmitResult =
  | { ok: true; application: ChurchApplicationRow }
  | {
      ok: false;
      status: 400 | 404 | 409 | 503;
      code: string;
      error: string;
      /** When the church is already on Harvous: who to connect to instead. */
      church?: { id: string; name: string };
    };

export async function submitApplication(userId: string, input: ApplicationInput, now = new Date()): Promise<SubmitResult> {
  let name = input.name;
  let city = input.city;
  let state = input.state;
  let country = input.country;
  let hmcChurchId: string | null = null;

  if (input.hmcChurchId) {
    const hmc = await hmcGetChurchByIdForDenorm(input.hmcChurchId);
    if (!hmc) return { ok: false, status: 404, code: 'HMC_CHURCH_NOT_FOUND', error: 'We couldn’t find that church in the directory' };
    const denorm = hmcDenormFields(hmc);
    hmcChurchId = hmc.id;
    name = denorm.name;
    city = denorm.city;
    state = denorm.state;
    country = denorm.country;

    const registered = first(
      await db
        .select({ id: Churches.id, name: Churches.name })
        .from(Churches)
        .where(eq(Churches.hmcChurchId, hmc.id))
        .limit(1),
    );
    if (registered) {
      return {
        ok: false,
        status: 409,
        code: 'CHURCH_ALREADY_ON_HARVOUS',
        error: `${registered.name} is already on Harvous`,
        church: registered,
      };
    }
  }
  country = deriveChurchCountry(country, state);

  try {
    const mine = await latestApplicationFor(userId);
    if (mine?.status === 'pending') {
      return { ok: false, status: 409, code: 'APPLICATION_PENDING', error: 'You already have a request waiting' };
    }
    const application = first(
      await db
        .insert(ChurchApplications)
        .values({
          id: `capp_${crypto.randomUUID()}`,
          hmcChurchId,
          name: name ?? 'Church',
          city,
          state,
          country,
          applicantUserId: userId,
          applicantRole: input.applicantRole,
          contactEmail: input.contactEmail,
          timezone: input.timezone,
          notes: input.notes,
          status: 'pending',
          createdAt: now,
        })
        .returning(),
    )!;
    return { ok: true, application };
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchApplications')) {
      return { ok: false, status: 503, code: 'APPLICATIONS_UNAVAILABLE', error: 'Requests aren’t open yet' };
    }
    if (isUniqueViolation(error, 'ChurchApplications_hmc_pending_unique')) {
      // ChurchApplications_hmc_pending_unique: someone else at this church already asked.
      return { ok: false, status: 409, code: 'CHURCH_REQUEST_EXISTS', error: 'Someone from your church already asked — we’ll be in touch with them' };
    }
    throw error;
  }
}

export async function withdrawApplication(userId: string, id: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(ChurchApplications)
    .set({ status: 'withdrawn', updatedAt: now })
    .where(
      and(
        eq(ChurchApplications.id, id),
        eq(ChurchApplications.applicantUserId, userId),
        eq(ChurchApplications.status, 'pending'),
      ),
    )
    .returning({ id: ChurchApplications.id });
  return rows.length > 0;
}

export async function declineApplication(input: { id: string; adminUserId: string; note: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const rows = await db
    .update(ChurchApplications)
    .set({ status: 'declined', decidedByUserId: input.adminUserId, decidedAt: now, decisionNote: input.note, updatedAt: now })
    .where(and(eq(ChurchApplications.id, input.id), eq(ChurchApplications.status, 'pending')))
    .returning({ id: ChurchApplications.id });
  return rows.length > 0;
}

export type ApproveResult =
  | {
      ok: true;
      church: typeof Churches.$inferSelect;
      seededServiceTimes: number;
      /** People who had already picked this church from the directory — connected on their next load. */
      alreadyPickedCount: number;
    }
  | { ok: false; status: 404 | 409 | 422 | 502; code: string; error: string };

/**
 * Approve: claim the request, create the org, register the church, seed, connect.
 *
 * The claim comes first (pending → approved, conditionally) so a double tap creates one org,
 * not two. Clerk is outside the transaction, so a failure after the org exists deletes it again
 * and puts the request back to pending — the admin sees an error and can simply retry.
 */
export async function approveApplication(input: { id: string; adminUserId: string; now?: Date }): Promise<ApproveResult> {
  const now = input.now ?? new Date();
  const claimed = first(
    await db
      .update(ChurchApplications)
      .set({ status: 'approved', decidedByUserId: input.adminUserId, decidedAt: now, updatedAt: now })
      .where(and(eq(ChurchApplications.id, input.id), eq(ChurchApplications.status, 'pending')))
      .returning(),
  );
  if (!claimed) return { ok: false, status: 409, code: 'NOT_PENDING', error: 'That request was already decided' };
  const applicantUserId = claimed.applicantUserId;
  if (!applicantUserId) {
    // A harvous.com request nobody has signed in for yet. Approval would make no one the admin.
    await db
      .update(ChurchApplications)
      .set({ status: 'pending', decidedByUserId: null, decidedAt: null, updatedAt: new Date() })
      .where(eq(ChurchApplications.id, claimed.id));
    return {
      ok: false,
      status: 409,
      code: 'NO_ACCOUNT_YET',
      error: 'They haven’t signed in to Harvous yet. Send them the setup link; this attaches when they do.',
    };
  }

  const release = async () => {
    await db
      .update(ChurchApplications)
      .set({ status: 'pending', decidedByUserId: null, decidedAt: null, updatedAt: new Date() })
      .where(eq(ChurchApplications.id, claimed.id));
  };

  if (claimed.hmcChurchId) {
    const taken = first(
      await db.select({ id: Churches.id }).from(Churches).where(eq(Churches.hmcChurchId, claimed.hmcChurchId)).limit(1),
    );
    if (taken) {
      await release();
      return { ok: false, status: 409, code: 'HMC_ALREADY_LINKED', error: 'Another church is already linked to this directory listing' };
    }
  }

  let orgId: string;
  try {
    orgId = (await createClerkOrganization({ name: claimed.name, createdByUserId: applicantUserId })).id;
  } catch (error) {
    await release();
    return {
      ok: false,
      status: 502,
      code: (error as { code?: string })?.code ?? 'CLERK_UNAVAILABLE',
      error: error instanceof Error ? error.message : 'Could not create the church’s organization',
    };
  }

  let church: typeof Churches.$inferSelect;
  try {
    church = first(
      await db
        .insert(Churches)
        .values({
          id: `chur_${crypto.randomUUID()}`,
          orgId,
          hmcChurchId: claimed.hmcChurchId,
          name: claimed.name,
          city: claimed.city,
          state: claimed.state,
          country: claimed.country,
          timezone: claimed.timezone,
          // The applicant — which also makes them staff before Clerk's roster is read
          // (church-staff.ts: createdBy is staff).
          createdBy: applicantUserId,
          billingPlan: null,
          pilotUntil: extendedPilotUntil(null, APPLICATION_PILOT_DAYS, now),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    )!;
    await db.update(ChurchApplications).set({ churchId: church.id }).where(eq(ChurchApplications.id, claimed.id));
  } catch (error) {
    await deleteClerkOrganization(orgId).catch(() => undefined);
    await release();
    throw error;
  }

  // From here the church exists; anything else is best-effort and never undoes it.
  let seededServiceTimes = 0;
  if (claimed.hmcChurchId && isHmcConfigured()) {
    try {
      const profile = await hmcGetChurchProfile(claimed.hmcChurchId);
      seededServiceTimes = await seedServiceTimesFromDirectory(church.id, profile?.serviceTimes?.slots ?? [], now);
    } catch (error) {
      console.warn('[church-applications] service-time seed skipped', error instanceof Error ? error.message : error);
    }
  }
  await connectUserToChurch(applicantUserId, church).catch((error) => {
    console.warn('[church-applications] applicant connect failed', error instanceof Error ? error.message : error);
  });

  let alreadyPickedCount = 0;
  if (claimed.hmcChurchId) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(UserMetadata)
      .where(eq(UserMetadata.hmcChurchId, claimed.hmcChurchId));
    alreadyPickedCount = Number(row?.n ?? 0);
  }

  return { ok: true, church, seededServiceTimes, alreadyPickedCount };
}

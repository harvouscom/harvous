/**
 * Church-org admin provisioning endpoints (phase 1 — fully dark).
 *
 * All endpoints are requireHarvousAdmin-gated; there is no user-facing
 * church surface yet. The pilot flow: create the Clerk Organization
 * manually in the Clerk dashboard (staff/volunteers only, ≤20 — congregants
 * are NEVER Clerk org members), then register it here.
 *
 * Endpoints:
 *   GET  /api/admin/churches                          — list + space counts
 *   POST /api/admin/churches                          — register a church (verifies the Clerk org exists)
 *   POST /api/admin/churches/:churchId/deactivate     — flip isActive off (inert kill-switch; spaces untouched)
 *   POST /api/admin/churches/:churchId/reactivate     — flip isActive on
 *   POST /api/admin/churches/:churchId/spaces         — create an org-owned broadcast space (type='public' + orgId)
 *   POST /api/admin/churches/:churchId/sync-staff     — sync Clerk org members → 'leader' rows on org spaces
 *
 * This file contains the first code paths that write Churches rows and set
 * Spaces.orgId. Org-owned spaces are already handled by the groundwork:
 * excluded from personal owned-space counts (tier-limits.ts) and exempt from
 * the 30-person cap when type='public' — so no add-on/limit checks run here.
 */

import { Hono } from 'hono';
import { db, first, Spaces, SpaceMemberships, Churches, eq, and, isNull, nowISO } from '../db';
import { requireHarvousAdmin, getHarvousSystemUserId } from '../utils/harvous-admin';
import { getAuth } from '../middleware/auth';
import {
  ClerkOrgError,
  computeStaffSyncPlan,
  fetchClerkOrganization,
  fetchClerkOrganizations,
  fetchClerkOrgMemberships,
  isValidClerkOrgId,
} from '../utils/clerk-org';
import { getThreadGradientCSS } from '@/utils/colors';
import { serializeSpaceCoverForDb, spaceCoverFromThreadColor } from '@/utils/space-cover';
import { validateTitle, validateColor } from '@/utils/validation';
import { generateSpaceId } from '@/utils/ids';
import { handleAPIError } from '@/utils/error-handling';

const app = new Hono();

function clerkErrorResponse(c: any, error: unknown) {
  if (error instanceof ClerkOrgError) {
    if (error.code === 'CLERK_ORGS_NOT_ENABLED') {
      return c.json({
        error: 'Clerk Organizations is not enabled for this instance — enable it in the Clerk dashboard first',
        code: 'CLERK_ORGS_NOT_ENABLED',
      }, 422);
    }
    return c.json({ error: 'Clerk is unavailable — try again', code: 'CLERK_UNAVAILABLE' }, 502);
  }
  return null;
}

// ─── GET /api/admin/churches ────────────────────────────────────────────────
app.get('/api/admin/churches', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const churches = await db.select().from(Churches).orderBy(Churches.createdAt);

    // Per-church org-space counts (small admin list; churches are few)
    const rows = await Promise.all(
      churches.map(async (church) => {
        const spaces = await db
          .select({ id: Spaces.id })
          .from(Spaces)
          .where(and(eq(Spaces.orgId, church.orgId), isNull(Spaces.deletedAt)));
        return { ...church, spaceCount: spaces.length };
      }),
    );

    return c.json({ success: true, churches: rows.reverse() });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/admin/churches', action: 'list_churches' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/admin/churches/clerk-orgs ─────────────────────────────────────
/**
 * Clerk organizations available to register, for the admin picker. Churches are
 * onboarded manually, so the admin selects an org by name rather than pasting
 * an opaque org_ id. Already-registered orgs are flagged, not hidden, so the
 * picker explains why one isn't selectable.
 */
app.get('/api/admin/churches/clerk-orgs', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    let orgs;
    try {
      orgs = await fetchClerkOrganizations();
    } catch (error) {
      const resp = clerkErrorResponse(c, error);
      if (resp) return resp;
      throw error;
    }

    const registered = new Set(
      (await db.select({ orgId: Churches.orgId }).from(Churches)).map((row) => row.orgId),
    );

    return c.json({
      success: true,
      orgs: orgs.map((org) => ({ ...org, registered: registered.has(org.id) })),
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/admin/churches/clerk-orgs', action: 'list_clerk_orgs' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/admin/churches ───────────────────────────────────────────────
app.post('/api/admin/churches', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const body = await c.req.json().catch(() => ({} as any));
    const orgId = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() || null : null;
    const state = typeof body.state === 'string' ? body.state.trim() || null : null;
    const country = typeof body.country === 'string' ? body.country.trim() || null : null;

    if (!isValidClerkOrgId(orgId)) {
      return c.json({ error: 'orgId must be a Clerk organization id (org_…)', code: 'INVALID_ORG_ID' }, 400);
    }
    const titleValidation = validateTitle(name, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);

    const existing = first(await db.select({ id: Churches.id }).from(Churches).where(eq(Churches.orgId, orgId)).limit(1));
    if (existing) return c.json({ error: 'A church is already registered for this organization', code: 'CHURCH_EXISTS' }, 409);

    // Verify the org actually exists in Clerk before registering. Fail closed:
    // the admin created it in the dashboard moments ago, so a retry is cheap.
    let clerkOrg;
    try {
      clerkOrg = await fetchClerkOrganization(orgId);
    } catch (error) {
      const resp = clerkErrorResponse(c, error);
      if (resp) return resp;
      throw error;
    }
    if (!clerkOrg) return c.json({ error: 'No Clerk organization found with that id', code: 'CLERK_ORG_NOT_FOUND' }, 422);

    const now = nowISO();
    // The secret-bearer admin path has no userId — fall back to the system user for the audit anchor.
    const createdBy = getAuth(c)?.userId ?? getHarvousSystemUserId();

    const church = first(await db.insert(Churches).values({
      id: `chur_${crypto.randomUUID()}`,
      orgId,
      name,
      city,
      state,
      country,
      createdBy,
      billingPlan: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }).returning())!;

    // Echo Clerk's own name so the admin can eyeball a mismatch with the registered name.
    return c.json({ success: true, church, clerkOrg: { name: clerkOrg.name, slug: clerkOrg.slug } });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/admin/churches', action: 'register_church' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/admin/churches/:churchId/deactivate | /reactivate ────────────
async function setChurchActive(c: any, active: boolean) {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const churchId = c.req.param('churchId');
    const church = first(await db.update(Churches)
      .set({ isActive: active, updatedAt: nowISO() })
      .where(eq(Churches.id, churchId))
      .returning());
    if (!church) return c.json({ error: 'Church not found', code: 'CHURCH_NOT_FOUND' }, 404);
    return c.json({ success: true, church });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/admin/churches/[churchId]/active', action: 'set_church_active' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
}

app.post('/api/admin/churches/:churchId/deactivate', (c) => setChurchActive(c, false));
app.post('/api/admin/churches/:churchId/reactivate', (c) => setChurchActive(c, true));

// ─── POST /api/admin/churches/:churchId/spaces ──────────────────────────────
/**
 * Creates an org-owned broadcast space: type='public', orgId = church.orgId.
 * Spaces.userId is the explicit designated staff owner (validated as a
 * current Clerk org member) — never the Harvous system user, so ownership
 * never needs migrating when the church takes over administration.
 */
app.post('/api/admin/churches/:churchId/spaces', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const churchId = c.req.param('churchId');
    const church = first(await db.select().from(Churches).where(eq(Churches.id, churchId)).limit(1));
    if (!church) return c.json({ error: 'Church not found', code: 'CHURCH_NOT_FOUND' }, 404);
    if (!church.isActive || church.deletedAt) {
      return c.json({ error: 'Church is not active', code: 'CHURCH_INACTIVE' }, 409);
    }

    const body = await c.req.json().catch(() => ({} as any));
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() || null : null;
    const color = typeof body.color === 'string' && body.color ? body.color : 'paper';
    const ownerUserId = typeof body.ownerUserId === 'string' ? body.ownerUserId.trim() : '';

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);
    if (!ownerUserId) return c.json({ error: 'ownerUserId is required', code: 'OWNER_REQUIRED' }, 400);

    let staff;
    try {
      staff = await fetchClerkOrgMemberships(church.orgId);
    } catch (error) {
      const resp = clerkErrorResponse(c, error);
      if (resp) return resp;
      throw error;
    }
    if (!staff.some((m) => m.userId === ownerUserId)) {
      return c.json({ error: 'ownerUserId is not a member of the Clerk organization', code: 'OWNER_NOT_IN_ORG' }, 422);
    }

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const cover = spaceCoverFromThreadColor(color);
    const { coverBgLight, coverBgDark } = serializeSpaceCoverForDb(cover);
    const now = nowISO();

    // No add-on/limit checks: org-sponsored spaces bill to the church and are
    // excluded from personal owned counts; public spaces are cap-exempt.
    const space = await db.transaction(async (tx) => {
      const created = first(await tx.insert(Spaces).values({
        id: generateSpaceId(),
        title: capitalizedTitle,
        description,
        color,
        backgroundGradient: getThreadGradientCSS(color),
        coverBgLight,
        coverBgDark,
        userId: ownerUserId,
        type: 'public',
        orgId: church.orgId,
        isPublic: false,
        isFeatured: false,
        isActive: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      }).returning())!;

      await tx.insert(SpaceMemberships).values({
        id: `smem_${crypto.randomUUID()}`,
        spaceId: created.id,
        userId: ownerUserId,
        role: 'owner',
        joinedAt: now,
        createdAt: now,
      });

      return created;
    });

    return c.json({ success: true, space });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/admin/churches/[churchId]/spaces', action: 'create_church_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/admin/churches/:churchId/sync-staff ──────────────────────────
/**
 * Reads the Clerk org roster and reconciles SpaceMemberships on every
 * org-owned space: staff → 'leader' rows (insert/promote), departed staff
 * 'leader' rows removed. Invariants: the Spaces.userId owner row is never
 * demoted or removed (healed if missing), and 'member' rows are never
 * touched — they are future congregant followers, not staff. Manual button
 * only in phase 1; never mutates when the Clerk fetch fails.
 */
app.post('/api/admin/churches/:churchId/sync-staff', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;

  try {
    const churchId = c.req.param('churchId');
    const church = first(await db.select().from(Churches).where(eq(Churches.id, churchId)).limit(1));
    if (!church) return c.json({ error: 'Church not found', code: 'CHURCH_NOT_FOUND' }, 404);
    if (!church.isActive || church.deletedAt) {
      return c.json({ error: 'Church is not active', code: 'CHURCH_INACTIVE' }, 409);
    }

    let staff;
    try {
      staff = await fetchClerkOrgMemberships(church.orgId);
    } catch (error) {
      const resp = clerkErrorResponse(c, error);
      if (resp) return resp;
      throw error;
    }

    // Include inactive spaces (membership stays truthful); exclude deleted.
    const orgSpaces = await db.select().from(Spaces)
      .where(and(eq(Spaces.orgId, church.orgId), isNull(Spaces.deletedAt)));
    if (orgSpaces.length === 0) {
      return c.json({ success: true, staffCount: staff.length, spaces: [], warnings: ['This church has no org spaces yet'] });
    }

    const now = nowISO();
    const warnings: string[] = [];
    const results: { spaceId: string; title: string; added: number; promoted: number; removed: number; healedOwner: boolean }[] = [];

    for (const space of orgSpaces) {
      const existing = await db
        .select({ userId: SpaceMemberships.userId, role: SpaceMemberships.role })
        .from(SpaceMemberships)
        .where(eq(SpaceMemberships.spaceId, space.id));

      const plan = computeStaffSyncPlan({ spaceOwnerUserId: space.userId, staff, existing });
      warnings.push(...plan.warnings);

      await db.transaction(async (tx) => {
        if (plan.healOwnerRow) {
          await tx.insert(SpaceMemberships).values({
            id: `smem_${crypto.randomUUID()}`,
            spaceId: space.id,
            userId: space.userId,
            role: 'owner',
            joinedAt: now,
            createdAt: now,
          }).onConflictDoNothing();
        }
        for (const userId of plan.toInsertLeaders) {
          await tx.insert(SpaceMemberships).values({
            id: `smem_${crypto.randomUUID()}`,
            spaceId: space.id,
            userId,
            role: 'leader',
            joinedAt: now,
            createdAt: now,
          }).onConflictDoNothing();
        }
        for (const userId of plan.toPromoteToLeader) {
          await tx.update(SpaceMemberships)
            .set({ role: 'leader', updatedAt: now })
            .where(and(eq(SpaceMemberships.spaceId, space.id), eq(SpaceMemberships.userId, userId)));
        }
        for (const userId of plan.toRemove) {
          // Guard restated in SQL: only 'leader' rows are ever deleted here —
          // never role 'owner', never role 'member' (congregant followers).
          await tx.delete(SpaceMemberships)
            .where(and(
              eq(SpaceMemberships.spaceId, space.id),
              eq(SpaceMemberships.userId, userId),
              eq(SpaceMemberships.role, 'leader'),
            ));
        }
      });

      results.push({
        spaceId: space.id,
        title: space.title,
        added: plan.toInsertLeaders.length,
        promoted: plan.toPromoteToLeader.length,
        removed: plan.toRemove.length,
        healedOwner: plan.healOwnerRow,
      });
    }

    return c.json({ success: true, staffCount: staff.length, spaces: results, warnings: [...new Set(warnings)] });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/admin/churches/[churchId]/sync-staff', action: 'sync_church_staff' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;

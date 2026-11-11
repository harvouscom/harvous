import { timingSafeEqual } from 'node:crypto';
import { purgeExpiredFamilyData } from '../family/retention';
import { exportChildNotebook } from '../family/notebook-export';
import { familyPublicConfig } from '../family/config';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { createClerkClient } from '@clerk/backend';
import { and, eq, gt, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { FamilyChildren, FamilyChildSessions, FamilySpaceApprovals, FamilyVerifications, Notes, Spaces } from '../db/schema';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { isPgUndefinedRelation } from '../utils/pg-undefined-relation';
import { CHILD_CAPABILITIES, CHILD_NOTICE_VERSION, HANDOFF_TTL_MS, VERIFICATION_TTL_MS, childSecret, emailDigest, hashSecret, hasActiveChildConsent, verifyKwsSignature } from '../family/policy';
import { kwsConfig, requireFamilyEnrollment, sendKwsVerification } from '../family/kws';
import { availableMinistries, childNoteSelection, deleteChildData, ministryMaterials, ownedChild, redeemHandoff, withChildSession } from '../family/service';

const route = new Hono();
const base = '/api/child-accounts';
route.use(`${base}/*`, async (c, next) => {
  if (c.req.path.startsWith(`${base}/child/`)) {
    const config = familyPublicConfig();
    if (!config || c.req.header('Origin') && c.req.header('Origin') !== config.childOrigin) {
      return c.json({ error: 'Open the child notebook from your parent’s sign-in link.' }, 403);
    }
  }
  // Parent mutations cannot use ambient cookies alone. The SPA attaches a Clerk JWT.
  if (!c.req.path.startsWith(`${base}/child/`) && !c.req.header('Authorization')?.startsWith('Bearer ')) {
    return c.json({ error: 'Sign in to manage your family.' }, 401);
  }
  await next();
});
route.use(`${base}/*`, bodyLimit({ maxSize: 32 * 1024 }));
route.use(`${base}/*`, async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
route.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Please check the information you entered.' }, 400);
  // Never log child content, parent emails, bearer tokens, or webhook bodies.
  console.error('[family] request failed');
  return c.json({ error: 'We could not complete that request. Please try again.' }, 500);
});
const parentId = (c: Parameters<typeof getAuthenticatedAuth>[0]) => getAuthenticatedAuth(c).userId;
const token = (c: Parameters<typeof getAuthenticatedAuth>[0]) => c.req.header('Authorization')?.match(/^Bearer (hvkid_[\w-]{43})$/)?.[1];

// The parent UI does not ask for child details until this flow is complete.
route.get(`${base}/status`, requireAuth, async (c) => {
  const config = kwsConfig();
  const publicConfig = familyPublicConfig();
  const available = process.env.HARVOUS_CHILD_ACCOUNTS_ENABLED === 'true' && process.env.HARVOUS_CHILD_RETENTION_READY === 'true' && !!config && !!publicConfig &&
    (process.env.NODE_ENV !== 'production' || config.environment === 'production');
  try {
    const children = await db.select().from(FamilyChildren).where(eq(FamilyChildren.parentUserId, parentId(c)));
    const verifications = await db.select({ id: FamilyVerifications.id, status: FamilyVerifications.status })
      .from(FamilyVerifications).where(and(eq(FamilyVerifications.parentUserId, parentId(c)),
        gt(FamilyVerifications.expiresAt, new Date()))).orderBy(desc(FamilyVerifications.createdAt));
    return c.json({ available, children, verifications, ...publicConfig, noticeVersion: CHILD_NOTICE_VERSION });
  } catch (error) {
    if (isPgUndefinedRelation(error, 'FamilyChildren') || isPgUndefinedRelation(error, 'FamilyVerifications')) {
      return c.json({ available: false, children: [], verifications: [], noticeVersion: CHILD_NOTICE_VERSION });
    }
    throw error;
  }
});

route.post(`${base}/verification`, requireAuth, async (c) => {
  const config = requireFamilyEnrollment();
  const input = z.object({ location: z.literal('US') }).strict().parse(await c.req.json());
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const user = await clerk.users.getUser(parentId(c));
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId && e.verification?.status === 'verified')?.emailAddress;
  if (!email) throw new HTTPException(403, { message: 'Verify your account email before setting up a child account.' });
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parentId(c)}))`);
    const deleting = await tx.select({ id: FamilyVerifications.id }).from(FamilyVerifications).where(and(
      eq(FamilyVerifications.parentUserId, parentId(c)), eq(FamilyVerifications.status, 'parent-deleting')));
    if (deleting.length) throw new HTTPException(409, { message: 'This account is being deleted.' });
    const recent = await tx.select({ id: FamilyVerifications.id }).from(FamilyVerifications).where(and(
      eq(FamilyVerifications.parentUserId, parentId(c)), gt(FamilyVerifications.createdAt, new Date(Date.now() - 3600_000))));
    if (recent.length >= 3) throw new HTTPException(429, { message: 'Please check your email or try again in an hour.' });
    await tx.insert(FamilyVerifications).values({ id, parentUserId: parentId(c), parentEmailHash: emailDigest(email),
      environment: config.environment, location: input.location, status: 'pending', createdAt: new Date(),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) });
  });
  try { await sendKwsVerification(email, id, input.location); }
  catch (error) {
    await db.update(FamilyVerifications).set({ status: 'failed' }).where(and(eq(FamilyVerifications.id, id), eq(FamilyVerifications.status, 'pending')));
    throw error;
  }
  return c.json({ id, status: 'pending' }, 202);
});

// External callback is signed, bounded and not authenticated with an adult session.
route.post('/api/webhooks/kws', bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
  c.header('Cache-Control', 'no-store');
  const config = kwsConfig();
  if (!config) throw new HTTPException(503, { message: 'Verification is not configured.' });
  const raw = await c.req.text();
  if (!verifyKwsSignature(raw, c.req.header('x-kws-signature'), [config.webhookSecret, process.env.KWS_PREVIOUS_WEBHOOK_SECRET ?? ''])) {
    throw new HTTPException(401, { message: 'Invalid signature.' });
  }
  const event = z.object({ name: z.string(), orgId: z.string(), productId: z.string(),
    payload: z.object({ parentEmail: z.string().email(), externalPayload: z.string().uuid(),
      status: z.object({ verified: z.boolean(), transactionId: z.string().min(1).max(200) }) }) }).parse(JSON.parse(raw));
  if (event.orgId !== config.orgId || event.productId !== config.productId) throw new HTTPException(403, { message: 'Wrong verification product.' });
  if (event.name !== 'parent-verified' || event.payload.status.verified !== true) return c.json({ received: true });
  await db.update(FamilyVerifications).set({ status: 'verified', verifiedAt: new Date(), transactionId: event.payload.status.transactionId })
    .where(and(eq(FamilyVerifications.id, event.payload.externalPayload), eq(FamilyVerifications.status, 'pending'),
      eq(FamilyVerifications.environment, config.environment), eq(FamilyVerifications.parentEmailHash, emailDigest(event.payload.parentEmail)),
      gt(FamilyVerifications.expiresAt, new Date())));
  return c.json({ received: true });
});

route.post(`${base}/children`, requireAuth, async (c) => {
  const config = requireFamilyEnrollment();
  const input = z.object({ verificationId: z.string().uuid(), displayName: z.string().trim().min(1).max(32),
    ageBand: z.enum(['under-8', '8-12']), noticeVersion: z.literal(CHILD_NOTICE_VERSION),
    isGuardian: z.literal(true), consent: z.literal(true) }).strict().parse(await c.req.json());
  const child = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parentId(c)}))`);
    const existing = await tx.select({ id: FamilyChildren.id }).from(FamilyChildren).where(eq(FamilyChildren.parentUserId, parentId(c)));
    if (existing.length >= 8) throw new HTTPException(409, { message: 'You can manage up to eight child accounts.' });
    const [verification] = await tx.update(FamilyVerifications).set({ status: 'consumed' }).where(and(
      eq(FamilyVerifications.id, input.verificationId), eq(FamilyVerifications.parentUserId, parentId(c)),
      eq(FamilyVerifications.status, 'verified'), eq(FamilyVerifications.environment, config.environment),
      gt(FamilyVerifications.expiresAt, new Date())
    )).returning();
    if (!verification) throw new HTTPException(403, { message: 'Complete parent verification before creating this account.' });
    const id = `child_${crypto.randomUUID()}`;
    const homeSpaceId = `space_${crypto.randomUUID()}`;
    await tx.insert(Spaces).values({ id: homeSpaceId, title: 'My Home', userId: id, type: 'personal', createdAt: new Date() });
    const [created] = await tx.insert(FamilyChildren).values({ id, homeSpaceId, parentUserId: parentId(c), displayName: input.displayName,
      ageBand: input.ageBand, verificationId: verification.id, noticeVersion: input.noticeVersion, consentedAt: new Date(),
      status: 'active', createdAt: new Date(), lastActiveAt: new Date() }).returning();
    return created;
  });
  return c.json({ child }, 201);
});

route.get(`${base}/children/:id`, requireAuth, async (c) => c.json(await db.transaction(async (tx) => {
  const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
  const notes = await tx.select(childNoteSelection).from(Notes).where(eq(Notes.userId, child.id));
  const approvals = await tx.select().from(FamilySpaceApprovals).where(eq(FamilySpaceApprovals.childId, child.id));
  const ministries = await availableMinistries(tx, parentId(c));
  return { child, notes, approvals, ministries, capabilities: CHILD_CAPABILITIES };
})));

route.get(`${base}/children/:id/export`, requireAuth, async (c) => c.json(await db.transaction(async (tx) => {
  await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
  const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
  return exportChildNotebook(tx, child);
})));

route.post(`${base}/children/:id/handoff`, requireAuth, async (c) => {
  requireFamilyEnrollment();
  const secret = childSecret();
  await db.transaction(async (tx) => {
    const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
    if (!hasActiveChildConsent(child)) throw new HTTPException(403, { message: 'This child account is paused.' });
    await tx.delete(FamilyChildSessions).where(and(eq(FamilyChildSessions.childId, child.id), eq(FamilyChildSessions.kind, 'handoff')));
    await tx.insert(FamilyChildSessions).values({ tokenHash: hashSecret(secret), childId: child.id, kind: 'handoff',
      createdAt: new Date(), expiresAt: new Date(Date.now() + HANDOFF_TTL_MS) });
  });
  return c.json({ token: secret, expiresInSeconds: HANDOFF_TTL_MS / 1000 });
});

route.delete(`${base}/children/:id/sessions`, requireAuth, async (c) => {
  await db.transaction(async (tx) => {
    const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
    await tx.delete(FamilyChildSessions).where(eq(FamilyChildSessions.childId, child.id));
  });
  return c.json({ success: true });
});

route.post(`${base}/children/:id/revoke`, requireAuth, async (c) => {
  await db.transaction(async (tx) => {
    const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
    await tx.update(FamilyChildren).set({ status: 'revoked', revokedAt: new Date() }).where(eq(FamilyChildren.id, child.id));
    await tx.delete(FamilyChildSessions).where(eq(FamilyChildSessions.childId, child.id));
    await tx.delete(FamilySpaceApprovals).where(eq(FamilySpaceApprovals.childId, child.id));
  });
  return c.json({ success: true });
});

route.delete(`${base}/children/:id`, requireAuth, async (c) => {
  await db.transaction(async (tx) => deleteChildData(tx, await ownedChild(tx, parentId(c), requireParam(c, 'id'))));
  return c.json({ success: true });
});

route.put(`${base}/children/:id/ministries`, requireAuth, async (c) => {
  const input = z.object({ spaceIds: z.array(z.string().max(100)).max(20) }).strict().parse(await c.req.json());
  await db.transaction(async (tx) => {
    const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
    if (!hasActiveChildConsent(child)) throw new HTTPException(403, { message: 'This child account is paused.' });
    const allowed = new Set((await availableMinistries(tx, parentId(c))).map((s) => s.id));
    if (input.spaceIds.some((id) => !allowed.has(id))) throw new HTTPException(403, { message: 'Choose a ministry channel you currently follow.' });
    await tx.delete(FamilySpaceApprovals).where(eq(FamilySpaceApprovals.childId, child.id));
    if (input.spaceIds.length) await tx.insert(FamilySpaceApprovals).values([...new Set(input.spaceIds)].map((spaceId) => ({ childId: child.id, spaceId, approvedAt: new Date() })));
  });
  return c.json({ success: true });
});

route.post(`${base}/child/redeem`, async (c) => {
  requireFamilyEnrollment();
  const input = z.object({ token: z.string().regex(/^hvkid_[\w-]{43}$/) }).strict().parse(await c.req.json());
  return c.json(await redeemHandoff(input.token));
});
route.get(`${base}/child/notebook`, async (c) => c.json(await withChildSession(token(c), async (tx, child) => ({
  displayName: child.displayName, capabilities: CHILD_CAPABILITIES, parentSignInUrl: familyPublicConfig()?.parentSignInUrl,
  notes: await tx.select(childNoteSelection).from(Notes).where(eq(Notes.userId, child.id)).orderBy(desc(Notes.createdAt)).limit(500),
  materials: await ministryMaterials(tx, child)
}))));

const noteInput = z.object({ title: z.string().trim().max(100), content: z.string().max(10_000) }).strict();
route.post(`${base}/child/notes`, async (c) => {
  const input = noteInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => {
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(Notes).where(eq(Notes.userId, child.id));
    if (count.count >= 500) throw new HTTPException(409, { message: 'Your notebook is full. Ask your parent for help.' });
    const [note] = await tx.insert(Notes).values({ id: `note_${crypto.randomUUID()}`, ...input, userId: child.id,
      spaceId: child.homeSpaceId, threadId: 'unorganized', createdAt: new Date(), updatedAt: new Date() }).returning(childNoteSelection);
    return { note };
  }), 201);
});
route.put(`${base}/child/notes/:id`, async (c) => {
  const input = noteInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => {
    const [note] = await tx.update(Notes).set({ ...input, updatedAt: new Date() }).where(and(eq(Notes.id, requireParam(c, 'id')), eq(Notes.userId, child.id))).returning(childNoteSelection);
    if (!note) throw new HTTPException(404, { message: 'Note not found.' });
    return { note };
  }));
});
route.delete(`${base}/child/session`, async (c) => c.json(await withChildSession(token(c), async (tx) => {
  await tx.delete(FamilyChildSessions).where(eq(FamilyChildSessions.tokenHash, hashSecret(token(c)!)));
  return { success: true };
})));

route.post('/api/admin/child-account-retention', async (c) => {
  const expected = process.env.FAMILY_RETENTION_CRON_SECRET;
  const received = c.req.header('Authorization')?.replace(/^Bearer /, '');
  if (!expected || expected.length < 32 || !received ||
      !timingSafeEqual(Buffer.from(hashSecret(expected)), Buffer.from(hashSecret(received)))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.header('Cache-Control', 'no-store');
  return c.json(await purgeExpiredFamilyData(true));
});

export default route;

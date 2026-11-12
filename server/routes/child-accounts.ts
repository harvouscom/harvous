import { CHILD_ACCOUNT_ID_PREFIX } from '../family/identity';
import { childNoteDetails, noteDetailsInput, writeChildNoteDetails } from '../family/note-details';
import imagePresets from '../../shared/appearance-image-presets.json';
import { timingSafeEqual } from 'node:crypto';
import { purgeExpiredFamilyData } from '../family/retention';
import { exportChildNotebook } from '../family/notebook-export';
import { familyPublicConfig } from '../family/config';
import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { createClerkClient } from '@clerk/backend';
import { and, eq, gt, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { FamilyChildren, FamilyChildBibleReadings, FamilyChildSessions, FamilySpaceApprovals, FamilyVerifications, Notes, Spaces } from '../db/schema';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { isPgUndefinedRelation } from '../utils/pg-undefined-relation';
import { syncEntitlementsFromProvider } from '../utils/entitlements';
import { sponsorFeatureKeys } from '../utils/family-entitlements';
import { CHILD_CAPABILITIES, CHILD_NOTICE_VERSION, HANDOFF_TTL_MS, VERIFICATION_TTL_MS, childSecret, emailDigest, hashSecret, hasActiveChildConsent, kwsWebhookSignatureResult } from '../family/policy';
import { familyEnrollmentConfig, kwsConfig, requireFamilyEnrollment, sendKwsVerification } from '../family/kws';
import { availableMinistries, childNoteSelection, deleteChildData, ministryMaterials, ownedChild, redeemHandoff, withChildSession, type Child } from '../family/service';
import { childBibleTranslationChoices, childBibleTranslations, childSchemes, childTextSizes, legacyChildBibleTranslations, coverBindings, coverColors, coverPatterns, coverSymbols, defaultChildPreferences, notebookPapers } from '../../shared/child-notebook';
import { addFamilyThought, familyReadings, familyThoughts, getFamilyReading, passageInput, readChapter, requireApprovedTranslation, shareFamilyReading, thoughtInput, translationInput } from '../family/bible';
import { searchChildNotebook } from '../family/notebook-search';
import { chapterStickers, setVerseSticker, verseStickerInput } from '../family/stickers';

function requireActiveConsent(child: Child) {
  if (!hasActiveChildConsent(child)) throw new HTTPException(403, { message: 'This child account is paused.' });
  return child;
}

const route = new Hono();
const base = '/api/child-accounts';
const kwsWebhook = '/api/webhooks/kws';
const retentionJob = '/api/admin/child-account-retention';
const pauseDuringRecovery: MiddlewareHandler = async (c, next) => {
  if (process.env.HARVOUS_CHILD_RECOVERY_PAUSED === 'true') {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'Child notebooks are temporarily unavailable.' }, 503);
  }
  await next();
};
route.use(`${base}/*`, pauseDuringRecovery);
route.use(kwsWebhook, pauseDuringRecovery);
route.use(retentionJob, pauseDuringRecovery);
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

const needsPlus = {
  error: 'Setting up a child notebook requires Harvous Plus.',
  code: 'CHILD_NOTEBOOK_NEEDS_PLUS',
  upgradeUrl: '/upgrade',
};

async function canEnrollChild(userId: string): Promise<boolean> {
  if ((await sponsorFeatureKeys(userId)).length > 0) return true;
  // Match Family Space creation when a checkout has finished ahead of its webhook.
  await syncEntitlementsFromProvider(userId).catch(() => undefined);
  return (await sponsorFeatureKeys(userId)).length > 0;
}

// The parent UI does not ask for child details until this flow is complete.
route.get(`${base}/status`, requireAuth, async (c) => {
  const publicConfig = familyPublicConfig();
  const available = !!familyEnrollmentConfig(process.env, parentId(c));
  try {
    const children = await db.select().from(FamilyChildren).where(eq(FamilyChildren.parentUserId, parentId(c)));
    const verifications = await db.select({ id: FamilyVerifications.id, status: FamilyVerifications.status })
      .from(FamilyVerifications).where(and(eq(FamilyVerifications.parentUserId, parentId(c)),
        gt(FamilyVerifications.expiresAt, new Date()))).orderBy(desc(FamilyVerifications.createdAt));
    const requiresPlus = available && (await sponsorFeatureKeys(parentId(c))).length === 0;
    return c.json({ available, requiresPlus, children, verifications, ...publicConfig, noticeVersion: CHILD_NOTICE_VERSION });
  } catch (error) {
    if (isPgUndefinedRelation(error, 'FamilyChildren') || isPgUndefinedRelation(error, 'FamilyVerifications')) {
      return c.json({ available: false, requiresPlus: false, children: [], verifications: [], noticeVersion: CHILD_NOTICE_VERSION });
    }
    throw error;
  }
});

route.post(`${base}/verification`, requireAuth, async (c) => {
  const config = requireFamilyEnrollment(parentId(c));
  if (!await canEnrollChild(parentId(c))) return c.json(needsPlus, 402);
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
  try { await sendKwsVerification(email, id, input.location, parentId(c)); }
  catch (error) {
    await db.update(FamilyVerifications).set({ status: 'failed' }).where(and(eq(FamilyVerifications.id, id), eq(FamilyVerifications.status, 'pending')));
    throw error;
  }
  return c.json({ id, status: 'pending' }, 202);
});

const kwsWebhookEvent = z.object({
  name: z.string(),
  orgId: z.string(),
  productId: z.string(),
  payload: z.object({
    parentEmail: z.string().email(),
    externalPayload: z.string().uuid(),
    status: z.object({ verified: z.boolean(), transactionId: z.string().min(1).max(200) }),
  }),
});

function logStagingKwsWebhook(
  outcome: 'not-configured' | 'missing-signature' | 'malformed-signature' | 'signature-mismatch' | 'stale-signature' | 'invalid-event' | 'wrong-product' | 'ignored' | 'matched' | 'no-match',
) {
  if (process.env.HARVOUS_CHILD_ENVIRONMENT === 'staging') {
    console.info('[kws-test-webhook]', outcome);
  }
}

// External callback is signed, bounded and not authenticated with an adult session.
route.post(kwsWebhook, bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
  c.header('Cache-Control', 'no-store');
  const config = kwsConfig();
  if (!config) {
    logStagingKwsWebhook('not-configured');
    throw new HTTPException(503, { message: 'Verification is not configured.' });
  }
  const raw = await c.req.text();
  const signature = kwsWebhookSignatureResult(raw, c.req.header('x-kws-signature'), [
    config.webhookSecret, process.env.KWS_PREVIOUS_WEBHOOK_SECRET ?? '',
  ]);
  if (signature !== 'valid') {
    logStagingKwsWebhook(signature);
    throw new HTTPException(401, { message: 'Invalid signature.' });
  }
  let event: z.infer<typeof kwsWebhookEvent>;
  try {
    event = kwsWebhookEvent.parse(JSON.parse(raw));
  } catch (error) {
    logStagingKwsWebhook('invalid-event');
    throw error;
  }
  if (event.orgId !== config.orgId || event.productId !== config.productId) {
    logStagingKwsWebhook('wrong-product');
    throw new HTTPException(403, { message: 'Wrong verification product.' });
  }
  if (event.name !== 'parent-verified' || event.payload.status.verified !== true) {
    logStagingKwsWebhook('ignored');
    return c.json({ received: true });
  }
  const result = await db.update(FamilyVerifications).set({ status: 'verified', verifiedAt: new Date(), transactionId: event.payload.status.transactionId })
    .where(and(eq(FamilyVerifications.id, event.payload.externalPayload), eq(FamilyVerifications.status, 'pending'),
      eq(FamilyVerifications.environment, config.environment), eq(FamilyVerifications.parentEmailHash, emailDigest(event.payload.parentEmail)),
      gt(FamilyVerifications.expiresAt, new Date())));
  logStagingKwsWebhook(result.count > 0 ? 'matched' : 'no-match');
  return c.json({ received: true });
});

route.post(`${base}/children`, requireAuth, async (c) => {
  const config = requireFamilyEnrollment(parentId(c));
  if (!await canEnrollChild(parentId(c))) return c.json(needsPlus, 402);
  const input = z.object({ verificationId: z.string().uuid(), displayName: z.string().trim().min(1).max(32),
    // Accept the old form's age band during rollout. New records store only under-13 eligibility.
    ageBand: z.enum(['under-8', '8-12']).optional(), noticeVersion: z.literal(CHILD_NOTICE_VERSION),
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
    const id = `${CHILD_ACCOUNT_ID_PREFIX}${crypto.randomUUID()}`;
    const homeSpaceId = `space_${crypto.randomUUID()}`;
    await tx.insert(Spaces).values({ id: homeSpaceId, title: 'My Home', userId: id, type: 'personal', createdAt: new Date() });
    const [created] = await tx.insert(FamilyChildren).values({ id, homeSpaceId, parentUserId: parentId(c), displayName: input.displayName,
      ageBand: 'under-13', verificationId: verification.id, noticeVersion: input.noticeVersion, consentedAt: new Date(),
      status: 'active', createdAt: new Date(), lastActiveAt: new Date(), bibleTranslations: [childBibleTranslations[0]] }).returning();
    return created;
  });
  return c.json({ child }, 201);
});

route.get(`${base}/children/:id`, requireAuth, async (c) => c.json(await db.transaction(async (tx) => {
  const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
  const notes = await tx.select(childNoteSelection).from(Notes).where(eq(Notes.userId, child.id));
  const approvals = await tx.select().from(FamilySpaceApprovals).where(eq(FamilySpaceApprovals.childId, child.id));
  const ministries = await availableMinistries(tx, parentId(c));
  return { child, notes, approvals, ministries, readings: await familyReadings(tx, child), capabilities: CHILD_CAPABILITIES };
})));

// A parent can rename the notebook at any time — a nickname, a typo, two children with one name.
// Same rule as at creation: a first name or nickname, 1–32 characters. Allowed while consent is
// paused, because naming is the parent managing the record, not the child using it.
const renameInput = z.object({ displayName: z.string().trim().min(1).max(32) }).strict();
route.put(`${base}/children/:id/name`, requireAuth, async (c) => {
  const { displayName } = renameInput.parse(await c.req.json());
  return c.json(await db.transaction(async (tx) => {
    const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
    await tx.update(FamilyChildren).set({ displayName }).where(eq(FamilyChildren.id, child.id));
    return { displayName };
  }));
});

route.get(`${base}/children/:id/export`, requireAuth, async (c) => c.json(await db.transaction(async (tx) => {
  await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
  const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
  return exportChildNotebook(tx, child);
})));

route.post(`${base}/children/:id/handoff`, requireAuth, async (c) => {
  requireFamilyEnrollment(parentId(c));
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

// Renewing consent after the notice changes. A notebook agreed under an older notice is paused
// (hasActiveChildConsent); this records the parent's agreement to the current one and resumes it.
// Same confirmations as creation. Only for active notebooks: a withdrawal or revocation never
// reactivates here. Already on the current notice is a no-op, so a double submit is harmless.
const renewalInput = z.object({ noticeVersion: z.literal(CHILD_NOTICE_VERSION), isGuardian: z.literal(true), consent: z.literal(true) }).strict();
route.post(`${base}/children/:id/consent`, requireAuth, async (c) => {
  requireFamilyEnrollment(parentId(c));
  renewalInput.parse(await c.req.json());
  return c.json(await db.transaction(async (tx) => {
    const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
    if (child.status !== 'active') throw new HTTPException(409, { message: 'Consent was withdrawn for this notebook. It can’t be resumed here.' });
    if (child.noticeVersion === CHILD_NOTICE_VERSION) return { noticeVersion: child.noticeVersion, consentedAt: child.consentedAt };
    const consentedAt = new Date();
    await tx.update(FamilyChildren).set({ noticeVersion: CHILD_NOTICE_VERSION, consentedAt }).where(eq(FamilyChildren.id, child.id));
    return { noticeVersion: CHILD_NOTICE_VERSION, consentedAt };
  }));
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
    await tx.update(FamilyChildren).set({ status: 'revoked', revokedAt: child.revokedAt ?? new Date() }).where(eq(FamilyChildren.id, child.id));
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

const translationsInput = z.object({ translations: z.array(translationInput).min(1).max(childBibleTranslations.length + legacyChildBibleTranslations.length) }).strict();
route.put(`${base}/children/:id/bible/translations`, requireAuth, async (c) => {
  const { translations } = translationsInput.parse(await c.req.json());
  return c.json(await db.transaction(async (tx) => {
    const child = requireActiveConsent(await ownedChild(tx, parentId(c), requireParam(c, 'id')));
    const approved = [...new Set(translations)];
    const available = childBibleTranslationChoices(child.bibleTranslations, await familyReadings(tx, child));
    if (approved.some(translation => !available.includes(translation))) {
      throw new HTTPException(400, { message: 'Choose from the translations available for this notebook.' });
    }
    await tx.update(FamilyChildren).set({ bibleTranslations: approved }).where(eq(FamilyChildren.id, child.id));
    return { translations: approved };
  }));
});

route.post(`${base}/children/:id/bible/readings`, requireAuth, async (c) => {
  const passage = passageInput.parse(await c.req.json());
  return c.json(await db.transaction(async (tx) => {
    const child = requireActiveConsent(await ownedChild(tx, parentId(c), requireParam(c, 'id')));
    return { reading: await shareFamilyReading(tx, child, passage) };
  }), 201);
});

route.get(`${base}/children/:id/bible/readings/:readingId`, requireAuth, async (c) => c.json(await db.transaction(async (tx) => {
  const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
  const reading = await getFamilyReading(tx, child, requireParam(c, 'readingId'));
  return { ...reading, ...await readChapter(tx, reading), thoughts: await familyThoughts(tx, reading.id) };
})));

route.post(`${base}/children/:id/bible/readings/:readingId/thoughts`, requireAuth, async (c) => {
  const input = thoughtInput.parse(await c.req.json());
  return c.json(await db.transaction(async (tx) => {
    const child = requireActiveConsent(await ownedChild(tx, parentId(c), requireParam(c, 'id')));
    return { thought: await addFamilyThought(tx, child, requireParam(c, 'readingId'), 'parent', input) };
  }), 201);
});

route.delete(`${base}/children/:id/bible/readings/:readingId`, requireAuth, async (c) => c.json(await db.transaction(async (tx) => {
  const child = await ownedChild(tx, parentId(c), requireParam(c, 'id'));
  const reading = await getFamilyReading(tx, child, requireParam(c, 'readingId'));
  await tx.delete(FamilyChildBibleReadings).where(eq(FamilyChildBibleReadings.id, reading.id));
  return { success: true };
})));

route.post(`${base}/child/redeem`, async (c) => {
  requireFamilyEnrollment(process.env.HARVOUS_CHILD_PILOT_PARENT_ID);
  const input = z.object({ token: z.string().regex(/^hvkid_[\w-]{43}$/) }).strict().parse(await c.req.json());
  return c.json(await redeemHandoff(input.token));
});
route.get(`${base}/child/privacy`, (c) => {
  const config = familyPublicConfig();
  if (!config) throw new HTTPException(404, { message: 'The child privacy notice is unavailable.' });
  return c.json({ privacyUrl: config.privacyUrl });
});

route.get(`${base}/child/notebook`, async (c) => c.json(await withChildSession(token(c), async (tx, child) => ({
  displayName: child.displayName, capabilities: CHILD_CAPABILITIES, parentSignInUrl: familyPublicConfig()?.parentSignInUrl,
  privacyUrl: familyPublicConfig()?.privacyUrl,
  preferences: child.notebookPreferences ?? defaultChildPreferences,
  translations: child.bibleTranslations,
  readings: (await familyReadings(tx, child)).filter(reading => child.bibleTranslations.includes(reading.translation)),
  ...await childNoteDetails(tx, child),
  materials: await ministryMaterials(tx, child)
}))));

const preferencesInput = z.object({
  coverColor: z.enum(coverColors.map(color => color.id)), coverSymbol: z.enum(coverSymbols),
  coverPattern: z.enum(coverPatterns), coverBinding: z.enum(coverBindings).optional(), paper: z.enum(notebookPapers).optional(),
  scheme: z.enum(childSchemes), textSize: z.enum(childTextSizes),
  reduceMotion: z.boolean(), sounds: z.boolean(),
  soundMode: z.enum(['everywhere', 'moments', 'off']).optional(),
  canvas: z.string().refine(value => value === 'device' || imagePresets.presets.some(image => image.mode === 'light' && value === `image:${image.id}`)).optional(),
  darkCanvas: z.string().refine(value => value === 'device' || imagePresets.presets.some(image => image.mode === 'dark' && value === `image:${image.id}`)).optional()
}).strict();
route.put(`${base}/child/preferences`, async (c) => {
  const preferences = preferencesInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => {
    await tx.update(FamilyChildren).set({ notebookPreferences: preferences }).where(eq(FamilyChildren.id, child.id));
    return { preferences };
  }));
});

const searchInput = z.object({
  query: z.string().trim().max(120), scope: z.enum(['all', 'notebook', 'family']), offset: z.number().int().min(0).max(625)
}).strict();
route.post(`${base}/child/search`, async (c) => {
  const { query, scope, offset } = searchInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), (tx, child) => searchChildNotebook(tx, child, query, scope, offset)));
});
route.get(`${base}/child/materials/:spaceId/:id`, async (c) => c.json(await withChildSession(token(c), async (tx, child) => {
  const [material] = await ministryMaterials(tx, child, { spaceId: requireParam(c, 'spaceId'), noteId: requireParam(c, 'id') });
  if (!material) throw new HTTPException(404, { message: 'This reading is no longer shared.' });
  return { material };
})));
route.get(`${base}/child/notes/:id`, async (c) => c.json(await withChildSession(token(c), async (tx, child) => {
  const { notes: [note] } = await childNoteDetails(tx, child, [requireParam(c, 'id')]);
  if (!note) throw new HTTPException(404, { message: 'Note not found.' });
  return { note };
})));

route.post(`${base}/child/bible/chapter`, async (c) => {
  const passage = passageInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => {
    requireApprovedTranslation(child, passage.translation);
    return { ...await readChapter(tx, passage), stickers: await chapterStickers(tx, child, passage.book, passage.chapter) };
  }));
});
route.put(`${base}/child/bible/stickers`, async (c) => {
  const input = verseStickerInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => ({ sticker: await setVerseSticker(tx, child, input) })));
});
route.get(`${base}/child/bible/readings/:readingId`, async (c) => c.json(await withChildSession(token(c), async (tx, child) => {
  const reading = await getFamilyReading(tx, child, requireParam(c, 'readingId'));
  requireApprovedTranslation(child, reading.translation);
  return { ...reading, ...await readChapter(tx, reading), thoughts: await familyThoughts(tx, reading.id) };
})));
route.post(`${base}/child/bible/readings/:readingId/thoughts`, async (c) => {
  const input = thoughtInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => ({
    thought: await addFamilyThought(tx, child, requireParam(c, 'readingId'), 'child', input)
  })), 201);
});

const noteInput = z.object({ title: z.string().trim().max(100), content: z.string().max(10_000), details: noteDetailsInput.optional() }).strict();
route.post(`${base}/child/notes`, async (c) => {
  const { details, ...input } = noteInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => {
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(Notes).where(eq(Notes.userId, child.id));
    if (count.count >= 500) throw new HTTPException(409, { message: 'Your notebook is full. Ask your parent for help.' });
    const [note] = await tx.insert(Notes).values({ id: `note_${crypto.randomUUID()}`, ...input, userId: child.id,
      spaceId: child.homeSpaceId, threadId: 'unorganized', createdAt: new Date(), updatedAt: new Date() }).returning(childNoteSelection);
    if (details) await writeChildNoteDetails(tx, child, note.id, details);
    const saved = await childNoteDetails(tx, child, [note.id]);
    return { note: saved.notes[0], catalog: saved.catalog };
  }), 201);
});
route.put(`${base}/child/notes/:id`, async (c) => {
  const { details, ...input } = noteInput.parse(await c.req.json());
  return c.json(await withChildSession(token(c), async (tx, child) => {
    const [note] = await tx.update(Notes).set({ ...input, updatedAt: new Date() }).where(and(eq(Notes.id, requireParam(c, 'id')), eq(Notes.userId, child.id))).returning(childNoteSelection);
    if (!note) throw new HTTPException(404, { message: 'Note not found.' });
    if (details) await writeChildNoteDetails(tx, child, note.id, details);
    const saved = await childNoteDetails(tx, child, [note.id]);
    return { note: saved.notes[0], catalog: saved.catalog };
  }));
});
route.delete(`${base}/child/session`, async (c) => c.json(await withChildSession(token(c), async (tx) => {
  await tx.delete(FamilyChildSessions).where(eq(FamilyChildSessions.tokenHash, hashSecret(token(c)!)));
  return { success: true };
})));

route.post(retentionJob, async (c) => {
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

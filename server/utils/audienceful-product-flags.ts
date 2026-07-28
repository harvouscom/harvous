/**
 * Server helpers: resolve user email and queue Audienceful product-behavior flags.
 */
import {
  type AudiencefulProductFlags,
  hasTruthyProductFlags,
  queueAudiencefulProductFlags,
} from '@/utils/audienceful';
import { db, first, UserMetadata, eq } from '../db';

/**
 * Look up UserMetadata.email and queue Audienceful flag writes.
 * Fire-and-forget; never throws into the request path.
 */
export function queueAudiencefulProductFlagsForUser(
  userId: string,
  flags: AudiencefulProductFlags,
): void {
  if (!hasTruthyProductFlags(flags)) return;
  if (!process.env.AUDIENCEFUL_API_KEY) return;

  void (async () => {
    const meta = first(
      await db
        .select({ email: UserMetadata.email })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .limit(1),
    );
    const email = meta?.email?.trim();
    if (!email) {
      console.warn('[Audienceful] skip product flags — no email in UserMetadata', { userId });
      return;
    }
    queueAudiencefulProductFlags({ email, clerkUserId: userId, flags });
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Audienceful] queueAudiencefulProductFlagsForUser failed:', { userId, message });
  });
}

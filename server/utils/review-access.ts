/**
 * Who may use Review, and how much of it.
 *
 * Plus is review of your *own* study. A church's questions are part of the Church plan and free
 * to anyone connected who follows the channel they are in (docs/CHURCH_V2_ROADMAP.md §B). So
 * Review has three answers, not two:
 *
 *   - `full`   — Plus. Everything the reader holds, their own and their church's.
 *   - `church` — no Plus, but connected to an active church. Church rows only.
 *   - `none`   — neither. The free daily sample, and the Plus offer.
 *
 * **Never an entitlement.** Granting the `review` key to a church's people would hand them all
 * of Plus — their own notes included. Access is decided per item instead: every Review read and
 * lookup takes the scope this resolves (`reviewScopeSql`), so a church-only reader simply has no
 * route to a non-church row.
 *
 * "Add to Review" — making a review item from your own study — stays behind `requireFeature`.
 */

import type { Context, Next } from 'hono';
import { db, first, UserMetadata, eq } from '../db';
import type { Auth } from '../middleware/types';
import { getAuthenticatedAuth } from '../middleware/auth';
import { featureRequiredBody, hasFeatureWithReconcile } from '../middleware/require-feature';
import { getActiveChurchByOrgId } from './church-staff';
import type { ReviewScope } from './church-review-delivery';

export type ReviewAccess = 'full' | 'church' | 'none';

const CONTEXT_KEY = 'reviewAccess';

export async function resolveReviewAccess(auth: Auth): Promise<ReviewAccess> {
  if (!auth.userId) return 'none';
  /* Throttled: a church-only reader misses here on every read, and the untrottled path asks the
     billing provider each time — the reconcile exists for the seconds after a checkout, not for
     someone who has never subscribed. */
  if (await hasFeatureWithReconcile(auth, 'review', { throttle: true })) return 'full';
  const meta = first(
    await db
      .select({ connectedOrgId: UserMetadata.connectedOrgId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, auth.userId))
      .limit(1),
  );
  if (!meta?.connectedOrgId) return 'none';
  const church = await getActiveChurchByOrgId(meta.connectedOrgId);
  // A lapsed church still counts: what its people already hold keeps working. Delivery is what
  // a lapse stops.
  return church?.isActive ? 'church' : 'none';
}

/** Route gate: Plus, or a church's reader. Sets the scope the handler reads with `reviewScopeOf`. */
export function requireReviewAccess() {
  return async (c: Context, next: Next) => {
    const access = await resolveReviewAccess(getAuthenticatedAuth(c));
    if (access === 'none') return c.json(featureRequiredBody('review'), 403);
    c.set(CONTEXT_KEY, access);
    return next();
  };
}

export function reviewAccessOf(c: Context): Exclude<ReviewAccess, 'none'> {
  return (c.get(CONTEXT_KEY) as Exclude<ReviewAccess, 'none'> | undefined) ?? 'full';
}

export function reviewScopeOf(c: Context): ReviewScope {
  return { access: reviewAccessOf(c) };
}

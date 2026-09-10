/**
 * The reader's own Study Bible layer, read.
 *
 * GET /api/study-bible/nodes — what a person has actually been studying, by node.
 *
 * Not feature-gated. Review is a Plus feature; the layer underneath it is a fact about the
 * account, and Home's themes and trends read it for everyone. Gating it would mean a free
 * reader's Activity page quietly losing the arcs it already shows them.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, UserNodeStates, eq, and, inArray, desc } from '../db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { isNodeKind, type NodeKind } from '@/utils/study-bible-nodes';
import { isUserNodeStatesTableMissing } from '../utils/pg-undefined-relation';

const route = new Hono();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseKinds(raw: string | undefined): NodeKind[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is NodeKind => isNodeKind(value));
}

route.get('/api/study-bible/nodes', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const kinds = parseKinds(c.req.query('kind'));
    const requested = Number.parseInt(c.req.query('limit') ?? '', 10);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(1, requested), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const rows = await db
      .select({
        nodeKind: UserNodeStates.nodeKind,
        nodeKey: UserNodeStates.nodeKey,
        label: UserNodeStates.label,
        noteId: UserNodeStates.noteId,
        exposureCount: UserNodeStates.exposureCount,
        revisitCount: UserNodeStates.revisitCount,
        explicitConnectionCount: UserNodeStates.explicitConnectionCount,
        expansionCount: UserNodeStates.expansionCount,
        synthesisCount: UserNodeStates.synthesisCount,
        reviewCount: UserNodeStates.reviewCount,
        firstStudiedAt: UserNodeStates.firstStudiedAt,
        lastSeenAt: UserNodeStates.lastSeenAt,
        meta: UserNodeStates.meta,
      })
      .from(UserNodeStates)
      .where(
        and(
          eq(UserNodeStates.userId, auth.userId),
          eq(UserNodeStates.status, 'active'),
          ...(kinds.length ? [inArray(UserNodeStates.nodeKind, kinds)] : []),
        ),
      )
      .orderBy(desc(UserNodeStates.lastSeenAt))
      .limit(limit);

    return c.json({
      success: true,
      nodes: rows.map((row) => ({
        ...row,
        firstStudiedAt: row.firstStudiedAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
      })),
    });
  } catch (error) {
    // An unmigrated database is a Home page without arcs, not a broken one.
    if (isUserNodeStatesTableMissing(error)) return c.json({ success: true, nodes: [] });
    const standardError = handleAPIError(error, {
      endpoint: '/api/study-bible/nodes',
      action: 'study_bible_nodes',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;

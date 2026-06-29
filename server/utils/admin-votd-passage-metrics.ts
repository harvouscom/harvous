/**
 * Today's Passage engagement metrics for the admin usage dashboard.
 * Combines XP / featured-item tracking with note-based detection so prototype
 * adds (POST /api/notes/create) count even when client tracking was missed.
 */

import { db, sql } from '../db';
import { COUNTABLE_USER_NOTES_N_SQL } from './purge-onboarding-content';

export type VotdPassageEngagementMetrics = {
  usersWhoAddedPassage: number;
  passageNotesAdded: number;
  dismissCloseEvents: number;
};

function publishDateMinForWindow(since: Date): string {
  return since.toISOString().slice(0, 10);
}

export async function fetchVotdPassageEngagementMetrics(since: Date): Promise<VotdPassageEngagementMetrics> {
  const sinceIso = since.toISOString();
  const publishDateMin = publishDateMinForWindow(since);

  const rows = await db.execute<{
    users_who_added_passage: number;
    passage_notes_added: number;
    dismiss_close_events: number;
  }>(sql`
    WITH published AS (
      SELECT
        p."reference",
        p."publishedDate",
        TRIM(LOWER(REGEXP_REPLACE(p."reference", '\\s+', ' ', 'g'))) AS ref_norm
      FROM "VotdPublishHistory" p
      WHERE p."publishedDate" >= ${publishDateMin}
    ),
    note_hits AS (
      SELECT DISTINCT n."id" AS note_id, n."userId" AS user_id
      FROM "Notes" n
      INNER JOIN published p ON (
        n."createdAt" >= (p."publishedDate" || 'T00:00:00.000Z')::timestamptz
        AND (
          TRIM(LOWER(REGEXP_REPLACE(COALESCE(n."title", ''), '\\s+', ' ', 'g'))) = p.ref_norm
          OR POSITION(
            'data-scripture-reference="' || p."reference" || '"'
            IN COALESCE(n."content", '')
          ) > 0
          OR EXISTS (
            SELECT 1 FROM "ScriptureMetadata" sm
            WHERE sm."noteId" = n."id"
            AND TRIM(LOWER(REGEXP_REPLACE(sm."reference", '\\s+', ' ', 'g'))) = p.ref_norm
          )
        )
      )
      WHERE n."createdAt" >= ${sinceIso}
      AND ${COUNTABLE_USER_NOTES_N_SQL}
    )
    SELECT
      (SELECT COUNT(DISTINCT user_id) FROM (
        SELECT user_id FROM note_hits
        UNION
        SELECT "userId" AS user_id FROM "UserXP"
        WHERE "activityType" = 'votd_engaged' AND "createdAt" >= ${sinceIso}
      ) combined_users) AS users_who_added_passage,
      (SELECT COUNT(*)::int FROM note_hits) AS passage_notes_added,
      (SELECT COUNT(*)::int FROM "UserFeaturedItems" ufi
        INNER JOIN "FeaturedItems" fi ON fi."id" = ufi."featuredItemId"
        WHERE fi."contentType" = 'votd' AND ufi."status" = 'completed'
        AND ufi."completedAt" >= ${sinceIso}) AS dismiss_close_events
  `);

  const row = rows[0];
  return {
    usersWhoAddedPassage: Number(row?.users_who_added_passage ?? 0),
    passageNotesAdded: Number(row?.passage_notes_added ?? 0),
    dismissCloseEvents: Number(row?.dismiss_close_events ?? 0),
  };
}

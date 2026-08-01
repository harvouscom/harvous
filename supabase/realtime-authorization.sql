-- Harvous Realtime Authorization (private Broadcast + Presence channels)
--
-- WHY
-- ---
-- Channel names alone are not access control. The anon key ships in the web
-- bundle, so before this, anyone who could guess `sync-{clerkUserId}` could
-- listen to that user's invalidation traffic. That was bounded while payloads
-- were `{type,id}` only. Co-editing wants to put note bodies on the wire, so
-- we enable RLS on `realtime.messages` first and flip every client to
-- `config: { private: true }`.
--
-- ROLLOUT (strict order — do not reverse)
-- --------------------------------------
-- 1. Run this SQL against the Supabase project (SQL editor or psql).
-- 2. Confirm the Clerk JWT template named `supabase` includes
--    `"role": "authenticated"` and `"sub": "{{user.id}}"` (see
--    docs/SUPABASE_REALTIME_SETUP.md). Without `role`, `TO authenticated`
--    policies never match and every private subscribe fails.
-- 3. Deploy the client/server that pass `private: true` on every channel.
-- 4. In Supabase Dashboard → Realtime → Settings, turn OFF
--    "Allow public access". Until that switch flips, a client that forgets
--    `private: true` can still join without RLS — keep the setting on only
--    long enough to verify private joins succeed.
--
-- SAFE TO RE-RUN
-- --------------
-- Drops/recreates the helper and policies by name. Does not touch app tables.
--
-- AUTH MODEL
-- ----------
-- Clerk user ids are not UUIDs, so we never call `auth.uid()` here. We read
-- `auth.jwt() ->> 'sub'` as text and compare to `SpaceMemberships.userId` /
-- `Notes.userId`. The helper is SECURITY DEFINER so Realtime RLS can check
-- membership without granting the `authenticated` role SELECT on those tables.

CREATE OR REPLACE FUNCTION public.harvous_realtime_topic_allowed(topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_sub text := coalesce(auth.jwt() ->> 'sub', '');
  space_id text;
  note_id text;
BEGIN
  IF jwt_sub = '' OR topic IS NULL OR topic = '' THEN
    RETURN false;
  END IF;

  -- Personal sync channel: only the matching Clerk user.
  IF topic = 'sync-' || jwt_sub THEN
    RETURN true;
  END IF;

  -- Space presence: active membership on that space.
  -- Topic shape from spaceChannelName(): `space-{spaceId}` where spaceId
  -- already carries the `space_` prefix.
  IF topic LIKE 'space-%' THEN
    space_id := substring(topic FROM length('space-') + 1);
    RETURN EXISTS (
      SELECT 1
      FROM "SpaceMemberships" m
      WHERE m."userId" = jwt_sub
        AND m."spaceId" = space_id
    );
  END IF;

  -- Per-note pen channel: note author, or a member of any shared space the
  -- note is currently associated with. Topic shape: `note-{noteId}`.
  IF topic LIKE 'note-%' THEN
    note_id := substring(topic FROM length('note-') + 1);
    RETURN EXISTS (
      SELECT 1
      FROM "Notes" n
      WHERE n.id = note_id
        AND n."userId" = jwt_sub
    )
    OR EXISTS (
      SELECT 1
      FROM "SpaceNotes" sn
      INNER JOIN "SpaceMemberships" m ON m."spaceId" = sn."spaceId"
      WHERE sn."noteId" = note_id
        AND sn."removedAt" IS NULL
        AND m."userId" = jwt_sub
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.harvous_realtime_topic_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.harvous_realtime_topic_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.harvous_realtime_topic_allowed(text) TO service_role;

-- RLS is already on by default for realtime.messages. Do NOT run
-- `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` from the app
-- connection — the table is owned by supabase_realtime_admin and that ALTER
-- fails with "must be owner of table messages". Creating/dropping policies
-- as postgres is allowed.

DROP POLICY IF EXISTS "harvous_realtime_select" ON realtime.messages;
DROP POLICY IF EXISTS "harvous_realtime_insert" ON realtime.messages;

CREATE POLICY "harvous_realtime_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.harvous_realtime_topic_allowed((SELECT realtime.topic()))
  AND realtime.messages.extension IN ('broadcast', 'presence')
);

CREATE POLICY "harvous_realtime_insert"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.harvous_realtime_topic_allowed((SELECT realtime.topic()))
  AND realtime.messages.extension IN ('broadcast', 'presence')
);

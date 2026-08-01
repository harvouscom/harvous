# Supabase Realtime setup (cross-device sync + co-editing)

Harvous uses **Supabase Realtime Broadcast** to nudge web and native clients to refetch after writes, and **Presence** for shared-space presence and the co-editing pen lease. HTTP sync (`/api/sync/*`) remains the source of truth for persistence.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `SUPABASE_URL` | Netlify + local API (`.env`) | Project URL (`https://xxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Broadcast after mutations (never expose to clients) |
| `VITE_SUPABASE_URL` | `.env` (Vite loads from repo root) | Browser Realtime subscribe |
| `VITE_SUPABASE_ANON_KEY` | `.env` | Browser Realtime subscribe |
| `HARVOUS_SUPABASE_URL` | Native xcconfig → Info.plist | Same URL for Mac/iOS |
| `HARVOUS_SUPABASE_ANON_KEY` | Native xcconfig | Anon key only |

If server keys are unset, the API still works; broadcasts are skipped. If client keys are unset, `useRealtimeSync` / native Realtime are no-ops (5-minute poll / debounced pull still run).

## Clerk JWT template (`supabase`)

1. In [Clerk Dashboard](https://dashboard.clerk.com) → **JWT templates** → create template named **`supabase`** (HS256, signing key = Supabase JWT secret from Project Settings → API).
2. Claims must include at least:
   - `"sub": "{{user.id}}"` (Clerk user id — used by Realtime RLS)
   - `"role": "authenticated"` (**required** for `TO authenticated` policies; without it every private subscribe fails silently)
   - `"aud": "authenticated"` (Clerk's Supabase template default)
3. Web: `getToken({ template: 'supabase' })` before subscribing.
4. Native: `HarvousClerkBridge.supabaseRealtimeToken()` uses the same template.

See [Clerk Supabase integration](https://clerk.com/docs/guides/development/integrations/databases/supabase).

## Realtime Authorization (required)

Channels are **private**. RLS on `realtime.messages` decides who may join:

| Topic | Who may join |
|-------|----------------|
| `sync-{clerkUserId}` | That user only |
| `space-{spaceId}` | Active `SpaceMemberships` row |
| `note-{noteId}` | Note author, or a member of any space with an active `SpaceNotes` association |

SQL lives at [`supabase/realtime-authorization.sql`](../supabase/realtime-authorization.sql). The helper is `SECURITY DEFINER` so Realtime can check membership without granting the `authenticated` role SELECT on app tables. Clerk ids are text, so policies use `auth.jwt() ->> 'sub'` — never `auth.uid()` (Clerk ids are not UUIDs).

### Rollout order (do not reverse)

1. **Run** the SQL — either `npm run db:realtime-auth` (applies [`supabase/realtime-authorization.sql`](../supabase/realtime-authorization.sql) via `SUPABASE_DIRECT_URL` / `SUPABASE_DATABASE_URL`) or paste that file into the Supabase SQL Editor. Do not add an `ALTER TABLE realtime.messages …` — the table is owned by `supabase_realtime_admin` and that ALTER fails from the app role; creating policies as `postgres` is enough.
2. **Confirm** the Clerk JWT template has `"role": "authenticated"`.
3. **Deploy** clients/server that pass `config: { private: true }` (web hooks, native `isPrivate`, server broadcast).
4. **Dashboard** → Realtime → Settings → turn **OFF** "Allow public access". Until that switch flips, a client that forgets `private: true` can still join without RLS. **This step is still manual** — there is no API hook in-repo for it.

Private channels without matching policies reject with `CHANNEL_ERROR`. If sync/presence dies after a deploy, check JWT `role` first, then whether the SQL ran.

## Live note bodies (co-editing)

For notes with `coEditEnabled` and without `contentEncrypted`, `broadcastCanonicalNoteInvalidation` may attach a size-capped `{ title, content, updatedAt, spaceId: null }` patch so followers can update without a refetch. Encrypted notes and notes above the size cap stay `{type,id}`-only and refetch over authenticated HTTP.

`spaceId` is always `null` on that patch — `Notes.spaceId` is private organization, not the shared association.

## Note inline images (Storage)

Web note body images use bucket **`note-attachments`** and the same `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on the API. See [NOTE_INLINE_IMAGE_STORAGE.md](./NOTE_INLINE_IMAGE_STORAGE.md) and run [`supabase/storage-note-attachments.sql`](../supabase/storage-note-attachments.sql) once per project.

## Verify

1. Set all env vars above (copy anon key and URL from Supabase dashboard).
2. Apply `supabase/realtime-authorization.sql` and confirm JWT `role`.
3. `npm run dev:all` — edit a note on web; second browser tab on `/prototype` should refresh lists within ~1s. DevTools → Network → WS should show private channel joins succeeding.
4. Open a co-edited note as a second member: follower should see body updates within ~1s without reload.
5. Native **Debug-Prod** + production web, same user — see [CROSS_PLATFORM_SYNC.md](./troubleshooting/CROSS_PLATFORM_SYNC.md).

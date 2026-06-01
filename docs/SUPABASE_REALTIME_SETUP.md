# Supabase Realtime setup (Phase 1 cross-device sync)

Harvous uses **Supabase Realtime Broadcast** to nudge web and native clients to refetch after writes. HTTP sync (`/api/sync/*`) remains the source of truth.

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
2. Web: `getToken({ template: 'supabase' })` before subscribing.
3. Native: `HarvousClerkBridge.supabaseRealtimeToken()` uses the same template.

See [Clerk Supabase integration](https://clerk.com/docs/guides/development/integrations/databases/supabase).

## Supabase Realtime authorization (optional hardening)

For private channels, configure [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) so users may only join `sync-{their_user_id}`. Phase 1 uses public channel names scoped by Clerk user id; enable private channels when policies are in place.

## Note inline images (Storage)

Web note body images use bucket **`note-attachments`** and the same `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on the API. See [NOTE_INLINE_IMAGE_STORAGE.md](./NOTE_INLINE_IMAGE_STORAGE.md) and run [`supabase/storage-note-attachments.sql`](../supabase/storage-note-attachments.sql) once per project.

## Verify

1. Set all env vars above (copy anon key and URL from Supabase dashboard).
2. `npm run dev:all` — edit a note on web; second browser tab on `/prototype` should refresh lists within ~1s.
3. Native **Debug-Prod** + production web, same user — see [CROSS_PLATFORM_SYNC.md](./troubleshooting/CROSS_PLATFORM_SYNC.md).

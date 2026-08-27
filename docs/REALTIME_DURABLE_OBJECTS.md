# Phase B: Supabase Realtime → Cloudflare Durable Objects

**Status: PLANNED.** Drafted 2026-08-27. Part of [INFRA_ENDGAME.md](INFRA_ENDGAME.md).
Prerequisite: [Phase A](CLOUDFLARE_MIGRATION.md) complete — the DOs live on the
Worker that already serves app.harvous.com.

Replaces the entire Supabase Realtime dependency — broadcast, presence, and the
edit lease — with Durable Objects. This is the **only true Supabase lock-in** in
the codebase (everything else is plain Postgres or S3-shaped storage), and it is
deliberately low-risk to move because the system already treats realtime as a
best-effort side channel: `server/utils/realtime.ts` documents "Broadcast is a
best-effort side channel; HTTP sync is authoritative", and every consumer
degrades to polling/manual sync when realtime is unconfigured
(`isSupabaseRealtimeConfigured()` guards).

---

## Current state (verified 2026-08-27)

### Channel families

| Topic | Purpose | Server publisher | Client consumer |
|---|---|---|---|
| `sync-{clerkUserId}` (`syncChannelName`) | cross-device "something changed, pull" | `broadcastInvalidation`, `broadcastInvalidationForSyncPush` in `server/utils/realtime.ts` | `src/hooks/useRealtimeSync.ts` → TanStack Query invalidation + `syncNow()` |
| `space-{spaceId}` (`spaceChannelName`) | shared-space member fan-out + presence | `broadcastInvalidationToSpaceMembers` (member IDs via `getSpaceMemberUserIds` from `shared-space-visit`), `server/utils/broadcast-shared-space-note.ts` | `src/hooks/useSpacePresence.ts` (presence roster) |
| `note-{noteId}` (`noteChannelName`) | "pass the pen" co-edit lease | — (peer-to-peer over the channel) | `src/hooks/useNoteEditLease.ts` |

All wired in `spa/src/App.tsx`. Native: `native/Harvous/Services/HarvousRealtimeSync.swift`
+ `HarvousSupabaseConfig.swift` subscribe with the Supabase Realtime protocol
directly.

### Authorization (dies with Supabase)

- Browser/native use the **anon key** with private channels
  (`REALTIME_PRIVATE_CHANNEL_CONFIG` in `src/lib/supabase-client.ts`); a Clerk
  session JWT is pushed via `realtime.setAuth` on a **45-second timer**.
- Server publishes with the **service role** key.
- RLS on `realtime.messages` (`supabase/realtime-authorization.sql`) calls
  `public.harvous_realtime_topic_allowed(text)` — a `SECURITY DEFINER` plpgsql
  function checking `auth.jwt()->>'sub'` against `SpaceMemberships` / `Notes` /
  `SpaceNotes`. This is the only meaningful stored function in the database.
- Depends on Clerk's native Supabase JWT integration (`role: authenticated`
  claim). All of this disappears with the migration.

---

## Target design

Three DO classes on the Phase A Worker, one instance per topic id
(`idFromName`), all using **WebSocket Hibernation** so idle objects cost
nothing:

### `NoteLeaseDO` — one per note (replaces `note-{noteId}`)

The lease is what a DO *is*: a single-threaded authority. State: current holder
(`clerkUserId`, connection id, acquired-at). Messages: `acquire`, `release`,
`heartbeat`; holder death (socket close/hibernation timeout) auto-releases and
notifies. Eliminates the race-prone peer-to-peer lease negotiation the channel
version has to do.

### `SpacePresenceDO` — one per space (replaces `space-{spaceId}`)

In-memory roster keyed by connection; join/leave broadcast to members; also the
fan-out point for space-scoped invalidations (server → one POST → DO → members),
replacing `broadcastInvalidationToSpaceMembers`'s N-channel publish loop with a
single delivery.

### `UserSyncDO` — one per user (replaces `sync-{clerkUserId}`)

Holds the user's connected devices; receives invalidation POSTs from Fly;
pushes `{type: 'invalidate', keys: [...]}` frames. Payload shape should match
what `useRealtimeSync` already consumes so the hook change is transport-only.

### Auth

- **Client connect:** `GET /realtime/connect?topic=note-{id}` (Upgrade:
  websocket) on the Worker. The Worker verifies the Clerk JWT (JWKS — same
  verification family the Fly API already does via `@clerk/backend`) and asks
  the authorization question before forwarding to the DO.
- **The authz question** is the plpgsql function's logic ported to TypeScript:
  membership/ownership checks against `SpaceMemberships` / `Notes` /
  `SpaceNotes`. Two implementation options, decided at execution:
  (a) the Worker calls a small authenticated Fly endpoint
  (`GET /api/realtime/authorize?topic=...`) — zero new DB access paths, adds one
  hop at connect time only; (b) Hyperdrive from the Worker to Postgres — faster,
  another credential surface. **Recommend (a)**: connects are rare, sync is
  authoritative anyway, and it keeps all DB access on Fly.
- **Server publish:** Fly → `POST /realtime/broadcast` on the Worker with a
  shared-secret bearer (same pattern as the existing cron endpoints), Worker
  routes to the right DO. Replaces the service-role Supabase client in
  `server/utils/realtime.ts` — the exported function signatures stay identical
  so no call sites change.

---

## Migration mechanics

1. Build the three DO classes + the connect/broadcast routes on the Worker;
   deploy dark (no client uses them).
2. **Dual-publish window:** `server/utils/realtime.ts` publishes to both
   Supabase and the Worker. It's fire-and-forget already; the dual write is two
   lines.
3. Move web hooks one at a time behind a flag (mirror the existing
   `isSupabaseRealtimeConfigured()` gating): `useRealtimeSync` first (lowest
   stakes — worst case is falling back to polling, which is the designed
   behavior), then `useSpacePresence`, then `useNoteEditLease`.
4. Native: rewrite `HarvousRealtimeSync.swift` from the Supabase protocol to a
   plain `URLSessionWebSocketTask` against `/realtime/connect` — simpler than
   what it replaces (no Supabase phoenix-channel framing, no 45s token timer;
   reconnect with a fresh Clerk token instead). Native tolerates realtime being
   absent (HTTP sync authoritative), so this can lag the web cutover safely.
5. Delete: `src/lib/supabase-client.ts`'s realtime client, the 45s `setAuth`
   timer, `supabase/realtime-authorization.sql`, the
   `harvous_realtime_topic_allowed` function (SQL `DROP FUNCTION`), the
   Clerk↔Supabase JWT integration in the Clerk dashboard, and the
   `@supabase/supabase-js` import from the client bundle (bundle-size win —
   measure with `npm run perf:check` and pocket the ratchet).

## Verification

- Two browsers, one note: pen passes, holder crash (kill tab) releases within
  the hibernation timeout.
- Two browsers, one space: presence roster converges on join/leave.
- Edit on device A → device B receives invalidation and refetches (network log
  shows the query refire) with realtime on; with the Worker route disabled, B
  still converges via polling — the fallback must survive the migration.
- Native macOS + web simultaneously on a shared-space note.
- Soak metric: DO request + duration billing for a week; expected ≈ $0 at
  current scale (hibernated sockets don't bill duration).

## Future: Yjs co-editing

Once `NoteLeaseDO` exists, true collaborative editing is the same shape one
level deeper: a Yjs doc hosted per note DO (the `y-durableobjects` pattern),
TipTap's Yjs bindings on the client, snapshots persisted through the existing
note-versioning tables. That supersedes the pen-passing lease in Shared Spaces —
the paid product — and is the strongest product argument for this phase. Not in
scope for the migration; design it as its own effort after B lands.

## How to execute

One session for the Worker/DO classes + dual publish, one for the web hook
cutover, one for native. Read `.claude/agents/data-agent context` first — the
sync semantics (`updatedAt` watermark, "HTTP sync is authoritative") are
load-bearing invariants; this phase must not touch them, only the nudge layer
above them.

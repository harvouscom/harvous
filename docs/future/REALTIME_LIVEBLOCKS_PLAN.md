# Real-Time Collaboration — Implementation Plan

> **⚠️ UPDATE (March 2026):** Harvous has migrated from Turso to Supabase. The real-time approach should now use **Supabase Realtime** instead of Liveblocks. Supabase Realtime provides presence, broadcast, and Postgres changes out of the box — no additional vendor needed. Tiptap collaboration can be built on top of Supabase Realtime channels. The phased approach below (cross-device sync → live shared spaces → collaborative editing) still applies, but the implementation details need revision for Supabase.

---

## Original Plan (Liveblocks — for reference)

### Recommendation Summary

**Liveblocks** was the originally recommended path to real-time for Harvous. Here's why it was considered:

| | Liveblocks | Partykit | Self-hosted WebSocket |
|---|---|---|---|
| Serverless (no ops) | ✓ | ✓ | ✗ |
| Tiptap collaboration | ✓ (ready-made) | ✓ (Yjs) | ✓ (Yjs) |
| Works with existing Turso schema | ✓ | ✓ | ✓ |
| Clerk auth integration | ✓ (auth endpoint) | Custom | Custom |
| Permanent document storage | ✓ (built-in) | Optional (persist) | You build it |
| Extra deployment | None | Cloudflare | Your server |
| Cost at small scale | Free tier; usage-based | Near zero | ~$5–10/mo |

Liveblocks provides [rooms, presence, and a ready-made Tiptap multiplayer experience](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap). Documents are [permanently stored](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap#permanent-storage) — you don't need to sync, scale, or maintain infrastructure. A single auth endpoint in your existing Hono API (with Clerk) controls room access. See [Liveblocks Multiplayer](https://liveblocks.io/multiplayer) for the full overview.

---

## What Real-Time Unlocks for Harvous

### Phase 1 — Cross-Device Instant Sync
*"I saved a note on my phone and it appears on my desktop without refreshing."*

Currently TanStack Query handles this with refetch-on-focus. That's fine but not instant. A lightweight "something changed, invalidate your cache" signal makes it feel live.

### Phase 2 — Live Shared Spaces & Leagues
*"I can see new notes appearing in a shared thread. I can see who's active in a league."*

This is where Harvous's social layer comes alive. Leagues feel competitive when you can see activity happening in real-time. Shared spaces feel collaborative when new notes appear without a refresh.

### Phase 3 — Collaborative Note Editing
*"My small group and I are all editing the same sermon notes together."*

Google Docs-style editing on a Harvous note. Liveblocks' [Tiptap integration](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap) provides real-time cursors, permanent storage, and optional version history — achievable without running your own sync infrastructure.

---

## Phase 1: Cross-Device Instant Sync

### Approach
Use a Liveblocks room per user (e.g. `sync-${userId}`). When a note is saved anywhere (web, mobile, SMS inbound), call Liveblocks from Hono to broadcast an invalidation signal to that room. All connected clients for that user subscribe via `@liveblocks/react` and invalidate their TanStack Query cache.

### What to Build

**1. Install Liveblocks packages**
```bash
npm install @liveblocks/client @liveblocks/react
# For backend auth (Phase 3 shares this):
npm install @liveblocks/node
```

**2. After any note save, broadcast to the user's room**
From your Hono API (e.g. after successful `PUT /api/notes/update` or note create), call Liveblocks REST/backend API to broadcast a message to room `sync-${userId}` so all of that user's tabs/devices receive it.

**3. SPA: LiveblocksProvider and sync hook**
- Wrap the app (or relevant subtree) with `LiveblocksProvider` using `authEndpoint: '/api/liveblocks-auth'` (see Phase 3 for auth implementation). For Phase 1, the auth endpoint can issue a token for room `sync-${userId}` when the request is for that room.
- Add a client hook (e.g. `useRealtimeSync.ts`) that enters the user's sync room, subscribes to broadcast events, and calls `queryClient.invalidateQueries({ queryKey: ["notes"] })` (and any other keys) when a "note:updated" (or similar) event is received.

### Result
Notes saved on mobile appear on desktop instantly. SMS-captured notes appear in the app within seconds. Zero polling overhead.

---

## Phase 2: Live Shared Spaces & League Activity

### Approach
One Liveblocks room per shared space (e.g. `space-${spaceId}`). Members connect with Clerk-backed auth; use Liveblocks presence and broadcast for "note created" and activity.

### What to Build

**1. Auth endpoint (shared with Phase 3)**
Implement a Hono route (e.g. `POST /api/liveblocks-auth`) that:
- Uses Clerk to get the current user (e.g. `getAuth(request)` / verify token).
- For room id `space-${spaceId}`: validates that the user is a member of that space (e.g. `requireSpaceAccess(spaceId, userId)` using existing [space-permissions](server/utils/space-permissions.ts)).
- Calls `@liveblocks/node` to create a Liveblocks session token for that room with `userInfo: { name, color }` for presence/cursor display.
- Returns the token to the client.

**2. SPA: enter room when viewing a shared space**
- When the user is on a shared space view, enter the Liveblocks room `space-${spaceId}` (same auth endpoint; client requests a token for that room).
- Use `useOthers()` (or equivalent) for presence — show who's currently in the space.
- Subscribe to broadcast events for "note:created" (or similar) and invalidate space/notes queries (e.g. `queryClient.invalidateQueries({ queryKey: ["space", spaceId, "notes"] })`).

**3. Active users indicator in the UI**
Small avatars or a "3 people active" indicator in the shared space/thread header so the space feels alive.

### Result
- New notes appear in shared threads without refreshing
- League members can see who's active during a challenge
- Activity feels live — essential for the competitive league experience

---

## Phase 3: Collaborative Note Editing (Tiptap)

### Approach
Use [Liveblocks Tiptap](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap): one room per note (e.g. `note-${noteId}`) for **shared-space notes only**. Documents are permanently stored by Liveblocks. Optional: sync to Turso for canonical record (search/export) via Hono (e.g. periodic or on close).

### What to Build

**1. Auth endpoint**
Same Hono route `POST /api/liveblocks-auth` (or equivalent). For room id `note-${noteId}`:
- Resolve the note's space (from `Notes.spaceId` or the note's thread's space via [server/db](server/db/schema.ts)).
- Call `requireSpaceAccess(spaceId, userId)` so only space members can join the note room.
- Use `@liveblocks/node` to create a Liveblocks token for room `note-${noteId}` with `userInfo: { name, color }` for cursor display (see [Liveblocks Authentication](https://liveblocks.io/docs/authentication)).
- Return the token to the client.

**2. SPA: LiveblocksProvider and collaborative editor**
- Wrap the note editor route (or app) with `LiveblocksProvider` with `authEndpoint: '/api/liveblocks-auth'` (or your full API base URL).
- For the shared-note editor, use `@liveblocks/react-tiptap` (e.g. `useLiveblocksExtension` with room id `note-${noteId}` and optional `field` if you have multiple editors on the page). See [Liveblocks Tiptap API](https://liveblocks.io/docs/api-reference/liveblocks-react-tiptap).
- Integrate with existing [TiptapEditor](src/components/react/TiptapEditor.tsx) or a collaboration-specific wrapper so existing extensions (ScripturePill, TiptapNoteLink, etc.) are preserved where possible.

**3. Persistence**
Liveblocks stores the document. If Harvous needs a Turso copy for search/export or single source of truth, add a sync path: e.g. server-side use [`withProsemirrorDocument`](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap#server-side-modifications) to read content and call `PUT /api/notes/update` (or a dedicated collab-save endpoint) with space-member write permission. Extend notes API so space members can update note content when the note is in a shared space they belong to (see [earlier collaboration discussion](docs/future/COLLABORATIVE_SHARED_SPACES.md)).

### Result
- Multiple people can edit the same note simultaneously
- Cursors show where each collaborator is
- Changes merge automatically (CRDT under the hood)
- Small groups studying together can build notes in real-time

### Caveats
- This is the most complex phase — test carefully with Harvous's existing scripture pill marks and custom Tiptap extensions
- Start with collaboration on shared space notes only, not personal notes

### Optional: Liveblocks Tiptap extras
- [Toolbar / FloatingToolbar](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap#toolbars) for consistent formatting UI
- [Annotations and comments](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap#annotations-and-comments) for inline discussion
- [Version history](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap#version-history) to restore or review past states
- [Offline support (experimental)](https://liveblocks.io/docs/api-reference/liveblocks-react-tiptap#Offline-support) so edits sync when back online
- [Server-side modifications](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap#server-side-modifications) for AI or automation that update the doc in real time

---

## Rollout Order

```
Phase 1: Cross-device sync       → Low effort, high value, do this first
Phase 2: Live shared spaces      → Medium effort, unlocks social features
Phase 3: Collaborative editing    → High effort, do when shared spaces are established
```

Phase 3 can lean on Liveblocks' built-in persistence and version history to simplify rollout compared to wiring your own Yjs persistence.

---

## Infrastructure & Cost

**Liveblocks**
- Hosted; no separate deployment. Your existing Hono API on Netlify stays the single backend; add one auth route that issues Liveblocks tokens.
- Pricing is usage-based (MAU, storage). Free tier available. See [Liveblocks pricing](https://liveblocks.io/pricing).

**Integration**
- Single auth endpoint in Hono (Netlify); SPA adds Liveblocks packages and `LiveblocksProvider`. No new deployment target.

---

## Files to Create

```
server/
  routes/
    liveblocks-auth.ts   # Clerk auth + space access + Liveblocks token (or add to existing route file)

spa/src/
  hooks/
    useRealtimeSync.ts   # Phase 1: listen for invalidation in user sync room
    useSpaceRealtime.ts  # Phase 2: enter space room, presence, broadcast for new notes
  # Phase 3: LiveblocksProvider in root/layout; collaborative Tiptap component using @liveblocks/react-tiptap
```

No `party/` directory or separate real-time server.

---

## Related Docs

- [SHARING_SYSTEM_DESIGN.md](./SHARING_SYSTEM_DESIGN.md) — shared spaces architecture
- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — leagues and social layer vision
- [SMS_AND_EMAIL_CAPTURE.md](./SMS_AND_EMAIL_CAPTURE.md) — inbound capture (Phase 1 sync makes SMS capture feel instant)
- [Liveblocks Multiplayer](https://liveblocks.io/multiplayer) — product overview
- [Liveblocks Tiptap](https://liveblocks.io/docs/ready-made-features/multiplayer/text-editor/tiptap) — ready-made Tiptap collaboration
- [Liveblocks Authentication](https://liveblocks.io/docs/authentication) — Clerk and auth endpoint pattern

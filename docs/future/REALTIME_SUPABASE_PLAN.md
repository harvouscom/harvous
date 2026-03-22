# Real-Time Collaboration with Supabase + Tiptap

## Overview

Real-time collaboration for Harvous, built on Supabase Realtime and Tiptap's Yjs-based collaboration stack. Since Harvous already uses Supabase for its database, Phases 1 and 2 require no additional services. Phase 3 (collaborative editing) adds Hocuspocus as a lightweight WebSocket server for Yjs document sync, with Supabase Postgres as the persistence layer.

### What Real-Time Unlocks

| Phase | Experience | Complexity |
|---|---|---|
| **1. Cross-Device Sync** | "I saved a note on my phone and it appears on my desktop instantly" | Low |
| **2. Live Shared Spaces** | "I can see who's active and new notes appear without refreshing" | Medium |
| **3. Collaborative Editing** | "My small group is editing the same sermon notes together" | High |

---

## Technology Stack

| Concern | Solution | Notes |
|---|---|---|
| Cache invalidation | Supabase Realtime (Broadcast or Postgres Changes) | Built-in, no extra service |
| Presence / "who's online" | Supabase Realtime Presence | Built-in, no extra service |
| Collaborative text editing | Hocuspocus + Yjs + Tiptap Collaboration extension | Requires a WebSocket server |
| Document persistence | Supabase Postgres (BYTEA column for Yjs state) | Hocuspocus Database extension handles load/save |
| Auth | Clerk (existing) | Hocuspocus `onAuthenticate` hook validates Clerk JWTs |

### Why Hocuspocus for Phase 3 (not pure Supabase Realtime)

Community Yjs providers for Supabase (`y-supabase`, `@kamick/supabaseprovider`) exist but are explicitly early-stage and not production-ready. Hocuspocus is maintained by the Tiptap team, battle-tested, and designed specifically for Tiptap collaboration. It handles:
- WebSocket multiplexing for multiple documents
- Yjs CRDT conflict resolution
- Awareness protocol (remote cursors)
- Document loading/saving lifecycle hooks
- Auth hooks (Clerk JWT validation)

Supabase Postgres is still the persistence backend — Hocuspocus just handles the real-time sync layer.

---

## Phase 1: Cross-Device Instant Sync

**Goal:** Notes saved on one device appear on all other devices within seconds, without manual refresh.

**Current state:** TanStack Query with refetch-on-focus. Works but not instant.

### Approach

Use Supabase Realtime **Broadcast** to send lightweight invalidation signals. When a note is saved anywhere (web, mobile, SMS inbound), broadcast a message to a user-scoped channel. All connected clients subscribe and invalidate their TanStack Query cache.

### Why Broadcast over Postgres Changes

- Lower latency (no WAL processing)
- No database load — fire-and-forget messages
- Can include arbitrary payload (note ID, action type)
- Postgres Changes processes on a single thread and can lag at high write volumes

### What to Build

**1. Server-side: broadcast after save**

After a successful note save in the Hono API, broadcast an invalidation signal:

```typescript
// server/utils/realtime.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function broadcastInvalidation(userId: string, payload: {
  type: 'note:created' | 'note:updated' | 'note:deleted' | 'thread:updated'
  id?: string
}) {
  await supabase.channel(`sync-${userId}`).send({
    type: 'broadcast',
    event: 'invalidate',
    payload,
  })
}
```

Call this from existing save/create/delete endpoints (e.g., after `PUT /api/notes/update`).

**2. Client-side: subscribe and invalidate cache**

```typescript
// src/hooks/useRealtimeSync.ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useRealtimeSync(userId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase.channel(`sync-${userId}`)

    channel.on('broadcast', { event: 'invalidate' }, ({ payload }) => {
      // Invalidate relevant queries based on event type
      if (payload.type.startsWith('note:')) {
        queryClient.invalidateQueries({ queryKey: ['notes'] })
        if (payload.id) {
          queryClient.invalidateQueries({ queryKey: ['note', payload.id] })
        }
      }
      if (payload.type.startsWith('thread:')) {
        queryClient.invalidateQueries({ queryKey: ['threads'] })
      }
    })

    channel.subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, queryClient])
}
```

Wire this into the app root (e.g., in the main layout or auth-gated wrapper).

### Result

Notes saved on mobile appear on desktop instantly. SMS-captured notes appear in the app within seconds. Zero polling overhead.

### Effort: ~1-2 days

---

## Phase 2: Live Shared Spaces

**Goal:** See who's active in a shared space and watch new content appear in real-time.

### Approach

Use Supabase Realtime **Presence** for "who's online" and **Broadcast** for activity events, both on a space-scoped channel (`space-${spaceId}`).

### What to Build

**1. Presence tracking**

```typescript
// src/hooks/useSpacePresence.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useSpacePresence(spaceId: string, currentUser: { id: string; name: string }) {
  const [activeUsers, setActiveUsers] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const channel = supabase.channel(`space-${spaceId}`)

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const users = Object.values(state).flat().map((p: any) => ({
        id: p.userId,
        name: p.name,
      }))
      setActiveUsers(users)
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId: currentUser.id,
          name: currentUser.name,
        })
      }
    })

    return () => { supabase.removeChannel(channel) }
  }, [spaceId, currentUser.id])

  return activeUsers
}
```

**2. Live activity feed**

Subscribe to broadcast events on the same space channel for "note added" / "note updated" events. Server broadcasts these after mutations that affect shared space content.

**3. UI: active users indicator**

Small avatar stack or "3 people active" indicator in the shared space header. Use `activeUsers` from the presence hook.

### Permissions

Use existing `requireSpaceAccess(spaceId, userId)` to validate membership before allowing channel subscription. Supabase RLS on the channel can enforce this, or validate in the client before subscribing.

### Result

- New notes appear in shared threads without refreshing
- Users see who's currently in the space
- Spaces feel alive and collaborative

### Effort: ~2-3 days

---

## Phase 3: Collaborative Note Editing

**Goal:** Multiple people editing the same Tiptap note simultaneously with real-time cursors and conflict-free merging.

### Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐     Postgres     ┌──────────────┐
│  Tiptap +   │ ◄────────────────► │  Hocuspocus  │ ◄──────────────► │   Supabase   │
│  Yjs client │     (Yjs sync)     │   Server     │   (persistence)  │   Postgres   │
└─────────────┘                    └──────────────┘                  └──────────────┘
       │                                  │
       │ Presence/cursors                 │ Auth
       │ (Yjs awareness)                  │ (Clerk JWT)
       ▼                                  ▼
  CollaborationCursor              onAuthenticate hook
```

### Why Hocuspocus

Hocuspocus is the Tiptap team's official collaboration backend. It provides:
- **Yjs document sync** over WebSocket — battle-tested CRDT conflict resolution
- **Awareness protocol** — remote cursors, selections, user presence within the editor
- **Database extension** — load/save Yjs document state to any database (Supabase Postgres)
- **Auth hooks** — validate Clerk JWTs and check space membership before granting access
- **Webhook extension** — notify your API when documents change (optional)

### What to Build

**1. Supabase table for Yjs document state**

```sql
CREATE TABLE collaborative_documents (
  note_id TEXT PRIMARY KEY REFERENCES notes(id),
  yjs_state BYTEA NOT NULL,          -- serialized Yjs document
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2. Hocuspocus server**

A lightweight Node.js service. Can be deployed on Fly.io, Railway, or similar.

```typescript
// collab-server/index.ts
import { Hocuspocus } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { createClient } from '@supabase/supabase-js'
import { verifyClerkJWT } from './auth' // Clerk JWT verification

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const server = new Hocuspocus({
  port: 1234,

  async onAuthenticate({ token, documentName }) {
    // documentName = "note-{noteId}"
    const user = await verifyClerkJWT(token)
    if (!user) throw new Error('Unauthorized')

    const noteId = documentName.replace('note-', '')
    // Verify user has access to this note's shared space
    const hasAccess = await checkSpaceAccess(supabase, noteId, user.id)
    if (!hasAccess) throw new Error('Forbidden')

    return { user }
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const noteId = documentName.replace('note-', '')
        const { data } = await supabase
          .from('collaborative_documents')
          .select('yjs_state')
          .eq('note_id', noteId)
          .single()
        return data?.yjs_state ? Buffer.from(data.yjs_state) : null
      },

      async store({ documentName, state }) {
        const noteId = documentName.replace('note-', '')
        await supabase
          .from('collaborative_documents')
          .upsert({
            note_id: noteId,
            yjs_state: state,
            updated_at: new Date().toISOString(),
          })
      },
    }),
  ],
})

server.listen()
```

**3. Client: Tiptap with collaboration extensions**

```typescript
// In collaborative note editor component
import { useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const ydoc = new Y.Doc()

const provider = new HocuspocusProvider({
  url: HOCUSPOCUS_URL,           // e.g., wss://collab.harvous.com
  name: `note-${noteId}`,        // document name = room
  document: ydoc,
  token: clerkToken,              // Clerk session token for auth
})

const editor = useEditor({
  extensions: [
    // ... existing Harvous extensions (ScripturePill, NoteLink, etc.)
    Collaboration.configure({ document: ydoc }),
    CollaborationCursor.configure({
      provider,
      user: { name: currentUser.name, color: currentUser.cursorColor },
    }),
  ],
})
```

### Integration with Existing TiptapEditor

The existing `TiptapEditor.tsx` has custom extensions (ScripturePill, NoteLink, etc.). For collaborative editing:
- Create a `CollaborativeTiptapEditor` wrapper that adds the `Collaboration` and `CollaborationCursor` extensions alongside the existing custom extensions
- The `Collaboration` extension replaces the default `history` extension (Yjs has its own undo/redo via `y-undo`)
- Scripture pills and other custom marks should work with Yjs — they're ProseMirror marks, and `y-prosemirror` syncs the full document schema
- Test custom extensions carefully — any extension that modifies the document outside the Yjs transaction flow could cause sync issues

### Scope: Shared Space Notes Only

Start with collaborative editing on **shared space notes only**, not personal notes. This keeps the scope manageable and aligns with the use case (small group study).

### Syncing Back to Supabase Notes Table

The Yjs document is the source of truth during editing. To keep the existing `notes` table in sync (for search, export, non-collaborative views):
- Use Hocuspocus's `onStoreDocument` hook or Webhook extension to serialize the Yjs doc to HTML/JSON and update the note's `content` column
- This runs periodically (debounced) and on document close — not on every keystroke

### Deployment

Hocuspocus is a stateful WebSocket server — it needs persistent connections, so serverless (Netlify Functions) won't work. Options:
- **Fly.io** — good for WebSocket workloads, easy to scale, ~$3-5/mo for a small instance
- **Railway** — similar, slightly easier setup
- **Render** — free tier available for small workloads

### Caveats

- **Most complex phase** — test carefully with Harvous's custom Tiptap extensions
- **Hocuspocus is a separate service** — adds operational overhead (deployment, monitoring, scaling)
- **Yjs document size** — very long notes could produce large Yjs states; implement document size limits or compaction
- **Offline + collab** — Yjs handles offline edits and merges on reconnect, but conflict resolution for long offline periods can produce surprising results
- Custom extensions (ScripturePill marks) need testing to ensure they survive Yjs round-trips

### Effort: ~1-2 weeks

---

## Rollout Order

```
Phase 1: Cross-device sync       → Low effort, high value — do this first
Phase 2: Live shared spaces      → Medium effort, makes spaces feel alive
Phase 3: Collaborative editing   → High effort, do when shared spaces are established
```

Each phase is independently valuable. Phase 1 alone makes the app feel significantly more responsive across devices.

---

## Packages to Install

### Phase 1 & 2 (no new packages — uses existing Supabase client)

Supabase Realtime is built into `@supabase/supabase-js`, which Harvous already has.

### Phase 3

```bash
# Client
npm install yjs @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor @hocuspocus/provider

# Server (collab-server)
npm install @hocuspocus/server @hocuspocus/extension-database @supabase/supabase-js
```

---

## Files to Create

```
# Phase 1
server/utils/realtime.ts             # broadcastInvalidation() helper
src/hooks/useRealtimeSync.ts          # Client-side cache invalidation listener

# Phase 2
src/hooks/useSpacePresence.ts         # Presence tracking for shared spaces
src/components/react/ActiveUsers.tsx   # Avatar stack / "X people active" UI

# Phase 3
collab-server/                        # Separate Hocuspocus service
  index.ts                            # Server setup with Database extension
  auth.ts                             # Clerk JWT verification
  Dockerfile                          # For deployment
sql/collaborative_documents.sql       # Table migration
src/components/react/CollaborativeTiptapEditor.tsx  # Collab-enabled editor wrapper
```

---

## Supabase Realtime Limits to Keep in Mind

- **Message size:** 1 MB max (fine for invalidation signals and presence; Yjs incremental updates are typically small)
- **Rate limits:** Vary by Supabase plan tier — exceeding disconnects the client (auto-reconnects)
- **Postgres Changes:** Single-threaded processing, latency increases at high write volumes (not an issue for Phases 1-2 since we use Broadcast)
- **Pricing:** $2.50 per million messages beyond plan quota

---

## Related Docs

- [COLLABORATIVE_SHARED_SPACES.md](./COLLABORATIVE_SHARED_SPACES.md) — Shared spaces implementation (v1 complete)
- [SHARING_SYSTEM_DESIGN.md](./SHARING_SYSTEM_DESIGN.md) — Sharing system architecture
- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — Leagues and social layer vision
- [REALTIME_LIVEBLOCKS_PLAN.md](./REALTIME_LIVEBLOCKS_PLAN.md) — Original Liveblocks plan (archived for reference)
- [TURSO_TO_SUPABASE_MIGRATION.md](./TURSO_TO_SUPABASE_MIGRATION.md) — Database migration context

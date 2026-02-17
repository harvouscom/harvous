# Real-Time with Partykit — Implementation Plan

## Recommendation Summary

**Partykit** is the recommended path to real-time for Harvous. Here's why it fits better than the alternatives:

| | Partykit | Fly.io WebSocket server | Jazz | Electric SQL |
|---|---|---|---|---|
| Serverless (no ops) | ✓ | ✗ | ✓ | Partial |
| Edge-native | ✓ | Partial | ✓ | ✗ |
| Works with existing Turso schema | ✓ | ✓ | ✗ | ✓ |
| Tiptap collaboration support | ✓ (Yjs) | ✓ (Yjs) | ✗ | ✗ |
| Cold starts | None | None | None | N/A |
| Migration cost | Low | Low | Very high | Medium |
| Cost at small scale | Near zero | ~$5-10/mo | Usage-based | Self-hosted |

Partykit runs on Cloudflare Workers with Durable Objects — each "party" (room) is a persistent, stateful edge worker. It's purpose-built for exactly what Harvous needs: presence, live sync, and eventually collaborative editing.

Tiptap (already in Harvous) has a first-class Yjs extension (`@tiptap/extension-collaboration`) that plugs directly into Partykit's Yjs provider. The path from current state to collaborative editing is more connected than it might seem.

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

Google Docs-style editing on a Harvous note. This is a significant feature but Tiptap + Yjs + Partykit makes it achievable without building the hard parts from scratch.

---

## Phase 1: Cross-Device Instant Sync

### Approach
Add a Partykit "presence" room per user. When a note is saved anywhere (web, mobile, SMS inbound), send a lightweight signal to that user's room. All connected clients for that user listen and invalidate their TanStack Query cache.

### What to Build

**1. Install Partykit**
```bash
npm install partykit partysocket
```

**2. Create a sync party (`party/sync.ts`)**
```ts
import type * as Party from "partykit/server";

export default class SyncParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onMessage(message: string) {
    // Broadcast the invalidation signal to all connections in this room
    this.room.broadcast(message);
  }
}
```

**3. After any note save, signal the user's room**
```ts
// In /api/notes/update.ts — after successful save
await fetch(`https://harvous.partykit.dev/parties/sync/${userId}`, {
  method: "POST",
  body: JSON.stringify({ type: "note:updated", noteId }),
});
```

**4. Listen on the client (SPA)**
```ts
// In a hook, e.g. useRealtimeSync.ts
import PartySocket from "partysocket";

useEffect(() => {
  const socket = new PartySocket({
    host: "harvous.partykit.dev",
    room: userId,
  });

  socket.onmessage = (event) => {
    const { type } = JSON.parse(event.data);
    if (type === "note:updated") {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  };

  return () => socket.close();
}, [userId]);
```

### Result
Notes saved on mobile appear on desktop instantly. SMS-captured notes appear in the app within seconds of the text being sent. Zero polling overhead.

---

## Phase 2: Live Shared Spaces & League Activity

### Approach
One Partykit room per shared space or league. Members of that space connect to the room. When anyone adds a note, the room broadcasts it. Presence tracking shows who's currently active.

### What to Build

**1. Shared space party (`party/space.ts`)**
```ts
import type * as Party from "partykit/server";

interface Connection {
  userId: string;
  displayName: string;
}

export default class SpaceParty implements Party.Server {
  connections = new Map<string, Connection>();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const userId = url.searchParams.get("userId")!;
    const displayName = url.searchParams.get("name")!;

    this.connections.set(conn.id, { userId, displayName });
    this.broadcastPresence();
  }

  async onClose(conn: Party.Connection) {
    this.connections.delete(conn.id);
    this.broadcastPresence();
  }

  async onMessage(message: string) {
    // Broadcast activity (new note, new reaction, etc.) to all members
    this.room.broadcast(message);
  }

  broadcastPresence() {
    const present = Array.from(this.connections.values());
    this.room.broadcast(JSON.stringify({ type: "presence", users: present }));
  }
}
```

**2. Client hook for shared space**
```ts
// useSpaceRealtime.ts
const socket = new PartySocket({
  host: "harvous.partykit.dev",
  room: `space-${spaceId}`,
  query: { userId, name: displayName },
});

socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "note:created") {
    // Optimistically prepend the new note to the list
    queryClient.invalidateQueries({ queryKey: ["space", spaceId, "notes"] });
  }
  if (msg.type === "presence") {
    setActiveUsers(msg.users);
  }
};
```

**3. Active users indicator in the UI**
Small avatars or a "3 people active" indicator in the shared thread header. Shows the space is alive.

### Result
- New notes appear in shared threads without refreshing
- League members can see who's active during a challenge
- Activity feels live — which is essential for the competitive league experience

---

## Phase 3: Collaborative Note Editing

### Approach
Tiptap already uses ProseMirror. Yjs is a CRDT (conflict-free replicated data type) library that tracks document changes and merges them automatically. Partykit has a built-in Yjs provider. Tiptap has a first-class `@tiptap/extension-collaboration` extension.

These three things connect almost out of the box.

### What to Build

**1. Install Yjs extensions**
```bash
npm install yjs @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

**2. Add a Yjs party (`party/collab.ts`)**
```ts
import { onConnect } from "y-partykit";
import type * as Party from "partykit/server";

export default class CollabParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    // y-partykit handles all the Yjs protocol automatically
    return onConnect(conn, this.room);
  }
}
```

**3. Add collaboration extensions to TiptapEditor**
```ts
// In TiptapEditor.tsx — add to extensions array
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-partykit/provider";

const ydoc = new Y.Doc();
const provider = new WebsocketProvider(
  "harvous.partykit.dev",
  `note-${noteId}`,
  ydoc
);

// Add to extensions:
Collaboration.configure({ document: ydoc }),
CollaborationCursor.configure({
  provider,
  user: { name: displayName, color: userColor },
}),
```

**4. Persist Yjs document state**
Partykit can persist the Yjs document to its storage so late-joining collaborators get the full document history. Add to the party:
```ts
async onConnect(conn: Party.Connection) {
  return onConnect(conn, this.room, { persist: true });
}
```

### Result
- Multiple people can edit the same note simultaneously
- Cursors show where each collaborator is
- Changes merge automatically without conflicts
- Small groups studying together can build notes in real-time

### Caveats
- This is the most complex phase — test carefully with Harvous's existing scripture pill marks and custom Tiptap extensions
- Yjs stores its own document representation; the server-side Turso record needs to be kept in sync (on save, serialize the Yjs doc to HTML and update the DB)
- Start with collaboration on shared space notes only, not personal notes

---

## Rollout Order

```
Phase 1: Cross-device sync       → Low effort, high value, do this first
Phase 2: Live shared spaces      → Medium effort, unlocks social features
Phase 3: Collaborative editing   → High effort, do when shared spaces are established
```

---

## Infrastructure & Cost

**Partykit pricing** (as of early 2026):
- Free tier: generous for development and early users
- Production: usage-based on connections and messages — at Harvous's current scale, likely under $10/month
- No servers to manage, no ops overhead — same philosophy as the rest of the stack

**Deployment**
```bash
npx partykit deploy
```
Partykit deploys to Cloudflare's global edge network. Same deploy model as Netlify — push and it's live globally.

---

## Files to Create

```
party/
  sync.ts          # Phase 1: cross-device invalidation signals
  space.ts         # Phase 2: shared space presence + activity
  collab.ts        # Phase 3: Yjs collaborative editing

spa/src/hooks/
  useRealtimeSync.ts     # Phase 1 client hook
  useSpaceRealtime.ts    # Phase 2 client hook

partykit.json            # Partykit config
```

---

## Related Docs

- [SHARING_SYSTEM_DESIGN.md](./SHARING_SYSTEM_DESIGN.md) — shared spaces architecture
- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — leagues and social layer vision
- [SMS_AND_EMAIL_CAPTURE.md](./SMS_AND_EMAIL_CAPTURE.md) — inbound capture (Phase 1 sync makes SMS capture feel instant)

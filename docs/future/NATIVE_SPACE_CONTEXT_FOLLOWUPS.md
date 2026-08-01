# Native follow-ups: space context and co-editing

**Status:** not started (web shipped August 2026 on `feat/shared-space-co-editing`)
**Scope:** `native/Harvous` (macOS + iOS). No server changes required for items 1–3.

Web resolved four related confusions about spaces and co-editing. Native shares the
underlying model but has none of the fixes, and in one case behaves noticeably worse.
This is the parity backlog, ordered by how much it hurts today.

---

## The model these all rest on

A note is **never copied** into a shared space. The canonical row lives in the
author's My Home (`Notes.spaceId`), and each shared space is a `SpaceNotes`
association row. Sharing a note doesn't move it, duplicate it, or take it out of
your Home.

Two consequences that drive everything below:

1. **`Notes.coEditEnabled` is an OR-mirror** across every live shared association.
   The server sets it true if *any* associated space has co-edit on
   (`server/utils/note-collaboration.ts` → `syncNoteCoEditMirror`). It therefore
   carries **no space context** and must never be rendered from directly.
2. **The per-space truth is `SpaceNotes.coEditEnabled`**, delivered to clients as
   `activeSharedAssociations[]` on `GET /api/notes/:id/details`
   (`server/routes/notes.ts:2558-2588`, serialized at `:2699-2712`). In a shared
   read the array contains only the context space, so a member can never learn the
   author's other audiences.

The framing web settled on, worth keeping in native copy too: **a space is an
audience you publish to, not a folder the note lives in.**

---

## 1. The author is locked out of their own note — highest priority

**What happens now.** `Note.coEditEnabled` (`native/Harvous/Models/Note.swift:61`)
is the only co-edit signal native decodes. Because it's the OR-mirror, turning on
co-editing in *one* shared space makes the note read-only for its own author **in
every context, including My Home**, with nothing on screen explaining why:

| Location | Code | Effect |
|---|---|---|
| `NoteEditorView.swift:1248` | `.disabled(note.coEditEnabled)` | title field dead |
| `NoteEditorView.swift:1281`, `:1322` | `isEditable: note.coEditEnabled == false` | body read-only |
| `NoteEditorView.swift:3125` | `guard !note.coEditEnabled else { return }` | autosave disabled |
| `NoteEditorView.swift:3298` | `isCoEditFollower: note?.coEditEnabled == true` | treated as follower |

The comment at `:1247` is honest about the reason — *"Co-edited notes are read-only
on native (no pen lease)"* — and as a safety choice with no lease it is defensible.
The problem is its blast radius: it costs the author write access to their own
private Home reading of the note, permanently, for as long as co-edit is on
anywhere. Web had a milder version of this bug and it was the top complaint.

**Fix A — scope the flag (small, do this first).** Decode
`activeSharedAssociations` alongside `coEditEnabled` in `HarvousAPI.swift` (the
note-detail decoder around `:572` currently takes `coEditEnabled` only) and add a
`spaces: [NoteSpaceAssociation]` to `Note`. Then replace every gate above with the
*context* flag rather than the mirror:

- reading in My Home (no shared context) → **editable**, no co-edit chrome
- reading in a shared space whose association has co-edit **off** → read-only
- reading in a shared space whose association has co-edit **on** → current
  behaviour (read-only until Fix B)

Web's rule lives in `spa/src/lib/note-audience.ts` (`resolveNoteAudience`), which
is pure and fully unit-tested — port the logic, and port the tests with it.

**⚠️ The trap.** Fix A alone re-opens a real conflict window: the author can now
type in Home while a collaborator is writing in the shared space, and the loser of
the race gets a 409. Web is safe here only because it keeps a presence lease
running even in Home and escalates the banner when someone else holds the pen.
Native has no lease at all (no Realtime channel subscription exists in
`native/Harvous/Services/`). So either:

- ship Fix A **plus** a visible warning whenever the note is co-editable anywhere
  and native cannot observe the pen (honest, cheap, slightly noisy), or
- ship Fix A **with** Fix B (correct, more work).

Do not ship Fix A silently.

**Fix B — implement the pen lease.** Subscribe to the per-note Supabase Realtime
presence channel and mirror web's arbiter-free winner selection. Reference:
`src/hooks/useNoteEditLease.ts` — channel name from `src/lib/supabase-client.ts`
(`noteChannelName` → `note-{id}`), `resolvePenHolder` at `:87` (earliest
`claimedAt`, ties broken by lowest `userId`), and the grace constants
`LEASE_BLUR_GRACE_MS = 5_000`, `LEASE_IDLE_RELEASE_MS = 45_000`,
`LEASE_DISCONNECT_GRACE_MS = 2_500`. Authorization policy is already in
`supabase/realtime-authorization.sql` and needs no change.

**Then port the presentation rule.** Web shows a quiet `Shared with Romans Group`
line in Home and escalates to the full pen banner only when someone else actually
holds it — `resolveNoteEditStatusVisibility` in `spa/src/lib/note-audience.ts`. The
invariant it enforces, which native must not lose: **if the editor is non-editable,
the reason is visible.** A locked editor with no explanation is worse than the
noise it saves.

---

## 2. Does the space picker orphan the open note?

**Web's decision.** The space switcher is navigation and outranks the open note. If
a note is on screen, the switcher names a space it belongs to. Switching to a space
that can't hold the open note closes it to an empty state naming that space
(`Nothing open in Romans Group`); opening a note the current space doesn't contain
moves the switcher instead. Either direction, nav and content never disagree.

Two rules make that work, and they must both be ported or neither:

- **Event, not invariant.** The close fires on a *user-initiated switch* only
  (`spa/src/hooks/useSwitchToSpace.ts`). As a continuous render guard it would
  vanish a private note the instant you opened it from a Home-scoped list inside a
  shared space.
- **The switch-time lookup must find data cached under any context, not just the
  bare key.** Web shipped a real bug here (fixed August 2026): a note opened with a
  space context caches under a context-suffixed key, but the close-check read the
  bare key — an exact-key miss — so every downstream guard failed open and a
  foreign, read-only note never closed on switching to My Home. Client-side that
  meant an editable-looking editor for a note the viewer didn't own (the server
  still rejected the write; see `resolveNoteEditAuthorization` below — no data was
  ever at risk, but the save silently vanished with no explanation). If native
  keys its own note cache/store by context the same way, the equivalent lookup
  needs the same prefix/any-context match — see `findCachedNoteAcrossContexts` in
  `spa/src/hooks/useSwitchToSpace.ts` and its regression test in
  `spa/src/hooks/__tests__/use-switch-to-space.test.ts`.
- **Editability must not rest solely on space-context resolution.** The
  context-collapse bug above also flipped `readOnlyInSharedSpace` to `false`
  because it was gated entirely behind `noteInSharedSpace`, with the server's own
  `canEdit` verdict sitting unused a few lines below. Fixed by checking ownership
  independently first — see `resolveForeignNoteReadOnly` in
  `spa/src/lib/note-audience.ts`. Port this as an unconditional rule: a note
  positively known to be foreign and without a co-edit grant must render
  read-only regardless of whatever context state native currently believes it's
  in.
- **Fail open.** Never close when membership hasn't loaded, and never close the
  author's own note when switching to My Home — My Home is an aggregate that
  contains every note you authored regardless of `spaceId`
  (`server/utils/dashboard-data.ts:1687`, `isMyHomeAggregate`).

**Native research needed first.** `SpaceStore.setActiveSpace(id:modelContext:)`
(`native/Harvous/Services/SpaceStore.swift:34`) persists `selectedSpaceId` to
`UserDefaults`. Unknown, and worth checking before designing anything:

- Does the open note survive a space switch on native today, and if so does any
  space-scoped chrome silently re-point at the new space?
- Is there a native equivalent of web's `?space=` note context, or is the active
  space the only signal?

Web's version of this bug was worse than "confusing": because a shared context sets
`canShare: false`, switching the picker **hid the Share button** on a My Home note
and offered a Remove action that 404'd. Check for the same class of drift on native
before assuming it's cosmetic.

---

## 3. Add-to-space doesn't exist natively yet

There is no `add-note` / association call anywhere in `native/` — a note can only
be created into a space, never shared to one afterwards. Nothing is broken; this is
a gap.

When it does get built, take the rules from `spa/src/lib/shared-note-membership.ts`
(`resolveNoteSpaceMembershipRows`) rather than re-deriving them. It classifies every
candidate space as `added` / `addable` / `blocked`, mirroring the server's own
refusals in `server/utils/shared-space-lifecycle.ts`:

| Situation | Server | UI should show |
|---|---|---|
| already associated | idempotent no-op | `added`, checked, inert |
| own note, unassociated | inserts association | `addable` |
| someone else's note | `409 SAVE_COPY_REQUIRED` | `blocked` — save an attributed copy |
| encrypted note | `409 LOCKED_NOTE` | `blocked` |
| ministry channel, non-leader | refused | `blocked` |

Web shipped this offering *every* shared space as a target and toasting
"Added to …" even when the server did nothing. `POST /api/spaces/:id/add-note` now
returns `alreadyAssociated: true` on a no-op (`server/routes/spaces.ts`) — use it
rather than assuming success.

---

## 4. Compose destination

Web now shows the destination before you write (`Saving to My Home`) and resolves
new-note placement from the active space alone — a list filter no longer influences
where a note lands. If native's compose has any comparable ambiguity about which
space a new note will belong to, name the destination in the editor rather than
leaving it to be discovered after saving.

---

## 5. Cross-platform: the write endpoint isn't scoped to the read context

Not native-specific — flagging it here because it surfaced while chasing the item 2
regression, and it affects any client (web included), so a native co-edit
implementation must not assume space context matters more than it does server-side.

`PUT /api/notes/update` never receives a space/context id at all
(`spa/src/hooks/mutations/useUpdateNote.ts` — the `contextSpaceId` field is
explicitly documented "Never sent to the canonical endpoint"). Server-side,
`resolveNoteEditAuthorization` → `resolveSharedSpacesGrantingEdit`
(`server/utils/note-collaboration.ts`) grants a write if **any** live,
co-edit-enabled `SpaceNotes` association exists for that note where the actor is a
member — independent of which space the client's UI currently shows.

**Not exploitable today**: verified against production data that no note is
currently associated with more than one shared space, so there's no second space
whose grant could disagree with the one being displayed. But the latent shape of
the bug is real: a note in Space A (co-edit off) *and* Space B (co-edit on) would
be legitimately writable via the unscoped endpoint while a viewer reads it in
Space A, where the UI correctly says editing is off. This is a should-fix, not a
five-alarm one — no incident has occurred and none can with the current data
shape — but the write path should eventually require and verify the same context
a read does, mirroring `resolveNoteReadContext`.

---

## Suggested order

1. **1-A + a warning** — cheapest way to give authors their notes back.
2. **2 research** — a few greps; may turn out to be a non-issue or may be the same
   Share-button class of bug.
3. **1-B (the lease)** — removes the warning and makes native a real co-edit peer.
4. **3 / 4** — when those surfaces get built.

## Cross-references

- `docs/SHARED_SPACES_DEV_NOTES.md` — canonical note + `SpaceNotes` model, and why
  copy-in was retired
- `docs/SUPABASE_REALTIME_SETUP.md` — channel + auth setup for the lease
- `spa/src/lib/note-audience.ts` + `spa/src/lib/__tests__/note-audience.test.ts` —
  the pure rules and their test matrix; the closest thing to a spec
- `e2e/shared-spaces-collaboration.spec.ts` — `per-space co-edit does not leak
  across spaces` is the single test that pins the contract native must match

# @ Mention pills — design doc (future editor branch)

**Status:** Design notes only — not implemented. Written alongside the Shared Spaces foundation
(`feat/shared-spaces-foundation`, July 2026) because shared spaces introduce cross-space content that a
future mention system must respect from day one. This is not part of that branch's scope.

**Motivation:** Replace highlight-to-connect (select text → "New Note from selection" → linked note) with
an inline `@` mention for notes, folders, and threads — similar in spirit to Scripture pills
(`TiptapScripturePill.ts`), but referencing Harvous content instead of Bible text.

## Shape

- **Atomic inline TipTap *node*, not a mark.** Scripture pills are a mark, and mark-boundary detection
  (`inclusive: false`) has caused a long tail of bugs documented in memory (`inclusive:false` boundary
  unreliability, mark bleeding via stored marks, etc.). A node type sidesteps all of that — it behaves
  like an atomic inline leaf (similar to an emoji or an inline image), not text with attached formatting.
- **Trigger:** typing `@` opens a floating picker — reuse the `createPortal` + `editor.on('selectionUpdate')`
  + `view.coordsAtPos()` pattern already used for the translation picker and selection action bar (see
  memory: "Floating UI pattern").
- **Type icons** on the rendered pill, matching existing iconography:
  - Note → note-sticky icon (same as `ListModeTriggerIcon`'s `notes` mode).
  - Folder → folder icon.
  - Thread → arrow-right-arrow-left icon (same as the `threads` list mode).
- **Pill HTML** carries `data-mention-type` (`note` | `folder` | `thread`) and `data-mention-id`, mirroring
  the `data-scripture-translation` attribute pattern scripture pills use for server-side extraction.
- **Server-side extraction**: a new pass modeled on `process-scripture-references.ts` — scans saved note
  content for mention pills, resolves them, and writes `NoteConnections` edges with a new `kind: 'mention'`
  (today `NoteConnections` is used for highlight-linked notes and study threads; a `kind` discriminator
  lets the memory graph and backlinks distinguish mention edges from those).
- **Tap-routing**: reuses the existing dock-routing pattern (see `home_card_dock_routing` memory) — tapping
  a note mention opens the note dock, a folder mention opens the folder drill, a thread mention opens the
  thread panel.
- **Replaces highlight-to-connect** as the primary inline linking flow once shipped; the old
  `linkedFromNoteId` / "New Note from selection" flow can eventually be deprecated in favor of "select text
  → @ mention an existing note" for linking to something that already exists, keeping "New Note from
  selection" for the create-new case.

## Cross-space visibility (locked in by the Shared Spaces foundation)

See `SHARED_SPACES_DEV_NOTES.md` → "Cross-space reference rules". Summary:

1. A mention resolves **within the space the note lives in** — a shared-space note's mention picker only
   offers content from that same space (plus, for the author, their own personal content — TBD whether
   that's allowed or whether mentions are strictly space-scoped; lean toward strictly space-scoped to avoid
   leaking personal content references into a shared context).
2. **Copy-in degrade**: `POST /api/spaces/:spaceId/copy-notes` copies content verbatim (no reprocessing).
   A mention pill copied into a new space whose target the copying user (or other space members) can't see
   should degrade — either to plain text (safest, simplest) or a "private reference" placeholder state.
   Decide this before shipping the mention system; copy-notes' verbatim-content behavior is compatible with
   either choice since it doesn't touch pill internals today.
3. **Person-mentions** (later, not in scope for the first mention-pills pass): candidate list comes from
   `SpaceMemberships` for the note's space.

## Not in scope for the first pass

- Quote-in-new-note (select text in a shared-space note → new attributed note) — lands with this branch,
  using a plain link/reference until the mention system exists, per the Shared Spaces foundation plan.
- Copy-selection-to-space, author-chip filtering in the shared-space list view — same.
- Person-mentions (`@Derek`) — future, after content mentions ship.

## Related docs

- [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) — cross-space reference rules this design
  must honor.
- Memory: `react19_innerhtml_selection`, floating UI pattern, scripture pill mark-boundary lessons — read
  before implementing, several of these bugs are exactly the class of thing a node-type approach avoids.

# @ Mention pills — implemented on feat/mention-pills (July 2026)

**Status:** v1 shipped on `feat/mention-pills` (based on `feat/shared-spaces-foundation`) — display and
navigation only. Written alongside the Shared Spaces foundation because shared spaces introduce cross-space
content that the mention system respects from day one.

**Motivation:** Replace highlight-to-connect (select text → "New Note from selection" → linked note) with
an inline `@` mention for notes, folders, and threads — similar in spirit to Scripture pills
(`TiptapScripturePill.ts`), but referencing Harvous content instead of Bible text.

## Shape (as built)

- **Mark, not a Node** (`TiptapMentionPill.ts`) — deliberately follows the `ScripturePill` precedent
  instead of the original node-type plan below. Reasoning: the same `inclusive: false` + `excludes: '_'` +
  stored-marks-stripper + cursor-snap-plugin safety net already exists, is proven, and is what every other
  pill in this codebase (scripture, note-link) uses; introducing a second pill *shape* (node) alongside
  marks would mean two different sets of atomic-delete/arrow-skip/parse-validation code paths to maintain.
  Mention pills reuse the generalized `findPillBoundaries` / `findAdjacentPillBoundaries` /
  `scripturePillSkipLeftTarget` helpers (now parameterized by `markName`) rather than duplicating them.
- **Trigger:** typing `@` opens a floating picker via `createPortal` + `editor.on('update'/'selectionUpdate')`
  + `view.coordsAtPos()` — the same pattern as the translation picker and selection action bar.
- **Kind tabs** in the picker (All / Notes / Folders / Threads, reusing the `.proto-chip-bar` component from
  the sidebar's highlight-kind filter) so a long notes list never buries folders/threads. Order matches the
  sidebar's own list-mode order (notes, folders, threads).
- **Type icons** on the rendered pill: note → note-sticky, folder → folder, thread → arrow-right-arrow-left
  (same icons as the sidebar's list-mode triggers).
- **Pill HTML** carries `data-mention-kind` (`note` | `thread` | `folder`), `data-mention-id`, and
  `data-mention-space-id`. (Originally planned as `data-mention-type`; renamed to `-kind` to read naturally
  next to `MentionKind`/`MentionPickerItem` in code — no functional difference.)
- **Tap-routing**: note mentions navigate via the router; thread/folder mentions drive the sidebar's
  `useProtoShell()` list-mode + drilldown state directly (no dedicated routes exist for threads/folders).
- **Label frozen at insert time** — the pill stores the title as its text content, like scripture pills
  store the reference. Renames don't update existing pills; the id keeps the link working.

## Deliberately deferred (not in this pass)

- **Server-side `NoteConnections` extraction.** The original plan called for a `process-scripture-
  references.ts`-style pass writing `kind: 'mention'` graph edges so the memory graph/backlinks pick up
  mentions. v1 ships display + click-navigation only, no graph edges. This is the natural next increment
  once the interaction itself is validated — the same span attributes (`data-mention-kind`/`-id`) are
  already in the saved HTML and ready for a future extraction pass to read.
- **Copy-notes cross-space degrade.** `POST /api/spaces/:spaceId/copy-notes` still copies content verbatim.
  A mention pill copied into a space where the target isn't visible to that audience currently keeps
  pointing at the original (inaccessible) target rather than degrading to plain text. **Must be handled
  before mention pills interact with the copy-notes flow in production** — see "Cross-space visibility"
  below, unchanged from the original plan.
- **Person mentions (`@Derek`).** Out of scope for this pass — confirmed explicitly when scoping this work.
  If a later pass adds them, reuse this same mark shape (`kind: 'person'`) rather than building a parallel
  mention system; candidate list would come from `SpaceMemberships` for the note's space.
- **Native iOS rendering.** Mention spans degrade to plain `@Name`-free title text on native (no special
  renderer); acceptable for v1, native pill rendering is a follow-up.

## Cross-space visibility (locked in by the Shared Spaces foundation)

See `SHARED_SPACES_DEV_NOTES.md` → "Cross-space reference rules". As built:

1. A mention resolves **within the space the note lives in** — a shared-space note's mention picker only
   offers content from that same space. A personal note's picker searches across the user's own spaces
   (their notes via unscoped search, plus threads/folders per-space) — never the reverse leak.
2. **Copy-in degrade is still unhandled** (see above) — tracked as a pre-production blocker, not resolved
   by this pass.
3. **Person-mentions** remain out of scope for this pass (see above) — not "planned alongside" content
   mentions; a separate future decision.

## Related docs

- [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) — cross-space reference rules this design
  must honor.
- [RESOURCE_LIBRARY.md](./RESOURCE_LIBRARY.md) — future `library` / `libraryItem` mention kind and
  Library tab in the picker (same mark shape; church/school catalog assets).
- Memory: `react19_innerhtml_selection`, floating UI pattern, scripture pill mark-boundary lessons.

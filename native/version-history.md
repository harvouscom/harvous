# Note Version History — Feature Recap

> Branch: `native-prototype`  
> Status: v1 shipped, build blocked on pre-existing editor errors (see below)

---

## What this feature is

A Time Machine-style version history for notes: versions are saved automatically as you write (`NoteSnapshotter`). **There is currently no in-app UI** to browse or restore (History was removed from the right inspector; Settings “Note backups” was also removed). Restoring, when a UI exists again, will take a snapshot of the current state first so a restore is undoable.

---

## What was shipped (v1)

### New files

| File | Purpose |
|---|---|
| `Models/NoteSnapshot.swift` | SwiftData model: stores full note body + title + refs + timestamp + reason + `cloudId`/`needsSync` for future Supabase sync |
| `Services/NoteSnapshotter.swift` | Singleton actor owning all cadence logic: active-interval capture, idle flush, no-op gating, and the `restore()` / `captureBeforeRestore()` helpers |
| `Views/NoteHistorySection.swift` | Standalone view (not mounted): collapsed summary → expandable snapshot list + `NoteVersionDiffView` restore flow — kept for a future entry point |

### Modified files

| File | Change |
|---|---|
| `Models/Note.swift` | Added `@Relationship(deleteRule: .cascade) var snapshots: [NoteSnapshot]` |
| `HarvousApp.swift` | Added `NoteSnapshot.self` to the SwiftData schema |
| `Views/NoteEditorView.swift` | Hooked `NoteSnapshotter.shared.noteDidAutosave(...)` into `EditorAutosaveDebouncer.schedule()` after `context.save()` |
| `Views/NoteInspectorView.swift` | Inspector: Tags and Info only (no History or Highlights sections) |

### How the cadence works

1. **Active interval** — at most one snapshot every 5 minutes while editing, deduped by content (no snapshot if nothing changed).
2. **Idle flush** — 30 seconds after the last keystroke, one final snapshot for the edit burst if content changed since the last snapshot.
3. **Pre-restore snapshot** — before any restore, the current state is automatically snapshotted with reason `.preRestore` so the restore can itself be undone by restoring to that entry.
4. **No-op gating** — if body + title + refs are identical to the most recent snapshot, nothing is written.

### UI

- **None shipped in the product shell** — `NoteHistorySection` remains in the codebase unmounted. Prior design: inspector “History” with expand/collapse, snapshot rows, and `NoteVersionDiffView` restore confirmation.

### Storage design

`NoteSnapshot` mirrors what a Supabase `note_snapshots` table would look like:
- `noteID: UUID` — the FK
- `body / title / detectedRefs` — full copy (plain text is cheap)
- `capturedAt: Date`
- `reasonRaw: String` — raw value of `SnapshotReason` enum
- `cloudId: UUID?` / `needsSync: Bool` — mirrors `Note.cloudId`/`needsSync` so sync can be bolted on without a model migration

Retention is "keep all" in v1. A cap + per-day rollup policy was deferred.

---

## What was intentionally deferred

### Live-scrub preview (the "full Time Machine feel")

**What it is:** As the user drags a timeline scrubber thumb in the inspector, the editor body morphs in real time to show the historical version, without committing until they tap Restore.

**Why deferred:** Requires adding a non-destructive preview mode to `NoteEditorView` + `HarvousEditor`:
- A `previewSnapshot: NoteSnapshot?` state that, when non-nil, renders a passed-in body string instead of the live SwiftData note.
- Suppressing autosave and all editing input while in preview mode.
- Toolbar chrome swap (`NoteToolbar`) to a "viewing past version" bar with Restore / Return to now actions.
- Subtle visual treatment (e.g. sepia tint, scale-down) to make "you're in the past" legible.

This is safe to add on top of v1 — the model, snapshotter, and inspector section are already in place. The work is purely editor-layer and can be done in isolation.

### Timeline scrubber widget

A horizontal slider/scrubber with labeled tick marks for each snapshot, replacing the list view when in expanded mode. The scrubber interaction drives the live-preview above.

### Keyboard stepping

`⌘⌥←` / `⌘⌥→` to step through snapshots one at a time while the History section is open. Would follow the same `FocusedValueKey` / `HarvousCommands` pattern used for note navigation and highlight cycling.

### Manual "pin this version" / naming

A long-press or explicit button to mark a snapshot as pinned with a user-provided label. Pinned versions are shown with a different dot color and are exempt from any future retention/compaction.

### Diff highlighting

Showing what changed between two adjacent snapshots — colored inline diff in the scrubber tooltip or a side-by-side modal.

### Supabase sync

The schema is already shaped for it (`cloudId`, `needsSync`). When the Supabase Swift SDK lands in the native app, add an upload pass to `NoteSnapshotter` keyed on `needsSync = true`, keyed by `noteID` → `note.cloudId`. No model migration needed.

### Retention / compaction policy

Keep the last N snapshots per note (e.g. 200), and collapse snapshots older than 30 days to one-per-day. Implement this as a background sweep in `NoteSnapshotter` on app launch.

---

## Pre-existing build issue to be aware of

The full Xcode project build may be blocked on some branches by errors in `HarvousEditor.swift` and `NoteEditorView.swift` that predate this feature work. The new History files (`NoteSnapshot`, `NoteSnapshotter`, `NoteHistorySection`) are the version-history stack.

- `HarvousEditor.swift:1647` — `caretRectForPosition` uses Obj-C selector style; Swift wants `caretRect(for:)`.
- `NoteEditorView.swift:155, 282, 383, 1011` — in-flight editor proxy and panel API changes.

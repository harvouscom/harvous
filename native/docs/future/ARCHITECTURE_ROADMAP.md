# Harvous Native — Architecture Roadmap

This document covers deferred Tier 2–5 work. Everything here is post-v1-stabilization.

---

## Tier 2 — Cloud Sync (Supabase)

**Goal:** Replace the current local-only SwiftData store with Supabase as the sync backend.

### Approach

- **Local-first.** SwiftData remains the source of truth on device; Supabase is the sync layer, not a remote primary.
- **Sync actor.** Add `Services/SupabaseSyncActor.swift` — an `actor` that holds the Supabase Swift client, serializes push/pull, and handles conflict resolution (last-write-wins on `updatedAt` for now; CRDT later).
- **Note model versioning.** Attach a `syncEpoch: Int` and `syncState: SyncState` (`.local`, `.synced`, `.conflict`) to `Note`. SwiftData already has a `localOnly` flag seed — wire it.
- **Delta push.** After every successful SwiftData save, push the diff (title, body, tags, refs, `updatedAt`) to the `notes` Supabase table. Use `upsert` with `onConflict: "id"`.
- **Pull on launch / foreground.** Fetch notes modified since the last known `syncCursor` (a watermark stored in `UserDefaults`). Apply to local store inside a single `ModelContext.transaction`.
- **Attachment sync.** Inline images (`NoteInlineImageAttachment`) need Supabase Storage. Upload on insert; store the object key in the attachment's `userInfo`; lazy-download on first render.

### Key files

| File | Change |
|---|---|
| `Services/SupabaseSyncActor.swift` | New — sync engine |
| `Services/HarvousCloudConfig.swift` | New — Supabase URL + anon key (read from `Info.plist`, never committed) |
| `Models/Note.swift` | Add `syncEpoch`, `syncState` |
| `Services/NoteSnapshotter.swift` | Hook post-snapshot push |
| `Services/SelectionHighlightCreator.swift` | Hook highlight creation push |

---

## Tier 3 — Collaboration (Supabase Realtime)

**Goal:** Multiple users editing the same note simultaneously, with presence indicators.

### Approach

- **Realtime channels.** Subscribe to `supabase.channel("note:\(note.id)")` when a note is opened. Broadcast cursor positions and typing state. Receive remote operations and apply them.
- **Operational transform (OT) or CRDT.** Start with OT on the plain-text body (simple enough given the body is line-structured). Migrate to a CRDT (e.g. Yjs via a Swift binding or a Rust-compiled wasm module) when conflict complexity grows.
- **Presence.** Publish `userId`, `displayName`, and `cursorRange` to the channel. Render remote cursors in `HarvousEditor` as colored caret overlays (draw in `NSLayoutManager`/`NSTextLayoutManager` on macOS, `NSLayoutManager` on iOS).
- **Access control.** Supabase Row Level Security scoped to the space's `member_ids`. Invite flow already exists via `SpaceManagementViews.swift`.

### Key files

| File | Change |
|---|---|
| `Services/NoteCollabSession.swift` | New — Realtime channel lifecycle + OT engine |
| `Editor/HarvousEditor.swift` | Remote cursor rendering in layout phase |
| `Editor/EditorProxy.swift` | `collaborators: [CollabPresence]` published property |
| `Views/NoteEditorView.swift` | Show presence avatars / cursor chips |

---

## Tier 4 — Deeper iOS Parity

Features macOS has that iOS still lacks or differs in.

### Inspector panel

macOS has `NoteInspectorView` in a sidebar inspector. On iOS the same content should appear as a `sheet` or a `UISheetPresentationController` half-sheet anchored to the detail column. Share a `NoteInspectorContent` view struct between platforms.

### `UIKeyCommands` for power users

`HarvousBodyTextView` on iOS should register `UIKeyCommand` entries for the same shortcuts as macOS `HarvousCommands.swift`:
- ⌘B bold, ⌘I italic, ⌘K link, ⌘/ strikethrough
- ⌘⌥1–4 headings
- ⌘[ outdent, ⌘] indent

Register in `keyCommands` override on `HarvousBodyTextView`.

### Selection format bar on iOS

`SelectionFormatBar.swift` is macOS-only. Extract the shared button logic into `SelectionFormatBarContent.swift` (a protocol/view) and add a floating `UIHostingController` equivalent on iOS that appears above the keyboard when text is selected.

### Vault export on iOS

`HarvousVaultExporter` writes Markdown to `~/Documents/Harvous/`. On iOS this writes to the app's Documents directory (shareable via Files.app). Add a "Share export folder" button in iOS settings pointing to the folder.

---

## Tier 5 — Original Feature Ideas

### AI Study Assistant

A sidebar AI assistant (powered by Claude API) aware of the current note content. Can:
- Answer questions about the current scripture context
- Suggest cross-references
- Generate study questions
- Draft commentary outlines

Implementation: streaming `URLSession` call to Claude API, rendered in a `ScrollView` inside an expandable panel. Store conversation threads per note in SwiftData (`AIThread` model).

### Cross-reference Discovery

After autosave, run a background task that finds notes whose `detectedRefs` overlap with the current note. Surface as a "Related" section in the inspector. Weighted by proximity of verse ranges and shared tags.

### Reading Plans

A new `ReadingPlan` SwiftData model: ordered list of `(scripture: String, date: Date)` entries. A `ReadingPlanView` widget (iOS widget + macOS menu bar extra) shows today's reading and taps into the editor to create a note pre-seeded with the passage pill.

### Focus Mode

Full-screen distraction-free editor for macOS (hide sidebar, hide toolbar, show only note title + body). Triggered by ⌘⌃F or a toolbar button. Exit via Esc. Optionally: typewriter scroll (keep caret vertically centered).

### Study Streaks

Track daily note-creation/edit activity in a `StudyActivity` model (one row per calendar day). Show a GitHub-style contribution graph in the "You" tab. Award streak milestones.

### Version History Live-Scrub

`NoteSnapshotter` already stores snapshots. The `NoteHistorySection` view exists but is not mounted in the inspector (no in-app browse/restore UI for now). Enhance with a scrubbing timeline: drag a thumb to preview the note body at any point in time without committing. "Restore this version" replaces the live body and triggers a save.

---

## Open Architecture Questions

1. **Swift 6 strict concurrency** — most of the codebase uses `@MainActor` to sidestep data races. Before Tier 2, audit `HarvousEditor.swift` coordinators (NSTextView delegates are called on the main thread but typed as `nonisolated` in the delegate protocols). A Swift 6 migration pass will surface hidden issues.

2. **NSTextLayoutManager vs NSLayoutManager** — macOS 12+ `NSTextView` can use the new `NSTextLayoutManager` (TextKit 2). `HarvousLayoutManager.swift` today subclasses the legacy `NSLayoutManager`. TextKit 2 is required for some future rendering features (e.g. richer attachment layout, line fragments API). Plan a phased opt-in.

3. **SwiftData multi-process access** — if a macOS menu bar extra or an iOS widget reads the SwiftData store, they share a container. Ensure `.modelContainer` configurations use `isStoredInMemoryOnly: false` and a shared App Group container URL so extensions can access notes without full app launch.

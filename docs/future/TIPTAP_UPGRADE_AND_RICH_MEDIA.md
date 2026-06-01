# Tiptap Upgrade & Rich Media Embeds

This document covers the Tiptap upgrade path, adding rich media embeds (images, videos, links, PDFs) with custom formatting, and preparing the editor for future real-time collaboration.

**Related docs:** [REALTIME_LIVEBLOCKS_PLAN.md](./REALTIME_LIVEBLOCKS_PLAN.md) (collaboration), [COLLABORATIVE_SHARED_SPACES.md](./COLLABORATIVE_SHARED_SPACES.md) (shared editing).

---

## Current state (Updated March 2026)

- **Tiptap version:** v3.20.5 — all packages aligned (upgraded from v3.6.5 in v1.202.0)
- **Custom extensions:** ScripturePill (mark), NoteLink (mark), BoldCustom (extended), HighlightCustom (extended)
- **ProseMirror-level code:** `appendTransaction` for stored marks, DOM capture-phase click handlers for pill interaction, custom paste transforms
- **BubbleMenu:** Replaced with custom floating toolbar using `createPortal` + `editor.on('selectionUpdate')` + `view.coordsAtPos()`
- **Inline images (web):** Prototype format toolbar uploads to Supabase Storage `note-attachments`; see [NOTE_INLINE_IMAGE_STORAGE.md](../NOTE_INLINE_IMAGE_STORAGE.md). Native still uses `[Image:base64]` markers until bridged.

---

## Part 1: Tiptap Upgrade — COMPLETED

> **Completed in v1.202.0 (March 2026)** — Upgraded from v3.6.5 to v3.20.5

### What we gained


| Feature                  | Version | Value                                                                                             |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| Reduced React re-renders | v3.0+   | `shouldRerenderOnTransaction` off by default — fewer unnecessary renders in our 4000+ line editor |
| IME input fixes          | v3.x    | Better CJK input; fixes composition events in mark views                                          |
| Markdown support         | v3.7+   | `@tiptap/markdown` package — enables note import/export                                           |
| Mark Views API           | v3.x    | Render marks as React components — future option for scripture pills                              |
| ResizableNodeView        | v3.10+  | Built-in resizable media with configurable handles, aspect ratio locking                          |
| Text Direction (RTL)     | v3.11+  | `setTextDirection()` command — enables Hebrew/Arabic study                                        |
| Position Mapping         | v3.12+  | `MappablePosition` class — essential for real-time collaboration                                  |


### Breaking changes handled

**1. BubbleMenu: tippy.js → Floating UI**

- Replaced TipTap's BubbleMenu entirely with a custom floating toolbar
- Uses `createPortal` + `editor.on('selectionUpdate')` + `view.coordsAtPos()` — same pattern as the translation picker
- More reliable than BubbleMenu plugin, no dependency on internal positioning library

**2. ProseMirror imports**

- Changed `prosemirror-state` imports to `@tiptap/pm/state` in all custom extensions
- Files updated: `TiptapEditor.tsx`, `TiptapScripturePill.ts`, `TiptapBoldCustom.ts`, `TiptapHighlightCustom.ts`

**3. `clearContent()` / `setContent()` emit behavior**

- Audited all calls — both existing calls already used `{ emitUpdate: false }` — no changes needed

**4. `mergeNestedSpanStyles` defaults to `true`**

- Added `mergeNestedSpanStyles: false` to editor config to preserve scripture pill `data-*` attributes

### Our customizations were safe

All four custom extensions use APIs that are stable across the v3.x range:

- `Mark.create()` / `Extension.extend()` — unchanged signatures
- ProseMirror direct API (`tr.setStoredMarks`, `state.doc.resolve`, `view.dispatch`) — ProseMirror hasn't changed these in years
- `appendTransaction` plugin pattern — core ProseMirror, not Tiptap-specific
- `inclusive: false` + `excludes: '_'` mark config — standard Tiptap mark options

### Upgrade lessons learned

- **Version mismatch was the root cause of BubbleMenu failures** — `@tiptap/core` drifted to 3.12.0 via transitive deps while `@tiptap/react` stayed at 3.6.5. Always pin all `@tiptap/`* packages to the same version.
- **Custom floating UI is more reliable than BubbleMenu** — The BubbleMenu plugin re-registers on every render if `shouldShow`/`appendTo` aren't memoized. A custom `createPortal` approach with `selectionUpdate` listener avoids this entirely.
- `**@vitejs/plugin-react` must be pinned to 5.x** — 6.x pulls in Vite 8 which requires Node 22+. Pin to `~5.1.4`.

---

## Part 2: Rich Media Embeds

### Design: Custom NodeViews per media type

Each embed type gets its own Tiptap Node extension with a custom React NodeView for rendering. All share a common wrapper pattern but have type-specific formatting.

```
BaseEmbed (abstract)
  ├── ImageEmbed      — photo with optional caption, resizable
  ├── VideoEmbed      — YouTube/Vimeo player with thumbnail
  ├── LinkEmbed       — URL preview card (title, description, favicon)
  └── PDFEmbed        — inline PDF viewer / thumbnail with page count
```

### Node schema (shared attributes)

```typescript
// All embed nodes share these attributes
{
  src: string;           // URL or storage path
  type: 'image' | 'video' | 'link' | 'pdf';
  caption: string | null;
  alt: string | null;    // Accessibility text
  width: number | null;  // Rendered width (for resizing)
  aspectRatio: number | null;
  metadata: {            // Type-specific metadata
    title?: string;      // Link/video title
    description?: string;
    favicon?: string;
    thumbnail?: string;
    pageCount?: number;  // PDF
    duration?: number;   // Video
    domain?: string;     // Link
  };
}
```

### ImageEmbed

- **Insert:** Drag-and-drop, paste, or toolbar button
- **Storage:** Upload to Supabase Storage → get public URL
- **Rendering:** `ResizableNodeView` (Tiptap v3.10+) with aspect ratio locking
- **Formatting:** Rounded corners, subtle shadow, optional caption below
- **Optimization:** Generate thumbnails server-side (Sharp is already a dependency)

### VideoEmbed

- **Insert:** Paste a YouTube/Vimeo URL → auto-detected and converted to embed
- **Rendering:** Thumbnail with play button overlay; expands to iframe on click
- **Formatting:** 16:9 aspect ratio container, rounded corners
- **No upload:** Link-only (no hosted video storage)

### LinkEmbed

- **Insert:** Paste a URL → server-side unfurl via `/api/resource/metadata` (already exists)
- **Rendering:** Card layout — favicon + title + description + domain
- **Formatting:** Bordered card with hover state, opens in new tab on click
- **Fallback:** If unfurl fails, render as inline link (not a card)

### PDFEmbed

- **Insert:** Drag-and-drop or file picker
- **Storage:** Upload to Supabase Storage
- **Rendering:** First-page thumbnail with page count badge
- **Interaction:** Click to open full PDF viewer (or download)

### File upload flow

```
User drops file / pastes image
  → Client validates type + size (max 10MB images, 25MB PDFs)
  → Upload to Supabase Storage bucket "note-attachments"
    → Path: {userId}/{noteId}/{uuid}.{ext}
  → Insert embed node with public URL
  → Note save includes embed nodes in content (stored as HTML)
```

### Supabase Storage setup needed

- Create bucket: `note-attachments`
- RLS policy: Users can only read/write their own `{userId}/` prefix
- Optional: CDN via Supabase's built-in image transformation for thumbnails

### RLS gotcha (don’t skip)

Harvous currently accesses Postgres via the server (Drizzle + `SUPABASE_DATABASE_URL`) and can safely enable RLS with **no policies** to block PostgREST access.

If/when we add **browser** usage of `@supabase/supabase-js` (Storage uploads / Realtime subscriptions), enabling RLS will start affecting client requests. At that point we must:

- Add **Storage bucket policies** (read/write) for the user’s `{userId}/` prefix, and
- Add any necessary **table policies** for Realtime (and PostgREST) if we expose tables client-side.

### Server-side changes

- **New endpoint:** `POST /api/notes/:id/upload` — handles file upload to Supabase Storage
- **Existing endpoint:** `/api/resource/metadata` — already unfurls URLs for link previews
- **Content processing:** Update `processScriptureReferences()` to skip content inside embed nodes (don't detect scripture refs in URLs/metadata)

---

## Part 3: Collaboration Readiness

The Tiptap upgrade directly enables future collaboration:

### What the upgrade provides

- **Position Mapping (v3.12):** `MappablePosition` class tracks cursor positions across concurrent edits — essential for multiplayer
- **Mark Views API:** React-rendered marks work with Yjs/Liveblocks collaboration out of the box
- **Transaction improvements:** Better deduplication prevents conflicts in concurrent editing

### What still needs to happen (separate effort)

Per the [REALTIME_LIVEBLOCKS_PLAN.md](./REALTIME_LIVEBLOCKS_PLAN.md):

1. Install Liveblocks (or Supabase Realtime + Yjs)
2. Add auth endpoint for room access control
3. Add presence indicators (who's editing)
4. Handle offline → online sync conflicts with existing IndexedDB layer
5. Scripture pill behavior in multiplayer: ensure pills created by one user resolve correctly for others

### Custom extension considerations for collab

- **ScripturePill `noteId` attribute:** When User A creates a pill with `noteId: "pending"`, User B shouldn't see/interact with it until the noteId resolves. May need a `visibility` attribute or filter pending pills from broadcast.
- `**appendTransaction` stored marks plugin:** Runs locally on each client — safe for collab since stored marks are per-client state.
- **NoteLink navigation:** `safeNavigate` uses Astro view transitions — needs testing in multiplayer (two users clicking different links simultaneously).

---

## Part 4: Testing Strategy

### Editor integration test (add now, regardless of upgrade)

Create a Vitest test that spins up a headless Tiptap editor and validates core behaviors. This becomes the regression safety net for any future Tiptap update.

**File:** `src/components/react/__tests__/tiptap-editor.test.ts`

**Test cases:**

1. **Pill creation:** Insert text "John 3:16", trigger detection → pill mark exists in doc
2. **Pill mark isolation:** Move cursor past pill, insert text → new text has no pill mark
3. **Pill backspace:** Place cursor inside pill, press backspace → entire pill removed
4. **Bold after pill:** Move cursor past pill, toggle bold → bold mark present, pill mark absent
5. **Paste transform:** Paste HTML with `<h1>` → converted to `<h2>` in doc
6. **Embed node:** Insert image embed node → node exists with correct attributes
7. **Embed in scripture detection:** Insert embed node with URL, run detection → no false scripture refs from URL text

### Manual testing checklist (per-upgrade)

- Scripture pill creation (desktop + mobile)
- Pill click navigation
- iOS double-space-to-period behavior
- Paste from external sources (Google Docs, Word, web)
- BubbleMenu positioning on text selection
- All embed types render correctly
- Embed resize works (images)
- Embed deletion
- Offline → online: embeds with pending uploads resume

---

## Implementation order

1. **Tiptap upgrade** (Part 1) — foundation for everything else
2. **Editor integration tests** (Part 4) — safety net before adding complexity
3. **ImageEmbed** — most requested media type, uses ResizableNodeView
4. **LinkEmbed** — leverages existing `/api/resource/metadata` endpoint
5. **VideoEmbed** — URL detection + iframe rendering
6. **PDFEmbed** — file upload + thumbnail generation
7. **Collaboration prep** (Part 3) — when shared spaces demand it

---

## Dependencies to add

```
@floating-ui/dom       — replaces tippy.js for BubbleMenu (required by upgrade)
@tiptap/markdown       — optional, enables markdown import/export
@supabase/supabase-js  — needed for Storage uploads (also needed for Realtime later)
```

## Estimated effort


| Phase                         | Effort    | Risk                                                 |
| ----------------------------- | --------- | ---------------------------------------------------- |
| Tiptap upgrade                | 1-2 days  | Medium — breaking changes are well-documented        |
| Editor integration tests      | 0.5 day   | Low                                                  |
| ImageEmbed + Supabase Storage | 2-3 days  | Medium — new infra (storage bucket, upload endpoint) |
| LinkEmbed                     | 1 day     | Low — endpoint already exists                        |
| VideoEmbed                    | 1 day     | Low — no upload, just URL detection                  |
| PDFEmbed                      | 1-2 days  | Medium — thumbnail generation                        |
| Collaboration                 | 2-3 weeks | High — see REALTIME_LIVEBLOCKS_PLAN.md               |



# Note History — deferred improvements

October 2026. History (note menu → History, `PrototypeNoteHistorySheet.tsx`) got a visual pass:
rows are now named by time, the current session wears a "Now" tag, the note's title moved to
the header, and the "57 saves" count is gone. This doc keeps the bigger ideas that were raised
alongside that pass and deliberately left for later.

## Done: the preview looks like the note (Oct 22 2026)

A past version used to render in the pre-2.0 pill look — flat grey pills, no accent tints,
different type — because every current pill, accent, quote and highlight rule is scoped to
`.proto-editor-surface`, and the preview is portaled (desktop popover, phone drawer) outside
the note pane. Now:

- **One read-only surface.** `ProtoReadOnlyNotePaper` draws the body on
  `.proto-editor-surface` with the note's own sheet (`.proto-editor-paper`) and title type.
  Pills keep their `data-pill-accent` tints; quotes and highlights match the live note.
  `data-readonly` holds pill hover fills and pointer cursors off, since nothing there opens.
  The block rhythm the editor gets through `.ProseMirror` is restated for the static body in
  `prototype-note-readonly.css`. The import preview (`ImportItemPreview.tsx`) uses the same
  component, without the sheet (`variant="inset"`).
- **Old versions show pills.** Versions saved before the server added pills, and
  `sync-update` saves, hold references as plain words. `withDisplayScripturePills`
  (`src/utils/note-read-only-html.ts`) wraps them for display, the way a save would. It is
  never written back: Restore copies the stored HTML, and the server pills it on save
  anyway. Existing pills are set aside and put back byte for byte, because the highlighter
  matches through inline tags and would otherwise re-wrap a pill (and drop its accent)
  whenever the same reference also appears bare.
- **List and header tidy.** Day headings lead each group, times sit under them in
  `--pds-text-secondary`, the selected row takes the accent fill with white ink, and the
  preview has its own header with the version's day and time beside Restore.

The preview now shares the editor surface, so it is the hook point for a diff (§2): marks
added there inherit the same pill and highlight styles as the note.

## Where it stands

- Every save writes an immutable `NoteVersions` row (`server/db/schema.ts`): `title`, full
  `content`, `source`, `authorId`, `editedBy`, `createdAt`.
- `GET /api/notes/:noteId/versions` groups those rows into editing **sessions** and returns each
  session as its last checkpoint (`server/utils/note-history-visibility.ts`). The client never
  sees the checkpoints inside a session.
- `GET /api/notes/:noteId/versions/:versionId` returns one version's full content for the
  preview pane. Restore writes a new version from an old one (`source: 'restore'`).
- Free accounts see a 90-day window; Plus (`full_history`) sees everything.

What the list still can't tell you: what changed in a session. A row says *when*, and the
preview shows *what it looked like*, but finding "the version before I deleted that paragraph"
still means opening rows one at a time.

## 1. Say what changed in each session

**Idea.** Under the time, one quiet line such as "Added 1 Samuel 7:12 · +3 lines",
"Rewrote the opening" or "Removed a quote". Lead with Scripture, because a reference added or
removed is the change people in Harvous care about most.

**Data.**
- Diff a session's last checkpoint against the previous session's last checkpoint, on plain
  text plus the scripture-pill references extracted from the HTML.
- Compute it on the server when the session closes, or lazily on first list read and then
  cache it. Store it as a small JSON `summary` on the session's last version row (a new nullable
  column), so the list endpoint stays a single read.
- Encrypted versions get no summary. The server can't read them, which is the point.

**Cost.** Medium. Needs a new column, a text diff (word-level is enough), pill-reference
extraction (already exists for detection), a backfill choice (lazy is fine), and copy rules
for the many-small-edits case.

**No AI.** It should stay deterministic, which is consistent with the no-generative-AI decision
for Review.

## 2. Show changes in the preview

**Idea.** In the preview, mark text added since the previous session (soft green underline)
and text removed (struck through, muted). Add a toggle to see the clean version.

**Data.** Both versions' HTML, which is already fetchable, plus a DOM-aware diff. A plain
string diff breaks pills and marks, so this has to diff at the block level, then at the word
level inside changed blocks.

**Cost.** Medium to high, because pills, highlights and blockquotes all need to survive the
diff rendering. `prepareReadOnlyNoteBodyHtml` is the place to hook in for the HTML, and
`ProtoReadOnlyNotePaper` for the rendering: both versions should get the display pills before
diffing, or every reference an old save held as plain text reads as a change.

## 3. Open a session into its checkpoints

**Idea.** A 57-save session expands into its checkpoints, so you can go back to 11:40 and not
only 11:49. Collapse them by minute, so 57 rows become about 10.

**Data.** The list endpoint would need a `?session=<startVersion>` mode that returns that
session's rows. The rows already exist.

**Cost.** Low on the server, medium in the UI. The stacked phone layout needs a third level
(list → session → version), or the session could expand inline.

**Question to settle first.** Is anyone actually hurt by session granularity? Look at restore
events: if people restore and then immediately restore again, the session end was the wrong
point.

## 4. Who edited, in shared spaces

**Idea.** On co-edited notes, show an avatar on each row for `editedBy ?? authorId`. A session
can include more than one editor, so this needs a rule (for example, the last editor wins, or
a stack of avatars).

**Data.** Already stored (`editedBy`). Sessions would need splitting on an editor change, or
would need to carry a list of editors.

**Cost.** Low to medium. Only matters once co-editing is common.

## Not doing

- **Named versions or bookmarks.** That's a different feature (snapshots), and Harvous notes
  are short enough that time plus a change summary should find the right version.
- **Showing save counts.** That's internal mechanics; it was removed on purpose.

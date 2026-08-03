# Note body truncated at ~2000 characters

## Symptom

A long note looks complete on the device it was written on, but opens **hard-cut roughly
1.5 screens in** on another device. The cut is mid-sentence, and everything after it is
gone. The device that wrote it still shows the full text.

That cut point is the tell: **2000 characters is `NOTE_LIST_CONTENT_MAX_CHARS`**, the cap
the server applies to note content in *list* payloads. If a note is cut anywhere else, this
is not your bug.

The writing device still looks fine because its localStorage draft
(`src/utils/note-draft-store.ts`) and live editor hold the full text. The server row does not.

## Root cause

`server/utils/dashboard-data.ts` truncates content in every list payload:

```ts
export const NOTE_LIST_CONTENT_MAX_CHARS = 2000;
const NOTE_LIST_SELECT = {
  ...NOTE_SELECT_COLUMNS,
  content: sql<string>`left(${Notes.content}, ${NOTE_LIST_CONTENT_MAX_CHARS})`,
  contentLength: sql<number>`length(${Notes.content})`,
};
```

`PUT /api/notes/update` overwrites `content` with whatever it receives. `expectedVersion`
does **not** protect against this — the version is current; only the *body* is stale. So any
client that sends back a body it read from a list row overwrites the note with its own preview.

Two paths did this. Both are now closed:

| Path | What happened | Fix |
|---|---|---|
| **Metadata-only saves** (folder add/remove, tag editor) | The endpoint *required* `content`, so these ops resent `row.content` — the truncated list body. Deterministic clobber on any note over 2000 chars. | `content`/`title` are now optional on `PUT /api/notes/update`; the three call sites send neither. |
| **Editor autosave racing the details fetch** | The note page paints instantly from the list seed. If the user typed before `GET /api/notes/:id/details` landed, `userEditedSinceOpenRef` flipped true, which permanently disabled the preview→full upgrade, and the truncated body was saved. | Saves are held while the body is a known-incomplete prefix; the tail is spliced in when the full body arrives. |

An amplifier made it stick: `useUpdateNote`'s optimistic cache patch unconditionally set
`__contentIsPreview: false`, which told `useNote` the truncated preview was authoritative and
suppressed the details refetch for the rest of the session. It now only clears that flag when
the save actually carried a body.

## The guards now in place

**Client — never save a body known to be incomplete.**
`__contentIsPreview` is set for *every* list seed, so it can't tell "short note, preview is
the whole thing" from "this is a prefix". The server now also returns `contentLength`, and
`src/utils/note-list-preview.ts` turns that into `__contentTruncated` + `__previewLength`.
While `contentTruncated` is true, `CardFullEditable` holds all four save paths (the 700 ms
debounce, `protoSaveAsync`, the unmount flush, and the pagehide keepalive). The 250 ms
localStorage draft writer stays **ungated** — it's the recovery path.

`resolveNoteListPreview` also trims the preview back to the last closing block tag, so the
seam is parseable and `preview === stored.slice(0, previewLength)` stays exactly true. That
invariant is what makes the release safe: when the full body lands and the user has typed,
the missing text is exactly `full.slice(previewLength)` and gets appended to the end of the
doc — preserving their in-flight edits and caret, which a `setContent` replace would destroy.

**Server — non-destructive backstop.**
`isRawListPreviewWrite` (`src/utils/note-truncated-write-guard.ts`) fires inside
`updateCanonicalNoteInTransaction` when the incoming body is exactly the cap length, the
stored body is longer, and the incoming body is an exact prefix. It then keeps the stored
content, applies the metadata, and skips the `updatedAt` bump.

Two things to know about it:

- It runs on the **raw request body**, before `transformCanonicalScriptureContent`. That
  rewrites pills and would break byte-exact prefix equality.
- It only catches a *raw passthrough*. A truncated body that went through TipTap is
  re-serialized and is no longer a prefix — that case is the client's job. A log-only
  `[note-truncation-telemetry]` warning covers it so it stays observable.

Resolution is non-destructive rather than a 400 on purpose: the residual false positive is a
user deleting a trailing paragraph and landing on exactly 2000 characters, which then costs
one dropped save the next keystroke fixes instead of stranding them.

## Investigating a report

```bash
npx tsx server/scripts/list-truncated-note-versions.ts --userId=user_xxx --days=90
```

Read-only. Walks each note's `NoteVersions` chain and flags any step that lost >50% of the
body. Interpreting the columns:

- `source=save` — an HTTP write; `source=sync-update` — native / offline sync push.
- `prefix=YES` **and** `atCap=YES` — a raw list row was PUT verbatim (the metadata-only path).
- `prefix=no` — the truncated body went through the editor first (the autosave race).
- `endsTag=NO` — the body ends mid-tag, which only a `left()` cut produces.

## Recovering a clobbered note

`NoteVersions` checkpoints every content change. Retention is latest-100 **and** 90 days
(both must be exceeded before pruning), so recent history is safe.

1. **Close the note on every other device and tab first.** An open editor will flush its
   stale body over the restore on unmount.
2. `GET /api/notes/<noteId>/versions` — metadata only, newest first.
3. `GET /api/notes/<noteId>/versions/<versionId>` — returns the full row including `content`.
   Walk back to the last version with the long body.
4. From the DevTools console on the same origin:
   ```js
   await fetch(`/api/notes/${noteId}/versions/${versionId}/restore`, {
     method: 'POST', credentials: 'include',
     headers: { 'Content-Type': 'application/json' }, body: '{}',
   }).then(r => r.json())
   ```

Omitting `expectedVersion` skips the optimistic check, which is what you want here. The
restore is recorded with `source: 'restore'` and is protected from pruning; the truncated
version stays in history.

`requireAuth` accepts the session cookie, so a logged-in browser tab needs no extra setup.
There is no UI for version history yet.

## Related

- `docs/troubleshooting/CROSS_PLATFORM_SYNC.md` — sync watermarks, tombstones, device divergence
- `docs/troubleshooting/PROTOTYPE_AW_SNAP_ERROR_5.md` — the other place the list cap matters
- `docs/troubleshooting/OFFLINE_MODE_HEALTH_CHECK.md` — `recoverPrototypeSyncQueueIfBloated` discards >100 pending ops

## Nearby invariants worth not breaking

- **List rows are not note bodies.** `SpaceNoteRow.content` and anything from
  `GET /api/spaces/:id/notes` is a preview. Never feed it to a write. If a type error tempts
  you to write `content: row.content ?? ''`, that is this bug.
- **`updatedAt` is both the sort key and the sync watermark.** Metadata-only saves must not
  bump it; `bumpUpdatedAt: false` suppresses it but then the change won't propagate via delta
  sync until the next real edit.
- **`userEditedSinceOpenRef` is load-bearing.** It gates the phantom-save guards *and* the
  body upgrade. Anything that sets it early disables the upgrade for the whole session.

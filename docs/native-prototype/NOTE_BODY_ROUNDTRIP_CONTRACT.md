# Note-body round-trip contract (web ⇄ native)

**Status:** Contract spec — handoff to the editor track
**Owner of this doc:** data/sync track (defines the contract)
**Owner of implementation:** editor track (implements native HTML⇄plain-text+pills)
**Depends on:** [PHASE_0_DATA_MODEL_ADR.md](./PHASE_0_DATA_MODEL_ADR.md) D1 (HTML is canonical in Postgres) and D5 (pill accents are shared)

This spec defines exactly how native serializes/deserializes note bodies so a note round-trips between web and native **without drift**. It is intentionally implementation-agnostic about *how* native parses/builds HTML — it fixes only the **contract**: the canonical store, the pill markup, the accent channel, and the no-regeneration invariant. The sync transport (`/api/sync/*`) and the native model fields already exist; this is the missing serialization rule between them.

> **Scope guard:** This is a spec. Implementing it lives in the editor surfaces (`HarvousEditor.swift` / `NoteEditorView.swift` / `ScripturePillAttachment.swift` and the web mark `TiptapScripturePill.ts`). The data/sync track does not write that code.

---

## 1. Canonical store and native projection

| Field | Lives | Meaning |
|---|---|---|
| `Notes.content` | Postgres (`server/db/schema.ts`) | **Canonical.** TipTap-authored HTML. The web editor reads/writes this directly. |
| `Note.serverContentHTML` | native (`native/Harvous/Models/Note.swift`) | **Verbatim copy** of the last-seen `Notes.content`. Never hand-edited. |
| `Note.body` | native | Plain-text **projection** of the HTML, with scripture pills represented as native pill tokens; `detectedRefs` re-derived from it. The editable surface. |
| `Note.scripturePillAccentsJSON` | native | `{ "<normalized reference>": "<accentToken>" }` — per-pill accent overrides, mirrored to/from `data-pill-accent` (§3). |

**Principle:** HTML is the source of truth. `body` is a lossy *view* for editing. `serverContentHTML` is the lossless carrier that lets native avoid regenerating HTML it can't fully represent.

---

## 2. The no-regeneration invariant (the load-bearing rule)

On **push** (native → server), native MUST decide per note:

```
if body unchanged since last pull
   AND scripturePillAccentsJSON unchanged
   AND per-pill translations unchanged:
       push serverContentHTML VERBATIM   // zero regeneration, zero drift
else:
       regenerate HTML from body (§4) and push that
```

Rationale: a note may contain web-authored rich content the plain-text `body` cannot represent (tables, inline images, nested structure). If native regenerated HTML on every push, a macOS edit to one paragraph would silently destroy that content. Resending `serverContentHTML` untouched when the body didn't change makes native edits **non-destructive** to web-only formatting.

Native already stubs this seam — the model comment reads: *"Regeneration only kicks in when `body` actually changed."* This contract makes it normative.

---

## 3. Scripture pill markup (exact attribute contract)

Both the web mark (`src/components/react/TiptapScripturePill.ts`) and the server parser (`server/utils/process-scripture-references.ts`) agree on this span. Native MUST emit and parse the same:

```html
<span class="scripture-pill scripture-pill-clickable"
      data-scripture-reference="John 3:16"
      data-note-id="<noteId | 'pending'>"
      data-scripture-translation="ESV"
      data-scripture-translation-label="ESV"
      data-pill-accent="warmAmber">John 3:16</span>
```

| Attribute | Required | Meaning / native handling |
|---|---|---|
| `class="scripture-pill scripture-pill-clickable"` | yes | Literal; the server regexes are class-agnostic but the web renderer needs it. |
| `data-scripture-reference` | yes | The reference. Server normalizes; native emits the displayed reference text. |
| `data-note-id` | new pills: `"pending"` or **omit** | Server's `process-scripture-references` resolves `pending`/absent ids into real scripture-note links on save. Native MUST NOT invent note ids — emit `pending` for new pills. |
| `data-scripture-translation` | optional | Per-pill translation override. Native carries it through; absent ⇒ note/user default. |
| `data-scripture-translation-label` | optional | Display abbrev; native may omit (web re-derives). |
| `data-pill-accent` | optional | **The accent channel** (§4). Server already extracts it: *"set by web UI or native bridge."* |

**Parsing on pull:** native recognizes `span[data-scripture-reference]` (any attribute order — the server tolerates both orderings) and converts each to a native pill token in `body`, lifting `data-pill-accent` → `scripturePillAccentsJSON` and `data-scripture-translation` → the pill's translation.

---

## 4. Accent reconciliation (D5: pill accents are shared)

There are **two distinct accent concepts** — do not conflate:

1. **Per-pill accent** (the pill's own color) → carried in `data-pill-accent` on the span ⇄ native `scripturePillAccentsJSON[reference]`. This is the round-trip channel and the server already reads/writes it.
2. **Painted-highlight accent** (a study highlight drawn over text) → lives in `StudyThreadEntries.highlightAccentRaw`, synced as a study row (see ADR D4 / WS4), **not** in the note body HTML.

For this contract: native maps `scripturePillAccentsJSON` ⇄ `data-pill-accent` using the **same accent token vocabulary** as `StudyThreadEntries.highlightAccentRaw` (e.g. `warmAmber`), so a pill colored on macOS shows the same color on web and vice versa.

---

## 5. Plain-text ⇄ HTML generation rules (when regenerating per §2)

Minimum fidelity native must preserve when it *does* regenerate from `body`:

- **Paragraphs:** each `body` line/paragraph → one block element (`<p>` or the editor's paragraph node). Blank lines preserved.
- **Inline marks** native supports (bold/italic/strikethrough/link) → the corresponding HTML the web mark set parses. Marks native does not model are part of the lossy boundary (§6).
- **Scripture pills** → §3 spans, with `data-note-id="pending"` for any pill not already resolved.
- **No invented structure:** native must not emit tags it didn't parse from the original unless the user added that formatting on native.

---

## 6. Lossy boundary for v1 (explicit)

Web-authored content native cannot represent in plain `body` — **tables, inline images, nested lists/quotes beyond native's editor model** — is:

- **Preserved** whenever the body is unchanged (§2 verbatim path).
- **At risk** only if the user edits `body` on native, forcing regeneration. v1 accepts that a native body-edit may drop web-only rich content from that note.
- A future improvement (out of v1 scope) is splice-level editing so native regenerates only the changed block; that is editor-track work, not part of this contract.

Document this limitation in the native release notes when sync ships.

---

## 7. Conformance checklist (editor track signs off against this)

- [ ] Pull stores `serverContentHTML` verbatim and derives `body` + `detectedRefs` + `scripturePillAccentsJSON`.
- [ ] Push resends `serverContentHTML` **unchanged** when `body`, accents, and translations are all unchanged (§2).
- [ ] Regenerated pills emit the exact span in §3, with `data-note-id="pending"` for new pills.
- [ ] `data-pill-accent` round-trips: color a pill on native → web shows same color; color on web → native shows same color.
- [ ] `data-scripture-translation` per-pill override survives a native edit that doesn't touch that pill.
- [ ] A note containing a table or inline image, edited elsewhere on native (different paragraph) via the verbatim path, **retains** the table/image after sync back to web.
- [ ] `process-scripture-references` resolves native-created pending pills into real scripture-note links on the server (no duplicate scripture notes).

---

## Related code (source of truth — read, don't fork)

| Concern | Path |
|---|---|
| Web pill mark (attributes, parse/render) | [`src/components/react/TiptapScripturePill.ts`](../../src/components/react/TiptapScripturePill.ts) |
| Server pill parsing + resolution | [`server/utils/process-scripture-references.ts`](../../server/utils/process-scripture-references.ts) |
| Native note model (`body`, `serverContentHTML`, `scripturePillAccentsJSON`) | [`native/Harvous/Models/Note.swift`](../../native/Harvous/Models/Note.swift) |
| Sync transport (already moves `content`) | [`server/routes/sync.ts`](../../server/routes/sync.ts) · [`native/Harvous/Services/HarvousSyncService.swift`](../../native/Harvous/Services/HarvousSyncService.swift) |
| Accent vocabulary | `StudyThreadEntries.highlightAccentRaw` in [`server/db/schema.ts`](../../server/db/schema.ts) |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-10 | Initial contract spec (handoff to editor track), grounded in the live pill markup + native model. |

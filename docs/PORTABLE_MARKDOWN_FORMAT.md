# Harvous Portable Markdown Format

One `.md` file per note. Human-readable outside Harvous (Obsidian-compatible highlights and callouts) with lossless round-trip via YAML frontmatter.

## Frontmatter

```yaml
---
id: note_1730000000000          # Harvous note id or native UUID string
title: "Note title"
created: 2026-05-30T12:00:00.000Z
updated: 2026-05-30T12:00:00.000Z
space: "Personal"
thread: "John Study"
threadColor: warmAmber
folder: "Gospel"
tags: [grace, gospel]
refs: ["John 3:16"]
noteType: default                # default | scripture | resource
scriptureReference: "John 3:16"  # scripture notes only
scriptureTranslation: NET
pinned: false
rating: 5
highlights:
  - id: study_1730000000000
    kind: miniNote               # miniNote | linkedNote | scriptureLink | reference | workspace
    accent: warmAmber
    anchorText: "for God so loved"
    anchorLocation: 12           # platform hint only (not portable across editors)
    anchorLength: 16
    annotation: "The hinge of the gospel."
    focusTitle: ""
    notesBody: ""
    scriptureReference: "John 3:16"
    scriptureTranslation: NET
    scriptureExcerpt: "For God so loved the world"
---
```

### Highlight fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | no | Original study-thread id; import creates new ids if missing |
| `kind` | yes | Entry kind (see above) |
| `accent` | yes | `warmAmber`, `skyBlue`, `violet`, `mintGreen`, `coralRose`, `neutral` |
| `anchorText` | for anchored kinds | Text snapshot; **portable anchor** for re-finding range |
| `anchorLocation` / `anchorLength` | no | Hint only |
| `annotation` | no | Maps to `miniNoteBody` (or primary annotation text) |
| `focusTitle` | no | Study focus title |
| `notesBody` | no | Workspace / deep notes body |
| `scriptureReference` / `scriptureTranslation` / `scriptureExcerpt` | no | Passage highlights |

Scripture passage highlights (`scriptureLink` with no body anchor) appear only in frontmatter and callouts, not as inline `==...==`.

## Body

```markdown
# Note title

God so loved the world... ==for God so loved== the world.

> [!note] Highlight (warmAmber) — "for God so loved"
> The hinge of the gospel.
```

- **`==highlighted text==`**: Obsidian-style highlight; visible and editable in any markdown viewer.
- **Callouts**: Obsidian callout syntax; human-readable annotation. On import, **`highlights:` frontmatter is authoritative**; callouts are for external editing and fallback parsing.

## Multi-note exports

Server bulk export concatenates complete per-note documents separated by a blank line. Each document begins with `---` YAML frontmatter.

## Legacy Harvous export

Older exports used `# title`, body, then a trailing `---` block with `**Created:**`, `**Thread:**`, etc. Import still accepts that format.

## External ingestion

| Source | Highlights | Annotations |
|--------|------------|-------------|
| Word `.docx` | `<w:highlight>` runs | `comments.xml` + comment range anchors |
| Google Docs | Export as `.docx` | Same as Word |
| HTML | `background-color` / `<mark>` | Usually lost |
| Markdown | `==text==` | Callouts, footnotes, `%% comments %%` |

External files normalize into this format before import.

## Cross-platform export compatibility

| Target app | Recommended export | Inline `==highlights==` | YAML `highlights:` | Annotations / callouts |
|------------|-------------------|-------------------------|--------------------|-------------------------|
| Obsidian | Portable `.md` | Yes | Yes (authoritative) | Yes (callout blocks) |
| Apple Notes | Import portable `.md` into Harvous | On re-import | Yes | Yes on round-trip |
| Google Docs | Export `.docx` from Word after Harvous import, or copy from Harvous | Partial via Word highlight runs | Lost in Docs | Comments if exported from Word |
| Notion | Markdown import | Often stripped | Import as page properties manually | Callouts may become quote blocks |
| Apple Notes (direct) | No native portable path | N/A | N/A | Export ENEX → Harvous vault (native) |

Harvous portable markdown is the best-lossless path for study highlights. For third-party apps, prefer **Obsidian** or re-import into Harvous.

## Native vault

Native mirror writes the same shape under `{Space}/{date} {title}.md`. Legacy `_harvous/highlights/{noteId}.json` sidecars remain readable for back-compat but inline + frontmatter is canonical.

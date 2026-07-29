# Resource Library

**Status:** Design only — no code lands from this doc.  
**Written:** July 2026  
**Audience:** Product, sharing-agent, content-agent, editor-agent, data-agent, marketing-agent

Harvous’s competitive answer to [Planning Center Groups Resources](https://help.planningcenter.com/en/138457-add-resources.html): a study-native **Resource Library** for churches (later schools) where curriculum assets are browsable, shareable, and **`@` mentionable** inside notes—not only downloadable from a group Resources tab.

---

## Related docs

| Doc | Relationship |
|-----|--------------|
| [PASTOR_FEATURES_ROADMAP.md](./PASTOR_FEATURES_ROADMAP.md) | Planning Center split; church ladder; ministry channels |
| [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) | Org accounts + curriculum distribution to connected members |
| [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md) | `connectedChurchId` / connect flow |
| [CHMS_INTEGRATION_RESEARCH.md](./CHMS_INTEGRATION_RESEARCH.md) | Roster sync; complement ChMS; optional later PCO resource import |
| [MENTION_PILLS.md](./MENTION_PILLS.md) | Shipped `@` mentions for notes/folders/threads; library extends kinds |
| [NOTE_TEMPLATES.md](./NOTE_TEMPLATES.md) | Starters that library items can point at or wrap |
| [TIPTAP_UPGRADE_AND_RICH_MEDIA.md](./TIPTAP_UPGRADE_AND_RICH_MEDIA.md) | Future embeds/PDFs in the editor |
| [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) | Church SKUs; “works alongside Planning Center” |
| [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) | Cross-space visibility rules mentions must honor |

---

## 1. Problem and opportunity

### What churches do today in Planning Center

PCO Groups lets leaders and admins share **files and links** with a group (or as **shared resources** across a group type): meeting guides, short videos, curriculum PDFs, book recommendations. Access can be leaders-only or all members. Members get notified in Church Center and open/download from a Resources tab. Files max out at 50MB; larger media is an external URL (Drive, YouTube, Vimeo, etc.).

That solves **distribution**. It does not solve **study memory**:

- Resources sit beside chat/events, not inside the notes people write while studying.
- There is no durable way to *reference* a shared guide from a personal reflection (“see Week 3 handout”).
- Passage history, Recall, and copy-lineage never see those assets.
- When someone leaves the group or the file moves, the citation in a note (if any) is just a dead URL.

### The Harvous wedge

**Keep Planning Center for people, groups, events, and attendance. Harvous is where study resources become referenceable knowledge—not a second file cabinet.**

A Resource Library lets churches (and later schools) put the same class of assets into Harvous so members can:

1. **Browse** a library scoped to their space, ministry, or connected church.
2. **Follow / pin** items into a study feed or space Resources surface.
3. **Copy** a starter or pack into My Home (existing copy-lineage).
4. **`@` mention** a library item inline in a note—same interaction grammar as note/folder/thread mentions.

Curriculum channels (`type='public'` + `orgId` ministry spaces) remain the **broadcast / feed** lane. The Resource Library is the **catalog and reference** lane. They compose: staff can pin library items into a ministry channel or attach them to a sermon-week starter without duplicating the asset.

---

## 2. Naming collision (locked)

Today, `Notes.noteType = 'resource'` plus `ResourceMetadata` means a **personal link/bookmark note** (OG title, `sourceUrl`, image)—see `server/routes/resource.ts` and `NewResourcePanel`. That product language stays.

| Term | Meaning |
|------|---------|
| **Resource note** (existing) | A note type: bookmark/link with `ResourceMetadata` |
| **Resource Library** (this doc) | Org- or space-scoped catalog product |
| **Library item** | One entry in a library (file, link, note pointer, pack, template) |

Product copy and schema sketches for this feature use **Library / LibraryItem**. Existing resource notes remain a content type that can *appear as* or *be linked from* a library item—they are not renamed.

---

## 3. Personas and jobs

| Persona | Jobs |
|---------|------|
| **Church admin / education pastor** | Maintain an org-wide library; share items across group types / ministries; control leaders-only vs member access; retire outdated curriculum |
| **Group / class leader** | Add space-local items for this quarter’s study; pin the week’s PDF; point members at a YouTube teaching without leaving Harvous |
| **Congregant / group member** | Find this week’s handout; open it while writing notes; `@` the guide so next year’s self (and Recall) still knows what they meant |
| **Connected church member** (not in every small group) | See church-shared library items in “From your church” / library home without joining every space |
| **School teacher** (later) | Same jobs as group leader under a school org; class-scoped libraries |
| **Student** (later) | Browse class materials; mention readings in personal notes |

---

## 4. Product thesis

**Harvous Resource Library** is the study-native place organizations put curriculum assets—PDFs, links, videos, guides, starter notes—so people can browse, follow, copy, and `@` mention them inside personal and group study.

### Competitive frame

| Planning Center Resources | Harvous Resource Library |
|---------------------------|--------------------------|
| File/link dump per group or group-type “shared resources” | Org- or space-scoped library with sections/tags |
| Notify in Church Center; open/download | Live inside study: preview, scripture-linked, `@` mention pills |
| Leaders-only vs all-members access | Role + space membership + church-connected scopes |
| Max ~50MB upload; large media via external URL | Same pragmatic model initially (upload small + link large) |
| No memory graph | Mentions + copy-lineage feed Recall / passage history |
| Separate from co-authored study notes | Same app as Shared Spaces, scripture pills, and threads |

### Architectural stance

```mermaid
flowchart TB
  subgraph org [Church or School org]
    Lib[ResourceLibrary]
    Items[LibraryItems]
    Sections[Sections or tags]
  end
  subgraph scopes [Visibility scopes]
    OrgWide[Org-wide shared]
    GroupType[Group type or ministry]
    SpaceOnly[Single Shared Space]
  end
  subgraph consume [Consumption]
    Browse[Library browser UI]
    Mention["@ library mention pill"]
    Copy[Copy into My Home]
    Channel[Optional ministry public space pin]
  end
  Lib --> Items
  Lib --> Sections
  Items --> OrgWide
  Items --> GroupType
  Items --> SpaceOnly
  Items --> Browse
  Items --> Mention
  Items --> Copy
  Items --> Channel
```

**Ownership (default):** One org-owned library under `Churches` (later school org). Items can be **scoped down** to Shared Spaces or ministry channels. Group leaders add space-local items; admins manage org-shared items (mirrors PCO group vs shared resources). Canonical masters stay org/author-owned; members **reference or copy**—no co-edit of library masters by default.

**Relation to ministry broadcast:** Ministry education channels remain `Spaces.type='public'` + `orgId` for feed-style curriculum. Library is the durable catalog those channels (and Shared Spaces) draw from. Do not collapse library into “just another public space”—browsing, pinning, access levels, and `@` referenceability are first-class.

---

## 5. Product surfaces

### 5.1 Org Library home

- Staff surface under church admin / education settings (and a lighter browse for connected members).
- Sections or tags (e.g. Adult Ed, Students, Sermon Series, Leader Guides).
- Search by title, description, scripture passage, tag.
- Create/edit library items; set scope and access; pin featured items.

### 5.2 Space Resources tab

- On a Shared Space (and optionally on a ministry channel): list of library items **in scope for this space**, plus space-local items.
- Pin ordering (leader can unpin org-shared pins for their space—same UX idea as PCO).
- Empty state: “Add a link or PDF for this group’s study.”

### 5.3 `@` mention picker — Library tab

- When the note’s space (or the author’s connected church) grants library access, the mention picker adds a **Library** kind tab alongside Notes / Folders / Threads.
- Inserting a mention creates a pill that navigates to the library item detail (preview / open file / open linked note).
- Label frozen at insert time (same as other mention pills); id keeps the link working if the title changes.

### 5.4 “From your church” / study feed pins

- Org-scoped items marked for connected congregants can surface in the existing church curriculum / inbox patterns (see CHURCH_ORG_AND_CURRICULUM)—as library cards, not only as duplicated notes.
- Optional: attach library items to sermon-calendar weeks (PASTOR_FEATURES_ROADMAP item 7).

### 5.5 Item detail

- Title, description, access badge, scripture anchors (optional), open/download/copy actions.
- For Harvous note/thread pointers: open in-app; for files: download or in-browser preview where safe; for external URLs: open with clear external affordance.

---

## 6. Library item types

| Kind | Description | v0 |
|------|-------------|----|
| **`link`** | External URL (Drive, YouTube, publisher page, etc.) | Yes |
| **`file`** | Uploaded document/media under a size cap (PDF, doc, image, short audio/video) | v1 |
| **`note_ref`** | Pointer to a Harvous note (often `noteType: 'resource'` or a curriculum note) | Yes |
| **`thread_ref`** | Pointer to a Harvous thread used as a curriculum pack | Yes |
| **`template_ref`** | Pointer to a `NoteTemplates` starter (org- or space-scoped) | v1 |
| **`pack`** | Lightweight bundle: ordered list of other library item ids + optional passage set | v2 |

Optional metadata on all kinds: description, cover image, pinned, leaders-only, scripture references (for passage-aware search and future Recall hooks).

---

## 7. Permissions

| Actor | Can |
|-------|-----|
| **Org admin / education role** | CRUD org-shared items; set group-type / ministry scopes; delete any item |
| **Group / space leader** | CRUD items scoped to their Shared Space; pin/unpin; cannot create org-wide shared items |
| **Space member** | Browse member-visible items in scope; open; copy; `@` mention |
| **Connected congregant** (not space member) | Browse org-wide / ministry items marked for connected users; `@` in personal notes when picker includes connected-church library |
| **Leaders-only items** | Visible only to `owner` / `leader` (and org staff); never offered in member mention pickers |

Access axes (orthogonal):

1. **Audience:** `leaders` \| `members` (PCO parity).
2. **Scope:** `org` \| `ministry` / group-type \| `space`.
3. **Church connection:** whether connected non-members can see the item.

Server enforces all three on list, open, and mention-picker search. Clients never trust UI alone.

---

## 8. Data model sketch

Design-only. Prefer first-class library tables so library items are not forced to be notes (notes remain optional targets via `note_ref`).

```text
ResourceLibraries
  id
  ownerKind          -- 'church' | 'school' | (future)
  ownerId            -- Churches.id or future Schools.id
  title
  createdAt, updatedAt

LibrarySections      -- optional; tags alone may suffice in v0
  id, libraryId, name, sortOrder

LibraryItems
  id
  libraryId
  kind               -- 'link' | 'file' | 'note_ref' | 'thread_ref' | 'template_ref' | 'pack'
  title
  description
  access             -- 'leaders' | 'members'
  pinnedDefault      -- bool; spaces may override pin locally
  sourceUrl          -- for kind=link (and external file hosts)
  fileStorageKey     -- for kind=file (Supabase storage; separate from note-attachments)
  fileMime, fileBytes
  targetNoteId       -- for note_ref
  targetThreadId     -- for thread_ref
  targetTemplateId   -- for template_ref
  packItemIds        -- jsonb ordered ids for kind=pack
  scriptureRefs      -- jsonb optional passage list
  createdByUserId
  createdAt, updatedAt, archivedAt

LibraryItemScopes
  id
  libraryItemId
  scopeKind          -- 'org' | 'ministry' | 'space'
  spaceId            -- when scopeKind=space
  ministryKey        -- when scopeKind=ministry (string or FK to future ministry/group-type)
  unique(libraryItemId, scopeKind, spaceId, ministryKey)

LibraryItemSpacePins -- optional override of pin state per space
  spaceId, libraryItemId, pinned, sortOrder
```

**Relationships to existing rails:**

- `noteType: 'resource'` notes can be targets of `note_ref` or created when a user “saves a copy” of a link item into My Home.
- `NoteTemplates` remain the starter engine; library `template_ref` is discovery + mention, not a second template system.
- Ministry `Spaces` (`type='public'`, `orgId`) can **pin** library items without owning a second copy.
- Attachments for library files should use a dedicated storage prefix/bucket policy (not `note-attachments` HTML embeds), with virus/size limits analogous to PCO’s ~50MB starting point.

---

## 9. Mentions and graph

### Shape

Extend shipped mention pills ([MENTION_PILLS.md](./MENTION_PILLS.md)):

- New kind: `library` (or `libraryItem`) on the same TipTap **mark** shape as note/thread/folder.
- Pill attrs: `data-mention-kind="library"`, `data-mention-id` (library item id), optional `data-mention-space-id` / library id for resolve context.
- Type icon: distinct from note/folder/thread (design-agent to pick from existing icon set).
- Tap: open library item detail (or deep-link to file/URL with confirmation for external).

### Picker source

- Space note → items in scope for that space + org items visible to the member.
- Personal note → user’s connected-church library (member-visible) + any libraries from spaces they belong to (search union, no reverse leak of private group-only items into unrelated contexts).
- Leaders-only items omitted unless the user is a leader/staff.

### Graph (deferred, same as other mentions)

- v1 of library mentions: display + navigation only.
- Later: extract `NoteConnections` with `kind: 'mention'` / subtype library so backlinks and Recall can resurface “notes that cited Week 3 guide.”
- **Copy-across-spaces degrade** must land before library mentions participate in copy-notes in production (same blocker as content mentions today): if the target is not visible to the destination audience, degrade to plain title text (or a non-navigating span).

---

## 10. Planning Center / ChMS relationship

Harvous does **not** replace Planning Center Groups, People, Services, Giving, or Church Center as the primary church app.

| Lane | Planning Center | Harvous |
|------|-----------------|---------|
| Groups / roster / events / attendance | Groups + People | Shared Spaces + optional ChMS roster sync |
| File/link dump for groups | Groups Resources / Shared resources | **Resource Library** (this doc) |
| Study memory, notes, scripture, Recall | — | Core product |
| Curriculum feed to connected members | Church Center notifications | Ministry channels + connect + library pins |

**Optional later integrations** (see [CHMS_INTEGRATION_RESEARCH.md](./CHMS_INTEGRATION_RESEARCH.md)):

- Import PCO resource **links** (and metadata) into Harvous library items for a group-mapped space—deep file sync is out of scope initially.
- After connect: “Resources for this group also live in Harvous” messaging for leaders who want study-native references.

Pitch remains: *Keep Planning Center. Harvous is where your people’s study—and the resources they study with—live together.*

---

## 11. Schools phase (later)

Same library primitive; different `ownerKind` (`school`) and org rails.

| Concern | Notes |
|---------|--------|
| **Org model** | Future Schools table / Clerk org for staff (same ≤20 staff pattern as churches unless product revisits) |
| **Scopes** | Class / course / grade ↔ Shared Spaces or dedicated scopes |
| **Privacy** | FERPA-minded defaults: class-scoped items not org-wide by default; youth/COPPA constraints align with CHMS youth section |
| **Mentions** | Same `@` library kind; picker respects class membership |
| **Marketing** | After church library proves the interaction; do not block church v0/v1 on school schema |

---

## 12. Phased roadmap

| Phase | Ship | Depends on |
|-------|------|------------|
| **v0** | Space-local library: links + `note_ref` / `thread_ref`; Space Resources tab; leaders-only vs members | Shared Spaces membership/roles |
| **v1** | Org library under church; shared scopes; file upload + storage limits; sections/tags; connected-member browse | Church org + connect ([CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md)) |
| **v2** | `@` library mention kind + picker tab; scripture anchors on items; pack kind; graph extraction optional | Mention pills v1; copy-notes degrade fix |
| **v3** | School orgs; optional PCO/ChMS resource-link import; sermon-calendar attach | Schools decision; ChMS connect |

Marketing ladder alignment: Group Leader → space Resources (v0); Church org → org Library (v1+); schools after church product-market fit.

---

## 13. Non-goals

- Full digital asset management (DAM), version trees, approval workflows, brand kits.
- First-party video hosting / streaming CDN (use YouTube/Vimeo/external links).
- Replacing Church Center messaging, events, or attendance.
- Co-editing library master PDFs inside Harvous.
- Skeleton loaders for library UI (use existing loading/empty patterns).
- Renaming or removing existing `noteType: 'resource'` bookmark notes.
- Replacing ministry broadcast spaces with the library alone.

---

## 14. Locked product decisions (July 2026)

1. **Library is a first-class catalog**, not only “pins inside a public space.”
2. **Product language:** Library / Library item — not overloaded onto `noteType: 'resource'`.
3. **Ownership:** Org-owned library with scope-down to space/ministry; space-local items for leaders.
4. **Consumption:** Browse + copy + `@` mention; masters not co-edited by members.
5. **Files:** Pragmatic size cap + external URLs for large media (PCO-like), dedicated storage path.
6. **PCO stance:** Complement Groups Resources; compete on study-native referenceability, not on being a better Church Center file tab.
7. **Schools:** Same primitive later; church phases first.

---

## 15. Open questions

- **Billing:** Does org Library attach to Church Study / Study Plus SKUs only, or is a space-local v0 included in Group Leader / Shared Spaces add-on? (Default assumption: v0 with Group Leader; org-wide + storage with Church Study+.)
- **Storage limits / pricing:** Per-org GB caps vs per-item size only; whether files are a paid add-on.
- **Implementation shape:** Confirm first-class `LibraryItems` rows vs “library = tagged notes in a hidden org space.” This doc prefers first-class rows for permissions, file metadata, and mention ids.
- **Ministry key:** String tag vs first-class ministry / group-type entity when ChMS sync lands.
- **Preview:** Which MIME types get in-app preview vs download-only on web and native.
- **Notifications:** Whether adding a member-visible item should notify space members (PCO does); prefer reuse of existing inbox/event patterns rather than a new channel.
- **Native:** Library browse + mention rendering parity timeline with web.

---

## 16. Summary

- **Vision:** Churches (then schools) get a Resource Library that wins against PCO Groups Resources by making assets **referenceable in study**—browse, pin, copy, and `@` mention.
- **Split:** Shared Spaces ↔ PCO Groups; **Resource Library (+ ministry channels)** ↔ PCO Resources.
- **Build on:** Church org/connect, Shared Spaces roles, mention pills, copy-lineage, note templates, existing resource *notes* as one item kind.
- **Ship order:** Space-local links → org library + files → `@` library mentions → schools / ChMS import.
- **Do not:** Become a ChMS, a DAM, or a rename of bookmark resource notes.

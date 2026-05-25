# Harvous architecture at a glance

This diagram consolidates the three client surfaces (Classic web 1.0, Prototype web 2.0, Native iOS/macOS), how they reach data, and — importantly — how each surface treats **threads** (the legacy org grouping) versus **folders** (the new collection system that replaces threads in the 2.0 product). For deeper context see [PROTOTYPE_2_0_ARCHITECTURE.md](./PROTOTYPE_2_0_ARCHITECTURE.md), [native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md](./native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md), and [design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md](./design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md).

---

## Combined architecture + data-usage diagram

```mermaid
flowchart LR

  %% ─────────────────────── CLIENTS ───────────────────────
  subgraph Clients["Clients"]
    direction TB

    subgraph Classic["Classic web 1.0 — thread-first"]
      direction TB
      C_routes["spa/src/router.tsx<br/>/, /thread/:id, /note/:id, /space/:id"]
      C_layout["AppLayout.tsx<br/>Sidebar lists THREADS"]
      C_editor1["CardFullEditable + TiptapEditor<br/>HTML w/ scripture pill marks"]
      C_uses["Uses: Note.threadId (required)<br/>Note.primaryCollection: not surfaced"]
      C_routes --> C_layout --> C_editor1
      C_layout --- C_uses
    end

    subgraph Proto["Prototype web 2.0 — folder-first"]
      direction TB
      P_routes["spa/src/router.tsx<br/>/prototype, /prototype/n/:id, /prototype/search"]
      P_layout["SimplifiedPrototypeLayout.tsx<br/>Sidebar modes: notes / folders /<br/>highlights / scripture"]
      P_editor["CardFullEditable + TiptapEditor<br/>(same component as Classic)"]
      P_uses["Uses: primaryCollection,<br/>secondaryCollections[]<br/>threadId stamped 'thread_unorganized' (hidden)"]
      P_routes --> P_layout --> P_editor
      P_layout --- P_uses
    end

    subgraph Native["Native iOS / macOS — folder-first, local"]
      direction TB
      N_app["HarvousApp.swift<br/>SwiftData @main"]
      N_views["MacRootView / iOSRootView<br/>Sidebar lists FOLDERS"]
      N_editor["HarvousEditor<br/>NSTextView / iOS proxy<br/>plain text + pill attachments"]
      N_store[("SwiftData (SQLite)<br/>Note, StudyThread, Space,<br/>NoteSnapshot, SpaceMember")]
      N_uses["Uses: Note.primaryFolder,<br/>Note.secondaryFolders<br/>NO Thread entity in SwiftData<br/>StudyThread here = local deep-study branch"]
      N_vault["Vault mirror<br/>(local + iCloud markdown)"]
      N_app --> N_views --> N_editor
      N_app --> N_store
      N_store -. export .-> N_vault
      N_views --- N_uses
    end
  end

  %% ─────────────────────── AUTH / API / SCRIPTURE ───────────────────────
  Clerk["Clerk auth<br/>(shared session)"]

  subgraph Backend["Backend — Netlify functions"]
    direction TB
    API["Hono API<br/>netlify/functions/api.cjs<br/><br/>/api/notes/* &nbsp; /api/spaces/*<br/>/api/threads/* &nbsp; /api/study-threads/*<br/>/api/search &nbsp; /api/spaces/:id/scripture-index"]
    SAux["Scripture services<br/>verse fetch, VOTD, translations"]
  end

  %% ─────────────────────── DATABASE ───────────────────────
  subgraph DB["Postgres (Supabase) — server/db/schema.ts"]
    direction TB
    T_Space["Spaces"]
    T_Thread["Threads<br/>(legacy org; 'thread_unorganized'<br/>used by Prototype)"]
    T_Note["Notes<br/>title, content (HTML),<br/>threadId, spaceId,<br/>primaryCollection, secondaryCollections[]"]
    T_Study["StudyThreadEntries<br/>anchored highlight / mini-note /<br/>linked note / scripture ref"]
    T_Members["Members, SpaceInvitations,<br/>ScriptureMetadata, …"]
    T_Space --> T_Note
    T_Thread --> T_Note
    T_Note --> T_Study
  end

  %% ─────────────────────── EDGES ───────────────────────
  Classic -- "React Query<br/>spa/src/lib/api.ts" --> API
  Proto   -- "React Query<br/>spa/src/lib/api.ts" --> API
  Classic -. session .-> Clerk
  Proto   -. session .-> Clerk
  API --> DB

  Native -. "scripture lookups only<br/>(non-blocking)" .-> SAux
  Native -. "sync TBD —<br/>cloudId / needsSync fields ready,<br/>endpoints not wired" .-x API

  %% Style the gap
  classDef gap stroke-dasharray: 5 5,stroke:#c66,color:#c66;
  class Native gap;
```

---

## Legend

| Surface | Primary org concept in UI | DB threads usage | DB collections/folders usage | Highlights stored in |
|---|---|---|---|---|
| **Classic web 1.0** | **Threads** (visible in sidebar/URL) | `Note.threadId` required and surfaced | `primaryCollection` exists on row, not surfaced in UI | Postgres `StudyThreadEntries` |
| **Prototype web 2.0** | **Folders** (collections) | `threadId` stamped `thread_unorganized` server-side, hidden in UI | `primaryCollection` + `secondaryCollections[]` first-class | Postgres `StudyThreadEntries` |
| **Native (iOS / macOS)** | **Folders** (`primaryFolder` + `secondaryFolders`) | **No `Thread` entity in SwiftData at all** | First-class on `Note` model | Local SwiftData `StudyThread` rows — **does not sync to web yet** |

## Terminology gotchas the diagram captures

- **"Thread"** means two different things. In Classic web it's the legacy org grouping (the `Threads` table). In Native, `StudyThread` is a per-note deep-study branch (anchored highlight / mini-note / linked note) — equivalent to web's `StudyThreadEntries`, not to web's `Threads`.
- **Folders ≈ Collections.** Native calls them `primaryFolder` / `secondaryFolders`; web (DB) calls them `primaryCollection` / `secondaryCollections`. Same concept; the SwiftData model uses `@Attribute(originalName: "primaryCollection")` to bridge the names locally.

---

**See also:** [PROTOTYPE_2_0_ARCHITECTURE.md](./PROTOTYPE_2_0_ARCHITECTURE.md) · [native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md](./native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md) · [design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md](./design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md)

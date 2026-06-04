# Harvous Architecture: Visual Guide

A visual-first tour of how the web prototype, native apps, and backend fit together.

---

## 1. The Big Picture

Three clients. One database.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HARVOUS CLIENTS                                │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐  │
│  │  Classic Web (1.0)│  │  Prototype Web    │  │  Native (macOS + iOS) │  │
│  │   /              │  │   /prototype/*    │  │   Swift + SwiftData   │  │
│  │                  │  │                   │  │                       │  │
│  │  Spaces + Threads│  │  Notes-first shell│  │  Notes-first shell    │  │
│  │  Full management │  │  (mirror of native│  │  Local-first today;   │  │
│  │  dashboard UI    │  │   look+feel)      │  │  cloud sync: future   │  │
│  └────────┬─────────┘  └────────┬──────────┘  └──────────┬────────────┘  │
└───────────┼─────────────────────┼──────────────────────── ┼───────────────┘
            │                     │                          │
            │      same Clerk     │     same Clerk           │  (today: scripture +
            │      session        │     session              │   VOTD API calls only)
            │                     │                          │
            ▼                     ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HONO API  (Netlify functions)                        │
│                        netlify/functions/api.cjs                            │
│                                                                             │
│   /api/notes/*    /api/spaces/*    /api/sync/*    /api/study-threads/*     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
                      ┌──────────────────────────┐
                      │   Supabase Postgres       │
                      │   server/db/schema.ts     │
                      │                           │
                      │  Notes  Spaces  Threads   │
                      │  StudyThreadEntries        │
                      │  Members  Tags  Metadata  │
                      └──────────────────────────┘
```

**Key insight:** The prototype web shell and native apps are designed to look and feel identical. The backend and database are the same for everyone.

---

## 2. Where Each Client Lives in the Codebase

```
harvous/
│
├── spa/src/                        ← Both Classic AND Prototype (same bundle)
│   ├── router.tsx                  ← Route tree (classic routes + prototype routes)
│   ├── layouts/
│   │   ├── SimplifiedPrototypeLayout.tsx   ← Prototype auth gate + shell root
│   │   └── proto-shell-context.tsx         ← Sidebar state, inspector, list modes
│   └── pages/prototype/            ← Everything under /prototype/*
│       ├── PrototypeHomePage.tsx
│       ├── PrototypeNotePage.tsx
│       ├── PrototypeSidebar.tsx
│       ├── NativeToolbar.tsx       ← Top bar mimicking native toolbar
│       └── PrototypeInspectorPane.tsx
│
├── native/Harvous/                 ← SwiftUI app (macOS + iOS)
│   ├── HarvousApp.swift            ← Entry point, scenes, SwiftData container
│   ├── ContentView.swift           ← MacRootView vs iOSRootView switch
│   ├── App/HarvousAppRouter.swift  ← Cross-tab / deep link state
│   ├── Views/                      ← All SwiftUI screens
│   ├── Editor/                     ← NSTextView editor (pills, attachments)
│   ├── Models/                     ← SwiftData @Model types (Note, Space, …)
│   └── Services/                   ← Network (scripture, VOTD), sync, notifications
│
└── server/                         ← Hono API (shared by all clients)
    ├── routes/notes.ts
    ├── routes/spaces.ts
    ├── routes/sync.ts              ← bootstrap / push / changes
    ├── routes/study-threads.ts
    └── db/schema.ts                ← Drizzle schema → Supabase Postgres
```

---

## 3. The Two Web Surfaces Side by Side

One SPA. Two layouts. Different URL prefixes.

```
 CLASSIC  (/  /note/*  /thread/*  /space/*)      PROTOTYPE  (/prototype/*)
 ┌─────────────────────────────────┐              ┌─────────────────────────────────┐
 │ ┌──────┬──────────────────────┐ │              │ ┌──────┬────────────────────┐   │
 │ │Space │  Thread header       │ │              │ │      │  Native toolbar    │   │
 │ │ list ├──────────────────────┤ │              │ │Side  ├────────────────────┤   │
 │ │      │  Note editor         │ │              │ │bar   │  Note editor       │   │
 │ │      │  (TipTap)            │ │              │ │      │  (TipTap, same     │   │
 │ │      │                      │ │              │ │      │   CardFullEditable) │   │
 │ │      ├──────────────────────┤ │              │ │      ├────────────────────┤   │
 │ │      │  Thread list /       │ │              │ │      │  Scripture / high- │   │
 │ │      │  management views    │ │              │ │      │  light docks       │   │
 │ └──────┴──────────────────────┘ │              │ └──────┴────────────────────┘   │
 └─────────────────────────────────┘              └─────────────────────────────────┘

 Organization model: Spaces + Threads               Organization model: Folders only
 Thread UI shown in sidebar                         Thread UI hidden; uses folders
 Full create/manage flows here                      New note → My Home space
```

**What's shared between them:** The note editor (`CardFullEditable.tsx`), all React Query hooks, the Clerk session, and all API calls are exactly the same. Only the chrome (sidebars, toolbars, modals) differs.

---

## 4. The Prototype Shell Layout (Web)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NativeToolbar                                                              │
│  [≡ sidebar]  [space: My Home ▾]          [🔍 search]  [ⓘ inspector]  [👤] │
├───────────────────────┬────────────────────────────┬────────────────────────┤
│                       │                            │                        │
│  PrototypeSidebar     │   PrototypeMainPaneShell   │  PrototypeInspectorPane│
│                       │                            │   (right panel)        │
│  List modes:          │   PrototypeNotePage        │                        │
│  ○ Notes              │   ┌────────────────────┐   │   Collections / tags   │
│  ○ Folders            │   │  CardFullEditable  │   │   Scripture references  │
│  ○ Highlights         │   │  (TipTap editor)   │   │   Creation date, info  │
│  ○ Scripture          │   └────────────────────┘   │                        │
│                       │                            │                        │
│  Note list items      │   Bottom docks (portaled): │                        │
│  (with timestamps)    │   [Format bar]             │                        │
│                       │   [Scripture chrome]       │                        │
│                       │   [Highlight dock]         │                        │
└───────────────────────┴────────────────────────────┴────────────────────────┘

Files:
  NativeToolbar.tsx              ← top bar
  PrototypeSidebar.tsx           ← left panel
  PrototypeMainPaneShell.tsx     ← center column shell
  PrototypeNotePage.tsx          ← editor page (wraps CardFullEditable)
  PrototypeInspectorPane.tsx     ← right panel
  proto-shell-context.tsx        ← state for all of the above
```

---

## 5. The Native App Layout

### macOS (NavigationSplitView)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Unified toolbar (glass strip)                                           │
│  [sidebar toggle]  [space switcher]           [new note]  [inspector]   │
├────────────────────┬──────────────────────────┬─────────────────────────┤
│                    │                          │                         │
│  SidebarPanelView  │  NoteEditorView          │  Inspector panel        │
│                    │                          │  (shown via toolbar     │
│  NoteListColumn    │  HarvousEditor           │   button)               │
│  (list of notes)   │  (NSTextView-backed,     │                         │
│                    │   scripture pills as      │  Tags / collections     │
│  SpaceSwitcherView │   text attachments)      │  Study threads          │
│  (in toolbar)      │                          │  Note metadata          │
│                    │  EditorProxy.swift        │                         │
│                    │  (SwiftUI ↔ NSTextView    │                         │
│                    │   coordinator)            │                         │
└────────────────────┴──────────────────────────┴─────────────────────────┘

Key files:
  HarvousApp.swift          ← WindowGroup + .modelContainer(SwiftData)
  ContentView.swift         ← routes to MacRootView
  Views/SidebarPanelView.swift
  Views/NoteEditorView.swift
  Editor/HarvousEditor.swift
  Editor/EditorProxy.swift
```

### iOS (TabView + Sheets)

```
┌──────────────────────────────────────┐
│  NavigationStack per tab             │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Note list  /  Editor view     │  │
│  └────────────────────────────────┘  │
│                                      │
│         FAB (floating new note)      │
│                  ●                   │
├──────────────────────────────────────┤
│ [Notes]  [Search]  [Library]  [You]  │  ← TabView
└──────────────────────────────────────┘

Sheets:
  ComposeView  ← new note sheet (.presentationDetents)

Key files:
  ContentView.swift → iOSRootView
  App/HarvousAppRouter.swift  ← iosSelectedTab, iosShowCompose, youNavigationStack
```

---

## 6. How "Threads" Became "Folders" (The Terminology Shift)

This is the biggest conceptual hurdle. The word "thread" means **three different things** in the codebase.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  THREE THINGS CALLED "THREAD"                                               │
│                                                                             │
│  1. Classic Threads  ───────────────────────────────────────────────────── │
│     What: Organizational containers (like notebooks / stacks)               │
│     Where: Threads table, Notes.threadId (required FK)                      │
│     Visible: Classic 1.0 UI only. HIDDEN in 2.0 prototype + native.         │
│     In 2.0: Every note still needs a threadId; server uses                  │
│             "thread_unorganized" as a silent sentinel.                       │
│                                                                             │
│  2. Folders (Collections)  ─────────────────────────────────────────────── │
│     What: The USER-VISIBLE organization in 2.0                              │
│     Where: Notes.primaryCollection, Notes.secondaryCollections              │
│             Native: Note.primaryFolder                                      │
│     How set: Folder chip in toolbar; inspector; sidebar folders mode         │
│     Migration: backfill-collections-from-threads.ts copies Classic          │
│               thread titles into collection labels                           │
│                                                                             │
│  3. StudyThreads  ──────────────────────────────────────────────────────── │
│     What: Per-note study workspace (highlights, questions, scripture)        │
│     Where: StudyThreadEntries table (server); StudyThread SwiftData (native) │
│     Gap: Web uses server-issued string IDs.                                  │
│           Native uses device UUIDs.                                          │
│           ⚠️  They do not sync yet — web study ≠ native study.              │
└─────────────────────────────────────────────────────────────────────────────┘

Diagram:
                         ┌─────────────┐
                         │  Note row   │
                         └──────┬──────┘
              ┌─────────────────┼───────────────────┐
              ▼                 ▼                    ▼
   Notes.threadId       Notes.primaryCollection  StudyThreadEntries
   (required; always    (the folder users see    (highlights /
    thread_unorganized   in prototype + native)   study workspace)
    in 2.0)
```

---

## 7. Data Flow: Creating a Note

### Web Prototype

```
User types "new note" in prototype
         │
         ▼
  PrototypeHomePage
  useCreateSimpleNote mutation
         │
         ▼
  POST /api/notes/create
  { spaceId: myHomeId, threadId: '' }
         │
         ▼
  server/routes/notes.ts
  ensureUnorganizedThread()   ← silently attaches thread_unorganized
         │
         ▼
  INSERT into Notes (Postgres)
  returns { noteId }
         │
         ▼
  Router navigates to /prototype/n/{noteId}
  PrototypeNotePage renders CardFullEditable
```

### Native (Today — Local Only)

```
User taps FAB / new note button
         │
         ▼
  ComposeView (iOS) or toolbar button (macOS)
         │
         ▼
  @Environment(\.modelContext).insert(Note(...))
  SwiftData saves to local SQLite
         │
         ▼
  NoteEditorView / HarvousEditor renders inline
  EditorAutosaveDebouncer — debounced saves on keystrokes
         │
         ▼
  ⚠️  Does NOT reach Postgres today
      (only scripture/VOTD API calls go to server)
```

### Native (Future — Cloud Sync)

```
  SwiftData local write  ──►  POST /api/sync/push
                         ◄──  GET  /api/sync/bootstrap  (on sign-in)
                         ◄──  GET  /api/sync/changes    (delta pull)
```

---

## 8. The Note Editor: Web vs Native

Both surfaces show scripture pills and study docks, but the underlying tech differs.

```
┌─────────────────────────────────────────────┐  ┌─────────────────────────────────┐
│  WEB (TipTap / ProseMirror)                 │  │  NATIVE (NSTextView / UITextView)│
│                                             │  │                                  │
│  CardFullEditable.tsx                       │  │  HarvousEditor.swift             │
│  ┌─────────────────────────────────────┐   │  │  EditorProxy.swift (macOS bridge) │
│  │  TipTap Editor (ProseMirror core)   │   │  │  IOSNoteBodyProxy.swift (iOS)     │
│  │                                     │   │  │                                  │
│  │  Scripture pill = custom mark       │   │  │  Scripture pill = text attachment │
│  │  (TiptapScripturePill.ts)           │   │  │  (NSTextAttachment / UITextAttach)│
│  │                                     │   │  │                                  │
│  │  Body stored as TipTap HTML         │   │  │  Body stored as plain text        │
│  │  in Postgres (Notes.content)        │   │  │  in SwiftData (Note.body)         │
│  └─────────────────────────────────────┘   │  │                                  │
│                                             │  │  ⚠️ Format gap: HTML ≠ plain text │
│  Study docks = React portals                │  │  Must convert on sync            │
│  (createPortal to document.body)            │  │                                  │
│                                             │  │  Study docks = SwiftUI views     │
│  Scripture detection: server-side           │  │  overlaid on editor              │
│  (process-scripture-references.ts)          │  │                                  │
└─────────────────────────────────────────────┘  └─────────────────────────────────┘
```

---

## 9. State Management: Web vs Native

```
WEB (React + React Query)                       NATIVE (SwiftUI + SwiftData)
─────────────────────────────────────────────   ─────────────────────────────────────────
Server state: React Query cache                  Server state: (future: synced to SwiftData)
  useNote(), useSpaceNotes()                      @Query — declarative fetch from local store
  usePrototypeSpaceScriptureIndex()               @Environment(\.modelContext) — insert/save

UI / ephemeral state: React useState             UI / ephemeral state: @State (per-view)
  proto-shell-context.tsx                         HarvousAppRouter.swift (cross-tab state)
  ├── sidebar open/collapsed                       ├── iosSelectedTab
  ├── list mode (notes/folders/highlights)         ├── iosShowCompose
  ├── inspector visibility                         └── youNavigationStack
  └── active folder chip

Auth: Clerk JWT                                  Auth: (not yet shipped for cloud features)
  server/middleware/auth.ts verifies               HarvousLocalIdentity.swift (device UUID)
  __session cookie or Bearer token                 Future: Clerk or Supabase auth
```

---

## 10. The Road to 2.0: What Changes, What Stays

```
                    TODAY                          TARGET (2.0)
                    ─────                          ─────────────

Auth            Clerk (web-only shipped)       Clerk or Supabase (native ships auth)

Primary client  Classic web (most users)       Native (macOS + iOS)

Web role        Classic = full product          /prototype = non-Apple companion
                Prototype = preview shell       Classic = retired / redirected

Organization    Classic: Threads UI            2.0: Folders (collections) only
                Prototype: Folders only         Classic Threads: silent sentinel only

Note body       TipTap HTML (web canonical)    Decision pending:
                Plain text (native local)         HTML in Postgres, strip on native ingest?
                                                  Plain canonical, generate HTML on push?

Study sync      Web: Postgres string IDs        Shared server IDs after sync migration
                Native: SwiftData UUIDs          No blind merge of local UUID rows

Billing         Clerk Billing (JWT claims)     Stripe; tier stored in Postgres DB

Public web      Everything under app.harvous   Slim surface: share links, join, sign-in
```

### The 7-Phase Migration Path

```
Phase 0 ─── ADR: decide note body format, auth provider, userId strategy
    │
Phase 1 ─── Auth + Stripe tier in DB (decouple from Clerk JWT)
    │
Phase 2 ─── Native cloud READ: sign-in → /api/sync/bootstrap → SwiftData
    │
Phase 3 ─── Native cloud WRITE: autosave → /api/sync/push
    │
Phase 4 ─── Study sync: StudyThreadEntries ↔ native, server-issued IDs
    │
Phase 5 ─── Slim public web (share/join/invite/OG; Universal Links → native)
    │
Phase 6 ─── Classic sunset: redirect authenticated routes to native / /prototype
    │
Phase 7 ─── Auth cleanup: remove Clerk if migrated; finalize e2e
```

---

## 11. Quick Reference: Finding Things in the Code

| "I want to understand…" | Start here |
|------------------------|------------|
| Prototype web routing | `spa/src/router.tsx` → `simplifiedPrototypeRoute` |
| Prototype shell layout | `spa/src/layouts/SimplifiedPrototypeLayout.tsx` |
| Prototype sidebar state | `spa/src/layouts/proto-shell-context.tsx` |
| Note editor (web) | `src/components/react/CardFullEditable.tsx` |
| Note editor (native macOS) | `native/Harvous/Editor/HarvousEditor.swift` + `EditorProxy.swift` |
| Note editor (native iOS) | `native/Harvous/Editor/IOSNoteBodyProxy.swift` |
| Scripture pills (web) | `TiptapScripturePill.ts`, `ScripturePillChromeWeb.tsx` |
| Scripture pills (native) | `Editor/HarvousEditor.swift` (attachment rendering) |
| API routes | `server/routes/notes.ts`, `spaces.ts`, `study-threads.ts` |
| Cloud sync endpoints | `server/routes/sync.ts` (bootstrap / push / changes) |
| Database schema | `server/db/schema.ts` |
| Folder ↔ Classic thread backfill | `server/scripts/backfill-collections-from-threads.ts` |
| Native app entry + scenes | `native/Harvous/HarvousApp.swift` |
| Native cross-platform state | `native/Harvous/App/HarvousAppRouter.swift` |
| Design tokens (web) | `spa/src/styles/prototype-tokens.css` |
| Design tokens (native) | `native/Harvous/DesignSystem/HarvousColors.swift` |
| Classic → 2.0 migration runbook | `docs/CLASSIC_TO_2_0_MIGRATION.md` |
| Native + web data model gaps | `native/docs/future/NATIVE_WEB_DATA_MODEL_GAP.md` |

---

## 12. The One Thing to Always Remember

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   The prototype web shell and the native app are designed to look           │
│   and feel IDENTICAL — same toolbar, sidebar, inspector, docks.             │
│                                                                             │
│   They use the SAME database and (eventually) the SAME sync API.            │
│                                                                             │
│   The gap today: native stores notes locally in SwiftData.                  │
│   Once /api/sync/* is wired, they'll share the same Postgres rows.          │
│                                                                             │
│   Web prototype = "native experience, browser delivery"                     │
│   Native apps   = "native experience, OS delivery"                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

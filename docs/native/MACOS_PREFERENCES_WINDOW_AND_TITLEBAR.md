# macOS preferences: window chrome and title bar (what we want vs what failed)

**Purpose:** A stable reference for how Harvous macOS **preferences** should look and behave relative to the **main document window**, and which patterns to avoid after several iterations that felt “non‑Apple” or visually wrong.

**Code today:** `Window` scene + `MacPreferencesRootView` in `native/Harvous/HarvousApp.swift`, `native/Harvous/Views/ProfileAndSettingsViews.swift`, `native/Harvous/ContentView.swift`, `native/Harvous/HarvousCommands.swift`, `native/Harvous/App/HarvousAppRouter.swift`; sidebar toolbar treatment shared with `native/Harvous/Views/NoteListColumn.swift` (`HarvousSidebarTransparentWindowToolbar`).

**IA (which panes exist):** Still governed by `docs/native/PROFILE_PREFERENCES_IA.md`. This doc is only about **shell chrome**: window type, title bar, toolbar, and spacing.

---

## What “good” means here

1. **Same window class as the app** — Preferences should read as another Harvous window, not a different species of UI. Corner radius, title bar integration, and overall chrome should match the **document `WindowGroup`** window, not a system‑special case that never quite aligns.
2. **One unified title strip** — Traffic lights, **leading toolbar controls** (back/forward), and the **pane name** should participate in the **same** top bar as the main app (compare `MacRootView` + `NavigationStack` toolbar in `ContentView.swift`). The pane name is the **title in that bar**, not a second, floating heading row with extra dead space under the stoplights.
3. **No orphan controls** — Nothing that looks like a misplaced iPad control (e.g. sidebar hamburger under the traffic lights) unless the platform clearly expects it. Prefer `**.toolbar(removing: .sidebarToggle)`** on the sidebar column when using `NavigationSplitView` for prefs.
4. **Match main‑window toolbar language** — e.g. primary actions in the nav slot using the same **bordered** button style as the compose control where it fits; avoid bespoke pill backgrounds or full‑width chrome that fights the system title bar.
5. **Same glass/toolbar transparency story as the sidebar** — Where the main app uses clear toolbar background + hidden **window** toolbar visibility so material runs under the unified bar (`NoteListColumn`), prefs **sidebar** should use the same pattern so the left column does not look like a different app.

---

## What we ship now (the “perfect” baseline)


| Topic                   | Approach                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene                   | `**Window("Settings", id: …)`** — not `**Settings { }**`. Same general chrome as the document window.                                                                                                                                   |
| Open / ⌘,               | `**openWindow(id:)**` from `ContentView` / `MacRootView` / account menu; `**CommandGroup(replacing: .appSettings)**` posts `Notification.Name.harvousOpenMacPreferences` so ⌘, still works without a `Settings` scene.                  |
| Title bar               | `**windowToolbarStyle(.unified(showsTitle: true))**` on the prefs `Window` so `**navigationTitle**` (from `HarvousSettingsFormView`) appears **in the title bar** next to toolbar items, not as a duplicate band below.                 |
| Main app window         | Stays `**unified(showsTitle: false)`** — note title lives in the editor body, not the window chrome. Prefs and main window intentionally differ **only** on `showsTitle` where it matches user expectation.                             |
| Structure               | `**NavigationSplitView`** + sidebar `**List**`, detail `**NavigationStack**` + `HarvousSettingsFormView`.                                                                                                                               |
| Back / forward          | `**ToolbarItem(placement: .navigation)**` — two items, **not** a single `ControlGroup` that can render as a giant pill and collide with traffic lights. Optional `**ToolbarSpacer(.flexible)`** on macOS 26+ to mirror the main window. |
| Sidebar chrome          | `**.toolbarBackground(.clear, for: .automatic)**` + `**HarvousSidebarTransparentWindowToolbar**` (macOS 15+: `**toolbarBackgroundVisibility(.hidden, for: .windowToolbar)**`).                                                          |
| Whole split (macOS 15+) | `**MacPreferencesWindowToolbarChrome**` on the split root to clear/hide `**.windowToolbar**` backdrop so there is not an extra thick slab under the bar.                                                                                |


**Deployment note:** `defaultLaunchBehavior(.suppressed)` would avoid showing the prefs window at launch until first open, but it requires **macOS 15+**; the app target includes **macOS 14**, so that modifier is omitted until the minimum OS is raised.

---

## Previous bad attempts (what to avoid and why)


| Anti‑pattern                                               | Why it felt wrong                                                                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**Settings { }` scene**                                   | System preferences window styling can **diverge** from your `WindowGroup` (corner radius, title bar, how titles land). Same SwiftUI modifiers do not guarantee the same **feel** as the document window.                   |
| `**unified(showsTitle: false)` on prefs**                  | Hides the window title strip; `**navigationTitle`** then tends to show **below** the toolbar row → **extra top space** and pane title **not** next to traffic lights / controls.                                           |
| `**ControlGroup` for back/forward in the toolbar**         | Often expands to a **wide bordered capsule** that visually **runs under or over** the traffic lights and reads nothing like Xcode / Apple prefs. Prefer **separate `ToolbarItem`s** in `.navigation`.                      |
| **Leaving default `.sidebarToggle`**                       | Standard `NavigationSplitView` adds the **sidebar toggle** in the title area; for a prefs window it reads as **clutter** under the stoplights. Remove with `**.toolbar(removing: .sidebarToggle)`** on the sidebar column. |
| **Custom glass / pill rows / non‑system toolbar hacks**    | Fights AppKit’s unified bar; hard to keep aligned across OS versions; reads “custom app chrome” instead of **native document + prefs**.                                                                                    |
| **Reusing `showsTitle: false` “because main window does”** | Main window **hides** title on purpose (editor holds the title). Prefs **must** show the pane name in the bar → `**showsTitle: true`** on the prefs `Window` only.                                                         |


---

## Moving forward: quick checklist

When touching macOS prefs chrome, ask:

1. Are we still a `**Window**` (not `Settings`) so chrome matches the main app?
2. Is prefs still `**unified(showsTitle: true)**` so the active pane title lives **in the title bar**?
3. Are back/forward **individual toolbar items**, not a stretched `ControlGroup`?
4. Is the sidebar toggle **removed** and sidebar **toolbar transparency** aligned with `NoteListColumn`?
5. Did we avoid introducing a **second title row** or **extra top inset** under the unified bar?

If any answer is no, expect the UI to drift back toward the older “gross” attempts.
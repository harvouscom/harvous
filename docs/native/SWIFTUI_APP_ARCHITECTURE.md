# Harvous native app: SwiftUI structure (macOS + iOS)

This document describes how the Harvous **multiplatform** SwiftUI app is organized in `native/Harvous/`. It assumes you are comfortable with React-style “UI as a function of state” and want SwiftUI vocabulary mapped to that mental model.

For a **macOS-only, tutorial-style** walkthrough (React/web framing, glossary with web tie-ins, named Harvous functions, and how the editor bridges to AppKit), see [MACOS_SWIFTUI_NATIVE_APP_GUIDE.md](MACOS_SWIFTUI_NATIVE_APP_GUIDE.md).

---

## 1. SwiftUI fundamentals (in one paragraph)

- **Declarative UI:** You describe *what* should be on screen given current data, not imperative step-by-step updates. When `@State`, `@Published`, or SwiftData models change, SwiftUI **re-evaluates** affected `body` properties and **diffs** the result against the last frame.
- `**View`:** A lightweight **description** of UI (a struct conforming to `View` with a `body`). Views are often recreated; long-lived behavior lives in `**ObservableObject`**, `**@StateObject**`, or **models**.
- **Environment:** Values “inherited” down the tree without passing parameters (`@Environment`, `.environmentObject`). Examples: `modelContext`, `openWindow` (macOS), `colorScheme`.
- **Bindings (`Binding<T>`):** Two-way connection: child can read and write a value owned by the parent (e.g. `selectedNote` in sidebar ↔ detail).

Official docs: [SwiftUI essentials](https://developer.apple.com/documentation/swiftui), [App organization](https://developer.apple.com/documentation/swiftui/app-organization).

---

## 2. App entry: `App`, `Scene`, and windows

**File:** `HarvousApp.swift`


| Concept                             | Role in Harvous                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `@main`                             | Marks the process entry type.                                                     |
| `struct HarvousApp: App`            | Defines **scenes** (windows / window groups) and shared modifiers.                |
| `WindowGroup { ... }`               | Primary **document-style** window (one or more instances). Hosts `ContentView()`. |
| `.modelContainer(for: [Note.self])` | Attaches **SwiftData** persistence for `Note` to the scene hierarchy.             |
| `.commands { HarvousCommands() }`   | Registers **menu bar** commands (macOS primary; iPad also gets some).             |


macOS-only on the main scene:

- `**.windowToolbarStyle(.unified(...))`** — title bar and toolbar share one “glass” strip (Apple Mail–style).
- `**.defaultSize` / `.windowResizability**` — initial window geometry and minimum size behavior.

macOS **Settings** is intentionally a separate `**Window`**, not `Settings { }`, so its chrome matches the main window (see comment in `HarvousApp.swift`). It is opened with `**openWindow(id:)**` and `**defaultLaunchBehavior(.suppressed)**` so it does not auto-open at launch.

---

## 3. Root UI: `ContentView` and platform roots

**File:** `ContentView.swift`

- `**ContentView`** is thin: it injects `**HarvousAppRouter**` via `**.environmentObject(appRouter)**` (from `HarvousApp`) and switches on platform:
  - **macOS:** `MacRootView`
  - **iOS:** `iOSRootView`
- **Deep links:** `harvous://…` URLs are normalized in `**HarvousPendingRoute`** and applied in platform-specific handlers (`onOpenURL`, `applyMacDeepLink`, `appRouter.applyPendingDeepLink()`).

**Router:** `App/HarvousAppRouter.swift` — an `**ObservableObject`** with `**@Published**` properties for cross-tab / cross-window UI state (e.g. which iOS tab is selected, compose sheet visibility, navigation path for “You” / settings). macOS settings deep link state also lives here (`macSettingsDeepLink`).

---

## 4. macOS layout: split view + stack + inspector

**Type:** `MacRootView`


| SwiftUI piece                                  | Purpose                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `**NavigationSplitView`**                      | **Sidebar column** + **detail column** (Apple Notes / Mail pattern). Sidebar width uses `**navigationSplitViewColumnWidth(min:ideal:max:)`**.          |
| `**NavigationStack**` (in detail)              | Pushes **navigation destinations** inside the detail column if you add linked navigation later.                                                        |
| `**NoteEditorView(note:showInspector:)`**      | Main editor; `**Binding<Note?>**` keeps sidebar selection and editor in sync.                                                                          |
| `**.toolbar { ToolbarItem(placement: ...) }**` | Leading (`**.navigation**`) vs trailing (`**.confirmationAction**`) slots differ between iOS and macOS; Harvous uses placements that read well on Mac. |
| `**.focusedSceneValue(\.newNoteAction, …)**`   | Exposes closures to **menu commands** without global singletons (`HarvousCommands` reads `@FocusedValue`).                                             |
| `**.overlay { SpotlightSearchView }`**         | Full-window search overlay toggled by state / shortcut.                                                                                                |


**Sidebar:** `Views/SidebarPanelView.swift` (macOS-only compile) wraps `**NoteListColumn`** in a `**NavigationStack**` and puts `**SpaceSwitcherView**` in the toolbar.

---

## 5. iOS layout: tabs, sheets, and navigation path

**Type:** `iOSRootView`


| SwiftUI piece                                              | Purpose                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `**TabView(selection:)`**                                  | Four tabs: Notes, Search, Library, You. `**$appRouter.iosSelectedTab**` binds selection to the router.                                        |
| `**NavigationStack**` per tab                              | Independent stacks per tab (standard iOS pattern).                                                                                            |
| `**NavigationStack(path: $appRouter.youNavigationStack)**` | **Programmatic navigation** for the You tab: push settings list and detail screens by mutating the path array (`HarvousYouNavigation` cases). |
| `**.sheet(isPresented: $appRouter.iosShowCompose)`**       | `**ComposeView**` as a modal sheet with `**.presentationDetents**` (bottom sheet / large detent).                                             |
| **FAB**                                                    | Floating `**Button`** in a `**ZStack**` over the tab bar (not a system tab item).                                                             |


When you design iOS features, ask: *Does this belong in a tab, a pushed screen on a stack, or a sheet?* That choice maps directly to these constructs.

---

## 6. Data layer: SwiftData

**Model:** `Models/Note.swift` — `@Model final class Note` with properties persisted by SwiftData.

**Access:**

- `**@Environment(\.modelContext)*`* — insert, delete, save (`ModelContext`).
- `**@Query**` (where used in list views) — declarative fetch tied to SwiftUI updates.

**Editor persistence:** `Views/NoteEditorView.swift` uses a small `**EditorAutosaveDebouncer`** (a `class` held in `**@State**`) so **keystrokes do not re-save SwiftData on every `body` evaluation** — an important pattern when a rich editor is in the hierarchy.

---

## 7. Rich text editor (platform differences)

**Shared concept:** “Note body” is stored as **plain text** on `Note` with `**detectedRefs`**; scripture **pills** are AppKit/UIKit text attachments in the live editor.

**Files:**

- `**Editor/HarvousEditor.swift`** — large; contains `**NSTextView**`-backed logic on macOS and branches for iOS where behaviors differ (attachments, horizontal rules, inline images on Mac, etc.).
- `**Editor/EditorProxy.swift**` — macOS coordinator / bridge for SwiftUI ↔ `NSTextView`.
- `**Editor/IOSNoteBodyProxy.swift**` — iOS-specific body editing path.

When you spec a feature that touches typing, selection, or pills, expect **conditional compilation (`#if os(macOS)` / `#if os(iOS)`)** or separate types — the two platforms do not share one text stack.

---

## 8. Design system and settings

- **Colors / typography / shapes:** `DesignSystem/` (`HarvousColors`, `HarvousTypography`, `HarvousFonts`, …). Prefer these over scattered magic numbers so macOS and iOS stay visually aligned.
- **Settings IA:** `docs/native/PROFILE_PREFERENCES_IA.md` — product-facing map of settings screens.
- **Settings types:** `App/HarvousSettingsRoute.swift` — sidebar items, translation list, avatar tokens, parsers for deep links into settings.

---

## 9. OS integrations (Recall, menus, widgets)

**Services/** — calendar, Live Activities, notifications, Spotlight indexing, snapshot writers, etc. Many entry hooks are called from `**ContentView`** / `**HarvousApp**` `**.task` / `.onAppear**` (authorization, launch hooks).

**Intents / widgets:** `Intents/`, `HarvousWidget/` — Shortcuts, widgets, and Live Activities share **app group** and snapshot models under `**Recall/`** (`HarvousAppGroup`, `RecallSharedModels`, …).

Feature work that surfaces outside the main window (widget, Siri, notification) almost always touches **multiple targets** in the Xcode project, not only the main app target.

---

## 10. Checklist: designing a feature for *both* macOS and iOS

1. **Chrome:** Mac uses **split view + inspector + menu commands**; iPhone uses **tabs + sheets + push**. Where does the user discover it?
2. **Navigation:** Is state in `**HarvousAppRouter`** (cross-tab / deep link) or local `**@State**` (single screen)?
3. **Persistence:** Does it need a new `**@Model`** field or a separate store? Any migration story for existing installs?
4. **Editor:** If it changes the note body, do both `**EditorProxy`** / `**IOSNoteBodyProxy**` paths need updates?
5. **Keyboard / pointer:** Mac expects **shortcuts** and **hover**; iOS expects **safe areas**, **keyboard avoidance**, and **haptics** where appropriate.
6. **Windowing (Mac):** Should it be a **sheet**, **inspector**, **new `Window` scene**, or inline in the split view?
7. **Presentation (iOS):** **Sheet**, **fullScreenCover**, **navigationDestination**, or **tab**?
8. **Conditional compilation:** Prefer `**#if os(macOS)`** in small glue views; avoid spreading platform `if` everywhere inside one huge `body` without extracting subviews.

---

## 11. Directory map (high level)


| Area / module                           | Typical contents                                           |
| --------------------------------------- | ---------------------------------------------------------- |
| `HarvousApp.swift`                      | Scenes, model container, recall registration               |
| `ContentView.swift`                     | `MacRootView` / `iOSRootView`, deep link wiring            |
| `App/`                                  | Router, settings routes, macOS preferences window roots    |
| `Views/`                                | SwiftUI screens: lists, editor shell, sidebars, sheets     |
| `Editor/`                               | Text system, scripture pills, parsers                      |
| `Models/`                               | SwiftData `@Model` types                                   |
| `Services/`                             | Side effects: network verse fetch, notifications, indexing |
| `DesignSystem/`                         | Tokens shared across platforms                             |
| `Intents/`, `HarvousWidget/`, `Recall/` | Extensions and shared payloads                             |


---

## 12. Vocabulary cheat sheet


| Term                          | Plain language                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Scene`                       | Something the system can show (window group, single window, menu bar extras in other apps).            |
| `NavigationSplitView`         | Sidebar + optional inspector + detail; canonical Mac/iPad layout.                                      |
| `NavigationStack`             | Push/pop stack of screens (iPhone primary; also used inside columns).                                  |
| `ToolbarItem(placement:)`     | Adds a control to the navigation bar or window toolbar; placements differ by platform.                 |
| `environmentObject`           | Dependency injection for reference-type `**ObservableObject**` observable by `**@EnvironmentObject**`. |
| `@State`                      | Value owned by this view; changes trigger re-render.                                                   |
| `@StateObject`                | Creates and owns an `**ObservableObject**` for the view’s lifetime (use for view models).              |
| `Binding`                     | Read/write bridge to parent state.                                                                     |
| `.sheet` / `.fullScreenCover` | Modal presentation from a boolean or item binding.                                                     |
| `ModelContext`                | SwiftData unit of work (save/delete/fetch).                                                            |


This should be enough to read `native/Harvous/` confidently and to write specs that name the right SwiftUI building blocks for each platform.
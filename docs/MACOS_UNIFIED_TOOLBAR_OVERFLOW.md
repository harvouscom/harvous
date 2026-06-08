# macOS unified toolbar overflow (“more”) during NavigationSplitView sidebar transitions

Internal engineering note — **not** user-facing release copy.

## Summary


| Topic                  | Status                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Symptom**            | AppKit toolbar **overflow** (“more” chevron) **flashing** on **sidebar expand** (especially `.detailOnly` → `.all`) **or inspector expand**, not necessarily at steady-state widths.        |
| **Cause (hypothesis)** | Unified toolbar + animated split: AppKit **re-evaluates overflow per animation tick** during column interpolation; transient frames can request overflow even when **final** geometry fits. |
| **Primary fix**        | Instant-commit pattern on `MacRootView`: `**animatedSplitVisibility`** for sidebar expand from `.detailOnly`, and `**animatedInspectorBinding`** for inspector expand. Both use `Transaction.disablesAnimations = true`; **collapse** keeps default slide / spring. |
| **Secondary fix**      | **Width budget**: sidebar `**max: 300`**, window `**minWidth: 980**` — defense for **steady-state** narrow windows; **did not** remove transition flash by itself.                          |
| **Rejected**           | AppKit view hunting, grace timers alone, compact/merged toolbars, moving sidebar or detail placements, document chrome for collection/share.                                                |


## Problem

With `.windowToolbarStyle(.unified(showsTitle: false))` ([HarvousApp.swift](../native/Harvous/HarvousApp.swift)), the **sidebar** and **detail** SwiftUI toolbars share **one** NSToolbar row. When the user reveals the sidebar from `**NavigationSplitViewVisibility.detailOnly`** (collapsed chrome / ⌘sidebar toggle / title-bar control), AppKit can **briefly** show the overflow chevron. The pain point is **animation-linked flash**, not only “window too narrow.”

## Constraints (do not violate without explicit product sign-off)

- **Sidebar**: Spaces + lists stay in `**ToolbarItemGroup(placement: .automatic)`** — [SidebarPanelView.swift](../native/Harvous/Views/SidebarPanelView.swift).
- **Detail**: Toolbar stays as built in `**MacRootView`** ([ContentView.swift](../native/Harvous/ContentView.swift)): new note, optional macOS 26 `ToolbarSpacer`s, collection chip, share/more, inspector + profile — **no reshuffling** to chase overflow (prior attempts visibly moved trailing controls).
- **No** arbitrary sleep/grace as the sole fix ([AGENTS.md](../AGENTS.md)); lifecycle-aligned behavior (e.g. disabling animations on expand) is acceptable.

## Current architecture (facts to preserve)


| Component                         | Location / behavior                                                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unified toolbar style             | `HarvousApp` main `WindowGroup`: `.windowToolbarStyle(.unified(showsTitle: false))`.                                                                                                                                                      |
| Split visibility source of truth  | `MacRootView`: `@State private var splitColumnVisibility`.                                                                                                                                                                                |
| **Animated binding**              | `animatedSplitVisibility`: wraps state for `**NavigationSplitView`** and `**SidebarPanelView**` binding — expand **from `.detailOnly`** uses `Transaction { disablesAnimations = true }`; other transitions assign normally.              |
| **Inspector binding**             | `animatedInspectorBinding`: wraps `showInspector`. Expand (`false → true`) uses `Transaction { disablesAnimations = true }`; collapse (`true → false`) wraps in `withAnimation(HarvousAnimation.spring)`. Both toolbar button and `toggleInspectorAction` focused-scene path route through it.   |
| Sidebar column sizing             | `.navigationSplitViewColumnWidth(min: 230, ideal: 260, max: 300)`. `**max**` tied to width budget; keep `**min**` in sync with `narrowColumnToolbarSuppressBelow` logic (230 vs 210 — see below).                                         |
| Inspector column sizing           | `.inspectorColumnWidth(min: 240, ideal: 280, max: 320)` on `NoteInspectorView` — see [NoteEditorView.swift](../native/Harvous/Views/NoteEditorView.swift).                                                                                |
| Window minimum (macOS)            | `ContentView()` in main `WindowGroup`: `.frame(minWidth: 980)`.                                                                                                                                                                           |
| Sidebar toolbar chrome visibility | `showSidebarToolbarChrome`: omit SwiftUI sidebar toolbar when measured width in `**(0 ..< 210)**` (`narrowColumnToolbarSuppressBelow`), but **show** when `**width == 0`** so expand from `detailOnly` does not blank the space switcher. |
| Column width measurement          | `SidebarColumnWidthPreferenceKey` + `GeometryReader` on sidebar stack; `sidebarColumnMeasuredWidth`.                                                                                                                                      |


**Invariant:** Any logic keyed to “split minimum width” should align `**navigationSplitViewColumnWidth(min:)`** (currently **230**) with documentation and any overflow-related thresholds.

## Root cause (hypothesis, detailed)

1. **No public API** to disable NSToolbar overflow for SwiftUI-hosted unified toolbars.
2. **Animated split** exposes **intermediate widths** each frame; overflow logic may run against **interpolated** layout, not just endpoints — so **width budget at steady state** can still flash mid-animation.
3. **Instant expand** aims for **one layout commit** at post-expand widths so overflow is evaluated once, matching the **final** column arrangement.

## History — approaches tried and outcomes

1. **Omit sidebar `toolbar` when column narrow** (`narrowColumnToolbarSuppressBelow` = 210, `width == 0` exception) — helps SwiftUI chrome behavior; **does not** remove NSToolbar overflow for the unified row alone.
2. `**NSViewRepresentable` overflow hiding** — traverse hierarchy, heuristics, timers, deferred restore — **unreliable**, fragile across OSes, Swift 6 noise; **removed**.
3. **Grace deadlines** — reduced flash slightly with (2); **not** a standalone fix; **removed** with suppressor.
4. **Compact toolbar** (fewer items / merged groups) — **rejected** (reordered unified strip / inspector+profile).
5. **Collection + share/more in editor chrome** — **rejected** (wrong UX).
6. **Bump sidebar min/ideal only** — minor; **not** sufficient alone.
7. **Transition-only suppressor** — same as (2)+(3); **removed**.
8. **Width budget** (`max` 300, `minWidth` 980) — **kept** for narrow-window steady state; **did not** fix transition flash alone.
9. `**animatedSplitVisibility` / instant expand** — **current** mitigation for `**.detailOnly → *`** flash.

## Principles for future changes

1. Prefer **layout semantics** (animation, constraints, budgets) over **private AppKit hacking**.
2. **Preserve** sidebar `.automatic` + detail placements unless product explicitly changes IA.
3. If overflow **still** flashes after instant expand: treat as **possible AppKit limitation** → **Feedback Assistant** + minimal repro; avoid reopening class-name suppression without DTS guidance.

## Related bugs — split-edge compose orb desync

| Topic | Status |
|---|---|
| **Symptom** | During live sidebar **divider drag**, the New Note compose **glyph** can track the detail column while its **`.bordered` glass capsule** stays at the prior x-position (ghost orb in the sidebar cluster). |
| **Mitigation** | `MacRootView` reads live width via `SidebarPanelView.reportedSidebarColumnWidth` and applies `.id(Int(width.rounded()))` + `disablesAnimations` on the compose `ToolbarItem` so AppKit recreates bordered chrome each frame. SwiftUI-native orb `ButtonStyle` alone did not fix (unified toolbar still hosts desynced layers). |

## Manual verification (when touching this area)

1. Default window (~1100×720), note selected (chip + share mounted): `**.detailOnly` → expand** via title-bar sidebar control and keyboard — sidebar should **snap** (no slide); watch for overflow flash.
2. **Collapse** (→ `.detailOnly`) — **slide** animation should match prior behavior; no flash expected.
3. Drag window to **minimum width** (~980); repeat expand/collapse; drag split to **sidebar max** (300).
4. Rapid toggle **many times** — no stuck visibility, no obvious glitches.
5. Spot-check **macOS 15** (no `ToolbarSpacer`) vs **macOS 26** (with spacers).
6. Very **long collection** chip label — if steady-state overflow appears, consider chip truncation separately (not this doc’s scope).
7. With sidebar expanded, repeatedly **open and close the inspector** at minimum window width (~980) and at sidebar `max` (300). Overflow chevron should not flash on inspector expand; close should still spring-animate. Verify both the toolbar button and the keyboard-shortcut path (focused scene value) route through `animatedInspectorBinding`.
8. Sidebar expanded: drag split divider between **min (240)** and **max (300)** — compose pencil and bordered orb stay aligned; no ghost orb after drag ends.

## If this doc goes stale

Update the **Summary** table and **Current architecture** when changing:

- [native/Harvous/ContentView.swift](../native/Harvous/ContentView.swift) — `MacRootView`, `animatedSplitVisibility`, split widths, detail toolbar.
- [native/Harvous/HarvousApp.swift](../native/Harvous/HarvousApp.swift) — unified style, `minWidth`, default size.
- [native/Harvous/Views/SidebarPanelView.swift](../native/Harvous/Views/SidebarPanelView.swift) — sidebar toolbar, `showSidebarToolbarChrome`, preference key.

## Possible directions (still unshipped)

- **Feedback Assistant / DTS** with unified toolbar + `NavigationSplitView` repro if flash persists.
- **Fewer detail toolbar slots** (menus / inspector-only) — product tradeoff.
- **WWDC / SDK** — watch for toolbar or split APIs.


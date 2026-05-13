# Native prototype: scripture pill light/dark fix and working-tree hygiene checkpoint

Internal engineering note for the `native-prototype` branch. Written 2026-05-12 so that, if we have to step away and come back, we can re-enter the same state without losing the recent Mac/iOS build work.

## Summary

| Topic | Status |
| --- | --- |
| **Symptom** | Text and inner-edge wash inside scripture pills stayed baked in the *previous* light/dark mode after the system appearance toggled. Pills in the editor body and in the title row both showed the bug. |
| **Root cause** | `ScripturePillAttachment.renderPill(...)` rasterizes the pill into an `NSImage` / `UIImage`. Dynamic system colors (`NSColor.labelColor` / `UIColor.label`) are resolved against the *current* appearance at draw time and frozen into that bitmap, so the cached image keeps showing the old appearance until something forces a re-raster. |
| **Fix (editor-embedded pills)** | Each text-view subclass (macOS `HarvousNoteTextView`, iOS `HarvousBodyTextView`) observes appearance changes (`viewDidChangeEffectiveAppearance` / `traitCollectionDidChange`), walks the text storage's `.attachment` ranges, calls a new `ScripturePillAttachment.refreshRasterForCurrentAppearance()`, and invalidates the corresponding glyph display. iOS rebuilds the rasters inside `traitCollection.performAsCurrent { ... }` so `UIGraphicsImageRenderer` resolves dynamic colors against the *new* trait collection. |
| **Fix (title-row pills in SwiftUI)** | `NoteEditorView.titleScripturePillsRow` keys its `FlowLayout` on the active `colorScheme` via `.id(colorScheme)`. SwiftUI then discards the previous-mode `Image` identities and re-rasterizes against the new appearance. |
| **Branch state at writing** | `native-prototype` clean, fully pushed to `origin/native-prototype`. HEAD = `ea5e534a`. |

## Where the work landed

Two commits on `native-prototype`, both pushed:

1. **`5e17a5c6` — fix native scripture pill appearance refresh** (3 files, +105 lines)
   - [`native/Harvous/Editor/ScripturePillAttachment.swift`](../native/Harvous/Editor/ScripturePillAttachment.swift) — adds `refreshRasterForCurrentAppearance()` for both macOS and iOS variants. Re-runs `Self.renderPill(...)`, replaces `self.image`, and recomputes `self.bounds` against the same descender/`kVPad` formula used at construction.
   - [`native/Harvous/Editor/HarvousEditor.swift`](../native/Harvous/Editor/HarvousEditor.swift) — overrides `viewDidChangeEffectiveAppearance()` (macOS) and `traitCollectionDidChange(_:)` (iOS, gated on `hasDifferentColorAppearance(comparedTo:)`); both call a private `refreshScripturePillRastersForCurrentAppearance()` that walks `textStorage`'s `.attachment` runs and invalidates glyph display. iOS wraps the walk in `traitCollection.performAsCurrent { ... }`.
   - [`native/Harvous/Views/NoteEditorView.swift`](../native/Harvous/Views/NoteEditorView.swift) — `.id(colorScheme)` on the `FlowLayout` inside `titleScripturePillsRow`, with a comment explaining why the editor host has its own refresh path.

2. **`ea5e534a` — checkpoint native prototype build assets** (~50 files)
   - Captures every previously uncommitted Mac/iOS prototype change so the branch is reproducible. See [Working-tree hygiene checkpoint](#working-tree-hygiene-checkpoint) below for the inventory and the *reason this commit exists*.

## Why the fix works

`ScripturePillAttachment.renderPill(...)` calls into `UIGraphicsImageRenderer` (iOS) and `NSImage(size:flipped:drawingHandler:)` (macOS). Both rasterize *eagerly* against whatever appearance is current at draw time. Anything inside the pill that was specified as `NSColor.labelColor` / `UIColor.label` (the reference text, the inner-edge wash) becomes a fixed RGBA value in that bitmap. SwiftUI re-evaluating the `Image(...)` view does not help, because the same `NSImage` / `UIImage` instance is being handed back.

The two fix sites correspond to the two ways those bitmaps reach the screen:

- **TextKit attachments** — owned by `NSTextStorage`. SwiftUI never re-creates them on `colorScheme` change because the `NSTextView` / `UITextView` outlives the body re-evaluation. We need an AppKit/UIKit-side hook (`viewDidChangeEffectiveAppearance` / `traitCollectionDidChange`) to mutate each attachment's `image` and tell the layout manager to repaint.
- **SwiftUI title row** — recreates `Image(nsImage:)` / `Image(uiImage:)` on every body call, but SwiftUI's structural identity sees an `Image` of "same size, same role" and reuses its rendering. `.id(colorScheme)` forces a new identity at the `FlowLayout` level so the cached pill bitmaps are dropped and re-rasterized.

If either fix is reverted, only that surface regresses; they are independent.

### Reproduction (manual)

1. Run `Harvous_macOS` (or `Harvous_iOS`).
2. Open any note that has at least one scripture pill in the body and one in the title.
3. Toggle macOS Appearance (System Settings → Appearance) or iOS Dark Mode.
4. **Before fix**: pill reference text and inner-edge wash stay in the prior mode until you scroll the run off-screen and back, edit the text, or relaunch.
5. **After fix**: both surfaces repaint immediately on the toggle.

### Touchpoints to be careful around

- The bounds math in `refreshRasterForCurrentAppearance()` mirrors the construction-time math (`refFont.descender - kVPad`). If `kVPad` or the reference font weight/size ever changes, both the constructor and this refresh path must be updated together. Drift here will manifest as pills that *jump* a pixel or two on appearance toggle.
- iOS *must* keep the `traitCollection.performAsCurrent { ... }` wrapper. Without it, `UIGraphicsImageRenderer` may resolve dynamic colors against the window scene's previous trait collection on the first invalidation pass and re-bake the wrong appearance.
- The macOS host walks `.attachment` runs sequentially with a `next <= idx { break }` guard. If a future change starts inserting zero-length attachment runs, that guard prevents an infinite loop but will skip later pills — verify with the diagnostic in [`HarvousBodyRichTextDiagnostics.swift`](../native/Harvous/Editor/HarvousBodyRichTextDiagnostics.swift).
- If anyone introduces another rasterized SwiftUI surface (e.g. a sidebar pill preview), it needs its own `.id(colorScheme)` or it will reproduce the original bug. The TextKit side is now self-healing for *all* `ScripturePillAttachment` instances in the body.

## Working-tree hygiene checkpoint

Before we landed the pill fix, `git status` on `native-prototype` was carrying ~42 modified files and several untracked groups of assets. Some of that work was hours old and would have been clobbered by a `git restore` / `git clean` / `xcodegen generate` cycle. The `ea5e534a` checkpoint commit captures all of it so the branch can be re-created on a fresh machine and so future Xcode builds reference the same on-disk assets the local builds were consuming.

### What was in the checkpoint

- **Pill UX siblings** — `BibleStudyTagSuggester.swift`, `ContentView.swift`, `MorphingChromeBar.swift`, `FolderChipPopover.swift`, `DailyPassageCard.swift`, `HarvousEditor.swift` (Dynamic Type rework, separate from the appearance refresh), `HarvousFonts.swift`, `EditorFormatCommands.swift`, `HarvousAppRouter.swift`, `ActiveHighlightDock.swift`, `ActiveScripturePillDock.swift`, `HighlightAnnotationPopover.swift`, `EditorProxy.swift`, `HarvousBodyRichTextDiagnostics.swift`, `NoteBodyAttachments.swift` (the `kVPad: 6 → 4` shift and the `scripturePillEffectiveAppearanceIsDark` `MainActor` refactor), `ThreadStore.swift`, `HomeHubView.swift`, `LibraryView.swift`, `NoteFeedRow.swift`, `NoteListColumn.swift`, `ScriptureHubView.swift`, `ScripturePassageView.swift`, `StatefulNoteEditorView.swift`, `StudyHighlightFeedRow.swift`, `StudyHighlightListColumn.swift`, `TagChipViews.swift`, `HarvousShape.swift`, `HarvousTypography.swift`.
- **App icon swap** — `Assets.xcassets/AppIcon.appiconset/Contents.json` now references `app-icon.png`; the old `Icon-iOS-Default-1024x1024@1x.png` is deleted; the new `app-icon.png` is added. *Half-applied before the checkpoint*: deleting only one of the three would have left the Asset Catalog in an unbuildable state.
- **New imagesets** — `Harvous.Camera.imageset`, `Harvous.Star.imageset`, `Harvous.Wrench.imageset` (each with its `.svg` and `Contents.json`). These are referenced from the new toolbar/glyph work in `MorphingChromeBar.swift` / `FolderChipPopover.swift`; without them, those files do not compile.
- **Build configuration drift** — `project.yml` (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` bumped `0.2.3 → 0.2.4`), `Info.plist` (`NSCameraUsageDescription` added — required for the new camera glyph code path), `Harvous_iOS.xcscheme` (`LastUpgradeVersion = 2640`), `Harvous_macOS.xcscheme` (Xcode-restructured test plan / target configuration plus `LastUpgradeVersion = 2640`).
- **Hook-generated files** — `Changelog/1.216.31.md`, `package.json` version bump, `public/sw.js` version pin, `README.md` update, `docs/BIBLE_STUDY_TAG_SUGGESTER_TUNING.md`. These come from local commit hooks and are expected on the branch; do not regenerate them by re-running scripts.

### Ignore-rule change

`**/xcuserdata/` is now in [`.gitignore`](../.gitignore) (right under the existing `native/Harvous/build/` block). The previously tracked `native/Harvous/Harvous.xcodeproj/project.xcworkspace/xcuserdata/heyderekj.xcuserdatad/UserInterfaceState.xcuserstate` was untracked in the same commit. Going forward, every developer's per-user Xcode UI state is ignored — no more spurious `git status` noise after opening Xcode.

### What this protects

If a future task does any of the following on this branch, the checkpoint is what you fall back to:

- `xcodegen generate` rerun (rewrites `project.pbxproj` from `project.yml`).
- `git clean -fdx native/` (removes derived data, but also any *untracked* asset folders if forgotten).
- Branch switch + return without a stash.
- New machine clone.

In all four cases, `git checkout ea5e534a -- native/` restores a known-buildable Mac+iOS prototype.

## Build verification at checkpoint time

Both schemes built successfully against the checkpoint:

- `Harvous_macOS` — Debug, local Mac destination.
- `Harvous_iOS` — Debug, iOS Simulator. (Note: the iOS simulator on this machine has hit transient `CoreSimulator is out of date` errors; that is an environment issue, not a code defect. The build itself completed on this branch state.)

If a future build fails after `xcodegen generate` or a clean checkout, sanity-check in this order:

1. Asset Catalog has `app-icon.png` (not `Icon-iOS-Default-1024x1024@1x.png`).
2. `Harvous.Camera`, `Harvous.Star`, `Harvous.Wrench` imagesets are present.
3. `Info.plist` contains `NSCameraUsageDescription`.
4. `project.yml` is at `MARKETING_VERSION = 0.2.4`, `CURRENT_PROJECT_VERSION = 0.2.4`.
5. `.xcscheme` files are at `LastUpgradeVersion = 2640`.

## Returning to this work

If you switch to `native-prototype` later and need to pick up exactly where we left off:

```bash
git fetch origin
git checkout native-prototype
git reset --hard origin/native-prototype  # only if local is behind/diverged
git log --oneline -5                       # expect ea5e534a, 5e17a5c6 at the top
```

Then in Xcode:

```bash
cd native/Harvous
xcodegen generate                          # only if project.pbxproj is missing or stale
open Harvous.xcodeproj
```

Build `Harvous_macOS` first; if it fails, run the five-step Asset Catalog / `Info.plist` / version sanity check above before touching anything else. Build `Harvous_iOS` only after macOS is green — it shares the same `ScripturePillAttachment` and editor refresh paths, so a macOS regression usually means the iOS build will also fail at the same call sites.

## Related docs

- [`docs/SCRIPTURE_PILL_IMPLEMENTATION.md`](SCRIPTURE_PILL_IMPLEMENTATION.md) — overall scripture pill architecture (web + shared concepts).
- [`docs/MACOS_UNIFIED_TOOLBAR_OVERFLOW.md`](MACOS_UNIFIED_TOOLBAR_OVERFLOW.md) — sibling native-prototype writeup; same documentation style.
- [`AGENTS.md`](../AGENTS.md) — top-level repo conventions, including the "no arbitrary delays" rule that informed using `viewDidChangeEffectiveAppearance` / `traitCollectionDidChange` instead of timers.

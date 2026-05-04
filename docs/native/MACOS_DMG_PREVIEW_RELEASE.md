# macOS preview DMG and GitHub Releases (unsigned)

This document is for **maintainers** who ship the **Harvous native Mac app** as an **unsigned preview** DMG for testers (via **GitHub Releases**). End-user install and Gatekeeper steps live in [`help/mac-native-app.md`](../../help/mac-native-app.md).

## Prerequisites

- **Xcode** (current stable recommended)
- **XcodeGen** — [`native/Harvous/project.yml`](../../native/Harvous/project.yml) is the source of truth; run `xcodegen generate` from `native/Harvous/` after changing versions or project structure
- **GitHub CLI** (`gh`) — authenticated (`gh auth login`) for scripted releases
- **`create-dmg`** — optional but recommended for a polished disk image (install the CLI tool locally; this is unrelated to distributing Harvous via Homebrew)

Harvous macOS target:

| Item | Value |
| --- | --- |
| Xcode project | `native/Harvous/Harvous.xcodeproj` |
| Scheme | `Harvous_macOS` |
| Release product | `Harvous.app` |
| Bundle ID | `com.harvous.app` |

## Why testers see security prompts

Preview builds use **signing disabled** in Xcode project settings (`CODE_SIGN_IDENTITY = "-"`, suitable for local dev and ad-hoc sharing). Downloads from the browser get Apple’s **quarantine** attribute. Together, that triggers **Gatekeeper** until the user approves the app or clears quarantine. **Developer ID signing + notarization** would remove most of that friction; this doc assumes **unsigned** preview releases only.

## Versioning (single source of truth)

1. Edit **[`native/Harvous/project.yml`](../../native/Harvous/project.yml)** — set **`MARKETING_VERSION`** and **`CURRENT_PROJECT_VERSION`** (release script sets both to the same semver string, similar to [dinky `release.sh`](https://github.com/heyderekj/dinky/blob/main/release.sh)).
2. From **`native/Harvous/`**, run:

   ```bash
   xcodegen generate
   ```

3. Commit the updated `project.yml` and regenerated `project.pbxproj` when cutting a release so tags match the shipped bundle version.

## Build paths

### Xcode GUI

1. Open **`native/Harvous/Harvous.xcodeproj`**
2. Select scheme **`Harvous_macOS`**, configuration **Release**
3. **Product → Build** (or **Archive** if you prefer Organizer)
4. Take **`Harvous.app`** from the build products folder (**Release**)

Goal: a **Release** build of **`Harvous.app`** for packaging.

### CLI (same as `release.sh` / `package-dmg.sh`)

From **`native/Harvous/`**:

```bash
xcodegen generate
xcodebuild -project Harvous.xcodeproj \
  -scheme Harvous_macOS \
  -configuration Release \
  -destination 'platform=macOS' \
  -derivedDataPath build \
  clean build
```

The app bundle:

`build/Build/Products/Release/Harvous.app`

There is **no** dedicated macOS unit-test target in this repo at the time of writing; the bundled **`release.sh`** does not run `xcodebuild test` (unlike dinky’s full preflight).

## DMG creation

### Option A: `create-dmg` (recommended)

Matches the workflow in **[heyderekj/dinky](https://github.com/heyderekj/dinky)**. Example (adjust version and paths):

```bash
cd native/Harvous
create-dmg \
  --volname "Harvous" \
  "Harvous-0.1.0.dmg" \
  "build/Build/Products/Release/Harvous.app"
```

Optional: add **`dmg-background.tiff`** in `native/Harvous/` and pass **`--background`**, **`--window-size`**, **`--icon`**, and **`--app-drop-link`** for a richer layout (see dinky’s **`release.sh`**).

### Option B: `hdiutil` (no extra tools)

```bash
hdiutil create -volname "Harvous" -srcfolder "build/Build/Products/Release/Harvous.app" \
  -ov -format UDZO "Harvous-0.1.0.dmg"
```

Note: a folder-only DMG behaves differently from a **`create-dmg`** “drag to Applications” layout; **`create-dmg`** is preferable for testers. End-user steps are in **[`help/mac-native-app.md`](../../help/mac-native-app.md)**.

## GitHub Release

Repository: **https://github.com/harvouscom/harvous**

1. Ensure the DMG is named consistently, e.g. **`Harvous-X.Y.Z.dmg`**
2. Tag **`vX.Y.Z`** at the commit that contains the version bump + generated project
3. Create a **GitHub Release** with that tag and **attach the DMG**
4. Link to **`help/mac-native-app.md`** in the release notes for Gatekeeper / quarantine steps

**CLI pattern** (also implemented in **`native/Harvous/release.sh`**):

```bash
gh release create "vX.Y.Z" "Harvous-X.Y.Z.dmg" \
  --title "Harvous Mac X.Y.Z (preview)" \
  --notes-file notes.md \
  --verify-tag
```

## Scripts in this repo

| Script | Purpose |
| --- | --- |
| [`native/Harvous/release.sh`](../../native/Harvous/release.sh) | Bump versions in **`project.yml`**, **`xcodegen generate`**, Release **build**, **`create-dmg`**, optional **`gh release create`** |
| [`native/Harvous/package-dmg.sh`](../../native/Harvous/package-dmg.sh) | **Build + DMG only** (no git tag / `gh`); uses version from **`project.yml`** or **`HARVOUS_VERSION` env** |

Prerequisites listed at the top of each script.

### Reference implementation

[heyderekj/dinky **`release.sh`](https://github.com/heyderekj/dinky/blob/main/release.sh) is the model: same overall flow with Harvous-specific paths, **`project.yml` + XcodeGen**, and **no** Homebrew cask, marketing **`site/`** sed, or updater zip.

## CI (optional, later)

A **`workflow_dispatch`** workflow on a **macOS** GitHub runner could run **`package-dmg.sh`** or a subset. Dinky pins a modern image (e.g. **`macos-26`**) for current Xcode; mirror that when you add CI. Secrets for **Developer ID + notarization** are only needed if you move beyond unsigned previews.

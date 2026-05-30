# Harvous for Mac (preview)

Harvous has a **native macOS app** built with SwiftUI. Preview builds are distributed as a **DMG** attached to **GitHub Releases** for testing and feedback.

- **Requirements:** macOS 14 (Sonoma) or later, on **Apple Silicon or Intel** Macs. Preview DMGs ship as a **universal** app (same download includes both architectures).

## Intel Macs

The preview build is a **universal binary**. If you use an **Intel** Mac and the app will not open, or macOS says it is not supported, report that through your usual feedback channel so we can verify the shipped `Harvous.app` still contains an **x86_64** slice (`lipo -archs` on the main executable should list **arm64** and **x86_64**). Occasional smoke testing on real Intel hardware is the most reliable check; automated builds use `generic/platform=macOS` so both slices are compiled.
- **Source:** Download only from the official repository: **[github.com/harvouscom/harvous/releases](https://github.com/harvouscom/harvous/releases)**.

These preview builds are **not** from the Mac App Store and are **not notarized**. macOS may block the app the first time you open it. That is expected for unsigned preview builds.

## Install

1. Open the downloaded **`.dmg`** file.
2. When the disk image window opens, **drag Harvous onto the Applications folder** shown there (or open **Applications** in Finder and drag **Harvous** in). If your DMG only shows the app with no **Applications** shortcut, drag **Harvous** into **Applications** manually from Finder.
3. Eject the disk image when you are done.

You can also **double-click Harvous** on the mounted volume for a quick test without copying to **Applications** (some macOS versions still recommend copying for day-to-day use).

## First launch and Gatekeeper

Try these in order:

### 1. Open from Finder (recommended first step)

- **Control-click** (or right-click) **Harvous** in Applications, choose **Open**, then confirm.  
  Often this is enough for a preview build.

### 2. System Settings

1. Try opening **Harvous** once (double-click).
2. If macOS blocks it, open **System Settings** (or **System Preferences** on older macOS).
3. Go to **Privacy & Security**.
4. Scroll to the message about Harvous being blocked and click **Open Anyway** (wording can vary slightly by macOS version).

### 3. Remove quarantine in Terminal

Downloads are often marked with Apple’s **quarantine** attribute. You can remove it for the **installed** app (adjust the path if you did not put Harvous in Applications):

```bash
xattr -dr com.apple.quarantine /Applications/Harvous.app
```

If you prefer to clear extended attributes more broadly (less specific than the command above), you can use:

```bash
xattr -cr /Applications/Harvous.app
```

Only run these commands for apps you **intentionally** downloaded from a source you **trust**.

## What we do not recommend

- **Do not** turn off Gatekeeper globally for the whole Mac (for example via broad `spctl` changes). Use the steps above for this app only.
- **Do not** install Harvous via unofficial mirrors. Use **[official GitHub Releases](https://github.com/harvouscom/harvous/releases)** only.

## Feedback

Preview builds are for **testing and feedback**. If something breaks or confuses you, report it through your usual Harvous feedback channel or the GitHub repository’s issues, as directed in the release notes.

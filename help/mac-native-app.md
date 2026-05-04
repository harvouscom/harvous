# Harvous for Mac (preview)

Harvous has a **native macOS app** built with SwiftUI. Preview builds are distributed as a **DMG** attached to **GitHub Releases** for testing and feedback.

- **Requirements:** macOS 14 (Sonoma) or later.
- **Source:** Download only from the official repository: **[github.com/harvouscom/harvous/releases](https://github.com/harvouscom/harvous/releases)**.

These preview builds are **not** from the Mac App Store and are **not notarized**. macOS may block the app the first time you open it. That is expected for unsigned preview builds.

## Install

1. Open the downloaded **`.dmg`** file.
2. Drag **Harvous** into your **Applications** folder (or run it directly from the disk image for a quick test).

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

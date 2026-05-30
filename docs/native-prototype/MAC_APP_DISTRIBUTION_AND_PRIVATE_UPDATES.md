# Mac app distribution, privacy, and updates (native-prototype)

This document is **maintainer guidance** for the Harvous **native Mac** app when the **source repository stays public** (for example `harvouscom/harvous`) but you may want **preview DMGs** or **update metadata** not to live on **public GitHub Releases**. It was written for the **`native-prototype`** branch.

For the concrete **unsigned preview** workflow (XcodeGen, DMG, `gh release create`), see [MACOS_DMG_PREVIEW_RELEASE.md](../native/MACOS_DMG_PREVIEW_RELEASE.md). End-user install and Gatekeeper steps are in [help/mac-native-app.md](../../help/mac-native-app.md).

---

## 1. The constraint: public repo and GitHub Releases

If the GitHub repository is **public**:

- **Release assets** attached to that repo (DMG, zip, and so on) are **public**. Anyone can list releases and download them.
- GitHub does not offer “public code, private release binaries” on the same repository for typical open-source setups.

So you **cannot** rely on **that** repo’s Releases alone if the goal is to keep the Mac binary off the public internet.

---

## 2. Distribution options (summary)

| Approach | Keeps DMG off public Harvous repo? | Notes |
| --- | --- | --- |
| **TestFlight** (Mac) or **Mac App Store** | Yes | Apple-hosted builds and testers or store listing; needs Apple Developer Program and App Store Connect workflow. |
| **Private companion repo** (releases only) | Yes | Example: public `harvous` for source, private `harvous-mac-releases` with GitHub Releases + DMG. Maintainers use `gh` the same way; binaries are not on the public code repo. |
| **Static manifest + file host** | Yes | Small JSON (or similar) lists `version` and `downloadURL`; DMG on Dropbox, R2/S3, your CDN, or an API you control. Same logical flow as a custom in-app updater (see below). |
| **Presigned or short-lived URLs** | Yes | Stronger than a long-lived Dropbox link when you need access control; the app or a server must refresh or issue URLs appropriately. |

**GitHub Actions artifacts** on a **public** repository are generally visible to the same audience as the repo; they are **not** a substitute for private distribution.

---

## 3. Private companion repo and the GitHub Releases API

The [Dinky](https://github.com/heyderekj/dinky) Mac app can poll `https://api.github.com/repos/heyderekj/dinky/releases/latest` and read `tag_name`, `html_url`, and `assets[].browser_download_url` (see [UpdateChecker.swift](https://github.com/heyderekj/dinky/blob/main/Dinky/Services/UpdateChecker.swift)) because **that** repo’s latest release is **public**.

For a **private** releases repository, **unauthenticated** `GET /repos/{owner}/{repo}/releases/latest` returns **401**. Practical patterns:

- **Do not** embed a personal access token in the shipped app to call the private repo API (tokens are extractable from the binary).
- Prefer a **small public manifest** (JSON on HTTPS) that you update when you cut a release, or a **server endpoint** (for example Harvous API) that returns version + download URL without exposing GitHub credentials to the client.

The companion repo remains a good place for **human** or **CI** publishing of DMGs even if the **client** does not call GitHub’s API directly.

---

## 4. Dropbox (or any static HTTPS host) + manifest

You do **not** need TestFlight **only** to keep binaries off GitHub. Dropbox or object storage can host:

1. **A manifest** — for example `{"version":"1.2.0","downloadURL":"https://...","releaseNotesURL":"https://..."}` (fields are up to you; semver compare should match what you ship in `CFBundleShortVersionString`).
2. **The DMG or zip** — URL must be a **direct download** (raw bytes), not an HTML interstitial. For Dropbox shared links, callers typically use `dl=1` or the `dl.dropboxusercontent.com` form so `URLSession` receives the file.

**Caveats:**

- **Bandwidth and fair use** on consumer Dropbox accounts may be limiting at scale; object storage + CDN is often better for wide distribution.
- **Link “privacy”** is usually **obscurity** (long unguessable URL). Anyone with the link can download unless you add stronger controls (signed URLs, auth, and so on).
- If you move or rename files, **links break**; keep a dedicated folder and a stable manifest URL.

---

## 5. In-app “check for updates” without Sparkle

[Dinky’s UpdateChecker](https://github.com/heyderekj/dinky/blob/main/Dinky/Services/UpdateChecker.swift) implements **check → semver compare → download → install** using `URLSession` and a deferred shell script to replace the bundle. **Sparkle** is not required for that pattern.

For Harvous, the same architecture applies whether the feed is:

- GitHub `releases/latest` **JSON** (public repo only), or  
- Your **manifest URL** (Dropbox, S3, static site, or API).

Harvous does **not** ship this updater in-tree as of this writing; this doc only records the design space. [Dinky’s `release.sh`](https://github.com/heyderekj/dinky/blob/main/release.sh) remains a useful reference for tagging, DMG, and release hygiene alongside [MACOS_DMG_PREVIEW_RELEASE.md](../native/MACOS_DMG_PREVIEW_RELEASE.md).

---

## 6. Apple Developer Program: signing vs TestFlight

- **Developer ID signing + notarization** — Reduces Gatekeeper friction for apps distributed **outside** the Mac App Store (DMG or zip from the web). This is about **trust on the Mac**, not about hiding the URL.
- **TestFlight (Mac) or the Mac App Store** — **Distribution channels** managed by Apple; good when you want invited testers or a store listing without publishing the DMG on GitHub.

Neither is strictly required **only** to “keep files off GitHub”; any **private** host + manifest can do that. They **are** relevant when you want **production-quality** installs and Apple-managed distribution.

---

## 7. Merge note

If **`native-prototype`** is merged into **`main`**, this file will appear on `main` unless the merge explicitly excludes it. Treat this doc as **prototype-branch maintainer notes** until you decide to promote or relocate it.

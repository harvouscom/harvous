# Clerk SDK setup (one-time)

The Swift sources in `Services/HarvousClerkBridge.swift` and
`Views/SignInGate.swift` are guarded by `#if canImport(Clerk)`. They compile
without the SDK linked (the app just refuses to sign in), and light up the
moment the SPM package is added.

## 1. Add the new Swift files to the Xcode project

The two files were created on disk but `project.pbxproj` references every
source file explicitly. In Xcode:

- **File ▸ Add Files to "Harvous"…**
  - `native/Harvous/Services/HarvousClerkBridge.swift` →
    targets ✅ Harvous_iOS, ✅ Harvous_macOS
  - `native/Harvous/Services/HarvousAPI.swift` →
    targets ✅ Harvous_iOS, ✅ Harvous_macOS
  - `native/Harvous/Services/HarvousSyncService.swift` →
    targets ✅ Harvous_iOS, ✅ Harvous_macOS
  - `native/Harvous/Views/SignInGate.swift` →
    targets ✅ Harvous_iOS, ✅ Harvous_macOS

Leave **"Copy items if needed"** off — the files are already in place; you
just need them in the project tree.

## 2. Add the package

Open `Harvous.xcodeproj` in Xcode →
**File ▸ Add Package Dependencies…** →
URL: `https://github.com/clerk/clerk-ios` →
Add `Clerk` to both targets (`Harvous_iOS` and `Harvous_macOS`).

## Fill in the publishable key

Edit `Configuration/Harvous-Env.xcconfig` and replace `pk_test_REPLACE_ME` with
the publishable key from the Clerk dashboard
(`Dashboard ▸ API keys ▸ Publishable key`). Use the `pk_test_…` for Debug,
`pk_live_…` for Release.

Publishable keys are not secret and are safe to commit, but you may prefer to
gitignore this file and have each developer maintain their own.

## Verify

Clean-build and launch. Cold launch should show Clerk's sign-in screen; after
sign-in, the rest of the app appears. If the placeholder *"Clerk SDK not
linked"* screen appears, the SPM package wasn't added to that target.

## SwiftData migration note

This change adds an additive `serverId: String?` to `Note`, `Space`, and
`StudyThread`. SwiftData lightweight migration handles additive Optionals
automatically — no extra steps. Existing rows get `serverId == nil`, and the
first successful sync (`HarvousSyncService.pullAll`) populates them.

## Sync behavior

`HarvousSyncService` is wired into `SignInGate`:

- On sign-in (`task(id: userId)`) → `flushPending` then `pullAll`.
- On app entering foreground → same.
- On `markDirty()` → `HarvousSyncScheduler` debounces upload (~1.5s); pull (~10s) runs only after a successful upload, not on every keystroke.
- Sign-in / foreground cancel pending scheduler work, then run explicit flush → pull → flush.
- Ingest from pulls is chunked with `Task.yield()` so large libraries do not freeze the UI.

**Cross-device testing:** use the **Debug-Prod** scheme so Mac/iOS talk to `https://app.harvous.com`. The default **Debug** scheme targets localhost only; production web (`/prototype`) will not see those notes. See [docs/troubleshooting/CROSS_PLATFORM_SYNC.md](../../docs/troubleshooting/CROSS_PLATFORM_SYNC.md).

## Supabase Realtime (instant cross-device sync)

Set `HARVOUS_SUPABASE_URL` and `HARVOUS_SUPABASE_ANON_KEY` in the active signing xcconfig (see `Configuration/Harvous-Env.xcconfig`). Create Clerk JWT template **`supabase`** (see [docs/SUPABASE_REALTIME_SETUP.md](../../docs/SUPABASE_REALTIME_SETUP.md)). `HarvousRealtimeSync` subscribes on sign-in and triggers a debounced pull when the API broadcasts `invalidate`.

Edits made offline flag rows with `needsSync = true` (see `markDirty()` on
each model). The next flush uploads them; on success `serverId` is written
back and the dirty flag clears.

What's wired so far:
- Notes: autosave + linked-notes save sites
- Highlights: create + accent edit

What's not yet wired (follow-ups):
- Local deletes → server DELETE
- Folder / pin / rating / scripture-pill-accent edits (call `note.markDirty()`)
- Lossy HTML↔plain-text bridge — uploads wrap as `<p>` paragraphs, downloads
  strip tags. A richer markdown/HTML translator belongs in a follow-up.

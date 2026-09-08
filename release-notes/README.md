# Release Notes

This folder contains user-friendly release notes that explain updates to Harvous in plain English.

## Purpose

While the `Changelog/` folder contains technical commit messages for developers, this folder provides:
- Clear explanations of what changed
- How changes improve the user experience
- Tips for using new features
- No technical jargon

## Style

- **No emoji** in release note files: not in the title, `###` section headers, or body text. Use clear headings and plain language instead.

## Two kinds of document

**Dated notes** (`2026-08-06.md`, in this folder) are the record of a day. One
per day, generated then rewritten, terse. They answer "what changed on the 6th".

**Launch notes** (`launches/harvous-for-churches.md`) are the story of a feature.
They answer "what is this thing and why would I want it". A launch note is not
day-shaped — Harvous for churches shipped across August 4th and 6th and a dozen
versions between — which is exactly why it cannot live in a dated file.

Write a launch note only when a release is genuinely a product story someone
would read on its own. Most releases are not. When one exists, the dated notes
stay terse and link to it rather than retelling it; duplicated copy in two
places is how this folder rots.

The generator only ever writes to `release-notes/*.md`, so anything in
`launches/` or `social/` is structurally safe from it.

## File Naming Convention

**One note per day, named for the day:** `2026-08-06.md`.

A day is the unit a reader thinks in — "here is what changed on the 6th" — and
it is the only unit that stays stable. Notes used to be named `vX.Y-month-year`,
which meant a new file per *minor*, and the post-commit hook bumps a minor on
every `feat:`. February 27th produced 108 files. August 6th produced 15 before
this changed. Nobody reads fifteen release notes for one afternoon.

One dated note covers every version released that day, and names them in its
`**Versions:**` line for anyone tracing a specific change.

Files named `vX.Y-month-year.md` are the old scheme, kept as history where a day
had a single note. Do not add more.

The native Mac/iOS app is the one exception: it ships on its own `0.x`
versioning and its notes (`mac-native-*.md`, `v0.3-may-2026.md`) stay
month-dated, because they do not track the web release stream.

## For Developers

When creating a new release:
1. Technical changelog goes in `Changelog/` (automated)
2. User-friendly release notes go here in `release-notes/`
3. Use the existing files as templates for tone and structure
4. Focus on benefits and user experience, not implementation details

### The DRAFT banner is the lock

The post-commit hook runs `scripts/generate-release-notes.js`, which drafts the
day's note from commit subjects. Every release that day resolves to the same
file, so the banner is what decides whether it may be rewritten:

- **Banner present** — nobody has invested anything in this file yet, so the
  day's next release regenerates it, now covering every version released today.
  A busy afternoon accumulates into one note instead of eight.
- **Banner gone** — you removed it when you rewrote the copy, so the file is
  yours. The generator never touches it again; it prints the new entries for you
  to fold in by hand.

Deleting the banner is the last step of a rewrite, and the only thing standing
between your copy and a routine `fix:` commit. That is not hypothetical: before
this guard existed, a patch replaced v2.21.0's hand-written notes with
boilerplate.

Commit subjects are written for developers — about the change rather than about
what it does for someone — so a draft is never publishable as-is.

To regenerate from scratch anyway:

```bash
npm run release-notes:generate -- <version> --force
```

## Public changelog (harvous.com)

The marketing site lives in [harvouscom/harvous.com](https://github.com/harvouscom/harvous.com) and deploys separately. Public release notes at [harvous.com/release-notes/](https://harvous.com/release-notes/) are built from that repo’s `data/webflow-changelog.csv`, synced automatically from `Changelog/*.md` via `npm run changelog:export` in the app repo (or the `sync-release-notes` GitHub Action on push to `main`). Use this folder for in-repo drafts and `/marketing-agent` copy.

## For Users

These release notes help you understand:
- What's new in Harvous
- How updates make your Bible study easier
- Tips for using new features effectively

Start with the most recent file to see the latest updates!

**What's next: how a room decides what to study** (September 2026): [launches/shared-space-study-suggestions.md](launches/shared-space-study-suggestions.md) — members of a shared space suggest what to study next and whoever runs the room picks; opt-in per room, shipped in v3.4.0.

**Harvous 3.0** (September 2026): [launches/harvous-3-0.md](launches/harvous-3-0.md) — the release in one place. Home became Activity, the sidebar became Search, and Review arrived; built across the 2.x numbers on the 3.0 branch and shipped as v3.0.0.

**Harvous for churches** (August 2026): [launches/harvous-for-churches.md](launches/harvous-for-churches.md) — the whole church release in one place, across v2.14.0–v2.33.0.

**August 20, 2026:** [2026-08-20.md](2026-08-20.md) — passages that open as passages, reading details on a phone, and references that stay put (v2.72.13–v2.72.16).

**August 6, 2026:** [2026-08-06.md](2026-08-06.md) — the Planner at full size, series that know how long they run, and a resource shelf for your church (v2.21.0–v2.33.0).

**July 2026:** [v2.0-july-2026.md](v2.0-july-2026.md) — **Harvous 2.0** (Classic retired; prototype shell is production web). Social copy: [social/v2.0-july-2026-launch.md](social/v2.0-july-2026-launch.md).

**April 2026:** [v1.216-april-2026.md](v1.216-april-2026.md) (v1.216.0 space context and navigation) and [v1.215-april-2026.md](v1.215-april-2026.md) (broader April updates including v1.215.x through 1.216.0).

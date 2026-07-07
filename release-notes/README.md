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

## File Naming Convention

Release notes are named by version and date:
- `v1.13-january-2026.md` - Version 1.13 updates from January 2026
- `v1.14-february-2026.md` - Version 1.14 updates from February 2026

## For Developers

When creating a new release:
1. Technical changelog goes in `Changelog/` (automated)
2. User-friendly release notes go here in `release-notes/`
3. Use the existing files as templates for tone and structure
4. Focus on benefits and user experience, not implementation details

## Public changelog (harvous.com)

The marketing site lives in [harvouscom/harvous.com](https://github.com/harvouscom/harvous.com) and deploys separately. Public release notes at [harvous.com/release-notes/](https://harvous.com/release-notes/) are built from that repo’s `data/webflow-changelog.csv`, synced automatically from `Changelog/*.md` via `npm run changelog:export` in the app repo (or the `sync-release-notes` GitHub Action on push to `main`). Use this folder for in-repo drafts and `/marketing-agent` copy.

## For Users

These release notes help you understand:
- What's new in Harvous
- How updates make your Bible study easier
- Tips for using new features effectively

Start with the most recent file to see the latest updates!

**July 2026:** [v2.0-july-2026.md](v2.0-july-2026.md) — **Harvous 2.0** (Classic retired; prototype shell is production web). Social copy: [social/v2.0-july-2026-launch.md](social/v2.0-july-2026-launch.md).

**April 2026:** [v1.216-april-2026.md](v1.216-april-2026.md) (v1.216.0 space context and navigation) and [v1.215-april-2026.md](v1.215-april-2026.md) (broader April updates including v1.215.x through 1.216.0).

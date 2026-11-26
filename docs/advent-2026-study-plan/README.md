# Advent 2026 study plan

A Harvous-authored, four-week Advent study plan plus a Christmas Day step, published to Discover as an official pack that installs as a study plan (steps in order, with progress). Start any day.

| File | Purpose |
|------|---------|
| [plan.json](./plan.json) | Listing title, description, category, slug, and the ordered steps |
| `notes/*.html` | One step per file, TipTap-compatible HTML. Scripture references become pills at install. |

Themes follow a common Protestant Advent pattern (hope, peace, joy, love) and say so, noting that other traditions name the weeks differently. Short quotations are ESV, as stated in week 1. No generated text ships: the bodies are authored files reviewed before publishing (see AGENTS.md, "No generative AI for study content").

## Review

- Theological review (theologian-agent, 2026-11-26): pass with revisions, all applied. Must-fix: none. Should-fix applied: ESV attribution; Mary "engaged but not yet married" instead of "young, unmarried"; Isaiah 7:14 framed as first given to Ahaz, with Matthew's reading of it; the shepherds as the first the angels tell, not the first to know.
- Approval: Derek, before publishing.

## Publish

```bash
npm run discover:publish-plan -- docs/advent-2026-study-plan            # dry run
npm run discover:publish-plan -- docs/advent-2026-study-plan --apply --production
```

Idempotent on `plan.json`'s `sourceId`: re-running after an edit updates the listing in place. People who already installed keep their own copy. Then let the catalog sync (`sync-discover-catalog.yml`) refresh harvous.com/discover.

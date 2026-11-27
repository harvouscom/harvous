# Advent 2026 study plan

A Harvous-authored, four-week Advent study plan plus a Christmas Day step, published to Discover as an official pack that installs as a study plan (steps in order, with progress). Start any day.

| File | Purpose |
|------|---------|
| [plan.json](./plan.json) | Listing title, description, category, slug, and the ordered steps |
| `notes/*.html` | One step per file, TipTap-compatible HTML. Scripture references become pills at install. |

Themes follow a common Protestant Advent pattern (hope, peace, joy, love) and say so, noting that other traditions name the weeks differently. Short quotations are ESV, as stated in week 1. No generated text ships: the bodies are authored files reviewed before publishing (see AGENTS.md, "No generative AI for study content").

## Review

- Theological review (theologian-agent, 2026-11-26): pass with revisions, all applied. Must-fix: none. Should-fix applied: ESV attribution; Mary "engaged but not yet married" instead of "young, unmarried"; Isaiah 7:14 framed as first given to Ahaz, with Matthew's reading of it; the shepherds as the first the angels tell, not the first to know.
- Second review (2026-11-27): a read-through with Derek plus an independent theologian-agent pass. Pass with revisions, no must-fix, all 15 to 20 ESV quotations checked. Applied: Isaiah 9:1-7 so Galilee is in the passage; Isaiah 7:10-16; the stump as judgment still ahead; Joseph's betrothal as binding ("divorce her quietly"); Mary's song as praise for what God did for her, widening to his people; Ephesians 2 read as Jew and Gentile, with a safer peace question; Luke 2:14 in ESV wording; Simeon and Anna as Luke gives them; Gaudete Sunday; Romans 15:12; Working Preacher for Week 4; the full Crossway ESV notice; a note on the short fourth week in 2026.
- Approval: Derek, before publishing.

## Publish

```bash
npm run discover:publish-plan -- docs/advent-2026-study-plan            # dry run
npm run discover:publish-plan -- docs/advent-2026-study-plan --apply --submit --production   # review queue
npm run discover:publish-plan -- docs/advent-2026-study-plan --apply --production            # straight to listed
```

With `--submit` the plan waits in admin Discover; approving it there (category topical-study, official on) assigns the slug and lists it.

Idempotent on `plan.json`'s `sourceId`: re-running after an edit updates the listing in place. People who already installed keep their own copy. Then let the catalog sync (`sync-discover-catalog.yml`) refresh harvous.com/discover.

# Harvous

See `AGENTS.md` for dev commands, architecture overview, quick reference, and faith/AI agent resources.

---

## Agent Team

This project uses a team of specialized agents as slash commands. Each agent owns a feature domain, loads its context file at session start, and updates it before finishing.

### Specialists (default — use these directly)

| Command | Domain |
|---|---|
| `/editor-agent` | TipTap editor, marks, selection, floating UI |
| `/scripture-agent` | Scripture pills, detection, translations |
| `/content-agent` | Cards, inbox, recall/review |
| `/theologian-agent` | Theological review of authored study content (pairs with content-agent) |
| `/sharing-agent` | Share tokens, public access, import flow |
| `/data-agent` | Supabase, API endpoints, offline sync |
| `/design-agent` | Design system, tokens, prototype CSS, native DesignSystem, gallery, visual cohesion |
| `/marketing-agent` | Changelog entries, user release notes in `release-notes/`, social copy, admin featured content |

**Release notes style:** Markdown under `release-notes/` is plain text only — no emoji in titles, section headers, or body (`release-notes/README.md`, `release-notes/TEMPLATE.md`). The marketing agent owns this convention.

### Cross-cutting

| Command | Domain |
|---|---|
| `/performance-agent` | Speed, snappiness, responsiveness — bundle budgets, render cost, interaction latency, optimistic mutations, build and chunking |

Routes differently from the specialists above: it owns measurement and budgets (`perf:check`, the
budget ratchet, `docs/performance/`), but the slow paths live inside editor/content/data/design
files, so it may edit those after reading the owning agent's context file — and must name the
cross-domain touch in its response. Reach for it when something feels slow or late, when adding a
dependency or a route, or for a performance review of a change.

**Bundle budget:** `npm run build:spa && npm run perf:check` guards the initial payload; CI runs it.
Raising a budget takes `npm run perf:baseline` plus a reason in the commit message.

### Coordinator (opt-in)

Use `/coordinator` only when:
- You're unsure which domain owns the work
- A change clearly touches 2+ domains and you want cross-domain review

For routine single-domain work, invoke the specialist directly — it's faster and cheaper.

### Context Files

Agent context files live in `.claude/agents/` (gitignored — local only). Each agent maintains its own context file with invariants, gotchas, and current state. The routing manifest is at `.claude/agents/manifest.json`.

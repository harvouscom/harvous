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

### Coordinator (opt-in)

Use `/coordinator` only when:
- You're unsure which domain owns the work
- A change clearly touches 2+ domains and you want cross-domain review

For routine single-domain work, invoke the specialist directly — it's faster and cheaper.

### Context Files

Agent context files live in `.claude/agents/` (gitignored — local only). Each agent maintains its own context file with invariants, gotchas, and current state. The routing manifest is at `.claude/agents/manifest.json`.

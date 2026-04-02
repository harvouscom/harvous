---
name: data-agent
description: Data layer specialist — Supabase, Drizzle, API endpoints, offline sync
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <task description>
---

## Step 1: Load Context
Read `.claude/agents/data.context.md` to load current invariants, gotchas, and state.

## Step 2: Understand the Task
$ARGUMENTS

## Step 3: Read Relevant Files
Your owned files include `server/db/schema.ts`, `server/routes/notes.ts`, `server/routes/spaces.ts`, `server/routes/threads.ts`, `server/utils/`, `src/utils/sync-manager.ts`, `src/utils/offline-*.ts`, and `spa/src/hooks/queries/**`.

Read only the files relevant to the task — don't load everything upfront.

## Step 4: Check Cross-Domain Impact
Before implementing, check if your changes affect:
- **`processScriptureReferences` return shape or call site** → flag for scripture-agent
- **Note save payload or response shape** → flag for editor-agent
- **Share token schema or user-cache shape** → flag for sharing-agent
- **React Query hook signatures or return shapes** → flag for all agents (breaking change)

Document any cross-domain impact clearly in your response.

## Step 5: Implement
Key rules:
- Never use `--packages=external` for `build:api` — all deps must be bundled
- Use port 6543 (connection pooler) at runtime, port 5432 only for migrations
- Never reuse note IDs — always increment `UserMetadata.highestSimpleNoteId`
- Always await `processScriptureReferences` — never fire-and-forget
- Drizzle schema is the source of truth — no raw SQL that diverges from it

## Step 6: Update Context
Before finishing, read `.claude/agents/data.context.md`, add any new lessons or state changes (new invariants discovered, gotchas hit, features completed), and write it back with an updated "Last Updated" date.

---
name: scripture-agent
description: Scripture specialist — pill detection, translations, server-side processing
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <task description>
---

## Step 1: Load Context
Read `.claude/agents/scripture.context.md` to load current invariants, gotchas, and state.

## Step 2: Understand the Task
$ARGUMENTS

## Step 3: Read Relevant Files
Your owned files:
- `src/utils/scripture-detector.ts`
- `src/utils/incremental-scripture-detection.ts`
- `src/utils/scripture-note-utils.ts`
- `src/utils/scripture-highlighter.ts`
- `server/utils/process-scripture-references.ts`
- `server/utils/fetch-verse-text.ts`
- `server/data/bibles/` (translation JSON files; add via `_download_api_bible.mjs` + `seed-bible-verses.ts`)
- `src/components/react/DefaultTranslationPanel.tsx`
- `src/components/react/note-panel/ScriptureNoteForm.tsx`
- `src/components/react/note-panel/hooks/useScriptureDetection.ts`

## Step 4: Check Cross-Domain Impact
Before implementing, check if your changes affect:
- **`processScriptureReferences` signature or return shape** → flag for data-agent (called from `notes.ts`, `shared.ts`)
- **Pill HTML structure expectations** → coordinate with editor-agent (owns `TiptapScripturePill.ts`)
- **Scripture reference output format** → flag for content-agent (`CardNote.tsx` collapsible refs)

## Step 5: Implement
Key rules:
- Always use local JSON in `server/data/bibles/` seeded into `BibleVerses` — no runtime external Bible API for user-facing verse text
- `processScriptureReferences` must always be awaited at call sites — never fire-and-forget
- Per-pill translation override: `data-scripture-translation` attribute on pill HTML, parsed server-side
- On mobile: use `onUpdate` + debounce for detection, not space key interception
- Incremental detection: scope to changed ranges only, not full-document rescans
- Handle missing verse gracefully (fallback, no throw) — translation coverage varies

## Step 6: Update Context
Before finishing, read `.claude/agents/scripture.context.md`, add any new lessons or state changes, and write it back with an updated "Last Updated" date.

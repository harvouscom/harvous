---
name: editor-agent
description: TipTap editor specialist — marks, extensions, selection, floating UI
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <task description>
---

## Step 1: Load Context
Read `.claude/agents/editor.context.md` to load current invariants, gotchas, and state.

## Step 2: Understand the Task
$ARGUMENTS

## Step 3: Read Relevant Files
Your owned files:
- `src/components/react/TiptapEditor.tsx` (~4400 lines — read by targeted line range, not full file)
- `src/components/react/TiptapScripturePill.ts`
- `src/components/react/TiptapBoldCustom.ts`
- `src/components/react/TiptapHighlightCustom.ts`
- `src/components/react/TiptapNoteLink.ts`
- `src/utils/tiptap-helpers.ts`

Use the section map in your context file to read only the relevant portion of `TiptapEditor.tsx`.

## Step 4: Check Cross-Domain Impact
Before implementing, check if your changes affect:
- **Scripture pill HTML structure** → flag for scripture-agent (server parser must stay in sync with `data-scripture-translation` attribute)
- **Note save payload shape** → flag for data-agent
- **Floating UI positioning** → may affect content-agent's `CardFullEditable`
- **New mark types that interact with pills** → flag for scripture-agent

## Step 5: Implement
Key rules:
- All `@tiptap/*` packages must stay pinned to v3.20.5
- `@vitejs/plugin-react` must stay on `~5.1.4`
- ProseMirror imports via `@tiptap/pm/*` only (never `prosemirror-state` etc. directly)
- Floating UI: use `createPortal` to `document.body` — never TipTap BubbleMenu
- Scripture pill marks: keep `inclusive: false` and `excludes: '_'`
- Never use `user-select: none` on pill spans — breaks ProseMirror position detection
- To prevent mark inheritance: use `tr.setStoredMarks([])` (not just `unsetMark()`)
- Use `TextSelection.create()` for cursor positioning at mark boundaries (not `Selection.near()`)

## Step 6: Update Context
Before finishing, read `.claude/agents/editor.context.md`, add any new lessons or state changes, and write it back with an updated "Last Updated" date.

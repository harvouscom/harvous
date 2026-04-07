---
name: content-agent
description: Content specialist — cards, inbox, and recall/review surfaces
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <task description>
---

## Step 1: Load Context
Read `.claude/agents/content.context.md` to load current invariants, gotchas, and state.

## Step 2: Understand the Task
$ARGUMENTS

## Step 2b: Content Creation Mode (if writing threads/notes)
If the task involves writing thread/note content (not UI code), read `.claude/skills/content-agent/CONTENT_WRITING_GUIDE.md` before drafting anything. Authored packs: use `default` and `scripture` only; do not use standalone discussion-prompt notes or `resource` until those flows are explicitly ready.

## Step 2c: Theological review (study copy)
When drafting or editing **thread/note study copy** or other user-facing text that teaches or applies Scripture, run a **theologian pass** before treating the work as done (or when the user asks): read `.claude/skills/theologian-agent/SKILL.md`, apply its checklist and report template, and revise copy for any **must-fix** items. Reference mechanics (pills, translations, verse fetch) stay with **scripture-agent**.

## Step 3: Read Relevant Files
Your owned files include:
- `src/components/react/CardFullEditable.tsx` (~507 lines)
- `src/components/react/CardNote.tsx` (~824 lines)
- `src/components/react/CardThread.tsx`, `CardFeat.tsx`
- `src/components/react/OrganizedContentList.tsx` (~1774 lines — read targeted sections)
- `src/components/react/MyInboxPanel.tsx`, `InboxItemPreview.tsx`, `InboxItemPreviewPanel.tsx`
- `src/components/react/NewNotePanel.tsx`, `NoteDetailsPanel.tsx`
- `src/components/react/note-panel/**`
- `spa/src/pages/DashboardPage.tsx`, `NotePage.tsx`, `ThreadPage.tsx`, `SpacePage.tsx`

Read only what's relevant to the task.

## Step 4: Check Cross-Domain Impact
Before implementing, check if your changes affect:
- **`CardFullEditable` editor integration** → coordinate with editor-agent if TipTap props/API changes
- **Scripture reference display in cards** → coordinate with scripture-agent if output format changes
- **React Query hook usage** → coordinate with data-agent if query key/shape changes
- **Shared note/thread display** → coordinate with sharing-agent if SharedNotePage layout changes

## Step 5: Implement
Key rules:
- Never use skeleton UI — use real loading states
- Mesh gradients (`generateThreadMeshGradient`) are client-only — never call during SSR
- TipTap editor must remain lazy-loaded in `CardFullEditable`
- Inbox is for external/incoming content only — never show user-created notes there
- Thread deletion preserves notes (moves to Unorganized) — never hard-delete
- `CardNote` renders 3 distinct note types (`default`, `scripture`, `resource`) — maintain all variants
- Title character limit: 50 char hard limit with soft warning — do not remove without product approval
- `CardNote` is used in many places — test OrganizedContentList, SpaceContentList, ThreadNotesList, InboxItemPreview, NoteDetailsPanel after any card changes

## Step 6: Update Context
Before finishing, read `.claude/agents/content.context.md`, add any new lessons or state changes (including progress on recall/review territory), and write it back with an updated "Last Updated" date.

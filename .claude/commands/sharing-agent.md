---
description: Sharing specialist — share tokens, public access, space membership, import flow
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: <task description>
---

## Step 1: Load Context
Read `.claude/agents/sharing.context.md` to load current invariants, gotchas, and state.

## Step 2: Understand the Task
$ARGUMENTS

## Step 3: Read Relevant Files
Your owned files:
- `src/components/react/NoteSharePanel.tsx`
- `src/components/react/ShareSettingsModal.tsx`
- `src/components/react/MySharingPanel.tsx`
- `src/components/react/SharedSpaceIndicator.tsx`, `SharedNoteCTAFooter.tsx`
- `src/components/react/InviteMemberPanel.tsx`, `SpaceMembersList.tsx`, `EditSpacePeoplePanel.tsx`
- `spa/src/pages/SharedNotePage.tsx`, `SharedThreadPage.tsx`
- `spa/src/pages/JoinSpacePage.tsx`, `InvitationPage.tsx`
- `spa/src/hooks/mutations/useJoinSpace.ts`, `useAcceptInvitation.ts`, `useAddSharedNote.ts`, `useAddSharedThread.ts`
- `server/routes/shared.ts`

## Step 4: Check Cross-Domain Impact
Before implementing, check if your changes affect:
- **Share token schema** → flag for data-agent (schema.ts, notes.ts)
- **User metadata enrichment** → coordinate with data-agent (`user-cache.ts`)
- **`SharedNotePage` layout or CardFullEditable usage** → coordinate with content-agent
- **New shareable entity types** → coordinate with data-agent (schema) and content-agent (display)

## Step 5: Implement
Key rules:
- Encrypted notes (`contentEncrypted: true`) must NEVER appear in any shared/public context — hard security requirement
- Scripture notes auto-generate share tokens on first share — maintain this behavior
- Token refresh is destructive (invalidates all existing links) — treat it as such in UI
- Normalize share URLs to current origin in frontend — handles dev vs prod API host
- Clerk force redirect URLs must NOT point to app root — post-auth redirects for join/invite must target the specific page
- Email invitations have expiry and status (`pending`, `accepted`, `expired`) — maintain full state machine
- Space membership roles: `owner`, `member`, `guest` — permission gates must cover all three

## Step 6: Update Context
Before finishing, read `.claude/agents/sharing.context.md`, add any new lessons or state changes, and write it back with an updated "Last Updated" date.

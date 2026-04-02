---
name: coordinator
description: Cross-domain coordinator — use when work spans 2+ agent domains (opt-in)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
argument-hint: <task description>
---

## When to Use This
Use the coordinator only when:
- A task clearly spans 2+ agent domains
- You're unsure which agent owns the affected files

For single-domain work, invoke the specialist directly (`/editor-agent`, `/scripture-agent`, etc.) — it's faster and cheaper.

## Step 1: Load Coordinator Context
Read `.claude/agents/coordinator.context.md` for the cross-domain dependency map.

## Step 2: Identify Owning Agents
Read `.claude/agents/manifest.json`.

For the task: $ARGUMENTS

Match the affected files against `owns` arrays in the manifest. List which agents are involved.

## Step 3: Load Relevant Agent Contexts
Read the context files for each involved agent:
- `.claude/agents/editor.context.md`
- `.claude/agents/scripture.context.md`
- `.claude/agents/content.context.md`
- `.claude/agents/sharing.context.md`
- `.claude/agents/data.context.md`

Load only the ones relevant to this task.

## Step 4: Identify the Primary Agent
The primary agent is the one whose domain contains most of the work. The others are reviewers.

Use the dependency map in `coordinator.context.md` to determine review order:
- `data` changes are reviewed last (foundation — others depend on it)
- Cross-cutting changes (e.g., pill HTML structure) require both sides to review

## Step 5: Execute Primary Work
Perform the primary implementation using the primary agent's context and rules.

## Step 6: Cross-Domain Review
For each reviewer agent, check the implemented changes against their invariants:
- Read their context file
- Verify no invariants are violated
- If violations are found, fix before proceeding

For complex reviews, use the Agent tool to launch a specialist review:
"Review these changes for compliance with your domain's invariants: [changes summary]"

## Step 7: Update All Touched Context Files
Update the context file for every agent whose domain was touched, with new lessons or state changes and an updated "Last Updated" date.

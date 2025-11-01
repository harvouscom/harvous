# Legacy Components

This folder contains archived components that are no longer used in active development.

## Why These Components Are Archived

These components use Quill.js for rich text editing, which has been replaced by Tiptap in React components.

## Archived Components

- **QuillEditor.astro**: Legacy Quill.js editor for Astro components
- **NewNotePanel.astro**: Legacy note creation panel using Quill
- **CardFullEditable.astro**: Legacy note editing card using Quill
- **react/QuillEditor.tsx**: Legacy React Quill editor (never used)

## Current Implementation

All active rich text editing now uses:
- `src/components/react/TiptapEditor.tsx` - Tiptap-based React editor
- `src/components/react/NewNotePanel.tsx` - React note panel (uses Tiptap)
- `src/components/react/CardFullEditable.tsx` - React editable card (uses Tiptap)

## When to Reference This Folder

- Historical reference for migration patterns
- Rollback scenarios (if needed)
- Understanding previous implementation details

**DO NOT** use these components for new development. Always use the Tiptap-based React components instead.


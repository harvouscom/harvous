# NewNotePanel Component Refactoring

This document describes the refactoring of `NewNotePanel.tsx` from a 1800-line monolithic component into smaller, focused custom hooks and UI components.

## Motivation

The original `NewNotePanel.tsx` was difficult to:
- **Understand**: 1800+ lines with mixed concerns
- **Test**: Tightly coupled logic made unit testing impractical
- **Maintain**: Changes required understanding the entire file
- **Reuse**: No way to reuse logic in other components

## New File Structure

```
src/components/react/
├── NewNotePanel.tsx                    (~300 lines, orchestrator)
├── note-panel/
│   ├── index.ts                        (exports)
│   ├── DefaultNoteForm.tsx             (default note type UI)
│   ├── ScriptureNoteForm.tsx           (scripture note type UI)
│   ├── SpaceSelector.tsx               (space checkbox button)
│   ├── NoteFormFooter.tsx              (close + create buttons)
│   ├── NewNotePanelStyles.tsx          (CSS-in-JS styles)
│   └── hooks/
│       ├── index.ts                    (exports)
│       ├── useNewNoteForm.ts           (form state management)
│       ├── useThreadSelection.ts       (thread loading/selection)
│       ├── useScriptureDetection.ts    (auto-detect scripture)
│       └── useNoteSubmission.ts        (form submission logic)
├── dialogs/
│   └── UnsavedChangesDialog.tsx        (reusable dialog)
```

## Custom Hooks

### `useNewNoteForm`

Manages form state and localStorage persistence.

**Location**: `src/components/react/note-panel/hooks/useNewNoteForm.ts`

**Options**:
```typescript
interface UseNewNoteFormOptions {
  currentSpace?: { id: string; title: string; color?: string; backgroundGradient?: string } | null;
}
```

**Returns**:
```typescript
interface UseNewNoteFormReturn {
  // State
  title: string;
  setTitle: (title: string) => void;
  content: string;
  setContent: (content: string) => void;
  noteType: 'default' | 'scripture' | 'resource';
  setNoteType: (type: NoteType) => void;
  scriptureReference: string;
  setScriptureReference: (ref: string) => void;
  scriptureVersion: string;
  setScriptureVersion: (version: string) => void;
  resourceUrl: string;
  setResourceUrl: (url: string) => void;
  sourceNoteId: string | null;
  sourceSelectionFrom: number | null;
  sourceSelectionTo: number | null;
  addToSpace: boolean;
  setAddToSpace: (add: boolean) => void;
  
  // Refs
  isLoadingFromLocalStorage: React.MutableRefObject<boolean>;
  
  // Functions
  hasUnsavedChanges: () => boolean;
  resetForm: () => void;
  clearLocalStorage: () => void;
}
```

**Responsibilities**:
- Manages all form field state (title, content, noteType, etc.)
- Persists form data to localStorage
- Loads saved data from localStorage on mount
- Initializes `addToSpace` when currentSpace is provided
- Tracks source note context for hyperlink creation

---

### `useThreadSelection`

Handles thread loading, selection, and detection.

**Location**: `src/components/react/note-panel/hooks/useThreadSelection.ts`

**Options**:
```typescript
interface UseThreadSelectionOptions {
  currentThread?: { id: string; title: string } | null;
  navigationHistory?: Array<{ id: string; title: string }>;
}
```

**Returns**:
```typescript
interface UseThreadSelectionReturn {
  threadOptions: Thread[];
  selectedThread: string;
  setSelectedThread: (thread: string) => void;
  handleThreadSelect: (threadTitle: string) => void;
  getSelectedThread: () => Thread;
  loadThreads: () => Promise<void>;
  setThreadOptions: React.Dispatch<React.SetStateAction<Thread[]>>;
}
```

**Responsibilities**:
- Loads thread list from API with debouncing
- Handles thread selection priority logic:
  1. `currentThread` prop (if provided)
  2. Client-side detection from URL/navigation context
  3. Saved thread ID from localStorage
  4. Default to "My Pile"
- Tracks manual vs automatic thread selection
- Persists thread selection to localStorage

---

### `useScriptureDetection`

Auto-detects scripture references and fetches verse text.

**Location**: `src/components/react/note-panel/hooks/useScriptureDetection.ts`

**Options**:
```typescript
interface UseScriptureDetectionOptions {
  title: string;
  content: string;
  noteType: NoteType;
  isLoadingFromLocalStorage: React.MutableRefObject<boolean>;
  setNoteType: (type: NoteType) => void;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setScriptureReference: (ref: string) => void;
  setScriptureVersion: (version: string) => void;
  scriptureReference: string;
  scriptureVersion: string;
}
```

**Returns**:
```typescript
interface UseScriptureDetectionReturn {
  isFetchingVerse: boolean;
}
```

**Responsibilities**:
- Debounced scripture detection (1 second after typing stops)
- Only detects in title field (not content)
- Fetches verse text from API when scripture detected
- Shows toast notification on detection
- Handles version change for re-fetching verse text

---

### `useNoteSubmission`

Handles form submission, validation, and navigation.

**Location**: `src/components/react/note-panel/hooks/useNoteSubmission.ts`

**Options**:
```typescript
interface UseNoteSubmissionOptions {
  // Form data
  title: string;
  content: string;
  noteType: NoteType;
  scriptureReference: string;
  scriptureVersion: string;
  resourceUrl: string;
  sourceNoteId: string | null;
  addToSpace: boolean;
  currentSpace?: { id: string } | null;
  
  // Thread data
  getSelectedThread: () => Thread;
  threadOptions: Thread[];
  
  // Navigation
  addToNavigationHistory?: (item: {...}) => void;
  
  // Callbacks
  onSuccess?: () => void;
  onClose?: () => void;
  resetForm: () => void;
  clearLocalStorage: () => void;
  loadNextNoteId: () => Promise<void>;
  setSelectedThread: (thread: string) => void;
}
```

**Returns**:
```typescript
interface UseNoteSubmissionReturn {
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleSaveAndClose: () => Promise<void>;
}
```

**Responsibilities**:
- Type-specific validation (default, scripture, resource)
- Form data preparation and API submission
- Navigation history updates (localStorage + React state)
- Scripture result toast notifications
- Hyperlink creation for notes from selected text
- Post-creation navigation
- Save & Close functionality for unsaved changes dialog

---

## UI Components

### `DefaultNoteForm`

Default note type form with title input and content editor.

**Props**:
```typescript
interface DefaultNoteFormProps {
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  nextNoteId: string;
  onEditorReady?: (editor: any) => void;
}
```

---

### `ScriptureNoteForm`

Scripture note type form with scripture reference input.

**Props**:
```typescript
interface ScriptureNoteFormProps {
  scriptureReference: string;
  onReferenceChange: (ref: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  nextNoteId: string;
  onEditorReady?: (editor: any) => void;
}
```

---

### `SpaceSelector`

Button for adding notes to a space.

**Props**:
```typescript
interface SpaceSelectorProps {
  space: { id: string; title: string; color?: string; backgroundGradient?: string };
  isSelected: boolean;
  onToggle: () => void;
}
```

---

### `NoteFormFooter`

Footer with close and create note buttons.

**Props**:
```typescript
interface NoteFormFooterProps {
  isSubmitting: boolean;
  onClose: () => void;
}
```

---

### `UnsavedChangesDialog`

Reusable dialog for handling unsaved changes.

**Location**: `src/components/react/dialogs/UnsavedChangesDialog.tsx`

**Props**:
```typescript
interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndClose: () => void;
}
```

---

### `NewNotePanelStyles`

CSS-in-JS styles injected into the component for TiptapEditor styling.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        NewNotePanel                              │
│  (Orchestrator - connects hooks and components)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  useNewNoteForm │ │useThreadSelection│ │useScriptureDetec│
│  (form state)   │ │  (thread mgmt)   │ │  (auto-detect)  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                              ▼
                   ┌─────────────────┐
                   │useNoteSubmission│
                   │  (form submit)  │
                   └─────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ DefaultNoteForm │ │ScriptureNoteForm│ │  SpaceSelector  │
│       UI        │ │       UI        │ │       UI        │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Migration Notes for Developers

### Using the Hooks in Other Components

The hooks are designed to be composable. You can use them independently:

```typescript
import { useNewNoteForm, useThreadSelection } from '@/components/react/note-panel/hooks';

// In your component:
const form = useNewNoteForm({ currentSpace });
const threads = useThreadSelection({ currentThread, navigationHistory });
```

### Extending Functionality

To add new note types:
1. Add the type to `NoteType` in `useNewNoteForm.ts`
2. Add validation logic in `useNoteSubmission.ts`
3. Create a new form component (e.g., `ResourceNoteForm.tsx`)
4. Add conditional rendering in `NewNotePanel.tsx`

### Key Design Decisions

1. **Hooks manage state, components render UI**: Clear separation of concerns
2. **localStorage persistence in hooks**: Form data survives page reloads
3. **Debounced API calls**: Thread loading and scripture detection use debouncing
4. **Manual selection tracking**: Prevents automatic resets after user manually selects

## Testing

Key behaviors to verify after changes:
- [ ] Thread selection persists across page reloads
- [ ] currentThread prop takes priority when provided
- [ ] Scripture auto-detection works on title input
- [ ] Note creation succeeds and navigates correctly
- [ ] Unsaved changes dialog appears when expected
- [ ] Space checkbox toggles correctly
- [ ] Keyboard shortcut (Cmd+S) triggers save


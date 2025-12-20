# React Islands Best Practices for Harvous

## Core Principles

1. **Island Minimalism**: Only use React for truly interactive components
2. **Astro-First**: Default to .astro files, reach for React islands sparingly
3. **Smart Hydration**: Use `client:idle`, `client:visible` over `client:load` when possible
4. **Data Down**: Fetch data in Astro, pass as props to islands
5. **Web Standards**: Prefer native HTML/CSS, enhance with React

## File Structure Pattern

Current Harvous structure:
```
src/
├── components/
│   ├── *.astro           # Server-rendered components (no JS)
│   │   ├── CardNote.astro
│   │   ├── CardThread.astro
│   │   └── Layout.astro
│   ├── react/            # Interactive React components
│   │   ├── TiptapEditor.tsx
│   │   ├── NewNotePanel.tsx
│   │   ├── ThreadCombobox.tsx
│   │   └── navigation/
│   │       ├── NavigationColumn.tsx
│   │       └── NavigationContext.tsx
│   └── ui/               # Shared UI primitives (React or Astro)
│       ├── button-group.tsx
│       └── sheet.tsx
```

**Key Points:**
- React components go in `src/components/react/`
- Astro components stay in `src/components/`
- Shared UI primitives can be either React or Astro

## Decision Tree: Astro vs React Island

### Use Astro (.astro) for:
- ✅ Static content (headers, footers, text)
- ✅ Lists that don't need real-time updates
- ✅ Navigation structure (data fetching)
- ✅ Layouts
- ✅ Simple cards/displays
- ✅ Anything that doesn't require client-side state

**Example from Harvous:**
```astro
---
// pages/index.astro - Fetching data in Astro
const threads = await getAllThreadsWithCounts(userId);
const spaces = await getSpacesWithCounts(userId);
---

<div class="threads">
  {threads.map(thread => (
    <a href={`/${thread.id}`}>
      <CardThread title={thread.title} count={thread.noteCount} />
    </a>
  ))}
</div>
```

### Use React Island (.tsx) for:
- ✅ Rich text editor (TiptapEditor)
- ✅ Real-time search/filtering
- ✅ Drag-and-drop interfaces
- ✅ Complex forms with validation
- ✅ Modals/dialogs with state
- ✅ Anything with `useState`, `useEffect`, or event handlers

**Example from Harvous:**
```tsx
// components/react/TiptapEditor.tsx - Needs client-side interactivity
export function TiptapEditor({ content, onChange }: Props) {
  const editor = useEditor({ content });
  // ... interactive editor logic
}
```

## Data Fetching Pattern

### ❌ Bad: Fetching in React Island

```tsx
// components/react/MySpacesPanel.tsx - CURRENT (needs refactoring)
export function MySpacesPanel() {
  const [spaces, setSpaces] = useState([]);
  
  useEffect(() => {
    fetch('/api/navigation/data').then(r => r.json()).then(setSpaces);
  }, []);
  
  return <div>{spaces.map(...)}</div>
}
```

**Problems:**
- Data not available on initial render (SEO, performance)
- Extra network request after page load
- Slower Time to Interactive
- No SSR benefits

### ✅ Good: Fetch in Astro, Pass to Island

```astro
---
// pages/profile.astro - Fetching in Astro
const spaces = await getSpacesWithCounts(userId);
---

<MySpacesPanel client:load spaces={spaces} />
```

```tsx
// components/react/MySpacesPanel.tsx - REFACTORED
interface Props {
  spaces: Space[];
}

export function MySpacesPanel({ spaces }: Props) {
  const [filtered, setFiltered] = useState(spaces);
  
  // Client-side filtering only
  const handleSearch = (query: string) => {
    setFiltered(spaces.filter(s => s.title.includes(query)));
  };
  
  return (
    <>
      <input onChange={e => handleSearch(e.target.value)} />
      {filtered.map(...)}
    </>
  );
}
```

**Benefits:**
- ✅ Data available on initial render (SSR)
- ✅ Faster page load
- ✅ Better SEO
- ✅ Progressive enhancement

### When Client-Side Fetching is Acceptable

Only fetch in React when:
- **Real-time updates** needed (websockets, polling)
- **User-triggered actions** (search, filters, pagination)
- **Dynamic data** that changes after initial load

**Example - Acceptable client-side fetch:**
```tsx
// User clicks "Load More" - acceptable to fetch in React
const handleLoadMore = async () => {
  const response = await fetch(`/api/notes?page=${page + 1}`);
  const newNotes = await response.json();
  setNotes([...notes, ...newNotes]);
};
```

## Hydration Strategy

### Default: `client:idle`

```astro
<!-- Waits until browser is idle - best for non-critical interactive elements -->
<SearchBar client:idle />
<ThreadSorter client:idle />
```

**Use for:**
- Non-critical interactive features
- Below-the-fold components
- Analytics, widgets
- Search bars (if not immediately visible)

### Use `client:visible` for below-fold content

```astro
<!-- Only loads when scrolled into view -->
<OrganizedContentList client:visible initialItems={items} />
<ThreadNotesList client:visible initialNotes={notes} />
```

**Use for:**
- Content lists below the fold
- Comment sections
- Related content
- Infinite scroll lists

**Current Harvous examples:**
- `OrganizedContentList` uses `client:visible` ✅
- `ThreadNotesList` uses `client:visible` ✅

### Use `client:load` sparingly

```astro
<!-- Only for critical, above-fold interactive content -->
<ToastProvider client:load />
<NavigationProvider client:load />
<TiptapEditor client:load content={content} />
```

**Use for:**
- Critical interactive components (navigation, auth)
- Forms in viewport
- Rich text editors
- Components that must be interactive immediately

**Current Harvous examples:**
- `ToastProvider` uses `client:load` ✅
- `NavigationProvider` uses `client:load` ✅

### Use `client:only="react"` for development/debugging

```astro
<!-- Skips SSR entirely - use sparingly -->
<TiptapEditor client:only="react" />
```

**Use ONLY when:**
- Component relies on browser APIs that don't exist in SSR
- Debugging SSR issues
- Temporary workaround (should be refactored)

**Current Harvous issue:**
- 20+ components use `client:only="react"` - many could use `client:load` or `client:visible` instead

## Form Handling Pattern

### ✅ Good: Progressive Enhancement

```astro
---
// pages/app/notes/create.astro
import { actions } from 'astro:actions';

if (Astro.request.method === 'POST') {
  const formData = await Astro.request.formData();
  await actions.createNote(formData);
  return Astro.redirect('/app/notes');
}
---

<form method="POST">
  <input name="title" required />
  <input name="content" />
  <button type="submit">Save</button>
</form>

<!-- Optional: Enhance with React for better UX -->
<NoteForm client:idle />
```

**Benefits:**
- Works without JavaScript
- Progressive enhancement
- Better accessibility
- SEO-friendly

## State Management

### URL State (Preferred)

```astro
---
const view = Astro.url.searchParams.get('view') ?? 'list';
const spaceId = Astro.url.searchParams.get('space');
---

<!-- Shareable, bookmarkable, back-button friendly -->
<ThreadView view={view} spaceId={spaceId} />
```

**Use for:**
- Filter states (view, sort, filter)
- Shareable UI state
- Navigation state
- Search queries

### React State (Only for UI-only state)

```tsx
// Only for things that don't need to persist or share
const [isOpen, setIsOpen] = useState(false);
const [sortOrder, setSortOrder] = useState('asc');
const [isEditing, setIsEditing] = useState(false);
```

**Use for:**
- Modal/dialog open state
- Dropdown open state
- Temporary UI state
- Form input state (before submission)

### React Context (For cross-component state)

```tsx
// components/react/navigation/NavigationContext.tsx
export const NavigationProvider = ({ children }) => {
  const [navigationHistory, setNavigationHistory] = useState([]);
  // ... shared navigation state
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
```

**Current Harvous example:**
- `NavigationContext` manages navigation state across components ✅

## Component Conversion Checklist

When refactoring a component, ask:

1. **Does this need JavaScript at all?**
   - No → Keep as .astro
   - Yes → Continue...

2. **Does it need client-side state?**
   - No → Keep as .astro with vanilla JS if needed
   - Yes → Continue...

3. **Can the state be in the URL?**
   - Yes → Keep as .astro, use query params
   - No → Make it a React island

4. **What hydration strategy?**
   - Critical above-fold → `client:load`
   - Interactive but not critical → `client:idle`
   - Below the fold → `client:visible`
   - Browser APIs required → `client:only="react"` (temporary)

## Optimization Checklist

### Current Status

- ✅ **Manual chunks configured** - Editor, Tiptap, Radix UI split into separate chunks
- ✅ **CSS code splitting enabled** - Styles split per component
- ⚠️ **Hydration optimization** - Some components could use better directives
- ⚠️ **Data fetching** - Some components fetch in React instead of Astro

### Recommended Optimizations

- [ ] Replace `client:only="react"` with `client:load`/`client:visible` where possible
- [ ] Move data fetching from React to Astro (MySpacesPanel, MyChurchPanel, NewThreadPanel)
- [ ] Use `client:idle` for non-critical features
- [ ] Use `client:visible` for below-fold content
- [ ] Move static content from .tsx to .astro files
- [ ] Use URL state for shareable UI state
- [ ] Prefer native HTML forms with progressive enhancement
- [ ] Leverage CSS for animations instead of JS

## Common Patterns for Harvous

### Note Editor (Needs to be React)

```astro
---
// pages/[id].astro
import TiptapEditor from '@/components/react/TiptapEditor';
const note = await getNote(id);
---

<TiptapEditor client:load content={note.content} onChange={handleChange} />
```

**Why React:**
- Rich text editing requires complex client-side state
- Tiptap is a React library
- Real-time formatting, undo/redo, etc.

### Thread List (Should be Astro)

```astro
---
// pages/index.astro - CURRENT (good example)
const threads = await getAllThreadsWithCounts(userId);
---

<div class="threads">
  {threads.map(thread => (
    <a href={`/${thread.id}`}>
      <CardThread title={thread.title} count={thread.noteCount} />
    </a>
  ))}
</div>
```

**Why Astro:**
- Static list display
- No client-side interactivity needed
- Better performance with SSR

### Search Bar (React Island)

```astro
---
// pages/find.astro
import FindSearchInput from '@/components/react/FindSearchInput';
const query = Astro.url.searchParams.get('q') || '';
---

<FindSearchInput client:load initialQuery={query} />
```

**Why React:**
- Real-time search as user types
- Client-side filtering
- Debouncing needed

### Navigation (React Island with Context)

```astro
---
// Layout.astro
import NavigationProvider from '@/components/react/navigation/NavigationContext';
const spaces = await getSpacesWithCounts(userId);
---

<NavigationProvider client:load>
  <NavigationColumn spaces={spaces} />
</NavigationProvider>
```

**Why React:**
- Complex state management (history, active items)
- Cross-component communication
- Real-time updates

## Migration Strategy

### 1. Audit Current Components

**Components that need refactoring:**

#### Data Fetching Violations:
- [ ] `MySpacesPanel.tsx` - Fetches spaces in `useEffect` (lines 33-76)
- [ ] `MyChurchPanel.tsx` - Fetches profile data in `useEffect` (lines 79-125)
- [ ] `NewThreadPanel.tsx` - Fetches all notes in `useEffect` (lines 126-155)

**Refactoring plan:**
1. Move data fetching to Astro page (profile.astro, etc.)
2. Pass data as props to React component
3. Remove `useEffect` data fetching
4. Keep client-side fetching only for user-triggered actions

#### Hydration Directive Issues:
- [ ] Audit 20+ components using `client:only="react"`
- [ ] Replace with `client:load`/`client:visible`/`client:idle` where possible
- [ ] Keep `client:only` only when browser APIs required

### 2. Categorize Components

**Can be pure Astro (no interactivity needed):**
- CardNote.astro ✅
- CardThread.astro ✅
- Button.astro ✅

**Need React but are fetching data (move fetch to Astro):**
- MySpacesPanel.tsx ⚠️
- MyChurchPanel.tsx ⚠️
- NewThreadPanel.tsx ⚠️

**Properly scoped React islands (interactive only):**
- TiptapEditor.tsx ✅
- NewNotePanel.tsx ✅
- ThreadCombobox.tsx ✅
- NavigationContext.tsx ✅

### 3. Start with Low-Hanging Fruit

**Priority order:**
1. **MySpacesPanel** - Simple prop passing
2. **MyChurchPanel** - Simple prop passing
3. **NewThreadPanel** - More complex (needs initialItems prop)
4. **Hydration directives** - Audit and replace `client:only` where possible

### 4. Move Heavy Lifting to Astro

**Before:**
```tsx
// React component fetches data
useEffect(() => {
  fetch('/api/spaces').then(r => r.json()).then(setSpaces);
}, []);
```

**After:**
```astro
---
// Astro page fetches data
const spaces = await getSpacesWithCounts(userId);
---
<MySpacesPanel client:load spaces={spaces} />
```

### 5. Keep Islands Lean

**React islands should only handle:**
- UI interactions (clicks, hovers, inputs)
- Client-side state (form inputs, modal open/close)
- Real-time updates (websockets, polling)
- Complex UI logic (drag-and-drop, rich text editing)

**React islands should NOT handle:**
- Initial data fetching (move to Astro)
- Server-side logic (use Astro actions)
- Static content rendering (use Astro)

## Testing Your Islands

Good island architecture means:
- ✅ Page loads fast without JS
- ✅ Content is visible before hydration
- ✅ No layout shift when islands hydrate
- ✅ Works without JS (progressive enhancement)
- ✅ JS only enhances the experience

### Performance Benchmarks

**Target metrics:**
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1

**How to measure:**
```bash
npm run build
# Test in production build
# Use Chrome DevTools Lighthouse
```

## Specific Cursor Prompts

Use these with Cursor Agent:

### Audit Prompt

```
Analyze all React components in src/components/react and categorize them:
1. Can be pure Astro (no interactivity needed)
2. Need React but are fetching data (move fetch to Astro)
3. Properly scoped React islands (interactive only)

Create a migration plan with priority order.
```

### Refactor Prompt

```
Refactor [ComponentName] following these rules:
- If no client-side state needed, convert to .astro
- If data fetching exists, move to Astro parent component
- If React island needed, ensure it only handles UI interactions
- Use appropriate client: directive (idle/visible/load)
- Pass data as props from Astro component
```

### Optimization Prompt

```
Optimize React island usage across the app:
1. Audit all components using client:only="react"
2. Replace with client:load/client:visible/client:idle where possible
3. Identify components that can use client:visible
4. Move all data fetching from useEffect to Astro components
5. Update components: MySpacesPanel, MyChurchPanel, NewThreadPanel
```

## Reference Documentation

- [REACT_ISLANDS_STRATEGY.md](./REACT_ISLANDS_STRATEGY.md) - Migration status and progress
- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - State management rules and best practices
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Data structures and system architecture
- [.cursorrules](../.cursorrules) - Project-specific development rules

## Quick Reference

### When to Use What

| Scenario | Solution |
|----------|----------|
| Static content | `.astro` file |
| Simple list display | `.astro` with data fetching |
| Form submission | `.astro` with `actions`, enhance with React |
| Rich text editing | React island with `client:load` |
| Search/filter | React island with `client:idle` or `client:visible` |
| Modal/dialog | React island with `client:load` |
| Below-fold content | React island with `client:visible` |
| Navigation state | React Context with `client:load` |
| Real-time updates | React island (fetch in React) |
| User-triggered actions | React island (fetch in React) |

### Client Directive Decision Tree

```
Does component need browser APIs on initial render?
├─ Yes → client:only="react" (temporary, refactor if possible)
└─ No → Is it critical/above-fold?
    ├─ Yes → client:load
    └─ No → Is it below the fold?
        ├─ Yes → client:visible
        └─ No → client:idle
```

---

**Remember:** The goal is minimal JavaScript, maximum performance, and progressive enhancement. Start with Astro, add React only when truly needed.


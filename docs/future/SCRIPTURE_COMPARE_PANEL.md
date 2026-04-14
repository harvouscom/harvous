# Scripture Compare Panel

## Context

Scripture notes in Harvous display a single bible verse. Users currently have no quick way to see that same passage in a different translation without changing their default. The "Compare" action adds a side-panel that mirrors how a scripture note looks in NewNotePanel—reference + translation switcher + verse body—but is fully read-only. Clicking a different translation re-fetches the verse immediately; no saving or editing occurs.

---

## Files to Change

| File | Change |
|---|---|
| `src/components/react/ScriptureComparePanel.tsx` | **New** — read-only scripture viewer with translation switcher |
| `src/utils/menu-options.ts` | Add `compareScriptureNote` option for scripture notes |
| `src/components/react/ActionStrip.tsx` | Dispatch `openScriptureComparePanel` event |
| `src/components/react/Menu.tsx` | Same dispatch for the More menu (not only ActionStrip) |
| `src/components/react/SquareButton.tsx` | Menu icon mapping for `compareScriptureNote` (see also `Menu.tsx` `renderIcon` / `book`) |
| `src/components/react/DesktopPanelManager.tsx` | Register panel type, state, event handlers, render |
| `src/components/react/BottomSheet.tsx` | Same wiring for mobile drawer |

---

## Step-by-Step

### 1. Create `ScriptureComparePanel.tsx`

**Path:** `src/components/react/ScriptureComparePanel.tsx`

Reuse the same CSS classes and UI as `ScriptureNoteForm.tsx` (`src/components/react/note-panel/ScriptureNoteForm.tsx`), but:
- Reference is a static `<p>` (not `<input>`)
- No TipTap editor — render verse HTML with `safeRenderHtml` (from `@/utils/content-renderer`)
- Translation dropdown is identical to ScriptureNoteForm (same CSS classes: `translation-dropdown-trigger`, `translation-dropdown-menu`, `translation-dropdown-item`, etc.)
- Copyright attribution at the bottom (same pattern as `CardFullEditable.tsx` lines 1841–1880), using `getTranslation` from `@/data/translations`

**Props:**
```ts
interface ScriptureComparePanelProps {
  noteId: string;
  scriptureReference: string;   // note title (e.g. "John 3:16")
  initialContent: string;        // current verse content from the note
  initialVersion: string;        // version stored on the note (e.g. "NET")
  onClose: () => void;
  inBottomSheet?: boolean;
}
```

**State:**
```ts
const [selectedVersion, setSelectedVersion] = useState(initialVersion || getCachedProfileData()?.defaultTranslation || 'NET');
const [verseContent, setVerseContent] = useState(initialContent);
const [isLoading, setIsLoading] = useState(false);
```

**Version change handler:**
```ts
async function handleVersionChange(newVersion: string) {
  setSelectedVersion(newVersion);
  setIsLoading(true);
  try {
    const res = await fetch('/api/scripture/fetch-verse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reference: scriptureReference, translation: newVersion }),
    });
    if (res.ok) {
      const data = await res.json();
      // API returns `text` (HTML), not `content` — see `POST /api/scripture/fetch-verse`
      if (data.text) setVerseContent(data.text);
    }
  } finally {
    setIsLoading(false);
  }
}
```

**Layout (mirrors ScriptureNoteForm layout, but read-only):**
```
panel-wrapper
  └── panel (panel--bottom-sheet when inBottomSheet)
        ├── panel__header
        │     └── panel__title  "Compare"
        ├── panel__body
        │     └── panel__content
        │           └── panel__content-scroll
        │                 ├── Reference row (flex, gap-3)
        │                 │     ├── <p> scripture reference (24px bold, same as ScriptureNoteForm input style)
        │                 │     └── Translation dropdown (identical to ScriptureNoteForm)
        │                 └── Verse content area (mt-5, rendered HTML via safeRenderHtml, opacity-50 during load)
        └── Attribution footer (same pattern as CardFullEditable lines 1841-1880)
  └── panel__footer--buttons
        └── SquareButton variant="Back" onClick={onClose} inBottomSheet={inBottomSheet}
```

No "Save" button — this is view-only.

---

### 2. `src/utils/menu-options.ts`

In `getMenuOptions`, inside the `case "note":` block, after **Threads** and **Tags** (and after the optional **Notes** push for scripture), add:

```ts
if (noteType === 'scripture') {
  options.push({ action: "compareScriptureNote", label: "Compare" });
}
```

Order for scripture notes: **Notes** (if applicable) → **Threads** → **Tags** → **Compare** → Lock / Share / Erase as applicable.

---

### 3. `src/components/react/ActionStrip.tsx`

In `dispatchAction`, add before the existing `editThread` handler:

```ts
if (action === 'compareScriptureNote') {
  window.dispatchEvent(new CustomEvent('openScriptureComparePanel', { detail: { contentId } }));
  return;
}
```

---

### 4. `src/components/react/DesktopPanelManager.tsx`

**a. Lazy import:**
```ts
const ScriptureComparePanel = createLazyComponent(
  () => import('./ScriptureComparePanel'), 'ScriptureComparePanel'
);
```

**b. `PanelType` union** — add `'scriptureCompare'`

**c. `PanelAction` union** — add:
```ts
| { type: 'OPEN_SCRIPTURE_COMPARE' }
| { type: 'CLOSE_SCRIPTURE_COMPARE' }
```

**d. `panelReducer`** — add cases:
```ts
case 'OPEN_SCRIPTURE_COMPARE':
  return { activePanel: 'scriptureCompare', panelKey: state.panelKey + 1 };
case 'CLOSE_SCRIPTURE_COMPARE':
  return { activePanel: null, panelKey: state.panelKey };
```

**e. State** — add alongside `sharePanelData`:
```ts
const [scriptureCompareData, setScriptureCompareData] = useState<{
  noteId: string; reference: string; content: string; version: string;
} | null>(null);
```

**f. Event listeners** (inside the main `useEffect` — **`[]` deps**): do **not** read `currentNote` from a stale closure. Use a **`currentNoteRef`** updated each render (`currentNoteRef.current = currentNote`) and only populate data when `String(currentNoteRef.current?.id) === String(contentId)`.

```ts
const handleOpenScriptureCompare = (event: Event) => {
  const { contentId } = (event as CustomEvent).detail || {};
  if (!contentId) return;
  const note = currentNoteRef.current;
  if (!note || String(note.id) !== String(contentId)) return;
  setScriptureCompareData({
    noteId: contentId,
    reference: note?.title ?? '',
    content: note?.content ?? '',
    version: note?.version ?? getCachedProfileData()?.defaultTranslation ?? 'NET',
  });
  dispatch({ type: 'OPEN_SCRIPTURE_COMPARE' });
  window.dispatchEvent(new CustomEvent('closeMoreMenu'));
};
```

Also clear `scriptureCompareData` in the **`closeAllPanels`** handler alongside `sharePanelData`.

```ts
const handleCloseScriptureComparePanel = () => {
  dispatch({ type: 'CLOSE_SCRIPTURE_COMPARE' });
  setScriptureCompareData(null);
};

window.addEventListener('openScriptureComparePanel', handleOpenScriptureCompare as EventListener);
window.addEventListener('closeScriptureComparePanel', handleCloseScriptureComparePanel);
// ... cleanup in return ...
```

**g. Close handler (useCallback):**
```ts
const handleCloseScriptureCompare = useCallback(() => {
  window.dispatchEvent(new CustomEvent('closeScriptureComparePanel'));
}, []);
```

**h. Breadcrumb dismiss** — add to `onBreadcrumbDismissTopLayer` switch:
```ts
case 'scriptureCompare':
  window.dispatchEvent(new CustomEvent('closeScriptureComparePanel'));
  break;
```

**i. Panel render** (alongside other panels):
```tsx
{state.activePanel === 'scriptureCompare' && scriptureCompareData && (
  <PanelErrorBoundary>
    <Suspense fallback={<DelayedFallback delayMs={80} containerClasses="h-full hidden min-[1160px]:block">
      <ProgressBarFallback containerClasses="h-full hidden min-[1160px]:block" />
    </DelayedFallback>}>
      <div className="h-full hidden min-[1160px]:block">
        <ScriptureComparePanel
          key={`scripture-compare-${state.panelKey}`}
          noteId={scriptureCompareData.noteId}
          scriptureReference={scriptureCompareData.reference}
          initialContent={scriptureCompareData.content}
          initialVersion={scriptureCompareData.version}
          onClose={handleCloseScriptureCompare}
          inBottomSheet={false}
        />
      </div>
    </Suspense>
  </PanelErrorBoundary>
)}
```

---

### 5. `src/components/react/BottomSheet.tsx`

**a. `DrawerType`** — add `'scriptureCompare'` to the union (line 72)

**b. `getDrawerTitle` titleMap** — add:
```ts
'scriptureCompare': 'Compare',
```

**c. `needsFreshState` array** — add `'scriptureCompare'` (around line 197)

**d. State** — add:
```ts
const [scriptureCompareData, setScriptureCompareData] = useState<{
  noteId: string; reference: string; content: string; version: string;
} | null>(null);
```

**e. Event listener** (inside the main effect near `openNoteDetailsPanel`; only open when `isMobile` and `currentNote` matches `contentId`). Register **`closeScriptureComparePanel`** on the same **`handleCloseBottomSheet`** as other closes, and in that handler clear `scriptureCompareData` when the drawer type is `scriptureCompare`. Add **`scriptureCompare`** to **`isFullHeightDrawer`**. Allow opening when offline: extend **`openBottomSheet`** offline allowlist with **`scriptureCompare`** (same idea as `note` / `resource` — user can still see the note’s cached verse; switching translation may fail until online).

```ts
const handleOpenScriptureComparePanel = (event: Event) => {
  if (!isMobile) return;
  const { contentId } = (event as CustomEvent).detail || {};
  if (!contentId || !currentNote || String(currentNote.id) !== String(contentId)) return;
  setScriptureCompareData({
    noteId: contentId,
    reference: currentNote.title ?? '',
    content: currentNote.content ?? '',
    version: currentNote.version ?? getCachedProfileData()?.defaultTranslation ?? 'NET',
  });
  openBottomSheet('scriptureCompare');
};
window.addEventListener('openScriptureComparePanel', handleOpenScriptureComparePanel as EventListener);
// cleanup in return
```

**f. Render** (alongside `noteDetails` render, around line 939):
```tsx
{drawerType === 'scriptureCompare' && scriptureCompareData && (
  <div className="panel-container flex-fill flex-stack" style={{ gap: 0 }}>
    <Suspense fallback={<DelayedFallback delayMs={80}>{mobileLoadingFallback}</DelayedFallback>}>
      <ScriptureComparePanel
        key={`mobile-scripture-compare-${panelKey}`}
        noteId={scriptureCompareData.noteId}
        scriptureReference={scriptureCompareData.reference}
        initialContent={scriptureCompareData.content}
        initialVersion={scriptureCompareData.version}
        onClose={() => window.dispatchEvent(new CustomEvent('closeScriptureComparePanel'))}
        inBottomSheet={true}
      />
    </Suspense>
  </div>
)}
```

**g. Import** — lazy import `ScriptureComparePanel` matching BottomSheet's existing lazy pattern.

---

## Implementation notes

- **`POST /api/scripture/fetch-verse`** response includes **`text`** (verse HTML), not `content`.
- **Menu vs strip:** `Menu.tsx` must dispatch `openScriptureComparePanel` for the More menu; `SquareButton` / `Menu` `renderIcon` should expose a **book** (or similar) icon for `compareScriptureNote` so it does not fall through to the generic “Note” sticky icon.
- **Preload:** optional idle preload of `./ScriptureComparePanel` in `preloadPanelChunks` for faster first open.

## Data Flow Notes

- The `contentId` dispatched by ActionStrip is the note ID.
- `currentNote` in DesktopPanelManager/BottomSheet carries `title` (scripture reference), `content` (verse HTML), and `version` (translation ID).
- The panel opens with the note's stored content + version; switching translations live-fetches from `POST /api/scripture/fetch-verse`.
- No new API endpoints needed.

---

## Verification

1. Open a scripture note (e.g., "John 3:16") — confirm "Compare" appears in the action strip.
2. Click "Compare" — panel opens with the reference title, verse text, and translation pill showing the note's current translation.
3. Click a different translation in the dropdown — verse content updates to the new translation.
4. Copyright attribution at the bottom changes to match the selected translation.
5. Close button dismisses the panel.
6. Repeat on mobile (narrow viewport) to confirm the bottom sheet variant works.
7. Confirm non-scripture notes ("default", "resource") do NOT show "Compare".

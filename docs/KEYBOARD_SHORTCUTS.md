# Keyboard Shortcuts

Harvous has two keyboard schemes, and they are not variations on each other.

- **Prototype (2.0)** uses bare **Shift + key** chords. No Cmd. This is the scheme the
  current app and the native apps share.
- **Classic** uses **Cmd/Ctrl + chord**. Legacy; documented here because Classic routes are
  still reachable.

Both are handled by one file — `src/utils/keyboard-shortcuts.ts` — which branches on the
route. `handlePrototypeKeyboardShortcut()` owns the Shift scheme, and Cmd+Shift chords are
suppressed on prototype routes so the two can't collide.

---

## Prototype shortcuts

### General

| Shortcut | Action |
|---|---|
| **⇧N** | New note |
| **⇧R** | Read the Bible |
| **⇧K** | Search and commands (opens the command palette) |
| **⇧,** | Settings |
| **⇧S** | Toggle sidebar |
| **⇧H** | Show Home |
| **⇧L** | Show list |
| **⇧J** | Focus the note list |
| **Esc** | Dismiss / clear a selection |

### Sidebar

| Shortcut | Action |
|---|---|
| **⇧← / ⇧→** | Cycle list mode (Notes, Folders, Highlights, Scripture, Threads, Resources) |
| **⇧↑ / ⇧↓** | Move focus in the list |
| **Home / End** | Jump to first / last |
| **Enter** | Open the focused item |
| **⌘F** | Focus the search field |
| **⌘←** | Back |

### Organize

These act on the **selection when one stands, and on the row holding keyboard focus when
none does**. That single rule is what makes bulk actions and one-row actions the same
gesture.

| Shortcut | Action |
|---|---|
| **⇧X** | Select / deselect the focused row |
| **⇧A** | Select all / none |
| **⇧M** | Move to folder |
| **⇧T** | Add to Thread |
| **⇧P** | Pin or unpin |
| **⇧⌫** | Delete |

Notes on the vocabulary:

- **⇧F is not "folder".** It is Find-in-note on note routes, and a note can be open while
  the sidebar holds a selection. **⇧M** ("move") takes folder instead.
- **⇧B is left alone** because native binds it to the sidebar toggle. See the divergence
  below.
- A verb never reaches a mutation the equivalent button would have greyed out — chord,
  palette row and bulk-bar button all pass through the same `everyRowAllows` gate in
  `spa/src/lib/note-row-capabilities.ts`.
- Organize verbs are **notes-only** today. `⇧X` / `⇧A` follow the checkbox wherever it
  goes, which currently means notes and highlights. The folder, Thread and resource lists
  still enter selection from the list menu and act from their own bars.

### Note

| Shortcut | Action |
|---|---|
| **⇧F** | Find in note |
| **⇧D** | Note details (inspector) |
| **⌘S** | Save |
| **Enter** | New paragraph, or title → body |
| **⇧Enter** | Line break within a paragraph |

⌘Enter is deliberately not a save chord — the editor uses it.

---

## Classic shortcuts

| Shortcut | Action |
|---|---|
| **⌘'** | New note |
| **⌘;** | New thread |
| **⌘K** | Spotlight search |
| **⌘S** | Save |
| **⌘⇧D** | Details panel |
| **⌘⇧S** | Share panel |
| **⌘⇧L** | Lock note |
| **⌘⇧E** | Edit |
| **⌘⇧H** | Home |
| **⌘←** | Back (overlay → hierarchy → history) |
| **⌘⌥S** | Space switcher |
| **⌘⌥[ / ]** | Previous / next item in the nav strip |
| **⌘⌥← / →** | Cycle content tabs |
| **⌘⌫** | Erase |
| **Esc** | Close the top panel |

Harvous does not use ⌘N for create, on either scheme.

---

## Where shortcuts are surfaced

| Surface | Path |
|---|---|
| Prototype settings page | `spa/src/pages/prototype/settings/PrototypeKeyboardShortcutsPage.tsx` |
| Classic preferences panel | `src/components/react/MyPreferencesPanel.tsx` |
| Native settings screen | `native/Harvous/Views/ProfileAndSettingsViews.swift` |
| Command palette | `spa/src/pages/prototype/PrototypeCommandPalette.tsx` |
| Shift-hold badges | `spa/src/hooks/usePrototypeShiftHints.ts` |

**Hold Shift for 400ms** and keycaps appear on toolbar buttons, and on the bulk bar's
Folder / Thread / Delete once a selection stands. The hold is what keeps Shift+letter typing
in the editor from flashing hints on every capital.

The prototype reference page is generated from `getPrototypeKeyboardShortcutsReference()`,
whose Organize group is derived from the command table in
`spa/src/lib/prototype-commands.ts`. A verb cannot exist as a chord without appearing on
that page. (The two used to be independent lists, and the page had already drifted — it was
missing ⌘F and ⌘←.)

There is no `?` cheatsheet overlay. The palette and the settings page cover it.

---

## Implementation

- **Handler:** `src/utils/keyboard-shortcuts.ts` — one capture-phase `keydown` listener.
- **Init:** `src/components/react/KeyboardShortcutsInit.tsx`, mounted from `spa/src/App.tsx`
  and `spa/src/layouts/SimplifiedPrototypeLayout.tsx`.
- **Dispatch:** the handler never calls app code directly. It fires `CustomEvent`s on
  `window`; components listen. Organize verbs share **one** event,
  `prototypeShortcutListVerb`, carrying `{ verb }` — the decision about whether a verb
  applies belongs with the selection state in `PrototypeSidebar`, not with the key.
- **Typing guard:** `isPrototypeTypingContext()` defers every Shift chord to any active
  text field, so `x`, `m`, `p` and `a` type normally.
- **Command palette target:** the sidebar publishes a context *getter* to
  `spa/src/lib/prototype-command-context-store.ts`. A getter rather than a value because
  part of the context is which row has focus, and focus moves without re-rendering React.

**Tests:** `src/utils/__tests__/keyboard-shortcuts.test.ts` drives the real listener;
`spa/src/lib/__tests__/prototype-commands.test.ts` covers the gates and wording.

---

## Native parity

Native has its own implementations: SwiftUI `.keyboardShortcut()` in
`native/Harvous/HarvousCommands.swift` for menu commands, plus a Shift monitor in
`native/Harvous/DesignSystem/HarvousShortcutKeycap.swift` (macOS `NSEvent` monitor,
iOS `UIKeyCommand`) with the same 400ms hold-to-hint.

Two divergences worth knowing:

1. **Sidebar toggle differs by platform.** Web binds **⇧S**; native binds **⇧B**.
   `docs/design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md` sides with native, so the
   parity doc and the web implementation currently contradict each other. Unresolved.
2. **Native is ahead on editor and note navigation.** It has a full Format menu
   (bold/italic/headings/lists/link/code), Daily Note, Random Revisit, Insert Wikilink,
   New Connected Note, next/prev note, next/prev scripture pill, next/prev study highlight,
   and dock toggles. The web prototype has none of these.

Native has no multi-select, so the Organize chords above are new vocabulary there. When
native follows, hang them on the existing `HarvousShiftShortcut` enum.

Prototype-only today: ⇧H, ⇧L, ⇧R, ⇧↑/⇧↓, and the whole Organize group.

---

## Related

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md](./design-parity/PROTOTYPE_NATIVE_MENU_CONTENT_PARITY.md)

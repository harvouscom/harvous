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
| **⇧K** | Search the Library — opens the panel with the caret in its search field |
| **⇧,** | Settings |
| **⇧S** | Toggle sidebar |
| **⇧H** | Show Activity |
| **⇧L** | Open the Library — the same panel, no caret, ready to browse |
| **⇧J** | Focus the list — the panel's when it is open, the sidebar's otherwise |
| **Esc** | Dismiss / clear a selection |

### Browsing

**⇧K**, **⇧L** and **⌘F** all open one surface: the **Library panel**, which morphs out of the
toolbar's centre chip. It replaced the command palette — the tabs are the browsing, the query is
the retrieval, and the organize verbs appear as an **Actions** group above the results. ⇧K and ⌘F
put the caret in the field; ⇧L does not, because the arrow keys belong to the list when you came
to browse.

The sidebar is still there behind **⇧S** and keeps its own search field, but nothing points a
chord at it any more.

| Shortcut | Action |
|---|---|
| **⇧← / ⇧→** | Cycle sections — the panel's tabs when it is open, the sidebar's list mode when the sidebar is expanded, and from neither it opens the panel |
| **⇧↑ / ⇧↓** | Move focus in the list |
| **Enter** | Open the focused item |
| **⌘F** | Open the Library panel's search |
| **⌘←** | Back |

Panel tab order for ⇧← / ⇧→: Everything, Notes, Folders, Threads, Highlights, Scripture,
Resources. Cycling clears any drill, because the tab is what Back returns to.

Nothing binds Enter: every panel row is a real `<button>`, so Enter and Space already fire it.
`use-library-panel-keys.ts` says outright that this is why the rows are buttons rather than divs
with click handlers, and that it is worth not undoing.

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
  Actions row and bulk-bar button all pass through the same `everyRowAllows` gate in
  `spa/src/lib/note-row-capabilities.ts`.
- The panel's Actions group is **filtered** by the query, unlike the palette's, which listed
  every available command unconditionally. Its field also searches notes, folders, Threads,
  highlights, Scripture and resources, so an unfiltered group would offer six verbs to
  someone who typed "grace" (`library-command-matches.ts`).
- `⇧X` / `⇧A` follow the checkbox wherever it goes. In the Library panel that is Everything,
  Notes, Folders, Threads and Highlights; Scripture and Resources have no checkbox, and a
  Scripture drill selects nothing because its rows are passages and books rather than things
  the six verbs can act on. Only notes take all six — folders, Threads and highlights take pin
  and their own destructive, which is what their bars have always offered
  (`library-panel/use-library-selection.ts`).
- Selecting is **entered from the tab menu**, under the kinds, not from a control attached to
  the search field and not from a hover reveal on the rows — there is no hover on a phone.

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
| Library panel | `spa/src/pages/prototype/library-panel/PrototypeLibraryPanelHost.tsx` |
| Panel Actions group | `spa/src/pages/prototype/library-panel/library-command-matches.ts` |
| Shift-hold badges | `spa/src/hooks/usePrototypeShiftHints.ts` |

**Hold Shift for 400ms** and keycaps appear on toolbar buttons, and on the bulk bar's
Folder / Thread / Delete once a selection stands — on both bars, the sidebar's and the
panel's, which are literally the same `.proto-bulk-bar` chrome. The hold is what keeps
Shift+letter typing in the editor from flashing hints on every capital.

The prototype reference page is generated from `getPrototypeKeyboardShortcutsReference()`,
whose Organize group is derived from the command table in
`spa/src/lib/prototype-commands.ts`. A verb cannot exist as a chord without appearing on
that page. (The two used to be independent lists, and the page had already drifted — it was
missing ⌘F and ⌘←.)

There is no `?` cheatsheet overlay. The Library panel and the settings page cover it: with a
row focused and nothing typed, the panel's Actions group lists what you could do to it, chords
included.

**The command palette is retired.** `PrototypeCommandPalette.tsx` is gone, and
`spa/src/pages/prototype/library-panel/__tests__/palette-retired.test.ts` guards the absence —
the component file, any `cmdk` import under `pages/prototype`, the `proto-command-palette`
stylesheet block, and the shell mounting it. Source-text assertions rather than behaviour,
because what is being guarded is the absence of code, which nothing else can observe.

The reference page's second group is **Browsing**, not "Sidebar", and matches the table
above chord for chord. It used to carry a `Home / End → "Jump to first / last"` row that
nothing ever bound — the only Home/End handler on a prototype route is the sidebar's resize
grip — so the row is gone rather than reproduced here.

---

## Implementation

- **Handler:** `src/utils/keyboard-shortcuts.ts` — one capture-phase `keydown` listener.
- **Init:** `src/components/react/KeyboardShortcutsInit.tsx`, mounted from `spa/src/App.tsx`
  and `spa/src/layouts/SimplifiedPrototypeLayout.tsx`.
- **Dispatch:** the handler never calls app code directly. It fires `CustomEvent`s on
  `window`; components listen. Organize verbs share **one** event,
  `prototypeShortcutListVerb`, carrying `{ verb }` — the decision about whether a verb
  applies belongs with the selection state, not with the key. The selection itself is the
  shell's, so the sidebar and the panel act on one list rather than two that have to be kept
  in step (`library-panel/use-library-selection.ts`).
- **⇧K's event kept its old name.** It still fires `prototypeShortcutOpenCommandPalette`; the
  shell now answers it by opening the panel's search. The name is what `palette-retired.test.ts`
  asserts the shell still contains, so the chord cannot be quietly unhooked.
- **Typing guard:** `isPrototypeTypingContext()` defers every Shift chord to any active
  text field, so `x`, `m`, `p` and `a` type normally.
- **Command target:** whichever list is showing publishes a context *getter* to
  `spa/src/lib/prototype-command-context-store.ts`. A getter rather than a value because
  part of the context is which row has focus, and focus moves without re-rendering React.
  The panel reads it through `library-panel/use-library-command-context.ts`, which captures
  it during the mount render and afterwards only ever *improves* the answer. The palette
  could read once and be done, because mounting was opening; the panel stays mounted while
  you type, so a naive re-read would overwrite the good mount-time answer with `null` for
  the worst possible reason — focus is now in the panel's own search field.

**Tests:** `src/utils/__tests__/keyboard-shortcuts.test.ts` drives the real listener;
`spa/src/lib/__tests__/prototype-commands.test.ts` covers the gates and wording;
`spa/src/pages/prototype/library-panel/__tests__/` covers the panel's view model, morph,
selection and command capture.

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

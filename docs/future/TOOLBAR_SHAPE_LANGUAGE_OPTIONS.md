# Toolbar Shape Language — Options

**Status:** Decision doc. Not started.
**Last Updated:** August 21, 2026
**Audience:** Whoever picks the shape, and whoever implements it afterwards.
**Covers:** improvement-list items #11 (orb → square icon blocks) and #24 (floating menu cohesion).

---

## Executive summary

The shell currently speaks two shape languages at once. Toolbar controls are 30px translucent
circles (`.proto-toolbar-icon-btn`, `spa/src/styles/prototype-components.css`); sidebar controls are
30×30 rounded squares on a flat surface (`.proto-sidebar-back-tile`, same file). Same size, same
job, different vocabulary — and they are visible at the same time.

**Recommendation: Option B — icon-only controls become tiles and keep their glass; the two labelled
controls stay pills; the account avatar stays round.**

The framing that makes this obvious is that there are *two* axes, not one, and today's toolbar
differs from the sidebar on both at once — which is why the mismatch reads as arbitrary rather than
as a distinction:

| Axis | What it should say | Toolbar | Sidebar |
|---|---|---|---|
| **Material** | what the control sits *on* | glass — it floats over the page | flat — it rests on a panel |
| **Shape** | what *kind* of control it is | tile = icon target, pill = labelled chip, circle = avatar | same |

Read that way, the material difference is not a mismatch at all — it is correct, and it is doing
work. The toolbar floats over the note and over an image wallpaper, and the glass is what says so.
Only the *shape* was arbitrary. So the recommendation changes exactly one thing and leaves the other
alone. **This is the toolbar/top-nav pattern**: glass material, tile shape for icon targets, pill for
anything carrying a label, circle only for the avatar.

An earlier draft of this doc recommended flattening the surface too (now Option D). Seeing the
options rendered side by side is what corrected it — a flat toolbar stops reading as chrome floating
over the page and starts reading as another panel, which loses something the glass was earning.

Two findings change what "adopt the tile" means, and both argue against copying the sidebar tile
verbatim:

1. **The tile's `9px` radius is not a design token.** It is a hardcoded literal, appearing three
   times in `prototype-components.css`, with no `--pds-radius-*` entry and no `HarvousShape`
   counterpart. Adopting it wholesale would promote an unsanctioned value into the app's most
   visible chrome. Use `--pds-radius-row` (10px, already mirrored by `HarvousShape.rowHighlight`
   and `HarvousShape.input`) and retire the 9s.
2. **The web/native radius mirror has already drifted**, so "native is the source of truth" cannot be
   assumed here — it has to be checked per value. See [Native parity](#native-parity) below.

---

## The alternatives

Letters match the rows in the `ds-20-toolbar-shape` gallery scene, which renders all five against
the real tokens.

| Option | Verdict | Trade-off |
|---|---|---|
| A. Do nothing | Defensible | The mismatch is real but quiet; nothing is broken |
| **B. Tiles, glass kept — icon controls take the tile shape and keep the toolbar's glass; labelled controls stay pills; avatar stays round** | **Recommended** | One more rule to hold ("labels get pills"), in exchange for each shape meaning something. Changes only the axis that was arbitrary |
| C. Tiles, flat — shape *and* material both move to the sidebar's | Not recommended | Fully consistent with the sidebar, but the toolbar stops reading as floating chrome. Discards a distinction that was carrying meaning |
| D. Flat circles — material only, shape unchanged | Weakest | The inverse of B: fixes the axis that was already correct and leaves the one that was not |
| E. Everything square — chips and avatar squared off too | Not recommended | One rule, but a labelled chip in a near-square is not a shape that wants a label in it, and a squared avatar reads as a control rather than a face |

---

## What exists today

### The orb

`.proto-toolbar-icon-btn` in `spa/src/styles/prototype-components.css`:

| Property | Value |
|---|---|
| Size | `var(--pds-toolbar-orb-size)` = `30px` (`spa/src/styles/prototype-tokens.css:573`) |
| Radius | `var(--pds-radius-pill)` = `999px` |
| Border | `0.5px solid var(--pds-border-control)` |
| Background | `var(--pds-bg-glass-medium)` + `backdrop-filter: var(--pds-glass-blur-control)` |
| Text | `var(--pds-text-primary)` |

Used by **16 component files** across `spa/src` and `src` — `NativeToolbar.tsx`,
`PrototypeSidebarToolbar.tsx`, `AccountMenu.tsx`, `ListViewMenu.tsx`, `SpaceSwitcherMenu.tsx`,
`PrototypeNoteMoreMenu.tsx`, the settings shells, and several sheets.

### The tile

`.proto-sidebar-back-tile` in the same file:

| Property | Value |
|---|---|
| Size | `30px` / `30px` (literals) |
| Radius | `9px` (literal — **no token**) |
| Border | none |
| Background | `var(--pds-bg-control)` |
| Text | `var(--pds-text-secondary)` |

`border-radius: 9px` occurs **three times** in `prototype-components.css`. There is no
`--pds-radius-9`, and `HarvousShape` has no 9. The nearest sanctioned values are
`--pds-radius-format` (8px, `HarvousShape.formatButton`) and `--pds-radius-row` / `--pds-radius-input`
(10px, `HarvousShape.rowHighlight` / `.input`).

### The two controls that are not icons

Both are height-locked to the orb (`height: var(--pds-toolbar-orb-size)`) and sit in the same row:

- `.proto-toolbar-folder-chip` — a labelled folder chip
- `.proto-toolbar-space-switcher` — `border-radius: var(--pds-radius-pill)`, holds an icon plus a
  space title, and swaps to the plain orb class when it has no label to show
  (`spa/src/pages/prototype/SpaceSwitcherMenu.tsx`)

This is why "make the orbs square" is not a one-line change: the row's shape language includes two
controls that are wide because they carry words.

---

## Option B in detail

**Goal:** one shape per kind of thing, so the toolbar stops looking like two design systems met in
the middle.

**Build:**
- Icon-only toolbar controls adopt the tile treatment — `--pds-radius-row` (10px), flat
  `--pds-bg-control`, no glass. Applied at `.proto-toolbar-icon-btn`, so all 16 consumers follow.
- `.proto-toolbar-folder-chip` and `.proto-toolbar-space-switcher` keep `--pds-radius-pill`. They are
  chips with labels; Concept 8's own table already says pills and chips are 999.
- `AccountMenu`'s `.proto-profile-orb` stays circular. It is an avatar, and avatars are round
  everywhere including native.
- Replace the three hardcoded `9px` radii with `--pds-radius-row` so the sidebar and toolbar
  genuinely match rather than being one pixel apart.

**Reuse:** `--pds-radius-row`, `--pds-bg-control`, `--pds-border-control` all exist. No new token is
required, which is the point — the alternative was minting a `9`.

**Done when:** the toolbar and sidebar tiles are indistinguishable at the same size; the folder chip
and space switcher still read as labelled chips; the avatar is untouched; no `border-radius: 9px`
remains in `prototype-components.css`.

### What to watch

Dropping `backdrop-filter` from the toolbar is not purely cosmetic. The glass tier is deliberate —
`--pds-glass-blur-control` is the control-level tier of a three-tier system documented in
`docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md` §3, and the toolbar sits over scrolling content
and over the wallpaper appearance mode. Flattening it must be checked in all three appearance modes
(light, dark, image wallpaper), because a flat `--pds-bg-control` over a photo wallpaper is a
different proposition from a flat tile inside an opaque sidebar.

If that check fails, Option B degrades gracefully: keep the glass, take only the radius.

---

## Native parity

The honest position here is narrower than the general rule, and worth stating plainly.

`docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md` §0 says native is the source of truth and web
mirrors it. For this change, there is no native counterpart to mirror:

- `HarvousShape.swift` has **no toolbar orb token**. Its radii are `card` 20, `button` 12, `input` 10,
  `pill` 999, `scripturePill` 14 (macOS) / 11 (iOS), `rowHighlight` 10, `formatButton` 8,
  `sidebarGlassLeading` 16.
- macOS Harvous uses the **system unified toolbar** (`ToolbarItem` in `ContentView.swift`), so its
  button shape is AppKit's, not a Harvous value.
- `native/Harvous/Views/NoteToolbar.swift` is the iOS *floating format bar* — a
  `Capsule(style: .continuous)` over a material backdrop, with `HarvousRadius.formatButton` on the
  individual buttons. It is not the same surface as the web top toolbar.

So the mirror obligation depends entirely on which value is chosen:

| If the change… | Then |
|---|---|
| Reuses `--pds-radius-row` (10px) | Nothing to add. `HarvousShape.rowHighlight` / `.input` already hold 10 |
| Mints a new radius (e.g. 9px) | Must be added to `HarvousShape` first, per BUILD_CONVENTIONS §7 |
| Only changes `--pds-toolbar-orb-size` / `--pds-toolbar-h` | No Swift counterpart exists, but it works against the "keep orb metrics aligned" note in `HARVOUS_DESIGN_SYSTEM.md` §3 |

**The mirror is not currently intact, and a proposal here should not pretend otherwise.** Two shipped
values already disagree:

| Token | Web | Native |
|---|---|---|
| `--pds-radius-button` | `999px` | `HarvousShape.button = 12` |
| `--pds-radius-scripture` | `999px` | `HarvousShape.scripturePill = 14` / `11` |

Whether those are deliberate platform adaptations or drift is itself worth answering. Until it is,
"native is the source of truth" should be read as a policy to uphold, not a description of the
current state.

---

## Prior art: `redesign-exploration.md` Concept 8

`docs/future/redesign-exploration.md` Concept 8 ("Design System: SwiftUI Sensibility") already
proposes a shape language:

| Element | Concept 8 | Shipped today |
|---|---|---|
| Cards | 16px | **20px** (`HarvousShape.card`, commented `"squishier" — up from 16`) |
| Buttons | 12px | `HarvousShape.button = 12`; web `--pds-radius-button` is `999px` |
| Inputs | 10px | 10px — agrees |
| Pills / chips | 999px | 999px — agrees |

Concept 8's table is **stale rather than aspirational**: the card radius moved from 16 to 20 after it
was written, and the Swift comment records the direction of travel. This doc therefore treats
Concept 8 as superseded on cards, consistent on inputs and pills, and **silent on toolbar icon
buttons** — it has no entry for them, which is the gap this doc fills.

The relevant inheritance from Concept 8 is its principle, not its numbers: pills and chips are 999,
everything structural is a small rounded square. Option B is that principle applied to a surface
Concept 8 did not cover.

---

## The floating-menu half (#24)

Changing the toolbar's shape without touching the surfaces that open *from* it would leave the
mismatch one layer down. Floating chrome is currently two systems:

| System | Entry point | Scope |
|---|---|---|
| Editor-side | `.floating-picker-enter` (`src/styles/global.css:1277`) | 5 files — selection action bar, translation picker, mention picker, scripture pill chrome, reader verse menu |
| Shell-side | `ProtoPopoverShell` + `spa/src/pages/prototype/proto-portaled-popover-classes.ts` | 30 files — account menu, space switcher, list view, folder popover, share popover, sheets |

The shell-side system is already centralized, which makes it the cheap half: one file governs
entrance and origin classes for thirty components.

**Already off both systems** — `src/components/react/LinkPreviewCard.tsx` and
`src/components/react/UrlLinkPromptUI.tsx` position and animate themselves. This is a pre-existing
cohesion gap, independent of any shape decision, and the smallest useful piece of #24: bringing the
two link surfaces onto the editor-side system is worth doing whether or not the orb changes.

**Recommendation for #24:** treat it as a follow-on, not a prerequisite. Land the shape decision
first, then align popover radii to whatever the toolbar settles on, then fold the two link surfaces
in. Doing it in the other order means aligning to a target that is about to move.

---

## Risks / watch-items

- **Blast radius is 16 component files** through one class. That is a feature — one CSS block
  changes all of them — but it also means there is no partial rollout. Check every consumer.
- **Appearance modes.** Any surface change needs light, dark, and image-wallpaper verification.
  A flat control over a photo wallpaper is the risky case.
- **No toolbar gallery scene exists.** Neither `spa/src/pages/dev/design-system/sceneRegistry.ts`
  nor the shared-spaces registry has one. Implementation should add `ds-20-toolbar` (or fill the
  vacant `ds-07`), `phase: 'Shell'`, with `editFiles` naming `NativeToolbar.tsx`,
  `prototype-components.css`, and `native/Harvous/Views/NoteToolbar.swift`. `npm run design:check`
  will not catch a regression here today, because it checks token presence and registry uniqueness,
  not rendering.
- **Architecture watch-items sit in the path.** `docs/design-parity/ARCHITECTURE_READINESS_AUDIT.md`
  lists W1 (`spa/src/layouts/proto-shell-context.tsx`) and W2
  (`spa/src/pages/prototype/PrototypeSidebar.tsx`) as P1 debt; both are in the path of shell chrome
  work. Not a blocker for a CSS-level shape change; a real one if the change grows into restructuring.
- **The dot indicators ride on the orb.** `.proto-toolbar-icon-btn__share-dot` and
  `.proto-toolbar-icon-btn__unseen-dot` are absolutely positioned against the orb's border box and
  assume its corner. A square corner moves where the dot should sit.

---

## Related docs

- `docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md` — token ownership, §7 add-vs-reuse checklist
- `docs/design-parity/HARVOUS_DESIGN_SYSTEM.md` — §3 component inventory ("keep orb metrics aligned")
- `docs/design-parity/HARVOUS_DESIGN_PARITY_SPEC.md` — §5 allowed cross-platform differences
- `docs/future/redesign-exploration.md` — Concept 8, prior art (superseded on cards)
- `docs/design-parity/ARCHITECTURE_READINESS_AUDIT.md` — W1 / W2

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-21 | **Option B accepted — tile shape, glass kept.** This is the toolbar/top-nav pattern: glass material, tile for icon targets, pill for labelled controls, circle for the avatar. | Derek's call, made against the rendered `ds-20-toolbar-shape` scene rather than the description. The doc had originally recommended flattening the surface as well; seeing it showed the glass was carrying meaning — it says the toolbar floats over the page — and only the shape was arbitrary. Implementation still open: `--pds-radius-row` vs a new token, and the `9px` literals to retire. |

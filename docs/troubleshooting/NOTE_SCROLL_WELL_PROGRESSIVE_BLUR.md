# Note scroll well: progressive blur (deferred)

## Context

We experimented with **progressive blur** at the top and bottom of the note body scroll area (TipTap edit mode and CardFullEditable view mode), using sticky `::before` / `::after` bands with `backdrop-filter` and gradient masks. The goal was a frosted edge instead of a simple alpha fade.

## Problem

On **light card backgrounds**, raw `backdrop-filter: blur()` often produces a **muddy, grayish band** (“gray dead zone”) where text and colored UI (e.g. scripture pills) look dirty or smudged rather than cleanly fading out.

Mitigations tried included white gradient overlays and `saturate()` on the backdrop filter; results were still not satisfactory enough to ship.

## Current behavior (restored)

Scroll wells use a **linear alpha mask** on the scroll container when the user has scrolled down and content overflows:

- TipTap: `.tiptap-content--top-fade` in [`src/styles/tiptap-editor.css`](../../src/styles/tiptap-editor.css)
- View mode: `.card-full-editable__content-scroll--top-fade` in [`src/styles/card-full-editable.css`](../../src/styles/card-full-editable.css)

Classes are toggled from [`src/components/react/TiptapEditor.tsx`](../../src/components/react/TiptapEditor.tsx) and [`src/components/react/CardFullEditable.tsx`](../../src/components/react/CardFullEditable.tsx). There is **no** bottom edge treatment in the current product CSS.

## If we revisit

- Re-evaluate **design**: soft mask-only edges vs blur vs separate overlay div with solid/paper gradient (similar to desktop nav column).
- Test **Safari / iOS PWA** compositing for any `backdrop-filter` inside `overflow: auto`.
- Consider **`prefers-reduced-motion`**: blur-free fallback (mask-only) for users who reduce motion.
- Avoid shipping until edge cases (pills, links, selection) look clean on white and paper-toned surfaces.

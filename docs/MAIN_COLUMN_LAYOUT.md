# Main column layout system

This doc describes how the main content area (thread, dashboard, space, note pages) fills the viewport and how CTAs are positioned. Use it when changing layout or adding main-content pages so the height and button placement don't regress.

See also: [docs/SCROLLABLE_CONTENT_CONSTRAINTS.md](SCROLLABLE_CONTENT_CONSTRAINTS.md) for the general flex chain and `min-height: 0` principle.

## 1. Main column structure (DOM)

Authenticated app layout (mobile and desktop) funnels into a main column that holds the scroll area and floating CTAs:

```
app-layout
  mobile-layout | desktop-layout
    mobile-main (main-column-with-cta) | section.layout-column (main-column-with-cta)
      mobile-main__body | main-column__body
        main-column__scroll          ← scroll container (flex, flex: 1, min-height: 0)
          Outlet (page root)         ← CardStack, or wrapper + CardFullEditable, etc.
        CreateNoteButton (desktop)   ← optional, sibling of scroll
        note-page-add-button         ← when on note page
        mobile-action-strip-dock     ← when dock visible (mobile)
```

The **Outlet** renders the matched route (ThreadPage, DashboardPage, SpacePage, NotePage, etc.). Its root (or the single box child of `main-column__scroll`) must fill the scroll area.

## 2. Rule: scroll area content must fill

- `main-column__scroll` is a flex container with `flex: 1; min-height: 0` so it gets a defined height from its parent.
- Its **direct child** (the page root) must fill that height. We enforce this in `layout.css` with **position: absolute; top: 0; left: 0; right: 0; bottom: 0** on `.main-column__scroll > *`, so the child always fills regardless of wrappers (e.g. NotePage's `display: contents` wrapper).
- If you add a new wrapper around the Outlet, ensure the **effective** root (the one box that fills) still gets that treatment, or keep the absolute rule so the single box child fills.

## 3. CardStack in the main column

When the page root is a CardStack (thread, dashboard, space):

- The **inner** chain (container → content → inner → inner-content) must use **flex: 1 1 0%; min-height: 0** so the scrollable list extends to the bottom.
- These rules live in `layout.css` under `.main-column__scroll .card-stack__container` (and `.card-stack__content`, `.card-stack__inner`, `.card-stack__inner-content`). Don't remove them.

## 4. Note page (CardFullEditable)

- CardFullEditable is made to fill the scroll area via `.main-column__scroll .card-full-editable` with the same **position: absolute; top: 0; left: 0; right: 0; bottom: 0** pattern.
- The note-page add button (`.note-page-add-button`) is a sibling of `main-column__scroll` inside `mobile-main__body` / `main-column__body`, positioned **bottom: 12px; right: 12px** in `layout.css`.

## 5. CTAs at the bottom

- **CreateNoteButton** (thread/dashboard/space): Rendered *inside* the card by the page components. It lives in `card-stack__inner-content`. We use **position: sticky; bottom: 0** (in `layout.css` for `.card-stack__inner-content > .create-note-button-wrapper`) so it stays at the bottom of the scroll viewport. CreateNoteButton injects a spacer and uses a spacer element so list content can scroll above it.
- **NotePageAddButton**: Rendered in AppLayout as a sibling of `main-column__scroll`; **position: absolute; bottom: 12px; right: 12px** in `layout.css`.

## 6. Checklist for layout changes

- **Adding a new main-content page** (new route that renders in the main column): Ensure the page root (or the single box child of `main-column__scroll`) fills the scroll area. If it's a new card-like component, add a rule in `layout.css` so it fills (absolute or flex) and any inner scroll area has the flex chain + `min-height: 0`.
- **Adding a floating CTA** in the main column: Decide whether it's inside the scroll (use sticky + spacer) or a sibling of `main-column__scroll` (use absolute + bottom/right).
- **Changing DOM structure** around Outlet or CardStack: Re-check that the scroll's (effective) single child still fills and that the CardStack inner chain still has the `layout.css` rules applied.

## 7. Where the rules live

- **[src/styles/layout.css](src/styles/layout.css)**: Main-column structure, scroll child fill (`.main-column__scroll > *`), CardStack chain (`.main-column__scroll .card-stack__container`, etc.), note page card fill (`.main-column__scroll .card-full-editable`), CTA positions (`.create-note-button-wrapper`, `.note-page-add-button`).
- **[src/styles/cards.css](src/styles/cards.css)**: Base styles for `.card-stack`, `.card-stack__container`, `.card-stack__content`, `.card-stack__inner`, `.card-stack__inner-content`.

Reference [docs/SCROLLABLE_CONTENT_CONSTRAINTS.md](SCROLLABLE_CONTENT_CONSTRAINTS.md) for the general "flex chain + min-height: 0" principle.

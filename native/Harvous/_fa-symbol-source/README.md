# Font Awesome Solid — native catalog icons (`Harvous.*`)

## Shipped in the app

The toolbar / sidebar / dock vectors are **Font Awesome Free 6 Solid** SVGs, checked in as **`template-rendering-intent`** **imagesets** under [Assets.xcassets](../Assets.xcassets/). Swift uses `HarvousFAGlyph` (rasterized `NSImage` / `UIImage`) so fixed point sizes match the prototype + web (`Icon`).

**License:** Font Awesome Free icons are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); fonts OFL; code MIT — see [fontawesome.com/license/free](https://fontawesome.com/license/free). Harvous surfaces attribution where other third-party credits appear (e.g. About / legal).

This folder (`_fa-symbol-source/`) keeps **source-of-truth copies** (Harvous-facing filenames) aligned with `node_modules/@fortawesome/fontawesome-free/svgs/solid/` for bumps and audits.

## Regenerate imagesets from npm

From the repo root (`harvous/`):

```bash
FA=node_modules/@fortawesome/fontawesome-free/svgs/solid
ASSETS=native/Harvous/Assets.xcassets
cp "$FA/pen-to-square.svg"   "$ASSETS/Harvous.Pencil.imageset/Pencil.svg"
cp "$FA/note-sticky.svg"     "$ASSETS/Harvous.Note.imageset/Note.svg"
cp "$FA/layer-group.svg"     "$ASSETS/Harvous.CardsFilled.imageset/CardsFilled.svg"
cp "$FA/highlighter.svg"     "$ASSETS/Harvous.Highlight.imageset/Highlight.svg"
cp "$FA/book-open.svg"       "$ASSETS/Harvous.BookOpen.imageset/BookOpen.svg"
cp "$FA/table-columns.svg"   "$ASSETS/Harvous.LayoutSidebarLeft.imageset/LayoutSidebarLeft.svg"
cp "$FA/table-columns.svg"   "$ASSETS/Harvous.LayoutSidebarRight.imageset/LayoutSidebarRight.svg"
cp "$FA/user.svg"            "$ASSETS/Harvous.UserFilled.imageset/UserFilled.svg"
```

(`LayoutSidebarLeft` and `LayoutSidebarRight` intentionally share **table-columns** — two-column split metaphor; swap to a distinct FA icon if you want asymmetry.)

Mirror into this folder with the **Harvous filenames** (same `cp` targets as above but `native/Harvous/_fa-symbol-source/<Name>.svg`).

## Naming map (toolbar / sidebar core set)

| Harvous imageset / file   | Font Awesome Free 6 solid |
|---------------------------|---------------------------|
| Pencil                    | pen-to-square.svg         |
| Note                      | note-sticky.svg           |
| CardsFilled               | layer-group.svg           |
| Highlight                 | highlighter.svg           |
| BookOpen                  | book-open.svg             |
| LayoutSidebarLeft         | table-columns.svg         |
| LayoutSidebarRight        | table-columns.svg         |
| UserFilled                | user.svg                  |

(The full `Harvous.*` set is broader — see `Assets.xcassets/` — these are just the originally-shipped toolbar vectors.)

## Optional: `.symbolset` (SF Symbols app)

Same workflow as before if you want Dynamic Type weight interpolation: **New Symbol from SVG** using the SVG files here, export as `Harvous.<Name>.symbolset`, remove the matching `.imageset` to avoid duplicate names.

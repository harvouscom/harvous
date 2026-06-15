# Hero tour screenshots

These are the real web-prototype captures the homepage hero cycles through. The
files below are placeholders (copies of the old `app-preview-mac.png`) — replace
each with a real screenshot from the running prototype, keeping the same filename.

| File | Capture this view in the prototype |
|---|---|
| `hero.png` | The main hero shot — My Home with a note open beside it (the strongest overview) |
| `scripture.png` | A note open with scripture pills + the translation picker/dock visible |
| `dictionary.png` | A word looked up in Easton's dictionary (the lookup popover/dock) |
| `highlight.png` | A note with highlighted text + the annotation dock |
| `folders.png` | My Home / sidebar showing auto-assigned folders + tags |
| `connect.png` | The thread / connected-notes view |
| `passage.png` | Today's Passage / verse of the day |

Tips:
- Capture at ~1440px wide (retina/2x is great) in **light** mode.
- Optional: add a `-dark.png` variant per file later (e.g. `scripture-dark.png`) and
  we can wire a light/dark swap.
- Keep the app window framing consistent across shots so the carousel feels steady.
- To trim or reorder the tour, edit the `tabs` array in `src/components/Hero.astro`.

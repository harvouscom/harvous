# Space cover image variants (5×5 × light/dark)

**Status:** Locked product direction (July 2026). **Assets generated** (50 WebPs + catalog); settings picker (color → 5 thumbs) wired for Shared Spaces + ministry channels.
**Scope:** Shared Spaces + ministry channel covers only — **not** Settings › Appearance wallpapers.

**On disk:**

- Light: `public/images/space-covers/light/space_cover_{family}_{01–05}.webp` (25)
- Dark: `public/images/space-covers/dark/space_cover_{family}_{01–05}.webp` (25)
- Catalog: `shared/space-cover-image-presets.json`

Variant `01` files are copies of today’s canonical Appearance pairings; `02–05` are new siblings.

## Locked decisions

| Decision | Lock |
|---|---|
| **Catalog size** | **50 images** — 25 light + 25 dark |
| **Family structure** | 5 color families × 5 variants each (per mode) |
| **Picker UX** | **Color first**, then **5 thumbs** within that family |
| **Default** | Picking a color alone still selects **variant 1** (today’s canonical pairing) — back-compat |
| **Surface** | Space / channel covers only (About hero, join letter, color tile pairing). Appearance wallpaper catalog stays as-is. |

## Color families (variant 1 = current canonical)

Maps from `SPACE_COVER_PICKER_COLORS` / `THREAD_TO_APPEARANCE_COLOR_ID` today:

| Family (space color) | Appearance color | Light v1 (keep) | Dark v1 (keep) |
|---|---|---|---|
| **blue** | sky | `breeze` (`ai_bg_053.webp`) | `cinder` (`ai_bg_074.webp`) |
| **purple** | lilac | `aurora` (`ai_bg_072.webp`) | `ember` (`ai_bg_073.webp`) |
| **orange** | peach | `drift` (`ai_bg_061.webp`) | `caldera` (`ai_bg_046.webp`) |
| **green** | mint | `meadow` (`ai_bg_051.webp`) | `depths` (`ai_bg_052.webp`) |
| **pink** | pink | `dawn` (`ai_bg_045.webp`) | `flare` (`ai_bg_059.webp`) |

Variants **2–5** expand each family’s mood/palette (same hue world, new compositions). Do not reuse Appearance-only presets (`halo` / `twilight`) as space-cover defaults unless deliberately remapped later.

## Generation brief

Generate **40 new** images (variants 2–5 × 5 families × 2 modes). Keep v1 files untouched.

**Prompt framing (per family):**

1. Start from the **v1** image’s palette, lighting, and abstract “atmosphere” (same visual language as existing `ai_bg_*` auth/prototype backgrounds — soft fields, light/dark readable behind UI chrome).
2. Variants 2–5 should feel like **siblings**, not clones: shift composition, density, focal glow, or secondary accent while staying unmistakably in-family.
3. **Light** variants: airy, high key, paper-friendly. **Dark** variants: deep, low glare, readable with light chrome.
4. Avoid text, faces, crosses-as-logo, or busy detail that fights the About letter / join card.
5. Export WebP, name tentatively `space_cover_{family}_{nn}_{mode}.webp` (e.g. `space_cover_blue_02_light.webp`) under a **space-covers** path (not mixed into Appearance’s sole catalog until wired).

**Suggested variant roles (same for every family):**

| Variant | Role |
|---|---|
| 1 | Canonical (existing) |
| 2 | Softer / more open negative space |
| 3 | Richer / deeper saturation |
| 4 | Diagonal / directional light |
| 5 | Quiet alternate (most different composition, still on-palette) |

harvous.com use-case heroes can keep pulling from the shared pool selectively; this catalog is owned by **space covers**.

## Data model (when implementing)

Keep thread **color** as the family key (`blue` | `purple` | …). Add a **variant index** `1…5` (default `1`).

Suggested storage (document only — choose at implement time):

- **A (minimal):** encode in cover JSON, e.g. `{ kind: 'image-preset', presetId: 'breeze-2' }` with a **space-cover-only** preset catalog `shared/space-cover-image-presets.json` (50 rows), separate from `appearance-image-presets.json`.
- **B:** `Spaces.coverVariant` tinyint 1–5 + derive light/dark preset ids from `(color, variant)`.

Picker:

1. Radiogroup of 5 family colors (existing swatches).
2. When a family is selected, show 5 thumbs for the **active appearance mode** (or light+dark pairs later); selecting a thumb sets variant (and persists cover).
3. Changing family resets variant to **1** unless we later add “remember last variant per family.”

`spaceCoverFromThreadColor(color)` remains “family + variant 1.”

## Out of scope (for this lock)

- Expanding Settings › Appearance image wallpapers to 50
- Auto-generating assets in CI
- Per-user custom uploads

## Implementation checklist

1. ~~Generate + compress 40 WebPs; keep 10 v1 files.~~
2. ~~Add `shared/space-cover-image-presets.json`.~~
3. ~~Wire PrototypeSpaceSettingsSection: color → thumbs.~~
4. ~~Persist variant (`coverVariant` on space update); default 1 on create / color-only change.~~
5. ~~About / join / toolbar tile use catalog via `effectiveSpaceCover` (color + variant).~~
6. Optional: create-space / create-channel forms get the same thumbs (today they save variant 1).

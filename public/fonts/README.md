# Self-hosted fonts

Fonts are vendored rather than loaded from a CDN: Harvous is an offline-capable PWA, and a
CDN import fails exactly when someone is reading without a connection.

| Family | Files | Source | License |
|---|---|---|---|
| Google Sans Flex | `google-sans-flex/` | Google | see Google Fonts terms |
| Neuton | `neuton/Neuton-{Regular,Bold}.woff2` | [Google Fonts](https://fonts.google.com/specimen/Neuton) | SIL Open Font License 1.1 |
| Patrick Hand | `patrick-hand/PatrickHand-Regular.woff2` | [Google Fonts](https://fonts.google.com/specimen/Patrick+Hand) | SIL Open Font License 1.1 |
| OpenDyslexic | `opendyslexic/OpenDyslexic-{Regular,Bold}.woff2` | [opendyslexic.org](https://opendyslexic.org/) / [antijingoist/opendyslexic](https://github.com/antijingoist/opendyslexic) | SIL Open Font License 1.1 |

Neuton, Patrick Hand and OpenDyslexic are the optional reading/notes faces offered in
Settings → Appearance → Type. Neuton and Patrick Hand are the **latin subset** only — the app
has no non-latin UI today, and the full subsets are several times the size for glyphs nothing
renders.

OpenDyslexic ships unsubsetted upstream, so it is ~100KB per weight against ~12KB for the
others. That is acceptable because a face is only fetched when someone selects it: a reader
who never opens Type downloads none of these.

`@font-face` declarations live in `spa/src/styles/prototype-tokens.css`; the selectable
stacks are the `--pds-font-choice-*` tokens in the same file.

To refresh a file, take the latin-subset URL from the Google Fonts CSS API
(`https://fonts.googleapis.com/css2?family=…`) with a modern browser User-Agent — the last
`@font-face` block in that response is the latin one.

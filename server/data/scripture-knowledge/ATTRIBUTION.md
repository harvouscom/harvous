# Scripture Knowledge Layer — Data Attribution

This directory holds shared, canonical scripture-knowledge data derived from open datasets.
All data is **verse-addressed and translation-agnostic** (it points at references like
"John 3:16", not at any one translation's wording).

## Cross-references — `cross-references.json`

- **Source:** Treasury of Scripture Knowledge (TSK), as compiled and distributed by
  [OpenBible.info](https://www.openbible.info/labs/cross-references/).
- **License:** Creative Commons Attribution (CC-BY). The underlying TSK is public domain.
- **Attribution:** Cross-reference data courtesy of Viz.Bible and OpenBible.info, used under
  CC-BY. Source file header: `www.openbible.info CC-BY`.
- **Processing:** Normalized from OSIS book codes to Harvous canonical book names and validated
  against `src/data/bible-chapters.json` by `server/scripts/import-cross-references.ts`.

## Planned additions (not yet imported)

- **Topics / themes:** OpenBible.info Topical Bible (CC-BY).
- **People:** open "people of the Bible" datasets, e.g. Viz.Bible (CC-BY).
- **Places:** OpenBible.info Bible Geocoding (CC-BY).
- **Definitions:** Easton's Bible Dictionary (public domain) — already shipped in
  `server/data/dictionaries/`.

Before importing any new dataset, confirm its exact license and add it here.

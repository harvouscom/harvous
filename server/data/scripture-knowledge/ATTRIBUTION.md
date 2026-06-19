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

## Topics / themes — `topics.json`, `topic-verses.json`

- **Source:** [OpenBible.info Topical Bible](https://www.openbible.info/topics/), file
  `topic-votes.txt`.
- **License:** Creative Commons Attribution (CC-BY). Source header:
  `CC-BY License: www.openbible.info/topics`.
- **Attribution:** Topical data courtesy of OpenBible.info, used under CC-BY.
- **Processing:** Numeric verse ids (`bbcccvvv`) decoded to canonical references and validated
  by `server/scripts/import-topics.ts`; short same-chapter ranges expanded to per-verse edges.

## Places — `places.json`, `place-refs.json`

- **Source:** [OpenBible.info Bible Geocoding](https://github.com/openbibleinfo/Bible-Geocoding-Data),
  file `data/ancient.jsonl`.
- **License:** Creative Commons Attribution (CC-BY 4.0). Some geometry derives from
  OpenStreetMap (ODbL).
- **Attribution:** Place data courtesy of OpenBible.info, used under CC-BY.
- **Processing:** `server/scripts/import-places.ts` extracts place name + OSIS verse references
  (coordinates deferred — precise geometry lives in separate per-place geojson files).

## Planned additions (not yet imported)

- **People:** STEPBible TIPNR (Tyndale House, CC-BY 4.0) — proper names with all references; its
  abbreviated reference format needs a dedicated parser (next pass).
- **Definitions:** Easton's Bible Dictionary (public domain) — already shipped in
  `server/data/dictionaries/`.

Before importing any new dataset, confirm its exact license and add it here.

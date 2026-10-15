# Bible JSON (verse corpora)

Harvous stores full-Bible text as JSON arrays of `{ "book", "chapter", "verse", "text" }` (canonical book names match `src/data/bible-chapters.json`). These files are **not** read at runtime in production; they are **imported into Postgres** via `server/scripts/seed-bible-verses.ts`, and the app serves text from the `BibleVerses` table.

## Data sources

| Translation | Source | Notes |
|-------------|--------|-------|
| **KJV** | Public-domain text (committed) | Clean, no Strong's numbers. Do **not** re-download from Bolls — Bolls serves the Strong's-numbered KJV. |
| **ESV, NIV, NLT, NKJV, BSB, NET** | Downloaded from [Bolls.life](https://bolls.life) API | `npm run bible:download:bolls -- ESV` (no API key required) |
| **NASB 1995, CSB, AMP, MSG** | Downloaded from [Bolls.life](https://bolls.life) API | `npm run bible:download:bolls -- NASB` (no API key required) |
| **NET** (alt) | [labs.bible.org](https://labs.bible.org) | `node server/data/bibles/_download_net.mjs` (NET only) |
| **NABRE** | Downloaded from [Bolls.life](https://bolls.life) API, then renumbered | `npm run bible:download:bolls -- NABRE` |
| **DRB** (Douay-Rheims) | Public-domain USFM from [eBible.org](https://ebible.org/find/details.php?id=engDRA) (`engDRA`, 1899 Challoner), then renumbered | `node server/data/bibles/_import_usfm.mjs DRB` |

### Downloading / re-downloading from Bolls.life

One translation (deletes existing file first to force a clean re-download):

```bash
rm server/data/bibles/CSB.json
npm run bible:download:bolls -- CSB
```

All eleven Bolls-sourced translations in sequence:

```bash
npm run bible:download:bolls:all
```

Then seed into Postgres:

```bash
npx tsx server/scripts/seed-bible-verses.ts        # all translations
npx tsx server/scripts/seed-bible-verses.ts CSB     # one translation
```

### Alternative download paths (API.Bible, AI generation)

The repo also contains `_download_api_bible.mjs` (requires `API_BIBLE_KEY`) and `_generate_translation.mjs` (AI generation via Claude). These exist as alternative pipelines but the committed JSON files are sourced from Bolls.life.

### Catholic translations: renumbered on import

The NABRE prints the Old Testament in Hebrew verse numbering, and the Douay-Rheims in the Latin Vulgate's. Harvous keys pills, highlights, compare, cross-references and review on one numbering (the English one in `src/data/bible-chapters.json`), so both are renumbered when they're imported. "Create in me a clean heart" is Psalm 51:10 in every translation, though a printed NABRE says 51:12 and a printed Douay-Rheims 50:12.

How it works (`server/data/versification/remap.mjs`):

1. The downloader writes the source's own numbering to `raw/<ID>.json` (gitignored).
2. UBS/Paratext versification tables (`eng.vrs`, `vul.vrs`, MIT) map each verse to English: Vulgate → Hebrew → English.
3. A banded alignment against a reference translation (KJV for DRB, ESV for NABRE) corrects the places where an edition divides verses differently from the tables (the Challoner prints English Jonah 1:17 as 2:1 and runs one verse off through 1 Thessalonians 4). A verse moves only when the wording clearly outweighs the table's address.
4. `_remap.mjs` writes `<ID>.json` and prints a report: titles dropped, verses outside the 66 books, verses moved, verses joined, English verses with no text. Read it before seeding.

To re-run just the renumbering: `node server/data/bibles/_remap.mjs NABRE`.

What's deliberately left out for now:

- **The deuterocanonical books** (Tobit, Judith, Wisdom, Sirach, Baruch, 1–2 Maccabees), and the Greek parts of shared books: Daniel 3:24–90 (Song of the Three), Daniel 13–14 (Susanna, Bel), the additions to Esther. They need the book list, parser and reader to know more than 66 books.
- **Psalm titles** that are a verse of their own, as in our ESV. A title that shares verse 1 with the psalm's first line stays, as printed.

Known gaps after renumbering: NABRE has no Esther 3:14–15 (Bolls doesn't serve them). Each translation has a few dozen English verses it prints joined to a neighbour (DRB 44, NABRE 24 including the usual omitted NT verses). The text is in the neighbouring verse.

Bolls' book list can undercount chapters (NABRE Ezekiel is listed with 47 and has 48), so `_download_bolls.mjs` asks past the listed count until a chapter comes back empty.

### Versification notes

Not all translations have the same verse count. This is expected:

- **NLT** (~31,064 verses): merges consecutive verse pairs in census/genealogy passages (e.g. Numbers 1:20–21 → verse 20 only)
- **MSG** (~31,015 verses): merges verse ranges freely as a paraphrase
- **ESV, NIV, BSB, CSB, NET** (~31,086 verses): omit a handful of verses that textual critics consider later additions
- **KJV, NKJV** (31,102 verses): traditional full versification
- **NABRE, DRB** (~31,060–31,080 verses): renumbered to English (see above); the gaps are verses their editions print joined

## After generating or updating a `.json` file

1. Run the seed against the target database:

   ```bash
   npx tsx server/scripts/seed-bible-verses.ts
   npx tsx server/scripts/seed-bible-verses.ts NASB
   ```

2. Ensure the translation id exists in `src/data/translations.ts` (registry + copyright strings).

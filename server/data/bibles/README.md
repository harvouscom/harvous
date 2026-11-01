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
| **RSV-2CE** (`RSV2CE`) | Downloaded from [Bolls.life](https://bolls.life) API (`RSV2CE`), headings and flattened verses fixed | `npm run bible:download:bolls -- RSV2CE` |
| **NRSV-CE** (`NRSVCE`) | Downloaded from [Bolls.life](https://bolls.life) API (`NRSVCE`), flattened verses fixed | `npm run bible:download:bolls -- NRSVCE` |

**Licensing.** The NABRE, RSV-2CE and NRSV-CE are copyrighted (the Confraternity of Christian Doctrine; the National Council of the Churches of Christ, with the RSV-2CE published by Ignatius Press). Permission to carry them has not been requested from any of the three, and the copyright lines in `src/data/translations.ts` don't say "used by permission". Ask before they ship to users.

### Downloading / re-downloading from Bolls.life

One translation (deletes existing file first to force a clean re-download):

```bash
rm server/data/bibles/CSB.json
npm run bible:download:bolls -- CSB
```

All thirteen Bolls-sourced translations in sequence:

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

### The RSV-2CE and NRSV-CE: English numbering, cleaned on import

Both are printed in English numbering, so `remap.mjs` takes their addresses as they are (`versification: 'eng'`), checks them against the ESV, and trusts them more than the NABRE's (`alignPrior`: at the default a short, freely worded verse like NRSV Ruth 3:5 gets pulled onto its neighbour). The NRSV-CE's Greek Daniel 3 (97 verses) goes through `vul.vrs`, which sends 3:24–90 to the Prayer of Azariah and 3:91–97 back to 3:24–30.

What Bolls serves isn't clean Scripture, so `_catholic_edition_fixes.mjs` writes `fixes/<ID>.json` (committed), which `_remap.mjs` applies first:

- **Section headings fused into verses.** The RSV-2CE has about 2,800 ("Trust in God under Adversity A Psalm of David…" in Psalm 3:1, "The Ark of God Captured" in the middle of 1 Samuel 4:1). In the 66 books they are found by a word diff against the 1952 RSV, which Bolls serves without them (`raw/RSV1952.json`, fetched by the script). In the deuterocanon, where there's no 1952 text, the test is the NRSV-CE's opening words, plus the shape of a heading when those are worded too differently to tell. `HEADING_OVERRIDES` holds the few calls made by reading the list. The NRSV-CE has the same headings, only where they fall mid-verse, plus "ADDITION A"–"END OF ADDITION F" in Esther and "THE SHORTER ENDING OF MARK".
- **Flattened verses.** Both editions print Esther's Greek additions as lettered verses (1:1a–r…), which Bolls runs into one verse, and the RSV-2CE's Daniel 3:24–90 is all in 3:23. `segment` splits each run back into verses by aligning it with the NABRE's verses (Esther) or the NRSV-CE's (Daniel), and `FORCED_CUTS` / `NO_CUT_BEFORE` hold the verse starts read off the printed editions. Every split Esther verse was checked against Bible Gateway's RSVCE and NRSVCE and starts where print does. The NRSV-CE prints Additions C and D in place of Esther 5:1–2, so those two Hebrew verses are missing from it.
- **Printed numbers that differ from Harvous's.** Both editions number Addition D as Esther 15:1–16; Harvous files it at the Douay-Rheims' 15:4–19 (as it does the NABRE's), so a printed RSV or NRSV "Esther 15:1" is Harvous 15:4. The RSV numbers the Prayer and Song of the Three 1–68 on its own; Harvous keeps the Vulgate's Daniel 3:24–90 (Prayer of Azariah 1–67), so the RSV's verses 29–30 are one verse (29), and its five lines printed out of the Greek order (dews, nights, light, ice, frosts) go to the verses they translate.
- **Small things.** Inline verse numbers ("…ever.” 22 And when…" in 2 Chronicles 20:21), chapter numbers left in front of a verse 1 ("28 Then Isaac…"), the RSV's pronunciation marks in names ("Ahasu-e′rus" → "Ahasuerus", `cleanRsvText`), and "Selah" glued to its line.
- **The Prologue to Sirach** is in both editions' Sirach 1:1 and is dropped, as it has no address (see below).

Run `node server/data/bibles/_catholic_edition_fixes.mjs RSV2CE --list` (then `NRSVCE`, which reads the RSV-2CE's file) to see every heading and split, and `node server/data/bibles/_remap.mjs RSV2CE` for the report.

Left as Bolls has them: a handful of typing slips in the RSV-2CE ("the the", "litle owl", "Your shall"), Psalm titles where they share verse 1 (RSV-2CE; the NRSV-CE leaves them out), and the RSV's own verse divisions where they differ from the ESV's (1 John 5:7, 2 Corinthians 13:13 in the NRSV-CE). The RSV-2CE's Tobit is the shorter Greek text, so many Tobit verses the NABRE has are missing from it; both editions leave out the Sirach verses the RSV omits (1:5, 1:7, 1:21…).

### The deuterocanon (NABRE, DRB, RSV-2CE and NRSV-CE)

All four Catholic translations also carry Tobit, Judith, Wisdom, Sirach, Baruch, 1–2 Maccabees and the Greek parts of Daniel and Esther. The other eleven translations don't, and the reader and pills say "Not in ESV" (or whichever) with a way to read it in the NABRE.

- **Where the chapters live.** `src/data/bible-chapters.json` stays the 66 books: stored `bookOrder` values, packs, continue-book and progress are built on it. `src/data/deuterocanon-chapters.json` adds the rest, written by `node server/data/versification/_build_deuterocanon_table.mjs` (each chapter takes the longest of `eng.vrs` and the two translations' raw downloads). Pass a translation to `bookChapterCount` / `orderedCanonBooks` / `adjacentChapter` in `src/utils/bible-book-chapters.ts` to get the canon it reads.
- **Book order.** The seven books and the Prayer of Azariah are appended at `bookOrder` 67–74 so no existing number moves. The reader lists them in Catholic order (Tobit and Judith after Nehemiah, the Maccabees after Esther, Wisdom and Sirach after the Song, Baruch after Lamentations).
- **Daniel.** Susanna and Bel stay where Catholic Bibles print them, Daniel 13–14. Daniel 3:24–90 collides with English 3:24–30 (the fourth man in the fire), so it is the book "Prayer of Azariah", 1:1–67, verse n = Daniel 3:n+23 in print. The reader shows it inside Daniel 3, after verse 23, in the Catholic translations.
- **Esther.** The additions are at the Douay-Rheims' addresses, Esther 10:4–16:24. The NABRE's lettered sections A–F are mapped onto them, checked verse by verse against the DRB text.
- **Different source texts.** The Douay-Rheims' Tobit, Judith and Sirach translate the Vulgate's Latin, a different text from the Greek the NABRE translates; their verses don't correspond, and no table maps them. They keep their printed numbers, so "Sirach 1:31" exists in the DRB and not in the NABRE, and the two columns of a compare won't line up in those books. Wisdom, Baruch and the Maccabees are renumbered to the English (RSV) numbering through `vul.vrs`.
- **Not in the sources.** The NABRE and DRB sources don't have the Prologue to Sirach, and the RSV-2CE's and NRSV-CE's is dropped: there's no address for it. Bolls' NABRE leaves out a few verses in Sirach (1:5, 1:7 and others the NABRE itself brackets).
- **Detection.** The books resolve in references ("Sir 2:1", "Ecclesiasticus 2:1", "1 Macc 2:3", "Song of the Three 1:30"), but are not in the auto-tag vocabulary: "Wisdom" is already a theme there.

To refresh after a re-download: `node server/data/versification/_build_deuterocanon_table.mjs`, then `node server/data/bibles/_remap.mjs NABRE` and `... DRB`. A re-seed with `seed-bible-verses.ts` only inserts rows it doesn't have (`onConflictDoNothing`).

Still left out: **Psalm titles** that are a verse of their own, as in our ESV. A title that shares verse 1 with the psalm's first line stays, as printed.

Known gaps after renumbering: NABRE has no Esther 3:14–15 (Bolls doesn't serve them). Each translation has a few dozen English verses it prints joined to a neighbour (DRB 44, NABRE 24 including the usual omitted NT verses). The text is in the neighbouring verse.

Bolls' book list can undercount chapters (NABRE Ezekiel is listed with 47 and has 48), so `_download_bolls.mjs` asks past the listed count until a chapter comes back empty.

### Versification notes

Not all translations have the same verse count. This is expected:

- **NLT** (~31,064 verses): merges consecutive verse pairs in census/genealogy passages (e.g. Numbers 1:20–21 → verse 20 only)
- **MSG** (~31,015 verses): merges verse ranges freely as a paraphrase
- **ESV, NIV, BSB, CSB, NET** (~31,086 verses): omit a handful of verses that textual critics consider later additions
- **KJV, NKJV** (31,102 verses): traditional full versification
- **NABRE, DRB** (~35,400–35,700 verses with the deuterocanon): renumbered to English (see above); the gaps are verses their editions print joined
- **RSV-2CE, NRSV-CE** (~35,400 verses with the deuterocanon): English numbering; the gaps are the usual omitted NT verses, the Vulgate-only verses in Tobit, Judith and Sirach, and the Esther verses above

### Red letter (words of Jesus)

None of these files mark the words of Jesus. Bolls serves no such tags, and the importers strip markup anyway. The reader's "Words of Jesus" setting colours them from a separate dataset in `src/data/red-letter/`, built by:

```
npx tsx server/data/bibles/_build_red_letter.ts
```

The script downloads two public-domain USFM texts from eBible.org that do mark His words with `\wj`:

- **World English Bible (`engwebp`).** Each verse becomes a pattern saying which of its quotations, in order, are His.
- **KJV (`eng-kjv2006`).** This is aligned word by word onto `KJV.json` and stored as exact character ranges.

Every translation with quotation marks is coloured by counting its quotations against the WEB pattern; the code is `src/utils/red-letter.ts`, and the reader runs the same code. Where a translation's quotations don't line up with WEB's, the verse stays black. That covers dialogue that's split differently, and speech printed without quotation marks, such as some of CSB's and MSG's.

Some deliberate gaps:

- **NET** closes Jesus' speech at John 3:15, so 3:16–21 stays black in NET, following its translators.
- **DRB** has no `\wj` source (`engDRA` carries none), so it is coloured only where WEB has the whole verse in His voice.

The script prints coverage per translation:

- `black`: verses of His left uncoloured.
- `off`: coloured verses whose red share is far from the KJV marking. This is the signature of a misread quote mark.

The full list goes to `raw/red-letter-report.txt`. Hand corrections go in `src/data/red-letter/overrides.json`, keyed `TRANSLATION|Book c:v`. Re-run the script after re-importing any translation.

## After generating or updating a `.json` file

1. Run the seed against the target database:

   ```bash
   npx tsx server/scripts/seed-bible-verses.ts
   npx tsx server/scripts/seed-bible-verses.ts NASB
   ```

2. Ensure the translation id exists in `src/data/translations.ts` (registry + copyright strings).

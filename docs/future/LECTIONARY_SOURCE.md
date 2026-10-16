# Lectionary citation source for "Today's readings"

Research spike, Oct 15 2026, then the Sundays-and-solemnities build the same day (see **What was built** at the end). The research table below was written before the build; two findings changed during it and are corrected inline.

## Answer

No clean, ready-made, licensed dataset of US Lectionary citations exists. The right move is to **hand-build the table ourselves from the Lectionary's structure (citations are facts), with a published dataset used only as a cross-check.** Nothing found can be adopted wholesale with a clear license. For the calendar side, use `romcal`.

## What each candidate turned out to be

| Candidate | Readings? | License | Verdict |
|---|---|---|---|
| **romcal** (npm, MIT) | No. Celebrations, seasons, weeks, cycles (Sunday A/B/C, weekday I/II), colors, martyrology. No version or plugin carries readings (maintainers' docs and a downstream project both say so). `npm view` confirms `3.0.0` is marked deprecated ("this package has been deprecated"), 1.6 MB unpacked; the dev line is `3.0.0-dev.*`. | MIT | **Not used** in the end: Harvous already had a US Roman calendar in `src/utils/liturgical-season.ts`, which the build extends. |
| **LiturgicalCalendar API** (JohnRDOrazio, Apache-2.0) | Calendar only. Its README lists the Roman Missal, decrees and national calendars; `readings` appears only as an empty Ambrosian field. A downstream project (nyabongo/lectio) says it imported "lectionary JSON" from LitCal, but I could not find it in the repo's `jsondata/` listing (**unverified where it lives**), and that project reports Year A only for the proper of time, Years B/C near-empty. | Apache-2.0 | Not a source. Possibly a partial cross-check. |
| **CLEDR** (CatholicOS) | Celebration ID mapping (LitCal/romcal keys) only. | CC BY-NC-ND 4.0 | Useful as a reference for ID crosswalks; license is unusable for derivatives. |
| **jayarathina/Roman-Calendar** | Calendar generator only. | Unlicense/none stated | No. |
| **plishman/Catholic-Lectionary-on-ESP8266** | Ships a `BOM_lectionary` CSV, contents undocumented, GPL-3.0 | GPL-3.0 | Skip: GPL, provenance unknown. |
| **steventine/sacristan-helper** | Builds `readings.json` (citations + Lectionary numbers, 20-year window) joined to romcal. Handles Ascension on Sunday vs Thursday, All Souls menu, optional-memorial flag. Its source is Felix Just's tables at catholic-resources.org, fetched at build time and not committed. | None stated | Best design reference. Cannot copy data from it: no license on repo or upstream. |
| **nyabongo/lectio** | Per-day JSON keyed to romcal ids; Sundays/solemnities PR shows 726 readings, 40% cross-checked against LitCal, rest written from memory of the OLM, all marked provisional. | Unknown | Not trustworthy data. Confirms the approach is feasible. |
| **Wikisource / Wikipedia** | Wikipedia's Ordo Lectionum Missae page (CC BY-SA 4.0) describes structure only, no tables. I found no complete Wikisource table. | CC BY-SA | No data. |
| **catholic-resources.org (Felix Just, S.J.)** | Complete US tables: Sundays A/B/C, weekdays I/II, seasonal, major feasts, common psalms; US 1998/2002 and 1970 editions. | `catholic-resources.org/Copyright.htm`: free for not-for-profit use with credit; **no commercial use without written permission** | Harvous is a paid product, so nothing was copied from it. Used only to check our own table, row by row. |
| **USCCB bible.usccb.org** | Daily readings pages for every date, with citations. No API or RSS. The page shows only "©USCCB" and links to a Bible Permissions policy. Their Lectionary permissions policy (printed worship aids, publications, web/digital) is aimed at reproducing Lectionary *text*; its web-use terms and any scraping terms I could not open (403). | Proprietary site | Citations are facts, but don't scrape them as a bulk source. Fine for spot-checking a handful of dates by hand. |

## Recommendation

1. **Calendar:** ~~`romcal`~~ the existing `liturgical-season.ts` helpers, extended in `src/utils/lectionary.ts` (romcal 3.0.0 is deprecated; see the table).
2. **Citations:** author our own table, keyed by the same identity romcal gives us. Source it from the Lectionary's own structure (OLM/Lectionary for Mass index), which is a public list of references. Do not copy any site's table. Then verify a sample against bible.usccb.org by hand (and the Felix Just tables if their terms allow).
3. **Ask once, in writing:** a short note to USCCB permissions confirming citations-only use (no Lectionary text, text comes from our own NABRE corpus) is fine. This is the only real legal risk, and it is cheap to remove. NABRE permission for the corpus itself was already noted as never requested; fold it into the same email.

## Data shape

Citations only, no text. Two tables:

```ts
// by celebration, for days with proper readings
{ key: "romcal:id" | "advent-w1-sun", cycle: "A"|"B"|"C"|null, weekdayCycle: "I"|"II"|null,
  lectionary: 1,                      // Lectionary number, optional but great for verification
  readings: [
    { slot: "first",  ref: "Is 2:1-5" },
    { slot: "psalm",  ref: "Ps 122:1-2, 3-4, 4-5, 6-7, 8-9" },
    { slot: "second", ref: "Rom 13:11-14" },   // omitted when absent
    { slot: "gospel", ref: "Mt 24:37-44" } ] }
```

- Lookup order for a date: US-specific/solemnity/feast row → Sunday row (cycle) → weekday row (cycle) → fallback to ferial.
- Weekdays of Advent, Christmas, Lent and Easter are one table (not cycle-dependent); Ordinary Time weekdays use Year I/II. Ordinary Time weekdays are keyed by week and day, not by date, so the table is year-independent.
- Alternate slots (Easter Vigil, Christmas Masses, All Souls, long/short forms) need `alt: [...]` entries. Show the main one, link the rest.

## Row estimate

| Block | Rows |
|---|---|
| Sundays (Advent, Christmas, Lent, Easter, Ordinary Time) × A/B/C | ~170 |
| Ordinary Time weekdays (34 weeks × 6 days × Year I/II) | ~410 |
| Advent, Christmas, Lent, Easter weekdays | ~130 |
| Solemnities, feasts, memorials with proper readings, US calendar | ~120 |
| Alternates, vigils, multi-Mass days (Christmas, Easter Vigil, All Souls) | ~25 |
| **Total** | **~850** |

About 2–3 reading citations each, so ~2,500 individual references. Memorials with no proper readings (most of them) fall back to the weekday row and need no entry, only a flag for the optional memorial.

## Coverage gaps and traps

- **US transfers:** Ascension (Thursday vs Sunday depends on province; most US dioceses use Sunday), Epiphany, Corpus Christi, Holy Days of Obligation moved to Monday/Saturday. romcal's US calendar may or may not match; test per year. Make it a setting or follow the user's diocese later.
- **Optional memorials** show the ferial readings; show a small flag, not a different set.
- **Local days** (diocesan patron, parish dedication) are out of scope.
- **Sundays displaced by feasts of the Lord** (Presentation, Transfiguration, Triumph of the Cross, St. John Lateran) need explicit rows.
- **Vigil Masses** (Nativity, Pentecost, Assumption, Sts. Peter and Paul, John the Baptist) have separate reading sets from the day Mass.
- **Alternate cycles:** Year B/C Sundays 25 and 26 are an example of what a hand-built table most easily drops; add a completeness test (every Sunday of every year A/B/C has first/psalm/gospel; every weekday of OT weeks 1–34 × I/II).

## Psalm numbering

US Lectionary psalm citations use the NABRE (Hebrew) numbering **and** the NABRE verse numbering, in which the psalm title often counts as verses 1–2 (e.g. Ps 51:3-6 where English translations print 51:1-4). That is consistent in the Lectionary, so a single rule applies to every row. Harvous's NABRE corpus was renumbered to English verses (`englishCandidates` in `server/data/versification/remap.mjs`), so each psalm row must be converted at read time or stored pre-converted. Check this with a test over every psalm row (the Douay/Vulgate numbering is the one that differs from the other translations; the NABRE numbering equals the Hebrew, so `versification` should be the Hebrew/org path). I did not verify any source's psalm numbering because none gave us data we could inspect. The Felix Just tables do not state a numbering in the page I could read.

## Effort

- Calendar integration with romcal (US calendar, cycle detection, transfers): ~1 day, plus a per-year test over 2026–2030.
- Authoring and proofreading ~850 rows: **3–5 days** of careful work, mostly the Ordinary Time weekdays and the sanctoral. The Sunday/solemnity block alone is ~1 day.
- Verification pass (spot-check 10% against USCCB by hand, completeness test, psalm conversion test): ~1 day.
- Total: roughly **1 to 1.5 weeks** for the complete set.

## Fallback: Sundays and solemnities only

If the full table is too much, ship ~190 rows (Sundays A/B/C, seasonal Sundays, solemnities and feasts of the Lord, about 1.5 days). On other days the card shows the Sunday's Gospel, or falls back to Today's passage. The data shape above is unchanged, so weekdays can be added later without rework.

## Open questions for Derek

- Is writing to USCCB (permission for citations, plus NABRE) acceptable before launch?
- Ascension and Epiphany: follow the most common US practice, or let people choose?
- Do you want me to author the table, or review Felix Just's terms first (their copyright page was not reachable)?

## What was built (Oct 15 2026, branch `claude/catholic-tradition-setting`)

First pass: Sundays, solemnities and feasts of the Lord. The weekdays followed the same day; see **Weekdays** below.

- **Table:** `src/data/lectionary/sundays-and-solemnities.ts`, 62 days, 171 entries, about 680 citations. Written from the Lectionary's order of readings, as the Lectionary prints them (NAB numbering, half-verse letters). Where the Lectionary offers "or", the first option.
- **Calendar:** `src/utils/lectionary.ts` → `lectionaryDayFor(date)`. US practice: Epiphany and Ascension on Sundays, Corpus Christi on Sunday. Transfers: St. Joseph and the Annunciation out of Holy Week and off Lent Sundays, the Immaculate Conception off an Advent Sunday, St. John the Baptist and Sts. Peter and Paul off the Sacred Heart and Trinity/Corpus Christi, Guadalupe dropped on an Advent Sunday. A test walks every Sunday from 2025 to 2040 and checks each resolves to a table row.
- **Numbering:** `harvousReferenceForCitation` turns a Lectionary citation into Harvous's English numbering by inverting the NABRE printed-number map from the import (`src/data/printed-verse-numbers/NABRE.json`). It is tested against `englishCandidates` for every psalm verse in the table. One exception is overridden by hand: Sirach 35 (30th Sunday C). There the Lectionary keeps the 1970 NAB numbering, but the NABRE renumbered the chapter, so Lectionary 35:12-14, 16-18 is NABRE 35:15-17, 20-22.
- **Server:** `/api/votd/today` reads a member's tradition from the account; a guest sends `?tradition=catholic`. On a day with readings, `reference` and `textHtml` become the Gospel's (so native and reminders open the right chapter unchanged), and `readings` carries all four. Engagement (`actedToday`) still keys on the day's verse row.
- **Card:** `PrototypeDailyPassageCard` titles itself "Today's readings · Gospel · …". The other readings sit under the text as rows: the Lectionary's name for each, then its citation, and each row opens in the reader.

### How the citations were checked

1. **Against the text.** Every reading was renumbered and its first and last verse printed from the local NABRE corpus, then read against the Lectionary's incipit. This is how the Sirach 35 shift was found.
2. **Against a second source.** Every Ordinary Time Sunday (A, B, C), Advent, Christmas, Lent, Easter, and the solemnities page were compared with Felix Just's tables, read only for comparison. That found five wrong psalms in my draft (26A, 20B, 21B, 23C, Lent 1A), all fixed. It also raised three disagreements, which USCCB settled in favour of the table: Sir 15:15-20, Is 50:5-9a and Sir 27:4-7. Felix Just's numbers there follow an older edition.
3. **Against USCCB.** Five days were checked against bible.usccb.org (6A, 24B, 8C, Christ the King C, Easter 3A), and all matched. USCCB then began answering 403, so the checks stopped there.

Not yet checked against a second source: Ash Wednesday, Easter 3 B/C, Christ the King A/B, All Souls (the Lectionary gives a menu; the table uses Wis 3:1-9, Ps 23, Rom 5:5-11, Jn 6:37-40), and Our Lady of Guadalupe. Worth a look against a printed Lectionary or USCCB before the first of those dates.

### Weekdays (built Oct 15 2026, second pass)

Every day of the year now has readings, except Holy Saturday, which has no Mass during the day; that day Home shows Today's passage.

- `src/data/lectionary/weekdays-seasons.ts`: Advent (by week to Dec 16, by date Dec 17–24), Christmas (Dec 29–31, Jan 2–7 before the Epiphany, Monday–Saturday after it), Lent, Holy Week, the Easter Octave and Easter weeks 2–7 (including the Thursday–Saturday readings used where the Ascension is on Sunday), and Mary, Mother of the Church. 117 days.
- `src/data/lectionary/weekdays-ordinary.ts`: weeks 1–34, Monday–Saturday, Year I and Year II first readings and psalms with the shared Gospel. 204 days, Lectionary #305–508.
- `src/data/lectionary/saints.ts`: the 20 saints' feasts with proper readings. A feast outranks the weekday, but is not kept on a Sunday, in Holy Week or in the Easter Octave. Memorials are left out on purpose: most take the weekday readings.
- Year I in odd years, Year II in even (`weekdayCycle`).

How they were checked:
1. The same text check as the Sundays: every reading renumbered, its first and last verse printed from the NABRE corpus. This found two parser gaps (half-verse letters past "e", like Tobit 13:6efgh) and nothing wrong in the citations themselves.
2. Every row was compared with Felix Just's tables (OT Year I, OT Year II, Advent/Christmas, Lent, Easter, Proper of Saints). The comparison ran as a script inside his pages that returned only differences, so none of his data was copied. Of about 650 day-rows, the real differences fixed were two psalm ranges (OT I 21 Thursday Ps 90:3-4; OT I 31 Monday Ps 69:36-37) and two Gospels (Lent 4 Tuesday Jn 5:1-3a, 5-16; Easter 4 Monday Jn 10:1-10). The rest were "or" options, page typos (Ps 78 for 79; every "20" in the Year II page renders as "22") or Vulgate-numbered Tobit canticles.
3. Kept against his table, worth a check with a printed Lectionary: Dec 18 Gospel (Mt 1:18-25 here, 1:18-24 there); Sts. Simon and Jude Gospel (Lk 6:12-16 here, 6:12-19 there); the Tobit 13 canticle verse lists (OT I 9 Saturday, 25 Wednesday).

### Known limits

- A citation across chapters ("Genesis 2:7-9; 3:1-7") opens in the reader as its whole span (2:7-3:7). Harvous references can't express a gap across chapters.
- Optional memorials, local feasts, Ascension Thursday provinces and vigil Masses are not modelled. Where the Lectionary offers alternatives by year on a weekday (Lent 5 Monday in Year C, Easter 4 Monday in Year A), the first option is always used.
- Native apps get the Gospel as the passage (same `reference` field) but not the other readings yet.

## Draft: permission note to USCCB (not sent; Derek's call)

> **To:** USCCB Permissions (permissions@usccb.org)
> **Subject:** Citations-only use of the Lectionary for Mass, and NABRE text, in a Bible study app
>
> Hello,
>
> I make Harvous, a Bible study and note-taking app (harvous.com). We'd like to make sure two uses are in order before we promote them.
>
> 1. **Lectionary citations.** For readers who choose a Catholic setting, Home shows "Today's readings" on Sundays and solemnities: the day's Gospel, and the citations of the First Reading, Responsorial Psalm and Second Reading (for example "Isaiah 45:1, 4-6"). We reproduce no Lectionary text, translations of the psalm refrains, or Gospel acclamations, only the references, which we compiled ourselves. The passage is shown in the reader's own chosen translation from our licensed Bible text.
> 2. **The NABRE.** We offer the New American Bible, Revised Edition as one of the translations a reader can choose for reading and for quoting in their own notes. We'd like to confirm what permission or license this requires for a subscription app, and the attribution you'd like shown.
>
> Happy to share screenshots or answer any questions.
>
> Thank you,
> Derek J

/**
 * Shared server helper to fetch verse text from the self-hosted BibleVerses table.
 * Used by process-scripture-references and the /api/scripture/fetch-verse route.
 * Pass a normalized reference and translation for consistent results.
 * Results are cached in VerseTextCache so each reference+translation is formatted at most once.
 */

import {
  parseScriptureReference,
  parseVerseGroups,
  validateVerseNumber,
  validateVerseRange,
  normalizeScriptureReference,
} from '@/utils/scripture-detector';
import { db, first, VerseTextCache, BibleVerses, eq, and, gte, lte } from '../db';
import { nowISO } from '../db/dates';

interface DbVerse {
  verse: number;
  text: string;
}

/**
 * Fetches verse text for a scripture reference from the BibleVerses table.
 * Returns formatted HTML with superscript verse numbers, or empty string on parse/lookup error.
 * If a verse in the requested range is missing from the translation, returns a notice.
 */
export async function fetchVerseText(reference: string, translation: string = 'NET'): Promise<string> {
  const cleanReference = reference.replace(/,\s+/g, ',');
  const parsed = parseScriptureReference(cleanReference);
  if (!parsed) {
    return '';
  }

  const normalizedKey = normalizeScriptureReference(cleanReference);

  // Check cache (keyed by reference + translation)
  let cached: { content: string } | undefined = undefined;
  try {
    cached = first(await db.select({ content: VerseTextCache.content })
      .from(VerseTextCache)
      .where(and(
        eq(VerseTextCache.reference, normalizedKey),
        eq(VerseTextCache.translation, translation),
      ))
      .limit(1));
  } catch (cacheReadErr: unknown) {
    const msg = cacheReadErr instanceof Error ? cacheReadErr.message : String(cacheReadErr);
    let causeMsg = '';
    for (let e: unknown = cacheReadErr; e != null; e = (e as { cause?: unknown })?.cause) {
      causeMsg += (e instanceof Error ? e.message : String(e)) + ' ';
    }
    const isMissingTable = /no such table|VerseTextCache/i.test(msg + causeMsg);
    if (isMissingTable) {
      console.warn('[fetchVerseText] VerseTextCache unavailable:', (msg + causeMsg).trim().slice(0, 120));
    } else {
      throw cacheReadErr;
    }
  }
  if (
    cached?.content &&
    cached.content.length > 0 &&
    cached.content.includes('<sup class="verse-num"')
  ) {
    return cached.content;
  }

  // Parse verse groups from reference
  let verseGroups = parseVerseGroups(cleanReference);
  if (verseGroups.length === 0) {
    const v = parsed.verse;
    if (v !== undefined && v !== null) {
      const start = Array.isArray(v) ? v[0] : v;
      const end = Array.isArray(v) ? (v[1] ?? v[0]) : v;
      if (typeof start === 'number' && typeof end === 'number') {
        verseGroups = [{ start, end }];
      }
    }
  }
  if (verseGroups.length === 0) {
    return '';
  }

  // Validate verse ranges
  for (const group of verseGroups) {
    if (group.start === group.end) {
      if (!validateVerseNumber(parsed.book, parsed.chapter, group.start)) {
        return '';
      }
    } else {
      if (!validateVerseRange(parsed.book, parsed.chapter, group.start, group.end)) {
        return '';
      }
    }
  }

  // Query BibleVerses table for all verse groups
  let allVerses: DbVerse[] = [];
  try {
    const versePromises = verseGroups.map(async (group) => {
      const rows = await db
        .select({ verse: BibleVerses.verse, text: BibleVerses.text })
        .from(BibleVerses)
        .where(and(
          eq(BibleVerses.translationId, translation),
          eq(BibleVerses.book, parsed.book),
          eq(BibleVerses.chapter, parsed.chapter),
          gte(BibleVerses.verse, group.start),
          lte(BibleVerses.verse, group.end),
        ))
        .orderBy(BibleVerses.verse);
      return rows;
    });
    const verseArrays = await Promise.all(versePromises);
    allVerses = verseArrays.flat();
  } catch (err: any) {
    console.error(`[fetchVerseText] DB error for ${reference} (${translation}):`, err?.message ?? err);
    return '';
  }

  if (allVerses.length === 0) {
    // No verses found — translation may not include these verses
    return `<p><em>This verse is not included in the ${translation} translation.</em></p>`;
  }

  // Format into HTML
  let formatted: string;
  if (verseGroups.length > 1) {
    const formattedParts: string[] = [];
    verseGroups.forEach((group, index) => {
      const groupVerses = allVerses.filter(
        (v) => v.verse >= group.start && v.verse <= group.end
      );
      if (groupVerses.length > 0) {
        const label = group.start === group.end ? `Verse ${group.start}:` : `Verses ${group.start}-${group.end}:`;
        formattedParts.push(`<p><strong>${label}</strong></p>`);
        const groupText = groupVerses.map((v) => `<sup class="verse-num" style="font-size:0.55em; line-height:0; vertical-align:super;">${v.verse}</sup>${v.text}`).join(' ');
        formattedParts.push(`<p>${groupText}</p>`);
        if (index < verseGroups.length - 1) {
          formattedParts.push('<hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--color-stone-grey); opacity: 0.3;" />');
        }
      } else {
        formattedParts.push(`<p><em>Verses ${group.start}-${group.end} are not included in the ${translation} translation.</em></p>`);
      }
    });
    formatted = formattedParts.join('');
  } else {
    formatted = allVerses.map((v) => `<sup class="verse-num" style="font-size:0.55em; line-height:0; vertical-align:super;">${v.verse}</sup>${v.text}`).join(' ');
  }

  // Cache the formatted result
  try {
    await db.insert(VerseTextCache).values({
      reference: normalizedKey,
      translation,
      content: formatted,
      createdAt: nowISO(),
    }).onConflictDoUpdate({
      target: [VerseTextCache.reference, VerseTextCache.translation],
      set: {
        content: formatted,
        createdAt: nowISO(),
      },
    });
  } catch (cacheErr: any) {
    console.error(`[fetchVerseText] Cache insert failed for ${normalizedKey} (${translation}):`, cacheErr?.message ?? cacheErr);
  }
  return formatted;
}

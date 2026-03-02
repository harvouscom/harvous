/**
 * Shared server helper to fetch verse text from Bible.org API.
 * Used by process-scripture-references and the /api/scripture/fetch-verse route.
 * Pass a normalized reference for consistent results.
 * Results are cached in VerseTextCache so each reference is fetched at most once.
 */

import { fetchWithTimeout } from '@/utils/fetch-helpers';
import {
  parseScriptureReference,
  parseVerseGroups,
  validateVerseNumber,
  validateVerseRange,
  normalizeScriptureReference,
} from '@/utils/scripture-detector';
import { db, VerseTextCache, eq } from '../db';
import { nowISO } from '../db/dates';

interface BibleOrgVerse {
  bookname: string;
  chapter: string;
  verse: string;
  text: string;
}

/**
 * Fetches verse text for a scripture reference. Uses normalized reference for cache key and API.
 * Returns formatted HTML with superscript verse numbers, or empty string on parse/fetch error.
 * Cache hit: returns immediately from DB. Cache miss: fetches from Bible.org, stores in cache, returns.
 */
export async function fetchVerseText(reference: string): Promise<string> {
  const cleanReference = reference.replace(/,\s+/g, ',');
  const parsed = parseScriptureReference(cleanReference);
  if (!parsed) {
    return '';
  }

  const normalizedKey = normalizeScriptureReference(cleanReference);
  let cached: { content: string } | null = null;
  try {
    cached = await db.select({ content: VerseTextCache.content })
      .from(VerseTextCache)
      .where(eq(VerseTextCache.reference, normalizedKey))
      .get();
  } catch (cacheReadErr: unknown) {
    // VerseTextCache may not exist if db:push wasn't run (e.g. new deploy); treat as cache miss
    const msg = cacheReadErr instanceof Error ? cacheReadErr.message : String(cacheReadErr);
    if (msg.includes('no such table') || msg.includes('VerseTextCache')) {
      console.warn('[fetchVerseText] VerseTextCache unavailable, using API only:', msg.slice(0, 80));
    } else {
      throw cacheReadErr;
    }
  }
  if (cached?.content && cached.content.length > 0) {
    return cached.content;
  }

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

  let verses: BibleOrgVerse[] = [];

  try {
    if (verseGroups.length > 1) {
      const versePromises = verseGroups.map(async (group) => {
        const groupReference = `${parsed.book} ${parsed.chapter}:${group.start}-${group.end}`;
        const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(groupReference)}&formatting=plain&type=json`;
        const response = await fetchWithTimeout(apiUrl, { timeout: 10000, retries: 2, retryTimeout: 5000 });
        if (!response.ok) throw new Error(`Bible.org API error for ${groupReference}: ${response.status}`);
        return (await response.json()) as BibleOrgVerse[];
      });
      const verseArrays = await Promise.all(versePromises);
      verses = verseArrays.flat();
    } else {
      // Use normalized key so chapter-only refs (e.g. "John 16") become "John 16:1-33" for the API
      const passage = normalizedKey;
      const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(passage)}&formatting=plain&type=json`;
      const response = await fetchWithTimeout(apiUrl, { timeout: 10000, retries: 2, retryTimeout: 5000 });
      if (!response.ok) throw new Error(`Bible.org API error: ${response.status}`);
      verses = await response.json();
    }
  } catch (err: any) {
    console.error(`[fetchVerseText] Error for ${reference}:`, err?.message ?? err);
    return '';
  }

  if (!verses || verses.length === 0) {
    return '';
  }

  let formatted: string;
  if (verseGroups.length > 1) {
    const formattedParts: string[] = [];
    verseGroups.forEach((group, index) => {
      const groupVerses = verses.filter((v) => {
        const verseNum = parseInt(v.verse);
        return verseNum >= group.start && verseNum <= group.end;
      });
      if (groupVerses.length > 0) {
        const label = group.start === group.end ? `Verse ${group.start}:` : `Verses ${group.start}-${group.end}:`;
        formattedParts.push(`<p><strong>${label}</strong></p>`);
        const groupText = groupVerses.map((v) => `<sup>${v.verse}</sup>${v.text}`).join(' ');
        formattedParts.push(`<p>${groupText}</p>`);
        if (index < verseGroups.length - 1) {
          formattedParts.push('<hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--color-stone-grey); opacity: 0.3;" />');
        }
      }
    });
    formatted = formattedParts.join('');
  } else {
    formatted = verses.map((v) => `<sup>${v.verse}</sup>${v.text}`).join(' ');
  }

  try {
    await db.insert(VerseTextCache).values({
      reference: normalizedKey,
      content: formatted,
      createdAt: nowISO(),
    }).onConflictDoUpdate({
      target: VerseTextCache.reference,
      set: { content: formatted, createdAt: nowISO() },
    });
  } catch (cacheErr: any) {
    console.error(`[fetchVerseText] Cache insert failed for ${normalizedKey}:`, cacheErr?.message ?? cacheErr);
  }
  return formatted;
}

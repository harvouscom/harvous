/**
 * Shared server helper to fetch verse text from Bible.org API.
 * Used by process-scripture-references and the /api/scripture/fetch-verse route.
 * Pass a normalized reference for consistent results.
 */

import { fetchWithTimeout } from '@/utils/fetch-helpers';
import {
  parseScriptureReference,
  parseVerseGroups,
  validateVerseNumber,
  validateVerseRange,
} from '@/utils/scripture-detector';

interface BibleOrgVerse {
  bookname: string;
  chapter: string;
  verse: string;
  text: string;
}

/**
 * Fetches verse text for a scripture reference. Uses normalized reference for consistent API calls.
 * Returns formatted HTML with superscript verse numbers, or empty string on parse/fetch error.
 */
export async function fetchVerseText(reference: string): Promise<string> {
  const cleanReference = reference.replace(/,\s+/g, ',');
  const parsed = parseScriptureReference(cleanReference);
  if (!parsed) {
    return '';
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
      const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(cleanReference)}&formatting=plain&type=json`;
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
    return formattedParts.join('');
  }

  return verses.map((v) => `<sup>${v.verse}</sup>${v.text}`).join(' ');
}

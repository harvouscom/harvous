import type { APIRoute } from 'astro';
import { parseScriptureReference, parseVerseGroups, type VerseGroup, validateVerseNumber, validateVerseRange } from '@/utils/scripture-detector';
import { handleAPIError } from '@/utils/error-handling';
import { fetchWithTimeout } from '@/utils/fetch-helpers';

export const prerender = false;

interface BibleOrgVerse {
  bookname: string;
  chapter: string;
  verse: string;
  text: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { reference } = await request.json();

    if (!reference || typeof reference !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Reference is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse the reference to get components
    // First, clean the reference for parsing (remove spaces after commas)
    const cleanReference = reference.replace(/,\s+/g, ',');
    const parsed = parseScriptureReference(cleanReference);
    if (!parsed) {
      return new Response(JSON.stringify({ 
        error: 'Invalid scripture reference format' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse verse groups from the cleaned reference
    const verseGroups = parseVerseGroups(cleanReference);
    
    // Validate verse numbers before fetching
    for (const group of verseGroups) {
      if (group.start === group.end) {
        // Single verse
        if (!validateVerseNumber(parsed.book, parsed.chapter, group.start)) {
          return new Response(JSON.stringify({ 
            error: `Invalid verse number: ${parsed.book} ${parsed.chapter}:${group.start} does not exist` 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        // Verse range
        if (!validateVerseRange(parsed.book, parsed.chapter, group.start, group.end)) {
          return new Response(JSON.stringify({ 
            error: `Invalid verse range: ${parsed.book} ${parsed.chapter}:${group.start}-${group.end} is not valid` 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
    
    let verses: BibleOrgVerse[] = [];
    
    if (verseGroups.length > 1) {
      // Multiple groups: need to fetch each group separately and combine
      // Bible.org API may not return all verses when comma-separated groups are passed
      // Use timeout-enabled fetch to prevent hangs on slow mobile networks
      const versePromises = verseGroups.map(async (group) => {
        const groupReference = `${parsed.book} ${parsed.chapter}:${group.start}-${group.end}`;
        const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(groupReference)}&formatting=plain&type=json`;
        const response = await fetchWithTimeout(apiUrl, {
          timeout: 10000, // 10 seconds for initial attempt
          retries: 2, // 2 retries
          retryTimeout: 5000, // 5 seconds for retries
        });
        
        if (!response.ok) {
          throw new Error(`Bible.org API error for ${groupReference}: ${response.status} ${response.statusText}`);
        }
        
        return await response.json() as BibleOrgVerse[];
      });
      
      const verseArrays = await Promise.all(versePromises);
      verses = verseArrays.flat();
    } else {
      // Single verse or range: fetch normally
      // Use timeout-enabled fetch to prevent hangs on slow mobile networks
      const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
      const response = await fetchWithTimeout(apiUrl, {
        timeout: 10000, // 10 seconds for initial attempt
        retries: 2, // 2 retries
        retryTimeout: 5000, // 5 seconds for retries
      });
      
      if (!response.ok) {
        throw new Error(`Bible.org API error: ${response.status} ${response.statusText}`);
      }
      
      verses = await response.json();
    }

    if (!verses || verses.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No verses found for this reference' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Format verse text with dividers if multiple groups
    let verseText: string;

    if (verseGroups.length > 1) {
      // Multiple groups: format with dividers and labels
      const formattedParts: string[] = [];
      
      verseGroups.forEach((group, index) => {
        // Get verses that belong to this group
        const groupVerses = verses.filter(v => {
          const verseNum = parseInt(v.verse);
          return verseNum >= group.start && verseNum <= group.end;
        });

        if (groupVerses.length > 0) {
          // Add verse label
          const label = group.start === group.end 
            ? `Verse ${group.start}:`
            : `Verses ${group.start}-${group.end}:`;
          
          formattedParts.push(`<p><strong>${label}</strong></p>`);
          
          // Add verse text for this group with superscript verse numbers
          const groupText = groupVerses.map(v => `<sup>${v.verse}</sup>${v.text}`).join(' ');
          formattedParts.push(`<p>${groupText}</p>`);
          
          // Add divider before next group (not after last)
          if (index < verseGroups.length - 1) {
            formattedParts.push('<hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--color-stone-grey); opacity: 0.3;" />');
          }
        }
      });
      
      verseText = formattedParts.join('');
    } else {
      // Single verse or single range: combine text with superscript verse numbers
      verseText = verses.map(v => `<sup>${v.verse}</sup>${v.text}`).join(' ');
    }
    
    // Get first verse info for response
    const firstVerse = verses[0];
    const verseNumber = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
    const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

    return new Response(JSON.stringify({
      reference,
      book: parsed.book,
      chapter: parsed.chapter,
      verse: verseNumber,
      verseEnd,
      translation: 'NET',
      text: verseText
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/scripture/fetch-verse',
      action: 'fetch_verse'
    });
    return new Response(JSON.stringify({ 
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};


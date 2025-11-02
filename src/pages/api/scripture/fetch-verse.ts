import type { APIRoute } from 'astro';
import { parseScriptureReference, parseVerseGroups, type VerseGroup } from '@/utils/scripture-detector';

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
    
    let verses: BibleOrgVerse[] = [];
    
    if (verseGroups.length > 1) {
      // Multiple groups: need to fetch each group separately and combine
      // Bible.org API may not return all verses when comma-separated groups are passed
      const versePromises = verseGroups.map(async (group) => {
        const groupReference = `${parsed.book} ${parsed.chapter}:${group.start}-${group.end}`;
        const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(groupReference)}&formatting=plain&type=json`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          throw new Error(`Bible.org API error for ${groupReference}: ${response.status} ${response.statusText}`);
        }
        
        return await response.json() as BibleOrgVerse[];
      });
      
      const verseArrays = await Promise.all(versePromises);
      verses = verseArrays.flat();
    } else {
      // Single verse or range: fetch normally
      const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
      const response = await fetch(apiUrl);
      
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
          
          // Add verse text for this group
          const groupText = groupVerses.map(v => v.text).join(' ');
          formattedParts.push(`<p>${groupText}</p>`);
          
          // Add divider before next group (not after last)
          if (index < verseGroups.length - 1) {
            formattedParts.push('<hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--color-stone-grey); opacity: 0.3;" />');
          }
        }
      });
      
      verseText = formattedParts.join('');
    } else {
      // Single verse or single range: just combine text (no dividers needed)
      verseText = verses.map(v => v.text).join(' ');
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
    console.error('Error fetching verse:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error fetching verse text' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};


import { randomUUID } from 'crypto';
import { findKeywordsInText, findKeywordsInTextWithPriority, BIBLE_STUDY_KEYWORDS, type BibleStudyKeyword } from '@/utils/bible-study-keywords';
import { db, first, Tags, NoteTags, eq, and, now } from '../db';

/** Confidence threshold for Harvous system user / automated note creation and admin regeneration. */
export const AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN = 0.65;

function isTagOverlapping(newTag: string, existingTag: string): boolean {
  const newLower = newTag.toLowerCase();
  const existingLower = existingTag.toLowerCase();
  if (newLower === existingLower) return true;
  if (newLower.includes(existingLower) || existingLower.includes(newLower)) return true;
  const overlappingPairs = [
    ['goodness', 'righteousness'], ['grace', 'mercy'], ['love', 'mercy'],
    ['faith', 'belief'], ['hope', 'faith'], ['peace', 'joy'],
    ['kingdom of god', 'heaven'], ['resurrection', 'eternal life'],
    ['eternal life', 'everlasting life'], ['holy spirit', 'spirit'],
    ['jesus', 'christ'], ['jesus', 'lord'], ['god', 'father'], ['god', 'lord']
  ];
  for (const [tag1, tag2] of overlappingPairs) {
    if ((newLower === tag1 && existingLower === tag2) || (newLower === tag2 && existingLower === tag1)) return true;
  }
  return false;
}

export interface AutoTagSuggestion {
  keyword: string;
  category: string;
  confidence: number;
  isExisting: boolean;
  tagId?: string;
}

export interface AutoTagResult {
  suggestions: AutoTagSuggestion[];
  totalFound: number;
  highConfidence: number;
}

export async function generateAutoTags(
  noteTitle: string, noteContent: string, userId: string, confidenceThreshold: number = 0.7
): Promise<AutoTagResult> {
  try {
    if (!userId) {
      console.error('Auto-tag generation failed: userId is required');
      return { suggestions: [], totalFound: 0, highConfidence: 0 };
    }
    const { stripHtml } = await import('@/utils/html-stripper');
    const cleanTitle = (noteTitle || '').trim();
    const cleanContent = stripHtml(noteContent || '', { preserveSpacing: true }).trim();
    const fullText = `${cleanTitle} ${cleanContent}`.trim();
    if (!fullText) return { suggestions: [], totalFound: 0, highConfidence: 0 };

    let foundKeywords: Array<{ keyword: BibleStudyKeyword; confidence: number }> = [];
    try {
      foundKeywords = findKeywordsInTextWithPriority(fullText, cleanTitle, cleanContent);
    } catch (keywordError: unknown) {
      console.error('Keyword detection error:', keywordError instanceof Error ? keywordError.message : String(keywordError));
      foundKeywords = [];
    }

    interface ExistingTag { id: string; name: string; color: string | null; category: string | null; userId: string; isSystem: boolean; createdAt: string; updatedAt: string | null; }
    let existingTags: ExistingTag[] = [];
    try {
      if (!db) throw new Error('Database connection not available');
      existingTags = await db.select().from(Tags).where(eq(Tags.userId, userId));
    } catch (dbError: unknown) {
      console.error('Database error fetching existing tags:', dbError instanceof Error ? dbError.message : String(dbError));
      existingTags = [];
    }

    const existingTagNames = new Set(existingTags.map(tag => tag.name.toLowerCase()));
    const suggestions: AutoTagSuggestion[] = [];
    let highConfidence = 0;

    for (const { keyword, confidence } of foundKeywords) {
      if (keyword.name.toLowerCase() === 'god') continue;
      if (confidence >= confidenceThreshold) {
        const isOverlapping = suggestions.some(existing => isTagOverlapping(keyword.name, existing.keyword));
        if (isOverlapping) continue;
        const isExisting = existingTagNames.has(keyword.name.toLowerCase());
        const existingTag = isExisting ?
          existingTags.filter(t => t.name.toLowerCase() === keyword.name.toLowerCase())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
          : undefined;
        suggestions.push({ keyword: keyword.name, category: keyword.category, confidence, isExisting, tagId: existingTag?.id });
        if (confidence >= 0.8) highConfidence++;
      }
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);
    const bibleStudyCategories = ['spiritual', 'biblical', 'character', 'book', 'theme'];
    const enhancedSuggestions = suggestions.map(suggestion => {
      const isBibleStudy = bibleStudyCategories.includes(suggestion.category);
      if (isBibleStudy) {
        return { ...suggestion, confidence: Math.min(1.0, suggestion.confidence + 0.05) };
      }
      return suggestion;
    });
    enhancedSuggestions.sort((a, b) => b.confidence - a.confidence);

    const { detectPersonTags } = await import('@/utils/person-tag-detector');
    for (const personTag of detectPersonTags(fullText)) {
      const key = personTag.toLowerCase();
      if (enhancedSuggestions.some(s => s.keyword.toLowerCase() === key)) continue;
      const isExisting = existingTagNames.has(key);
      const existingTag = isExisting
        ? existingTags.filter(t => t.name.toLowerCase() === key)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        : undefined;
      enhancedSuggestions.push({
        keyword: personTag,
        category: 'character',
        confidence: 0.85,
        isExisting,
        tagId: existingTag?.id,
      });
    }
    enhancedSuggestions.sort((a, b) => b.confidence - a.confidence);

    const topSuggestions = enhancedSuggestions.slice(0, 12);
    return { suggestions: topSuggestions, totalFound: suggestions.length, highConfidence };
  } catch (error: unknown) {
    console.error('Error generating auto tags:', error instanceof Error ? error.message : String(error));
    return { suggestions: [], totalFound: 0, highConfidence: 0 };
  }
}

function dedupeSuggestionsByKeyword(suggestions: AutoTagSuggestion[]): AutoTagSuggestion[] {
  const seen = new Set<string>();
  const out: AutoTagSuggestion[] = [];
  for (const s of suggestions) {
    const k = s.keyword.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export async function applyAutoTags(
  noteId: string,
  suggestions: AutoTagSuggestion[],
  userId: string,
  options?: { forceRelink?: boolean }
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];
  let applied = 0;
  if (!noteId || !userId) {
    const error = 'Missing required parameters: noteId or userId';
    console.error('applyAutoTags validation failed:', error);
    return { applied: 0, errors: [error] };
  }

  const list = dedupeSuggestionsByKeyword(suggestions);

  for (const suggestion of list) {
    try {
      let tagId = suggestion.tagId;
      if (!tagId) {
        try {
          const allUserTags = await db.select().from(Tags).where(eq(Tags.userId, userId));
          const existingTag = allUserTags.find(t => t.name.toLowerCase() === suggestion.keyword.toLowerCase());
          if (existingTag) {
            tagId = existingTag.id;
          } else {
            const newTagId = `tag_${randomUUID()}`;
            await db.insert(Tags).values({
              id: newTagId,
              name: suggestion.keyword,
              color: getColorForCategory(suggestion.category),
              category: suggestion.category,
              userId: userId,
              isSystem: true,
              createdAt: now(),
            });
            tagId = newTagId;
          }
        } catch (tagError) {
          console.error(`Error handling tag ${suggestion.keyword}:`, tagError);
          errors.push(`Failed to handle tag "${suggestion.keyword}": ${tagError}`);
          continue;
        }
      }

      if (!tagId) {
        errors.push(`Missing tagId for "${suggestion.keyword}"`);
        continue;
      }

      if (options?.forceRelink) {
        await db.delete(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)));
      } else {
        const existingRelation = first(await db.select().from(NoteTags)
          .where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)))
          .limit(1));
        if (existingRelation) continue;
      }

      const relationId = `note_tag_${randomUUID()}`;
      await db.insert(NoteTags).values({
        id: relationId,
        noteId,
        tagId,
        isAutoGenerated: true,
        confidence: suggestion.confidence,
        createdAt: now(),
      });
      applied++;
    } catch (error) {
      console.error(`Error applying tag ${suggestion.keyword}:`, error);
      errors.push(`Failed to apply tag "${suggestion.keyword}": ${error}`);
    }
  }
  return { applied, errors };
}

function getColorForCategory(category: string): string {
  const colorMap: Record<string, string> = {
    'spiritual': '#006eff', 'biblical': '#28a745', 'character': '#ffc107',
    'place': '#17a2b8', 'book': '#6f42c1', 'theme': '#fd7e14', 'life': '#e83e8c'
  };
  return colorMap[category] || '#006eff';
}

export async function removeAutoTags(noteId: string): Promise<number> {
  try {
    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.isAutoGenerated, true)));
    return 1;
  } catch (error) {
    console.error('Error removing auto tags:', error);
    return 0;
  }
}

export async function regenerateAutoTags(
  noteId: string,
  noteTitle: string,
  noteContent: string,
  userId: string,
  confidenceThreshold: number = 0.7,
  options?: { removeAllNoteTagLinks?: boolean }
): Promise<{ applied: number; errors: string[]; suggestionCount: number }> {
  try {
    if (options?.removeAllNoteTagLinks) {
      await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
    } else {
      await removeAutoTags(noteId);
    }
    const result = await generateAutoTags(noteTitle, noteContent, userId, confidenceThreshold);
    const out = await applyAutoTags(noteId, result.suggestions, userId, {
      forceRelink: Boolean(options?.removeAllNoteTagLinks),
    });
    return { ...out, suggestionCount: result.suggestions.length };
  } catch (error) {
    console.error('Error regenerating auto tags:', error);
    return { applied: 0, errors: [`Failed to regenerate tags: ${error}`], suggestionCount: 0 };
  }
}

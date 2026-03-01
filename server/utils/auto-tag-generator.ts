import { findKeywordsInText, findKeywordsInTextWithPriority, BIBLE_STUDY_KEYWORDS, type BibleStudyKeyword } from '@/utils/bible-study-keywords';
import { db, Tags, NoteTags, eq, and } from '../db';

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
    const cleanContent = stripHtml(noteContent || '').trim();
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
      if (keyword.name.includes(' ')) continue;
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
    const topSuggestions = enhancedSuggestions.slice(0, 12);
    return { suggestions: topSuggestions, totalFound: suggestions.length, highConfidence };
  } catch (error: unknown) {
    console.error('Error generating auto tags:', error instanceof Error ? error.message : String(error));
    return { suggestions: [], totalFound: 0, highConfidence: 0 };
  }
}

export async function applyAutoTags(
  noteId: string, suggestions: AutoTagSuggestion[], userId: string
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];
  let applied = 0;
  if (!noteId || !userId) {
    const error = 'Missing required parameters: noteId or userId';
    console.error('applyAutoTags validation failed:', error);
    return { applied: 0, errors: [error] };
  }
  for (const suggestion of suggestions) {
    try {
      let tagId = suggestion.tagId;
      if (!tagId) {
        try {
          const allUserTags = await db.select().from(Tags).where(eq(Tags.userId, userId));
          const existingTag = allUserTags.find(t => t.name.toLowerCase() === suggestion.keyword.toLowerCase());
          if (existingTag) {
            tagId = existingTag.id;
          } else {
            const newTagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await db.insert(Tags).values({
              id: newTagId,
              name: suggestion.keyword,
              color: getColorForCategory(suggestion.category),
              category: suggestion.category,
              userId: userId,
              isSystem: true,
              createdAt: new Date().toISOString(),
            });
            tagId = newTagId;
          }
        } catch (tagError) {
          console.error(`Error handling tag ${suggestion.keyword}:`, tagError);
          errors.push(`Failed to handle tag "${suggestion.keyword}": ${tagError}`);
          continue;
        }
      }
      const existingRelation = await db.select().from(NoteTags)
        .where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)))
        .get();
      if (existingRelation) continue;
      const relationId = `note_tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteTags).values({
        id: relationId, noteId, tagId, isAutoGenerated: true, confidence: suggestion.confidence, createdAt: new Date().toISOString(),
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
  noteId: string, noteTitle: string, noteContent: string, userId: string
): Promise<{ applied: number; errors: string[] }> {
  try {
    await removeAutoTags(noteId);
    const result = await generateAutoTags(noteTitle, noteContent, userId);
    return await applyAutoTags(noteId, result.suggestions, userId);
  } catch (error) {
    console.error('Error regenerating auto tags:', error);
    return { applied: 0, errors: [`Failed to regenerate tags: ${error}`] };
  }
}

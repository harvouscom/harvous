import { findKeywordsInText, findKeywordsInTextWithPriority, BIBLE_STUDY_KEYWORDS } from './bible-study-keywords';
import { db, Tags, NoteTags, eq, and } from 'astro:db';

// Helper function to detect overlapping/similar tags
function isTagOverlapping(newTag: string, existingTag: string): boolean {
  const newLower = newTag.toLowerCase();
  const existingLower = existingTag.toLowerCase();
  
  // Exact match
  if (newLower === existingLower) return true;
  
  // One tag contains the other (e.g., "Holy Spirit" vs "Spirit")
  if (newLower.includes(existingLower) || existingLower.includes(newLower)) return true;
  
  // Similar spiritual concepts that overlap (removed salvation/redemption overlap)
  const overlappingPairs = [
    ['goodness', 'righteousness'],
    // Removed: ['redemption', 'salvation'] - these are distinct concepts
    // Removed: ['redemption', 'forgiveness'] - these are distinct concepts  
    // Removed: ['salvation', 'forgiveness'] - these are distinct concepts
    ['grace', 'mercy'],
    ['love', 'mercy'],
    ['faith', 'belief'],
    ['hope', 'faith'],
    ['peace', 'joy'],
    ['kingdom of god', 'heaven'],
    ['resurrection', 'eternal life'],
    ['eternal life', 'everlasting life'],
    ['holy spirit', 'spirit'],
    ['jesus', 'christ'],
    ['jesus', 'lord'],
    ['god', 'father'],
    ['god', 'lord']
  ];
  
  for (const [tag1, tag2] of overlappingPairs) {
    if ((newLower === tag1 && existingLower === tag2) || 
        (newLower === tag2 && existingLower === tag1)) {
      return true;
    }
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

/**
 * Generate auto-tag suggestions for a note based on its content
 */
export async function generateAutoTags(
  noteTitle: string, 
  noteContent: string, 
  userId: string,
  confidenceThreshold: number = 0.7 // Lowered threshold to include more relevant tags
): Promise<AutoTagResult> {
  try {
    // Auto-tag generation started
    console.log('Auto-tag generation environment:', {
      NODE_ENV: process.env.NODE_ENV,
      hasDb: !!db,
      userId: userId?.substring(0, 10) + '...',
      noteTitle: noteTitle?.substring(0, 20),
      confidenceThreshold,
      isProduction: process.env.NODE_ENV === 'production'
    });

    // Early validation for production
    if (!userId) {
      console.error('Auto-tag generation failed: userId is required');
      return { suggestions: [], totalFound: 0, highConfidence: 0 };
    }

    // Strip HTML tags from content for better keyword detection
    const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Separate title and content for enhanced analysis
    const cleanTitle = (noteTitle || '').trim();
    const cleanContent = stripHtml(noteContent || '').trim();
    const fullText = `${cleanTitle} ${cleanContent}`.trim();
    
    if (!fullText) {
      return { suggestions: [], totalFound: 0, highConfidence: 0 };
    }

    // Find keywords in the text with enhanced detection
    let foundKeywords: Array<{ keyword: any; confidence: number }> = [];
    try {
      foundKeywords = findKeywordsInTextWithPriority(fullText, cleanTitle, cleanContent);
    } catch (keywordError: unknown) {
      console.error('Keyword detection error:', keywordError);
      if (process.env.NODE_ENV === 'production') {
        console.error('Production keyword detection error:', {
          error: keywordError instanceof Error ? keywordError.message : String(keywordError),
          fullText: fullText?.substring(0, 100),
          userId: userId
        });
      }
      // Continue with empty keywords if detection fails
      foundKeywords = [];
    }
    
    // Get existing tags for the user to avoid duplicates
    let existingTags: any[] = [];
    try {
      // Test database connectivity first
      if (!db) {
        throw new Error('Database connection not available');
      }
      
      existingTags = await db
        .select()
        .from(Tags)
        .where(eq(Tags.userId, userId));
        
      console.log('Successfully fetched existing tags:', {
        count: existingTags.length,
        userId: userId?.substring(0, 10) + '...'
      });
    } catch (dbError: unknown) {
      console.error('Database error fetching existing tags:', dbError);
      if (process.env.NODE_ENV === 'production') {
        console.error('Production database error:', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          userId: userId,
          operation: 'fetch_existing_tags',
          stack: dbError instanceof Error ? dbError.stack : undefined
        });
      }
      // Continue with empty tags array if database fails
      existingTags = [];
    }

    // Process existing tags
    const existingTagNames = new Set(existingTags.map(tag => tag.name.toLowerCase()));

    // Process suggestions and filter out overlapping/similar tags
    const suggestions: AutoTagSuggestion[] = [];
    let highConfidence = 0;

    for (const { keyword, confidence } of foundKeywords) {
      console.log(`Processing keyword: ${keyword.name} (confidence: ${confidence})`);
      
      // Skip "God" as it's implied in all biblical content
      if (keyword.name.toLowerCase() === 'god') {
        console.log(`Skipping ${keyword.name}: God is implied in all biblical content`);
        continue;
      }
      
      // Only suggest single-word tags (no spaces)
      if (keyword.name.includes(' ')) {
        console.log(`Skipping ${keyword.name}: contains spaces`);
        continue;
      }
      
      // Only suggest if confidence is above threshold
      if (confidence >= confidenceThreshold) {
        console.log(`${keyword.name} meets confidence threshold (${confidence} >= ${confidenceThreshold})`);
        
        // Check for overlapping/similar tags already in suggestions
        const isOverlapping = suggestions.some(existing => 
          isTagOverlapping(keyword.name, existing.keyword)
        );
        
        if (isOverlapping) {
          console.log(`Skipping ${keyword.name}: overlaps with existing suggestion`);
          continue;
        }
        
        const isExisting = existingTagNames.has(keyword.name.toLowerCase());
        console.log(`${keyword.name} isExisting: ${isExisting}`);
        
        // Find the most recent tag with this name (to avoid duplicates)
        const existingTag = isExisting ? 
          existingTags
            .filter(t => t.name.toLowerCase() === keyword.name.toLowerCase())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] 
          : undefined;
        
        suggestions.push({
          keyword: keyword.name,
          category: keyword.category,
          confidence: confidence,
          isExisting: isExisting,
          tagId: existingTag?.id
        });

        console.log(`Added ${keyword.name} to suggestions`);

        if (confidence >= 0.8) {
          highConfidence++;
        }
      } else {
        console.log(`Skipping ${keyword.name}: confidence ${confidence} below threshold ${confidenceThreshold}`);
      }
    }

    // Sort by confidence (highest first)
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Apply Bible study keyword priority boost
    // Bible study keywords should get higher priority in final suggestions
    const bibleStudyCategories = ['spiritual', 'biblical', 'character', 'book', 'theme'];
    const enhancedSuggestions = suggestions.map(suggestion => {
      const isBibleStudy = bibleStudyCategories.includes(suggestion.category);
      if (isBibleStudy) {
        // Add a small priority boost for Bible study keywords to ensure they appear in top 8
        const priorityBoost = 0.05;
        const enhancedConfidence = Math.min(1.0, suggestion.confidence + priorityBoost);
        console.log(`Bible study priority boost for ${suggestion.keyword}: +${priorityBoost} (${suggestion.confidence} -> ${enhancedConfidence})`);
        return {
          ...suggestion,
          confidence: enhancedConfidence
        };
      }
      return suggestion;
    });

    // Re-sort with enhanced confidence
    enhancedSuggestions.sort((a, b) => b.confidence - a.confidence);

    // Apply proper limits: maximum 8 tags (0-8 based on content quality)
    const topSuggestions = enhancedSuggestions.slice(0, 8);

    console.log('Final auto-tag results:', {
      totalFound: suggestions.length,
      highConfidence: highConfidence,
      topSuggestions: topSuggestions.map(s => ({ 
        name: s.keyword, 
        confidence: s.confidence, 
        isExisting: s.isExisting,
        category: s.category 
      })),
      allSuggestions: enhancedSuggestions.map(s => ({ 
        name: s.keyword, 
        confidence: s.confidence, 
        isExisting: s.isExisting,
        category: s.category 
      })),
      bibleStudyKeywords: topSuggestions.filter(s => bibleStudyCategories.includes(s.category)).map(s => s.keyword)
    });

    return {
      suggestions: topSuggestions,
      totalFound: suggestions.length,
      highConfidence: highConfidence
    };

  } catch (error: unknown) {
    console.error('Error generating auto tags:', error);
    // Enhanced error logging for production debugging
    if (process.env.NODE_ENV === 'production') {
      console.error('Production auto-tag generation error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        noteTitle: noteTitle?.substring(0, 50),
        noteContentLength: noteContent?.length || 0,
        userId: userId,
        confidenceThreshold: confidenceThreshold
      });
    }
    return { suggestions: [], totalFound: 0, highConfidence: 0 };
  }
}

/**
 * Apply auto-generated tags to a note
 */
export async function applyAutoTags(
  noteId: string,
  suggestions: AutoTagSuggestion[],
  userId: string
): Promise<{ applied: number; errors: string[] }> {
  console.log('Starting applyAutoTags:', {
    noteId,
    suggestionsCount: suggestions.length,
    userId: userId?.substring(0, 10) + '...',
    isProduction: process.env.NODE_ENV === 'production'
  });

  const errors: string[] = [];
  let applied = 0;

  // Early validation
  if (!noteId || !userId) {
    const error = 'Missing required parameters: noteId or userId';
    console.error('applyAutoTags validation failed:', error);
    return { applied: 0, errors: [error] };
  }

  for (const suggestion of suggestions) {
    try {
      let tagId = suggestion.tagId;

      // Create tag if it doesn't exist
      if (!tagId) {
        try {
          // Get all tags for the user and filter by name (case-insensitive)
          const allUserTags = await db
            .select()
            .from(Tags)
            .where(eq(Tags.userId, userId));
          
          const existingTag = allUserTags.find(t => 
            t.name.toLowerCase() === suggestion.keyword.toLowerCase()
          );
          
          if (existingTag) {
            // Use the existing tag instead of creating a new one
            tagId = existingTag.id;
            console.log('Using existing tag:', { tagId, tagName: suggestion.keyword });
          } else {
            // Create new tag only if no tag with this name exists
            const newTagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            console.log('Creating new tag:', { 
              tagId: newTagId, 
              tagName: suggestion.keyword,
              category: suggestion.category 
            });
            
            await db.insert(Tags).values({
              id: newTagId,
              name: suggestion.keyword,
              color: getColorForCategory(suggestion.category),
              category: suggestion.category,
              userId: userId,
              isSystem: true, // Auto-generated tags are system tags
              createdAt: new Date(),
            });

            tagId = newTagId;
            console.log('New tag created successfully:', { tagId, tagName: suggestion.keyword });
          }
        } catch (tagError) {
          console.error(`Error handling tag ${suggestion.keyword}:`, tagError);
          errors.push(`Failed to handle tag "${suggestion.keyword}": ${tagError}`);
          continue;
        }
      }

      // Check if note-tag relationship already exists
      const existingRelation = await db
        .select()
        .from(NoteTags)
        .where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)))
        .get();

      if (existingRelation) {
        // Skip this tag as it's already assigned to the note
        // Tag already assigned, skipping
        continue;
      }

      // Create note-tag relationship
      const relationId = `note_tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('Creating note-tag relationship:', {
        relationId,
        noteId,
        tagId,
        tagName: suggestion.keyword,
        confidence: suggestion.confidence
      });
      
      await db.insert(NoteTags).values({
        id: relationId,
        noteId: noteId,
        tagId: tagId,
        isAutoGenerated: true,
        confidence: suggestion.confidence,
        createdAt: new Date(),
      });

      console.log('Note-tag relationship created successfully:', {
        relationId,
        noteId,
        tagId,
        tagName: suggestion.keyword
      });

      applied++;

    } catch (error) {
      console.error(`Error applying tag ${suggestion.keyword}:`, error);
      errors.push(`Failed to apply tag "${suggestion.keyword}": ${error}`);
    }
  }

  return { applied, errors };
}

/**
 * Get color for tag category
 */
function getColorForCategory(category: string): string {
  const colorMap: Record<string, string> = {
    'spiritual': '#006eff',
    'biblical': '#28a745',
    'character': '#ffc107',
    'place': '#17a2b8',
    'book': '#6f42c1',
    'theme': '#fd7e14',
    'life': '#e83e8c'
  };

  return colorMap[category] || '#006eff';
}

/**
 * Remove auto-generated tags from a note
 */
export async function removeAutoTags(noteId: string): Promise<number> {

  try {
    const result = await db
      .delete(NoteTags)
      .where(and(
        eq(NoteTags.noteId, noteId),
        eq(NoteTags.isAutoGenerated, true)
      ));

    return 1; // Success
  } catch (error) {
    console.error('Error removing auto tags:', error);
    return 0;
  }
}

/**
 * Regenerate auto tags for a note (remove old ones and create new ones)
 */
export async function regenerateAutoTags(
  noteId: string,
  noteTitle: string,
  noteContent: string,
  userId: string
): Promise<{ applied: number; errors: string[] }> {
  try {
    // Remove existing auto-generated tags
    await removeAutoTags(noteId);

    // Generate new suggestions
    const result = await generateAutoTags(noteTitle, noteContent, userId);

    // Apply new tags
    const applied = await applyAutoTags(noteId, result.suggestions, userId);

    return applied;
  } catch (error) {
    console.error('Error regenerating auto tags:', error);
    return { applied: 0, errors: [`Failed to regenerate tags: ${error}`] };
  }
}

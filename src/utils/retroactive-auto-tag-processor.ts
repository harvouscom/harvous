/**
 * Retroactive Auto-Tag Processor
 * 
 * Specific implementation for applying auto-tags to existing notes
 */

import { RetroactiveProcessor, findNotesWithoutTags } from './retroactive-utils';
import { generateAutoTags, applyAutoTags } from './auto-tag-generator';

export interface NoteItem {
  id: string;
  title?: string;
  content?: string;
  createdAt: Date;
}

export class RetroactiveAutoTagProcessor extends RetroactiveProcessor<NoteItem> {
  private confidenceThreshold: number;

  constructor(
    options: {
      userId: string;
      batchSize?: number;
      dryRun?: boolean;
      confidenceThreshold?: number;
      onProgress?: (current: number, total: number, item: NoteItem) => void;
    }
  ) {
    super(options);
    this.confidenceThreshold = options.confidenceThreshold || 0.8;
  }

  async findItemsToProcess(): Promise<NoteItem[]> {
    return await findNotesWithoutTags(this.userId);
  }

  async processItem(item: NoteItem): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      // Generate auto-tags for this note
      const autoTagResult = await generateAutoTags(
        item.title || '',
        item.content || '',
        this.userId,
        this.confidenceThreshold
      );

      if (autoTagResult.suggestions.length === 0) {
        return {
          success: true,
          details: {
            message: 'No auto-tag suggestions found',
            suggestionsFound: 0,
            tagsApplied: 0
          }
        };
      }

      // Apply the auto-tags
      const applyResult = await applyAutoTags(
        item.id,
        autoTagResult.suggestions,
        this.userId
      );

      return {
        success: true,
        details: {
          suggestionsFound: autoTagResult.suggestions.length,
          tagsApplied: applyResult.applied,
          tags: autoTagResult.suggestions.map(s => s.keyword),
          errors: applyResult.errors
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  getItemIdentifier(item: NoteItem): string {
    return `${item.id} (${item.title?.substring(0, 30) || 'Untitled'}...)`;
  }
}

/**
 * Convenience function to run retroactive auto-tagging
 */
export async function runRetroactiveAutoTags(
  userId: string,
  options: {
    confidenceThreshold?: number;
    dryRun?: boolean;
    onProgress?: (current: number, total: number, item: NoteItem) => void;
  } = {}
) {
  const processor = new RetroactiveAutoTagProcessor({
    userId,
    confidenceThreshold: options.confidenceThreshold || 0.8,
    dryRun: options.dryRun || false,
    onProgress: options.onProgress
  });

  return await processor.run();
}

# Retroactive Utilities System

## Overview

The retroactive utilities system provides a framework for applying new features to existing data without affecting new data creation. This is particularly useful when you add new functionality (like auto-tagging) and need to apply it to existing notes.

## Architecture

### Core Components

1. **`src/utils/retroactive-utils.ts`** - Base framework and utilities
2. **`src/utils/retroactive-auto-tag-processor.ts`** - Specific auto-tag implementation
3. **`scripts/retroactive-auto-tags.js`** - Command-line script for running auto-tag processing

### Key Classes and Functions

#### `RetroactiveProcessor<T>` (Base Class)
Abstract base class for all retroactive processing operations.

**Methods to implement:**
- `findItemsToProcess()` - Find items that need processing
- `processItem(item)` - Process a single item
- `getItemIdentifier(item)` - Get human-readable identifier

**Built-in functionality:**
- Progress tracking
- Error handling
- Batch processing
- Dry run support
- Comprehensive result reporting

#### Utility Functions
- `findNotesWithoutTags(userId)` - Find notes that don't have any tags
- `findNotesWithCriteria(userId, criteria)` - Find notes with specific criteria
- `getProcessingStats(userId)` - Get statistics about tag coverage

## Usage Examples

### Running Auto-Tag Processing

```bash
# Process all notes without tags
node scripts/retroactive-auto-tags.js YOUR_USER_ID

# Test with dry run (no changes made)
node scripts/retroactive-auto-tags.js YOUR_USER_ID --dry-run
```

### Creating New Retroactive Processors

```typescript
import { RetroactiveProcessor } from '@/utils/retroactive-utils';

class RetroactiveNewFeatureProcessor extends RetroactiveProcessor<NoteItem> {
  async findItemsToProcess(): Promise<NoteItem[]> {
    // Find items that need the new feature
    return await findNotesWithCriteria(this.userId, {
      hasTags: false,
      createdAfter: new Date('2024-01-01')
    });
  }

  async processItem(item: NoteItem): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      // Apply the new feature to this item
      const result = await applyNewFeature(item);
      return { success: true, details: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getItemIdentifier(item: NoteItem): string {
    return `${item.id} (${item.title?.substring(0, 30) || 'Untitled'}...)`;
  }
}
```

### Using the Auto-Tag Processor Directly

```typescript
import { runRetroactiveAutoTags } from '@/utils/retroactive-auto-tag-processor';

const result = await runRetroactiveAutoTags(userId, {
  confidenceThreshold: 0.8,
  dryRun: false,
  onProgress: (current, total, item) => {
    console.log(`Processing ${current}/${total}: ${item.id}`);
  }
});

console.log(`Processed ${result.processed} notes, ${result.successful} successful`);
```

## Common Patterns

### Finding Notes by Criteria

```typescript
// Notes without tags
const notesWithoutTags = await findNotesWithoutTags(userId);

// Notes with specific criteria
const notes = await findNotesWithCriteria(userId, {
  hasTags: false,                    // Notes without tags
  createdAfter: new Date('2024-01-01'), // Created after date
  titleContains: 'Jesus',            // Title contains text
  contentContains: 'prayer'          // Content contains text
});
```

### Getting Processing Statistics

```typescript
const stats = await getProcessingStats(userId);
console.log({
  totalNotes: stats.totalNotes,
  notesWithTags: stats.notesWithTags,
  notesWithoutTags: stats.notesWithoutTags,
  tagCoverage: `${stats.tagCoverage}%`
});
```

### Error Handling

The system automatically handles errors and continues processing. Results include:
- `success: boolean` - Whether the item was processed successfully
- `error?: string` - Error message if processing failed
- `details?: any` - Additional details about the processing result

## Best Practices

### 1. Always Use Dry Run First
```bash
node scripts/retroactive-auto-tags.js USER_ID --dry-run
```

### 2. Implement Progress Callbacks
```typescript
const processor = new MyRetroactiveProcessor({
  userId,
  onProgress: (current, total, item) => {
    console.log(`Processing ${current}/${total}: ${item.id}`);
  }
});
```

### 3. Handle Errors Gracefully
```typescript
async processItem(item: NoteItem) {
  try {
    // Your processing logic
    return { success: true, details: result };
  } catch (error) {
    console.error(`Error processing ${item.id}:`, error);
    return { success: false, error: error.message };
  }
}
```

### 4. Use Appropriate Batch Sizes
For large datasets, consider processing in smaller batches to avoid timeouts.

## File Structure

```
src/utils/
├── retroactive-utils.ts              # Base framework
├── retroactive-auto-tag-processor.ts # Auto-tag implementation
└── auto-tag-generator.ts             # Auto-tag logic

scripts/
└── retroactive-auto-tags.js          # Command-line script
```

## Integration with Existing Systems

### Auto-Tag System
The retroactive auto-tag processor integrates with:
- `generateAutoTags()` - Generates tag suggestions
- `applyAutoTags()` - Applies tags to notes
- Database tables: `Notes`, `Tags`, `NoteTags`

### Database Schema
Requires these tables:
- `Notes` - Note content and metadata
- `Tags` - Tag definitions
- `NoteTags` - Many-to-many relationship between notes and tags

## Troubleshooting

### Common Issues

1. **"No such table" errors**
   - Ensure database schema is deployed: `npm run db:push`

2. **Authentication errors**
   - Make sure you're logged in and have the correct user ID

3. **Import errors in scripts**
   - Use `.js` extensions in import statements for Node.js scripts

4. **Memory issues with large datasets**
   - Use batch processing or smaller batch sizes

### Debugging

Enable verbose logging by adding progress callbacks:

```typescript
const result = await runRetroactiveAutoTags(userId, {
  onProgress: (current, total, item) => {
    console.log(`Processing ${current}/${total}: ${item.id}`);
    console.log(`Title: ${item.title?.substring(0, 50)}...`);
  }
});
```

## Future Extensions

The system is designed to be easily extensible. Common extensions might include:

1. **Retroactive XP calculation** - Apply XP to old notes
2. **Retroactive thread organization** - Reorganize notes into threads
3. **Retroactive content analysis** - Apply new analysis features
4. **Retroactive metadata extraction** - Extract metadata from existing content

Each extension would follow the same pattern:
1. Extend `RetroactiveProcessor<T>`
2. Implement the three required methods
3. Create a command-line script if needed
4. Add to this documentation

## Security Considerations

- All retroactive operations require user authentication
- Operations are scoped to the authenticated user's data only
- Dry run mode allows testing without making changes
- Error handling prevents partial state corruption

## Performance Considerations

- Batch processing prevents memory issues
- Progress callbacks allow monitoring of long-running operations
- Error handling ensures processing continues even if individual items fail
- Statistics help understand the scope before processing

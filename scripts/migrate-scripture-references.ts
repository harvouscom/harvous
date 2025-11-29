/**
 * Migration script to populate NoteScriptureReferences junction table
 * 
 * This script scans all existing notes for scripture references and creates
 * junction entries linking notes to the scripture notes they reference.
 * 
 * Usage:
 *   npx tsx scripts/migrate-scripture-references.ts [USER_ID] [--dry-run]
 * 
 * Examples:
 *   npx tsx scripts/migrate-scripture-references.ts                      # Migrate all users
 *   npx tsx scripts/migrate-scripture-references.ts user_abc123          # Migrate specific user
 *   npx tsx scripts/migrate-scripture-references.ts user_abc123 --dry-run # Preview changes
 */

import { db, Notes, NoteScriptureReferences, ScriptureMetadata, eq, and } from 'astro:db';
import { detectScriptureReferences, normalizeScriptureReference } from '../src/utils/scripture-detector';

interface MigrationStats {
  notesProcessed: number;
  junctionEntriesCreated: number;
  referencesFound: number;
  errors: number;
}

// Regex to extract scripture pills from HTML content
const SCRIPTURE_PILL_PATTERN = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;

async function migrateScriptureReferences(userId?: string, dryRun: boolean = false): Promise<MigrationStats> {
  console.log('🚀 Starting scripture references migration...');
  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made');
  }
  if (userId) {
    console.log(`📝 Migrating notes for user: ${userId}`);
  } else {
    console.log('📝 Migrating notes for ALL users');
  }
  
  const stats: MigrationStats = {
    notesProcessed: 0,
    junctionEntriesCreated: 0,
    referencesFound: 0,
    errors: 0
  };

  try {
    // Get all notes (optionally filtered by user)
    let notes;
    if (userId) {
      notes = await db.select({
        id: Notes.id,
        content: Notes.content,
        userId: Notes.userId,
        noteType: Notes.noteType
      })
        .from(Notes)
        .where(eq(Notes.userId, userId))
        .all();
    } else {
      notes = await db.select({
        id: Notes.id,
        content: Notes.content,
        userId: Notes.userId,
        noteType: Notes.noteType
      })
        .from(Notes)
        .all();
    }

    console.log(`📊 Found ${notes.length} notes to process`);

    // Get all scripture metadata for reference lookup
    const allScriptureMetadata = await db.select({
      noteId: ScriptureMetadata.noteId,
      reference: ScriptureMetadata.reference
    })
      .from(ScriptureMetadata)
      .all();

    // Create a map of normalized reference -> scripture note ID
    const scriptureRefMap = new Map<string, { noteId: string; userId: string }>();
    for (const meta of allScriptureMetadata) {
      const normalizedRef = normalizeScriptureReference(meta.reference);
      // Get the note to find the user
      const scriptureNote = await db.select({ userId: Notes.userId })
        .from(Notes)
        .where(eq(Notes.id, meta.noteId))
        .get();
      if (scriptureNote) {
        // Store with userId prefix to handle multi-user scenarios
        scriptureRefMap.set(`${scriptureNote.userId}:${normalizedRef}`, {
          noteId: meta.noteId,
          userId: scriptureNote.userId
        });
      }
    }

    console.log(`📖 Found ${scriptureRefMap.size} scripture notes in database`);

    // Process each note
    for (const note of notes) {
      // Skip scripture notes themselves
      if (note.noteType === 'scripture') {
        continue;
      }

      stats.notesProcessed++;

      try {
        // Method 1: Extract from processed pills in HTML
        const pillReferences = extractPillReferences(note.content);
        
        // Method 2: Detect raw text references (not yet processed as pills)
        const textReferences = detectTextReferences(note.content, note.userId, scriptureRefMap);
        
        // Combine and deduplicate
        const allReferences = new Map<string, string>(); // scriptureNoteId -> reference
        
        for (const [reference, scriptureNoteId] of pillReferences) {
          allReferences.set(scriptureNoteId, reference);
        }
        
        for (const [reference, scriptureNoteId] of textReferences) {
          if (!allReferences.has(scriptureNoteId)) {
            allReferences.set(scriptureNoteId, reference);
          }
        }

        if (allReferences.size === 0) {
          continue;
        }

        stats.referencesFound += allReferences.size;
        console.log(`  📝 Note ${note.id}: Found ${allReferences.size} scripture reference(s)`);

        // Create junction entries
        for (const [scriptureNoteId, reference] of allReferences) {
          try {
            // Check if junction entry already exists
            const existingJunction = await db.select()
              .from(NoteScriptureReferences)
              .where(
                and(
                  eq(NoteScriptureReferences.noteId, note.id),
                  eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
                )
              )
              .limit(1)
              .get();

            if (existingJunction) {
              console.log(`    ⏭️  Junction already exists: ${note.id} -> ${scriptureNoteId} (${reference})`);
              continue;
            }

            if (!dryRun) {
              await db.insert(NoteScriptureReferences).values({
                id: `note-scripture-${note.id}-${scriptureNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                noteId: note.id,
                scriptureNoteId: scriptureNoteId,
                createdAt: new Date()
              });
              console.log(`    ✅ Created junction: ${note.id} -> ${scriptureNoteId} (${reference})`);
            } else {
              console.log(`    🔍 Would create junction: ${note.id} -> ${scriptureNoteId} (${reference})`);
            }
            
            stats.junctionEntriesCreated++;
          } catch (error) {
            console.error(`    ❌ Error creating junction for ${note.id} -> ${scriptureNoteId}:`, error);
            stats.errors++;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing note ${note.id}:`, error);
        stats.errors++;
      }

      // Progress indicator every 100 notes
      if (stats.notesProcessed % 100 === 0) {
        console.log(`  📊 Progress: ${stats.notesProcessed} notes processed...`);
      }
    }

    console.log('\n✅ Migration complete!');
    console.log('📊 Summary:');
    console.log(`  - Notes processed: ${stats.notesProcessed}`);
    console.log(`  - References found: ${stats.referencesFound}`);
    console.log(`  - Junction entries ${dryRun ? 'to create' : 'created'}: ${stats.junctionEntriesCreated}`);
    console.log(`  - Errors: ${stats.errors}`);

    return stats;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Extract scripture references from already-processed pills in HTML content
 */
function extractPillReferences(content: string): Map<string, string> {
  const references = new Map<string, string>(); // reference -> scriptureNoteId
  
  let match;
  const pattern = new RegExp(SCRIPTURE_PILL_PATTERN.source, 'gi');
  
  while ((match = pattern.exec(content)) !== null) {
    const reference = match[1];
    const scriptureNoteId = match[2];
    references.set(reference, scriptureNoteId);
  }
  
  return references;
}

/**
 * Detect raw text references that aren't yet pills and match to existing scripture notes
 */
function detectTextReferences(
  content: string, 
  userId: string,
  scriptureRefMap: Map<string, { noteId: string; userId: string }>
): Map<string, string> {
  const references = new Map<string, string>(); // reference -> scriptureNoteId
  
  // Extract plain text from HTML
  const plainText = content
    .replace(/<span[^>]*data-scripture-reference[^>]*>([^<]*)<\/span>/gi, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Detect scripture references
  const detectedRefs = detectScriptureReferences(plainText);
  
  for (const ref of detectedRefs) {
    const normalizedRef = normalizeScriptureReference(ref.reference);
    
    // Look up in the scripture map (with user prefix)
    const lookupKey = `${userId}:${normalizedRef}`;
    const scriptureData = scriptureRefMap.get(lookupKey);
    
    if (scriptureData) {
      references.set(ref.reference, scriptureData.noteId);
    }
  }
  
  return references;
}

// Parse command line arguments and run migration
const args = process.argv.slice(2);
const userId = args.find(arg => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');

migrateScriptureReferences(userId, dryRun)
  .then((stats) => {
    console.log('\n🎉 Migration finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed with error:', error);
    process.exit(1);
  });


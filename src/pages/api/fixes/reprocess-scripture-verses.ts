import type { APIRoute } from 'astro';
import { db, Notes, ScriptureMetadata, eq, and } from 'astro:db';
import { fetchWithTimeout } from '@/utils/fetch-helpers';
import { handleAPIError } from '@/utils/error-handling';
import { debug } from '@/utils/logger';

interface ReprocessResult {
  noteId: string;
  reference: string;
  success: boolean;
  error?: string;
  verseText?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';

    debug('Finding scripture notes for user', { userId: userId?.substring(0, 10) + '...' });
    
    // Find all scripture notes for this user
    const scriptureNotes = await db.select({
      noteId: Notes.id,
      content: Notes.content,
      title: Notes.title,
    })
      .from(Notes)
      .where(and(
        eq(Notes.noteType, 'scripture'),
        eq(Notes.userId, userId)
      ))
      .all();

    debug('Found scripture notes', { count: scriptureNotes.length });

    const results: ReprocessResult[] = [];
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const note of scriptureNotes) {
      // Get ScriptureMetadata for this note
      const metadata = await db.select()
        .from(ScriptureMetadata)
        .where(eq(ScriptureMetadata.noteId, note.noteId))
        .get();

      if (!metadata) {
        debug('Note has no ScriptureMetadata - skipping', { noteId: note.noteId });
        results.push({
          noteId: note.noteId,
          reference: note.title || 'Unknown',
          success: false,
          error: 'No ScriptureMetadata found'
        });
        skippedCount++;
        continue;
      }

      const reference = metadata.reference;
      const originalText = metadata.originalText || '';

      // Check if originalText is empty or just equals the reference (not actual verse content)
      // Verse content should have HTML tags like <sup> or be longer than just the reference
      const needsReprocessing = 
        !originalText || 
        originalText.trim() === '' ||
        originalText.trim() === reference ||
        originalText.trim() === reference.charAt(0).toUpperCase() + reference.slice(1) ||
        (!originalText.includes('<sup>') && originalText.length < reference.length + 20); // Rough heuristic

      if (!needsReprocessing) {
        debug('Note already has verse content - skipping', { noteId: note.noteId, reference });
        skippedCount++;
        continue;
      }

      debug('Reprocessing scripture reference', { reference, noteId: note.noteId });

      if (dryRun) {
        debug('[DRY RUN] Would fetch verse', { reference });
        results.push({
          noteId: note.noteId,
          reference,
          success: true,
          verseText: '[DRY RUN]'
        });
        processedCount++;
        continue;
      }

      try {
        // Fetch verse text from Bible.org API
        const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
        const verseResponse = await fetchWithTimeout(apiUrl, {
          timeout: 10000, // 10 seconds for initial attempt
          retries: 2, // 2 retries
          retryTimeout: 5000, // 5 seconds for retries
        });

        if (!verseResponse.ok) {
          throw new Error(`Bible.org API returned error: ${verseResponse.status} ${verseResponse.statusText}`);
        }

        const verses = await verseResponse.json();
        
        if (!Array.isArray(verses) || verses.length === 0) {
          throw new Error('No verses returned from API');
        }

        // Format verse text with superscript verse numbers (same format as process-scripture-references.ts)
        const verseText = verses.map((v: any) => `<sup>${v.verse}</sup>${v.text}`).join(' ');
        const capitalizedContent = verseText.charAt(0).toUpperCase() + verseText.slice(1);

        // Update Note.content
        await db.update(Notes)
          .set({ 
            content: capitalizedContent,
            updatedAt: new Date()
          })
          .where(eq(Notes.id, note.noteId));

        // Update ScriptureMetadata.originalText
        await db.update(ScriptureMetadata)
          .set({ 
            originalText: capitalizedContent
          })
          .where(eq(ScriptureMetadata.noteId, note.noteId));

        debug('Successfully updated with verse content', { noteId: note.noteId, reference, length: verseText.length });
        
        results.push({
          noteId: note.noteId,
          reference,
          success: true,
          verseText: capitalizedContent.substring(0, 100) + '...' // Preview
        });
        processedCount++;

      } catch (error: any) {
        console.error(`   ❌ Error fetching verse for ${reference}:`, error.message || error);
        results.push({
          noteId: note.noteId,
          reference,
          success: false,
          error: error.message || 'Unknown error'
        });
        errorCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const summary = {
      totalScriptureNotes: scriptureNotes.length,
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount,
      results: results.slice(0, 50) // Limit results to first 50 for response size
    };

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      summary,
      message: dryRun 
        ? `Dry run completed. Would process ${processedCount} notes.`
        : `Reprocessing completed. Processed ${processedCount} notes, ${errorCount} errors.`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/fixes/reprocess-scripture-verses',
      action: 'reprocess_scripture_verses'
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

// Also support GET for easy browser access
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';

    // Return a simple HTML page for browser access
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Reprocess Scripture Verses</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      margin-top: 0;
      color: #333;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      margin: 10px 10px 10px 0;
      background: #007bff;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 16px;
    }
    .button:hover {
      background: #0056b3;
    }
    .button.dry-run {
      background: #6c757d;
    }
    .button.dry-run:hover {
      background: #545b62;
    }
    .status {
      margin-top: 20px;
      padding: 15px;
      border-radius: 6px;
      display: none;
    }
    .status.loading {
      display: block;
      background: #fff3cd;
      border: 1px solid #ffc107;
    }
    .status.success {
      display: block;
      background: #d4edda;
      border: 1px solid #28a745;
    }
    .status.error {
      display: block;
      background: #f8d7da;
      border: 1px solid #dc3545;
    }
    pre {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      max-height: 500px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔧 Reprocess Scripture Verses</h1>
    <p>This tool finds scripture notes that were created without verse content (due to API timeout failures) and reprocesses them to fetch the actual verse text.</p>
    
    <div>
      <button class="button dry-run" onclick="runReprocess(true)">🔍 Dry Run (Preview)</button>
      <button class="button" onclick="runReprocess(false)">🚀 Run Reprocessing</button>
    </div>
    
    <div id="status" class="status"></div>
  </div>

  <script>
    async function runReprocess(dryRun) {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'status loading';
      statusDiv.innerHTML = '⏳ Processing... This may take a few minutes.';
      
      try {
        const url = '/api/fixes/reprocess-scripture-verses?dryRun=' + dryRun;
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
          statusDiv.className = 'status success';
          statusDiv.innerHTML = \`
            <h3>✅ Success!</h3>
            <p><strong>\${data.message}</strong></p>
            <p><strong>Summary:</strong></p>
            <ul>
              <li>Total scripture notes: \${data.summary.totalScriptureNotes}</li>
              <li>Processed: \${data.summary.processed}</li>
              <li>Skipped (already have content): \${data.summary.skipped}</li>
              <li>Errors: \${data.summary.errors}</li>
            </ul>
            <details>
              <summary>View Details</summary>
              <pre>\${JSON.stringify(data, null, 2)}</pre>
            </details>
          \`;
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (error) {
        statusDiv.className = 'status error';
        statusDiv.innerHTML = \`
          <h3>❌ Error</h3>
          <p>\${error.message}</p>
        \`;
      }
    }
  </script>
</body>
</html>
    `;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/fixes/reprocess-scripture-verses',
      action: 'reprocess_scripture_verses'
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


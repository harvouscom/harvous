import { markdownToHtml } from './markdown-to-html';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface OnboardingNote {
  title: string;
  content: string; // HTML content
  order: number; // Based on filename prefix
}

/**
 * Load onboarding notes from markdown files
 * 
 * Automatically discovers all .md files in the onboarding folder using Node.js fs.
 * Edit the markdown files in src/data/onboarding/ and they'll be automatically used.
 * Files are sorted by numeric prefix in filename (e.g., 01-welcome.md, 02-organize.md).
 */

/**
 * Loads markdown files from the onboarding directory
 * This runs at module initialization (build time), so file system access works
 */
function loadMarkdownFiles(): Record<string, string> {
  try {
    // Get the directory path - resolve from the current file's location
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // src/utils/load-onboarding-notes.ts -> src/data/onboarding
    const onboardingDir = join(__dirname, '..', 'data', 'onboarding');
    
    console.log('[loadOnboardingNotes] Looking for files in:', onboardingDir);
    
    const files = readdirSync(onboardingDir)
      .filter(file => file.endsWith('.md') && file !== 'README.md')
      .sort();
    
    console.log('[loadOnboardingNotes] Found files:', files);
    
    const modules: Record<string, string> = {};
    
    for (const file of files) {
      const filePath = join(onboardingDir, file);
      const content = readFileSync(filePath, 'utf-8');
      // Use relative path as key to match expected format
      modules[`../data/onboarding/${file}`] = content;
      console.log(`[loadOnboardingNotes] Loaded file: ${file} (${content.length} chars)`);
    }
    
    return modules;
  } catch (error: any) {
    console.error('[loadOnboardingNotes] Error reading onboarding directory:', error);
    console.error('[loadOnboardingNotes] Error details:', {
      message: error.message,
      code: error.code,
      path: error.path,
      stack: error.stack
    });
    return {};
  }
}

// Load files at module initialization (build time)
const onboardingModules = loadMarkdownFiles();

/**
 * Parses a markdown string and returns an OnboardingNote
 */
function parseMarkdownNote(markdown: string, order: number): OnboardingNote {
  const lines = markdown.split('\n');
  let title = '';
  let contentStartIndex = 0;

  // Check if first line is a markdown heading
  if (lines[0].startsWith('# ')) {
    title = lines[0].substring(2).trim();
    contentStartIndex = 1;
  } else if (lines[0].startsWith('## ')) {
    title = lines[0].substring(3).trim();
    contentStartIndex = 1;
  } else {
    // Fallback: use first line as title
    title = lines[0].trim();
    contentStartIndex = 1;
  }

  // Get content (everything after title)
  const contentMarkdown = lines.slice(contentStartIndex).join('\n').trim();
  
  // Convert markdown content to HTML
  const contentHtml = markdownToHtml(contentMarkdown);

  return {
    title,
    content: contentHtml,
    order
  };
}

/**
 * Loads onboarding notes from markdown files
 * 
 * Files are automatically discovered using Node.js fs at module initialization.
 * Edit the markdown files in src/data/onboarding/ and they'll be automatically used.
 * New files are automatically included - just add them to the folder with a numeric prefix.
 */
export function loadOnboardingNotes(): OnboardingNote[] {
  try {
    const notes: OnboardingNote[] = [];

    // Debug: log what we got
    console.log('[loadOnboardingNotes] onboardingModules keys:', Object.keys(onboardingModules));
    console.log('[loadOnboardingNotes] Number of files:', Object.keys(onboardingModules).length);

    // Process each markdown file
    for (const [filePath, markdownContent] of Object.entries(onboardingModules)) {
      try {
        // Extract filename from path (e.g., "../data/onboarding/01-welcome.md" -> "01-welcome.md")
        const fileName = filePath.split('/').pop() || '';
        
        // Extract order from filename (e.g., "01-welcome.md" -> 1)
        const orderMatch = fileName.match(/^(\d+)-/);
        const order = orderMatch ? parseInt(orderMatch[1], 10) : notes.length + 1;

        // markdownContent is already a string from readFileSync
        const note = parseMarkdownNote(markdownContent, order);
        notes.push(note);
      } catch (error) {
        console.error(`[loadOnboardingNotes] Error processing onboarding file ${filePath}:`, error);
        // Continue with other files
      }
    }

    console.log(`[loadOnboardingNotes] Successfully loaded ${notes.length} notes`);

    // Sort by order to ensure correct sequence
    return notes.sort((a, b) => a.order - b.order);
  } catch (error: any) {
    console.error('[loadOnboardingNotes] Error loading onboarding notes:', error);
    console.error('[loadOnboardingNotes] Error stack:', error.stack);
    // Return default notes as fallback
    return getDefaultOnboardingNotes();
  }
}

/**
 * Fallback default notes if markdown files can't be loaded
 */
function getDefaultOnboardingNotes(): OnboardingNote[] {
  return [
    {
      title: 'Welcome to Harvous',
      content: '<p>This is your first note! You can edit it, add it to threads, or delete it. Try clicking on this note to see more options.</p>',
      order: 1
    },
    {
      title: 'Organize Your Notes',
      content: '<p>Create threads to organize your notes by topic, study, or theme. You can add notes to multiple threads.</p>',
      order: 2
    },
    {
      title: 'Capture Scripture',
      content: '<p>When you reference Bible verses in your notes, Harvous automatically creates scripture notes that link together.</p>',
      order: 3
    }
  ];
}


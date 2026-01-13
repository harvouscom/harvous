#!/usr/bin/env node

/**
 * Sync Changelog to Webflow CMS Since a Specific Time
 * 
 * This script syncs changelog entries to Webflow CMS for commits since a specific time.
 * 
 * Usage:
 *   node scripts/sync-changelog-since.js [since_time]
 * 
 * Examples:
 *   node scripts/sync-changelog-since.js "12:00:00 CST"
 *   node scripts/sync-changelog-since.js "2026-01-12 12:00:00 -0600"
 * 
 * Make sure WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) is set in your environment.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file if it exists
function loadEnvFile() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // Only set if not already in process.env (env vars take precedence)
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    // .env file doesn't exist or can't be read - that's okay
    // Script will use environment variables if set
  }
}

// Load .env file before accessing environment variables
loadEnvFile();

// Webflow configuration
const WEBFLOW_COLLECTION_ID = '6914bfd8c7facb8fa00eaad3';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

// Category name to option ID mapping (from Webflow field creation)
// User-friendly categories: Feature, Fix, Improvement
const CATEGORY_MAP = {
  'Feature': 'fc75e0b94768195db5ecd06607d3a596',
  'Fix': '6b12417229c034f993616ccdcb8d3ca6',
  'Improvement': '938b0ef47d5f79e79b2c6e0acb639ede'
};

// Check if a commit message describes user-visible changes
// Returns false for internal/technical commits that users don't need to know about
function isUserRelevant(message) {
  const internalKeywords = [
    'error handling',
    'migration',
    'api',
    'endpoint',
    'function',
    'method',
    'format',
    'logging',
    'parsing',
    'subscriber',
    'webhook',
    'changelog',
    'refactor',
    'internal',
    'backend',
    'updatesubscriber',
    'retry-failed',
    'audienceful',
    'clerk',
    'webhook integration',
    'json parsing',
    'timeout logging',
    'newline at end of file',
    'validation utility'
  ];
  
  // User-visible keywords that override internal keywords
  const userVisibleKeywords = [
    'offline experience',
    'offline',
    'ordering',
    'order',
    'user experience',
    'user-facing',
    'improve experience',
    'better experience'
  ];
  
  const lowerMessage = message.toLowerCase();
  
  // Check for user-visible keywords first (these override internal keywords)
  const hasUserVisibleKeyword = userVisibleKeywords.some(keyword => 
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  // If it has user-visible keywords, include it even if it has internal keywords
  if (hasUserVisibleKeyword) {
    return true;
  }
  
  // Skip if contains internal keywords
  if (internalKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
    return false;
  }
  
  // Include if describes user-visible change
  // Note: This is a conservative filter - when in doubt, exclude
  return true;
}

// Extract category from commit message and map to user-friendly categories
// Returns null for commits that should be skipped (docs, test, chore, build, ci, or not user-relevant)
function extractCategory(message, body = null) {
  // First check if the commit is user-relevant (check both message and body)
  const fullText = body ? `${message} ${body}` : message;
  if (!isUserRelevant(fullText)) {
    return null;
  }
  
  const match = message.match(/^(feat|fix|refactor|style|docs|test|chore|perf|build|ci):/);
  
  if (!match) {
    // No conventional commit prefix - skip it
    return null;
  }
  
  const commitType = match[1];
  
  // Map commit types to user-friendly categories
  switch (commitType) {
    case 'feat':
      return 'Feature';
    case 'fix':
      return 'Fix';
    case 'refactor':
    case 'perf':
    case 'style':
      return 'Improvement';
    case 'docs':
    case 'test':
    case 'chore':
    case 'build':
    case 'ci':
      // Skip these - not user-facing
      return null;
    default:
      return null;
  }
}

// Get category option ID
function getCategoryId(category) {
  if (!category) return null;
  return CATEGORY_MAP[category] || null;
}

// Create slug from commit message
function createSlug(message, hash) {
  const slugBase = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 40)
    .replace(/^-+|-+$/g, '');
  // Add hash and timestamp to ensure uniqueness
  const timestamp = Date.now();
  return `${slugBase}-${hash.substring(0, 7)}-${timestamp}`;
}

// Clean commit message for use as name (remove prefix, capitalize)
function cleanCommitMessageForName(message) {
  // Remove conventional commit prefix (feat:, fix:, etc.)
  let cleaned = message.replace(/^(feat|fix|refactor|style|perf|docs|test|chore|build|ci):\s*/i, '');
  
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned.substring(0, 100);
}

// Generate user-friendly content description from commit message
function generateUserFriendlyContent(message, category, body = null) {
  // Remove conventional commit prefix
  let description = message.replace(/^(feat|fix|refactor|style|perf|docs|test|chore|build|ci):\s*/i, '');
  
  // Capitalize first letter
  if (description.length > 0) {
    description = description.charAt(0).toUpperCase() + description.slice(1);
  }
  
  // Add category-specific context
  let intro = '';
  switch (category) {
    case 'Feature':
      intro = 'We\'ve added a new feature: ';
      break;
    case 'Fix':
      intro = 'We\'ve fixed an issue: ';
      break;
    case 'Improvement':
      intro = 'We\'ve made an improvement: ';
      break;
    default:
      intro = '';
  }
  
  // Format main description as HTML
  const mainContent = intro ? `${intro}${description}` : description;
  let htmlContent = `<p>${mainContent}</p>`;
  
  // Add commit body if it exists and is not empty
  if (body && body.trim().length > 0) {
    // Clean up the body - remove excessive whitespace
    let cleanBody = body.trim();
    
    // Check for Context: or Reason: sections (case-insensitive)
    const contextMatch = cleanBody.match(/^(?:Context|Reason):\s*(.+?)(?:\n\n|\n(?!\s)|$)/ims);
    
    if (contextMatch) {
      // Extract context text
      const contextText = contextMatch[1].trim();
      
      // Remove context section from body for processing
      cleanBody = cleanBody.replace(/^(?:Context|Reason):\s*.+?(?:\n\n|\n(?!\s)|$)/ims, '').trim();
      
      // Add context section with bold styling
      const formattedContext = contextText.replace(/\n/g, '<br>');
      htmlContent += `<p><strong>Context:</strong> ${formattedContext}</p>`;
    }
    
    // Process remaining body content
    if (cleanBody.length > 0) {
      // Split into paragraphs (double newlines) or use single newlines
      const paragraphs = cleanBody.split(/\n\n+/).filter(p => p.trim().length > 0);
      
      // If no double newlines, treat as single paragraph
      if (paragraphs.length === 0) {
        paragraphs.push(cleanBody);
      }
      
      // Add each paragraph as a separate <p> tag
      paragraphs.forEach(paragraph => {
        const trimmed = paragraph.trim();
        if (trimmed.length > 0) {
          // Replace single newlines within paragraph with <br>
          const formatted = trimmed.replace(/\n/g, '<br>');
          htmlContent += `<p>${formatted}</p>`;
        }
      });
    }
  }
  
  return htmlContent;
}

// Get version from package.json at a specific commit
function getVersionAtCommit(commitHash) {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJsonContent = execSync(
      `git show ${commitHash}:package.json`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    const packageJson = JSON.parse(packageJsonContent);
    return packageJson.version;
  } catch (error) {
    // If we can't get the version, return null
    return null;
  }
}

// Check if version is >= 1.0.0
function isVersion1OrHigher(version) {
  if (!version) return false;
  const [major] = version.split('.').map(Number);
  return major >= 1;
}

// Get all commits since a specific time
function getCommitsSince(sinceTime) {
  try {
    // Get commits since the specified time
    const allCommits = execSync(
      `git log --since="${sinceTime}" --format="%H|%ai|%s" --no-merges`,
      { encoding: 'utf-8' }
    ).trim().split('\n');
    
    const validCommits = [];
    
    for (const commitLine of allCommits) {
      if (!commitLine) continue;
      
      const [hash, date, ...messageParts] = commitLine.split('|');
      const message = messageParts.join('|');
      
      // Skip version bump commits
      if (message.startsWith('chore: bump version') ||
          message.startsWith('chore: release version') ||
          message.startsWith('chore: update README.md') ||
          message.startsWith('chore: update package version')) {
        continue;
      }
      
      // Get version at this commit
      const version = getVersionAtCommit(hash);
      
      if (!version || !isVersion1OrHigher(version)) {
        continue;
      }
      
      // Get commit body first (needed for user-relevance check)
      const commitBody = execSync(
        `git log --format="%b" -1 ${hash}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      
      // Check if this is a user-facing commit (pass body for full context)
      const category = extractCategory(message, commitBody);
      if (!category) {
        continue; // Skip non-user-facing commits
      }
      
      // Format date as ISO 8601
      const dateObj = new Date(date);
      const isoDate = dateObj.toISOString();
      
      validCommits.push({
        hash,
        date: isoDate,
        message,
        body: commitBody || null,
        version,
        category
      });
    }
    
    return validCommits;
  } catch (error) {
    console.error('❌ Error getting commits:', error.message);
    return [];
  }
}

// Create Webflow CMS item
async function createWebflowItem(commit, version) {
  // Use changelog-specific token if available, fallback to inbox token for backward compatibility
  const webflowToken = process.env.WEBFLOW_CHANGELOG_API_TOKEN || process.env.WEBFLOW_INBOX_API_TOKEN;
  
  if (!webflowToken) {
    console.error('❌ WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) not set.');
    return false;
  }
  
  const category = commit.category;
  const categoryId = getCategoryId(category);
  
  if (!categoryId) {
    console.error(`❌ Invalid category for commit ${commit.hash}: ${category}`);
    return false;
  }
  
  const slug = createSlug(commit.message, commit.hash);
  const name = cleanCommitMessageForName(commit.message);
  
  // Generate user-friendly content description (including commit body if available)
  const content = generateUserFriendlyContent(commit.message, category, commit.body);
  
  // Webflow API v2 expects a single item object, not wrapped in items array
  // Create items as drafts so they can be reviewed before publishing
  const itemData = {
    isDraft: true,
    isArchived: false,
    fieldData: {
      name: name,
      slug: slug,
      'version-number': version,
      'date': commit.date,
      'commit-message': content,
      'category': categoryId
    }
  };
  
  try {
    // Create item (Webflow API v2 format)
    const createResponse = await fetch(
      `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemData)
      }
    );
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      // Check if it's a duplicate (slug already exists)
      if (errorText.includes('duplicate') || errorText.includes('already exists')) {
        return 'duplicate';
      }
      console.error(`❌ Error creating Webflow item for ${commit.hash}:`, errorText);
      return false;
    }
    
    const createResult = await createResponse.json();
    // Webflow v2 returns { id: "...", ... } directly, or { items: [{ id: "..." }] }
    const itemId = createResult.id || createResult.items?.[0]?.id;
    
    if (!itemId) {
      console.error(`❌ No item ID returned from Webflow for ${commit.hash}`);
      return false;
    }
    
    // Item created as draft - no need to publish
    // Items will be reviewed and published manually in Webflow CMS
    return true;
  } catch (error) {
    console.error(`❌ Error syncing to Webflow for ${commit.hash}:`, error.message);
    return false;
  }
}

// Check if we're in a git repository
function isGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Main execution
async function main() {
  // Check if we're in a git repository
  if (!isGitRepository()) {
    console.error('❌ Not in a git repository.');
    process.exit(1);
  }
  
  // Use changelog-specific token if available, fallback to inbox token for backward compatibility
  const webflowToken = process.env.WEBFLOW_CHANGELOG_API_TOKEN || process.env.WEBFLOW_INBOX_API_TOKEN;
  if (!webflowToken) {
    console.error('❌ WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) not set. Please set it in your environment.');
    process.exit(1);
  }
  
  // Get since time from command line argument or default to 12 PM CST today
  const sinceTime = process.argv[2] || '12:00:00 CST';
  
  console.log(`🔍 Finding user-facing commits since "${sinceTime}"...\n`);
  
  // Get all valid commits
  const commits = getCommitsSince(sinceTime);
  
  if (commits.length === 0) {
    console.log(`ℹ️  No user-facing commits found since "${sinceTime}".`);
    process.exit(0);
  }
  
  console.log(`📝 Found ${commits.length} user-facing commit(s) to sync:\n`);
  
  // Show what we're going to create
  commits.forEach((commit, index) => {
    console.log(`${index + 1}. [${commit.category}] v${commit.version} - ${commit.message.substring(0, 60)}...`);
  });
  
  console.log(`\n🚀 Starting sync...\n`);
  
  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  
  // Process commits one by one (with a small delay to avoid rate limiting)
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    console.log(`[${i + 1}/${commits.length}] Processing: ${commit.message.substring(0, 50)}...`);
    
    const result = await createWebflowItem(commit, commit.version);
    
    if (result === true) {
      successCount++;
      console.log(`   ✅ Created`);
    } else if (result === 'duplicate') {
      duplicateCount++;
      console.log(`   ⚠️  Already exists (skipped)`);
    } else {
      errorCount++;
      console.log(`   ❌ Failed`);
    }
    
    // Small delay to avoid rate limiting
    if (i < commits.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n✅ Sync complete!`);
  console.log(`   Created: ${successCount}`);
  console.log(`   Already existed: ${duplicateCount}`);
  console.log(`   Errors: ${errorCount}`);
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  if (error.stack) {
    console.error('\nStack trace:', error.stack);
  }
  process.exit(1);
});

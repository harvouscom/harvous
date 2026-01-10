#!/usr/bin/env node

/**
 * Automatic Changelog Sync to Webflow CMS
 * 
 * This script automatically creates changelog entries in Webflow CMS for each commit,
 * but only when the version is >= 1.0.0. It runs after each commit via git hook.
 * 
 * Features:
 * - Only runs when version >= 1.0.0
 * - Skips version bump commits
 * - Only includes user-facing commits (feat, fix, refactor, perf, style)
 * - Skips non-user-facing commits (docs, test, chore, build, ci)
 * - Maps commit types to user-friendly categories: Feature, Fix, Improvement
 * - Extracts version, date, commit message, and category
 * - Creates items as drafts in Webflow CMS (for manual review before publishing)
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Get current version from package.json
function getCurrentVersion() {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    console.error('❌ Error reading package.json:', error.message);
    return null;
  }
}

// Check if version is >= 1.0.0
function isVersion1OrHigher(version) {
  if (!version) return false;
  const [major] = version.split('.').map(Number);
  return major >= 1;
}

// Get latest commit (excluding version bumps)
function getLatestCommit() {
  try {
    // Get the most recent commit
    const commitLine = execSync(
      'git log --format="%H|%ai|%s" -1 --no-merges',
      { encoding: 'utf-8' }
    ).trim();
    
    if (!commitLine) return null;
    
    const [hash, date, ...messageParts] = commitLine.split('|');
    const message = messageParts.join('|');
    
    // Skip version bump commits
    if (message.startsWith('chore: bump version') ||
        message.startsWith('chore: update README.md') ||
        message.startsWith('chore: update package version')) {
      return null;
    }
    
    // Get commit body separately
    const commitBody = execSync(
      'git log --format="%b" -1 --no-merges',
      { encoding: 'utf-8' }
    ).trim();
    
    // Format date as ISO 8601
    const dateObj = new Date(date);
    const isoDate = dateObj.toISOString();
    
    return { 
      hash, 
      date: isoDate, 
      message,
      body: commitBody || null
    };
  } catch (error) {
    console.error('❌ Error getting commit:', error.message);
    return null;
  }
}

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
  
  const lowerMessage = message.toLowerCase();
  
  // Skip if contains internal keywords
  if (internalKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
    return false;
  }
  
  // Include if describes user-visible change
  // Note: This is a conservative filter - when in doubt, exclude
  // The presence of user-visible keywords doesn't override internal keywords
  return true;
}

// Extract category from commit message and map to user-friendly categories
// Returns null for commits that should be skipped (docs, test, chore, build, ci, or not user-relevant)
function extractCategory(message) {
  // First check if the commit is user-relevant
  if (!isUserRelevant(message)) {
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
    .substring(0, 50)
    .replace(/^-+|-+$/g, '');
  return `${slugBase}-${hash.substring(0, 7)}`;
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

// Create Webflow CMS item
async function createWebflowItem(commit, version) {
  const webflowToken = process.env.WEBFLOW_API_TOKEN;
  
  if (!webflowToken) {
    console.log('⚠️  WEBFLOW_API_TOKEN not set. Skipping changelog sync.');
    return false;
  }
  
  const category = extractCategory(commit.message);
  
  // Skip commits that don't map to user-facing categories
  if (!category) {
    return null;
  }
  
  const categoryId = getCategoryId(category);
  if (!categoryId) {
    console.error('❌ Invalid category:', category);
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
      console.error('❌ Error creating Webflow item:', errorText);
      console.error('   Request body was:', JSON.stringify(itemData, null, 2));
      return false;
    }
    
    const createResult = await createResponse.json();
    // Webflow v2 returns { id: "...", ... } directly, or { items: [{ id: "..." }] }
    const itemId = createResult.id || createResult.items?.[0]?.id;
    
    if (!itemId) {
      console.error('❌ No item ID returned from Webflow');
      console.error('   Response was:', JSON.stringify(createResult, null, 2));
      return false;
    }
    
    // Item created as draft - no need to publish
    // Items will be reviewed and published manually in Webflow CMS
    return true;
  } catch (error) {
    console.error('❌ Error syncing to Webflow:', error.message);
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
    console.log('ℹ️  Not in a git repository. Skipping changelog sync.');
    process.exit(0);
  }
  
  // Get current version
  const version = getCurrentVersion();
  if (!version) {
    console.log('⚠️  Could not read version. Skipping changelog sync.');
    process.exit(0);
  }
  
  // Check if version >= 1.0.0
  if (!isVersion1OrHigher(version)) {
    // Silently exit - don't log anything for versions < 1.0.0
    process.exit(0);
  }
  
  // Get latest commit
  const commit = getLatestCommit();
  if (!commit) {
    // Silently exit if no valid commit (e.g., version bump commit)
    process.exit(0);
  }
  
  // Create Webflow CMS item
  const success = await createWebflowItem(commit, version);
  
  if (success === null) {
    // Commit was skipped (not user-facing)
    // Silently exit - don't log anything
    process.exit(0);
  } else if (success) {
    console.log(`✅ Changelog entry created: ${commit.message.substring(0, 60)}...`);
  } else {
    // Don't fail the commit if Webflow sync fails
    console.log('⚠️  Failed to create changelog entry (non-blocking)');
  }
  
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  // Don't fail the commit on error
  process.exit(0);
});

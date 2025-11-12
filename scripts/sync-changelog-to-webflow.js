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
 * - Extracts version, date, commit message, and category
 * - Creates draft items in Webflow CMS
 * - Publishes items automatically
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
const CATEGORY_MAP = {
  'feat': 'fc75e0b94768195db5ecd06607d3a596',
  'fix': '43e8f31fd047dfe571ae03812b21ff90',
  'refactor': 'acf1556cd4b7ea3bb14347ba75dd9e00',
  'style': 'e6314d936c31913cad7b23802d1af8cf',
  'docs': 'b552b3a5348904e5fd2167a7693199e8',
  'test': 'e971908ee539133daea638c373b52940',
  'chore': '36126c5878a951d82b2eee7754b1fa99',
  'perf': '297e26fbca6fb77406d12ddc10e6be3a',
  'build': '1f8176bb2418c9bcfafdb6bb7174dfe2',
  'ci': '6b12417229c034f993616ccdcb8d3ca6'
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
    
    // Format date as ISO 8601
    const dateObj = new Date(date);
    const isoDate = dateObj.toISOString();
    
    return { hash, date: isoDate, message };
  } catch (error) {
    console.error('❌ Error getting commit:', error.message);
    return null;
  }
}

// Extract category from commit message
function extractCategory(message) {
  const match = message.match(/^(feat|fix|refactor|style|docs|test|chore|perf|build|ci):/);
  return match ? match[1] : 'chore';
}

// Get category option ID
function getCategoryId(category) {
  return CATEGORY_MAP[category] || CATEGORY_MAP['chore'];
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

// Create Webflow CMS item
async function createWebflowItem(commit, version) {
  const webflowToken = process.env.WEBFLOW_API_TOKEN;
  
  if (!webflowToken) {
    console.log('⚠️  WEBFLOW_API_TOKEN not set. Skipping changelog sync.');
    return false;
  }
  
  const category = extractCategory(commit.message);
  const categoryId = getCategoryId(category);
  const slug = createSlug(commit.message, commit.hash);
  const name = commit.message.substring(0, 100);
  
  const itemData = {
    fieldData: {
      name: name,
      slug: slug,
      'version-number': version,
      'date': commit.date,
      'commit-message': commit.message,
      'category': categoryId
    }
  };
  
  try {
    // Create draft item
    const createResponse = await fetch(
      `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: [itemData] })
      }
    );
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('❌ Error creating Webflow item:', errorText);
      return false;
    }
    
    const createResult = await createResponse.json();
    const itemId = createResult.items?.[0]?.id;
    
    if (!itemId) {
      console.error('❌ No item ID returned from Webflow');
      return false;
    }
    
    // Publish the item
    // Note: If this endpoint doesn't work, items will be created as drafts
    // and can be published manually in Webflow CMS
    const publishResponse = await fetch(
      `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items/publish`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemIds: [itemId] })
      }
    );
    
    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      console.error('⚠️  Item created but failed to publish:', errorText);
      // Item was created, just not published - still consider it a success
      return true;
    }
    
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
  
  if (success) {
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

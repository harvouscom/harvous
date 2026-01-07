#!/usr/bin/env node

/**
 * Changelog Generation Script
 * 
 * This script generates a changelog markdown file for a given version by:
 * - Extracting commits between the previous version and current HEAD
 * - Parsing conventional commit messages
 * - Grouping commits by type (Features, Fixes, Improvements, etc.)
 * - Generating a user-friendly markdown file in Changelog/ folder
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the previous version from git history
 * Looks for the last version in package.json from git history
 */
function getPreviousVersion() {
  try {
    // Try to get the version from the parent commit's package.json
    const parentPackageJson = execSync('git show HEAD~1:package.json 2>/dev/null', { encoding: 'utf-8' });
    const parentPackage = JSON.parse(parentPackageJson);
    return parentPackage.version;
  } catch (error) {
    // If we can't get parent commit, try to find the last version tag
    try {
      const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8' }).trim();
      if (tags) {
        const tagList = tags.split('\n');
        // Find the most recent version tag (format: v0.252.0 or 0.252.0)
        for (const tag of tagList) {
          const versionMatch = tag.match(/^v?(\d+\.\d+\.\d+)$/);
          if (versionMatch) {
            return versionMatch[1];
          }
        }
      }
    } catch (tagError) {
      // No tags found, continue
    }
    
    // If no previous version found, return null (will use all commits)
    return null;
  }
}

/**
 * Get commits between two versions
 * Gets commits since the last version bump (when package.json was last modified)
 */
function getCommitsBetweenVersions(previousVersion, currentVersion) {
  try {
    let gitCommand;
    
    // Find the last commit that modified package.json (the last version bump)
    // We'll get commits since that commit
    try {
      // Get commits that modified package.json, excluding the current one
      // The version bump script runs after a commit, so we want commits since the last package.json change
      const packageJsonCommits = execSync(
        `git log --oneline --format="%H" -- package.json | head -2`,
        { encoding: 'utf-8' }
      ).trim().split('\n');
      
      if (packageJsonCommits.length > 1) {
        // The second commit is the previous version bump
        const lastVersionCommit = packageJsonCommits[1];
        // Get commits since that commit (including the current commit)
        gitCommand = `git log ${lastVersionCommit}..HEAD --pretty=format:"%H|%s|%b" --no-merges`;
      } else if (packageJsonCommits.length === 1) {
        // Only one commit modified package.json, get commits since HEAD~1
        // This means we're on the first version bump
        gitCommand = `git log HEAD~1..HEAD --pretty=format:"%H|%s|%b" --no-merges`;
      } else {
        // No commits modified package.json yet, get recent commits
        gitCommand = `git log -10 --pretty=format:"%H|%s|%b" --no-merges`;
      }
    } catch (error) {
      // Fallback: get commits since HEAD~1 (the commit before current)
      // This is safe because version bump typically happens after a commit
      try {
        gitCommand = `git log HEAD~1..HEAD --pretty=format:"%H|%s|%b" --no-merges`;
      } catch (error2) {
        // If HEAD~1 doesn't exist (first commit), get the current commit
        gitCommand = `git log -1 --pretty=format:"%H|%s|%b" --no-merges`;
      }
    }
    
    const output = execSync(gitCommand, { encoding: 'utf-8' }).trim();
    
    if (!output) {
      return [];
    }
    
    // Parse commits (split by newline, then by |)
    const commits = output.split('\n').map(line => {
      const [hash, subject, ...bodyParts] = line.split('|');
      const body = bodyParts.join('|');
      
      return {
        hash: hash?.trim(),
        subject: subject?.trim() || '',
        body: body?.trim() || '',
        fullMessage: `${subject || ''}\n${body || ''}`.trim()
      };
    }).filter(commit => {
      // Filter out version bump commits and chore commits that are just version bumps
      const message = commit.subject.toLowerCase();
      return !message.match(/^(chore|bump).*version/i) && 
             !message.match(/^chore:.*bump/i) &&
             message.length > 0;
    });
    
    return commits;
  } catch (error) {
    console.warn(`⚠️  Could not get commits: ${error.message}`);
    return [];
  }
}

/**
 * Parse a conventional commit message
 * Returns { type, description, isBreaking }
 */
function parseConventionalCommit(message) {
  if (!message) {
    return { type: 'other', description: message, isBreaking: false };
  }
  
  // Check for breaking changes
  const isBreaking = message.includes('BREAKING CHANGE') || 
                     message.match(/^[^:]+!:/);
  
  // Match conventional commit format: type(scope): description
  const match = message.match(/^(\w+)(?:\([^)]+\))?(!?):\s*(.+)/i);
  
  if (match) {
    const [, type, breaking, description] = match;
    return {
      type: type.toLowerCase(),
      description: description.trim(),
      isBreaking: isBreaking || !!breaking
    };
  }
  
  // Not a conventional commit, return as-is
  return {
    type: 'other',
    description: message.trim(),
    isBreaking: false
  };
}

/**
 * Group commits by type
 * Returns an object with type as key and array of descriptions as value
 */
function groupCommitsByType(commits) {
  const groups = {
    features: [],
    fixes: [],
    improvements: [],
    performance: [],
    documentation: [],
    breaking: [],
    other: []
  };
  
  const typeMapping = {
    'feat': 'features',
    'feature': 'features',
    'fix': 'fixes',
    'bugfix': 'fixes',
    'refactor': 'improvements',
    'improve': 'improvements',
    'enhance': 'improvements',
    'perf': 'performance',
    'performance': 'performance',
    'docs': 'documentation',
    'doc': 'documentation',
    'style': 'improvements',
    'test': 'other',
    'chore': 'other'
  };
  
  commits.forEach(commit => {
    const parsed = parseConventionalCommit(commit.subject || commit.fullMessage);
    
    // Handle breaking changes separately
    if (parsed.isBreaking) {
      groups.breaking.push(parsed.description);
      return;
    }
    
    // Map commit type to group
    const groupKey = typeMapping[parsed.type] || 'other';
    
    // Clean up description: capitalize first letter, remove trailing period if present
    let description = parsed.description;
    if (description) {
      description = description.charAt(0).toUpperCase() + description.slice(1);
      description = description.replace(/\.$/, '');
      
      // Only add if not already in the group (avoid duplicates)
      if (!groups[groupKey].includes(description)) {
        groups[groupKey].push(description);
      }
    }
  });
  
  return groups;
}

/**
 * Generate markdown content for changelog
 */
function generateMarkdown(version, date, groupedCommits) {
  let markdown = `# Version ${version}\n\n`;
  markdown += `**Release Date**: ${date}\n\n`;
  
  // Breaking Changes (if any)
  if (groupedCommits.breaking.length > 0) {
    markdown += `## Breaking Changes\n\n`;
    groupedCommits.breaking.forEach(change => {
      markdown += `- ${change}\n`;
    });
    markdown += `\n`;
  }
  
  // Features
  if (groupedCommits.features.length > 0) {
    markdown += `## Features\n\n`;
    groupedCommits.features.forEach(feature => {
      markdown += `- ${feature}\n`;
    });
    markdown += `\n`;
  }
  
  // Fixes
  if (groupedCommits.fixes.length > 0) {
    markdown += `## Fixes\n\n`;
    groupedCommits.fixes.forEach(fix => {
      markdown += `- ${fix}\n`;
    });
    markdown += `\n`;
  }
  
  // Improvements
  if (groupedCommits.improvements.length > 0) {
    markdown += `## Improvements\n\n`;
    groupedCommits.improvements.forEach(improvement => {
      markdown += `- ${improvement}\n`;
    });
    markdown += `\n`;
  }
  
  // Performance
  if (groupedCommits.performance.length > 0) {
    markdown += `## Performance\n\n`;
    groupedCommits.performance.forEach(perf => {
      markdown += `- ${perf}\n`;
    });
    markdown += `\n`;
  }
  
  // Documentation
  if (groupedCommits.documentation.length > 0) {
    markdown += `## Documentation\n\n`;
    groupedCommits.documentation.forEach(doc => {
      markdown += `- ${doc}\n`;
    });
    markdown += `\n`;
  }
  
  // Other (only include if there are meaningful changes)
  const meaningfulOther = groupedCommits.other.filter(item => {
    // Filter out very short or generic messages
    return item.length > 10 && 
           !item.toLowerCase().includes('update') &&
           !item.toLowerCase().includes('bump');
  });
  
  if (meaningfulOther.length > 0) {
    markdown += `## Other Changes\n\n`;
    meaningfulOther.forEach(change => {
      markdown += `- ${change}\n`;
    });
    markdown += `\n`;
  }
  
  // If no changes found, add a note
  const hasChanges = Object.values(groupedCommits).some(group => group.length > 0);
  if (!hasChanges) {
    markdown += `_No significant changes in this version._\n`;
  }
  
  return markdown;
}

/**
 * Save changelog file to Changelog/ folder
 * Returns the absolute filepath
 */
function saveChangelogFile(version, content) {
  const changelogDir = join(__dirname, '..', 'Changelog');
  
  // Create Changelog directory if it doesn't exist
  if (!existsSync(changelogDir)) {
    mkdirSync(changelogDir, { recursive: true });
  }
  
  // File name: 0.252.0.md (no v prefix)
  const filename = `${version}.md`;
  const filepath = join(changelogDir, filename);
  
  writeFileSync(filepath, content, 'utf-8');
  
  // Return absolute path
  return filepath;
}

/**
 * Get current date in readable format
 */
function getCurrentDate() {
  const date = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Main function to generate changelog
 */
export function generateChangelog(currentVersion, previousVersion = null) {
  try {
    // Check if we're in a git repository
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    } catch (error) {
      console.warn('⚠️  Not in a git repository. Skipping changelog generation.');
      return null;
    }
    
    // If no previous version provided, try to get it
    if (!previousVersion) {
      previousVersion = getPreviousVersion();
    }
    
    console.log(`📝 Generating changelog for version ${currentVersion}...`);
    if (previousVersion) {
      console.log(`   Previous version: ${previousVersion}`);
    } else {
      console.log(`   No previous version found, using all commits`);
    }
    
    // Get commits between versions
    const commits = getCommitsBetweenVersions(previousVersion, currentVersion);
    
    if (commits.length === 0) {
      console.log('ℹ️  No commits found for changelog.');
      return null;
    }
    
    console.log(`   Found ${commits.length} commit(s)`);
    
    // Group commits by type
    const groupedCommits = groupCommitsByType(commits);
    
    // Get current date
    const date = getCurrentDate();
    
    // Generate markdown
    const markdown = generateMarkdown(currentVersion, date, groupedCommits);
    
    // Save to file
    const filepath = saveChangelogFile(currentVersion, markdown);
    
    console.log(`✅ Changelog generated: ${filepath}`);
    
    return filepath;
  } catch (error) {
    console.error(`❌ Error generating changelog: ${error.message}`);
    return null;
  }
}

// If run directly (not imported), execute
// Check if this file is being run directly by comparing the file URL
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('generate-changelog.js');

if (isMainModule) {
  const args = process.argv.slice(2);
  const currentVersion = args[0];
  const previousVersion = args[1] || null;
  
  if (!currentVersion) {
    console.error('Usage: node generate-changelog.js <currentVersion> [previousVersion]');
    process.exit(1);
  }
  
  generateChangelog(currentVersion, previousVersion);
}


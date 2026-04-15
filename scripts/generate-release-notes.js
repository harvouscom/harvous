#!/usr/bin/env node

/**
 * User-Friendly Release Notes Generator
 * 
 * This script generates user-friendly release notes from technical changelogs.
 * It transforms technical commit messages into plain English explanations
 * focused on user benefits and experience improvements.
 * 
 * Usage:
 *   node scripts/generate-release-notes.js <version>
 *   node scripts/generate-release-notes.js 1.14.0
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Mapping of technical terms to user-friendly descriptions
 */
// Category strings become ### headings in generated markdown — keep them plain text (no emoji).
const USER_FRIENDLY_MAPPINGS = {
  // Navigation improvements
  'navigation': {
    keywords: ['nav', 'navigation', 'menu', 'sidebar', 'mobile nav', 'desktop nav'],
    category: 'Navigation improvements',
    transform: (text) => {
      if (text.includes('mobile')) return 'Made mobile navigation easier to use';
      if (text.includes('desktop')) return 'Improved desktop navigation experience';
      return 'Enhanced navigation throughout the app';
    }
  },
  
  // Space & Thread organization
  'organization': {
    keywords: ['space', 'thread', 'hierarchy', 'organize', 'structure'],
    category: 'Organization and structure',
    transform: (text) => {
      if (text.includes('space')) return 'Better organization with Spaces';
      if (text.includes('thread')) return 'Improved thread management';
      return 'Enhanced content organization';
    }
  },
  
  // Editor improvements
  'editor': {
    keywords: ['editor', 'tiptap', 'paste', 'formatting', 'text', 'typing'],
    category: 'Writing and editing',
    transform: (text) => {
      if (text.includes('paste')) return 'Smarter copy and paste';
      if (text.includes('format')) return 'Better text formatting';
      return 'Improved writing experience';
    }
  },
  
  // Performance
  'performance': {
    keywords: ['perf', 'performance', 'speed', 'fast', 'optimize', 'cache'],
    category: 'Performance',
    transform: (text) => 'Made the app faster and more responsive'
  },
  
  // Sync & Data
  'sync': {
    keywords: ['sync', 'synchronize', 'offline', 'data', 'storage'],
    category: 'Sync and data',
    transform: (text) => {
      if (text.includes('offline')) return 'Better offline support';
      return 'Improved data synchronization';
    }
  },
  
  // UI/UX Polish
  'polish': {
    keywords: ['ui', 'ux', 'design', 'visual', 'style', 'appearance'],
    category: 'Visual polish',
    transform: (text) => 'Refined the visual design'
  },
  
  // Bug fixes
  'fixes': {
    keywords: ['fix', 'bug', 'issue', 'error', 'crash'],
    category: 'Bug fixes',
    transform: (text) => text.replace(/^fix:?\s*/i, '').replace(/^Fixed?\s*/i, 'Fixed ')
  }
};

/**
 * Parse technical changelog and extract changes
 */
function parseChangelog(changelogPath) {
  try {
    const content = readFileSync(changelogPath, 'utf-8');
    const lines = content.split('\n');
    
    const changes = {
      features: [],
      fixes: [],
      improvements: [],
      performance: [],
      other: []
    };
    
    let currentSection = null;
    
    lines.forEach(line => {
      // Detect section headers
      if (line.startsWith('## Features')) {
        currentSection = 'features';
      } else if (line.startsWith('## Fixes')) {
        currentSection = 'fixes';
      } else if (line.startsWith('## Improvements')) {
        currentSection = 'improvements';
      } else if (line.startsWith('## Performance')) {
        currentSection = 'performance';
      } else if (line.startsWith('## Other')) {
        currentSection = 'other';
      } else if (line.startsWith('- ') && currentSection) {
        // Extract bullet point content
        const change = line.substring(2).trim();
        if (change && !change.includes('_No significant changes')) {
          changes[currentSection].push(change);
        }
      }
    });
    
    return changes;
  } catch (error) {
    console.error(`❌ Error reading changelog: ${error.message}`);
    return null;
  }
}

/**
 * Categorize a change based on keywords
 */
function categorizeChange(changeText) {
  const lowerText = changeText.toLowerCase();
  
  for (const [key, mapping] of Object.entries(USER_FRIENDLY_MAPPINGS)) {
    if (mapping.keywords.some(keyword => lowerText.includes(keyword))) {
      return {
        category: mapping.category,
        userFriendly: mapping.transform(changeText)
      };
    }
  }
  
  // Default category
  return {
    category: 'General improvements',
    userFriendly: changeText
  };
}

/**
 * Group changes by user-friendly categories
 */
function groupChangesByCategory(changes) {
  const grouped = {};
  
  // Process all change types
  ['features', 'improvements', 'fixes', 'performance'].forEach(type => {
    changes[type].forEach(change => {
      const { category, userFriendly } = categorizeChange(change);
      
      if (!grouped[category]) {
        grouped[category] = {
          whatChanged: [],
          howItHelps: []
        };
      }
      
      // Generate "what changed" and "how it helps" from the change
      const { whatChanged, howItHelps } = generateUserFriendlyText(change, type);
      
      if (whatChanged) grouped[category].whatChanged.push(whatChanged);
      if (howItHelps) grouped[category].howItHelps.push(howItHelps);
    });
  });
  
  return grouped;
}

/**
 * Generate user-friendly "what changed" and "how it helps" text
 */
function generateUserFriendlyText(technicalText, type) {
  // Remove technical prefixes
  let cleaned = technicalText
    .replace(/^(feat|fix|improve|enhance|refactor|perf|style):\s*/i, '')
    .replace(/^(add|update|improve|enhance|fix|optimize)\s+/i, '');
  
  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Generate "what changed"
  let whatChanged = cleaned;
  
  // Generate "how it helps" based on type and content
  let howItHelps = '';
  
  if (type === 'features') {
    howItHelps = generateFeatureBenefit(cleaned);
  } else if (type === 'fixes') {
    howItHelps = generateFixBenefit(cleaned);
  } else if (type === 'improvements' || type === 'performance') {
    howItHelps = generateImprovementBenefit(cleaned);
  }
  
  return { whatChanged, howItHelps };
}

/**
 * Generate benefit text for features
 */
function generateFeatureBenefit(featureText) {
  const lower = featureText.toLowerCase();
  
  if (lower.includes('navigation') || lower.includes('nav')) {
    return 'Easier to find and access your content';
  }
  if (lower.includes('space') || lower.includes('organize')) {
    return 'Better organization keeps your notes tidy';
  }
  if (lower.includes('mobile')) {
    return 'Improved mobile experience for on-the-go use';
  }
  if (lower.includes('paste') || lower.includes('copy')) {
    return 'Saves time when adding content from other sources';
  }
  if (lower.includes('sync')) {
    return 'Your notes stay up to date across all devices';
  }
  
  return 'Makes your Bible study workflow smoother';
}

/**
 * Generate benefit text for fixes
 */
function generateFixBenefit(fixText) {
  const lower = fixText.toLowerCase();
  
  if (lower.includes('crash') || lower.includes('error')) {
    return 'More reliable app experience';
  }
  if (lower.includes('count') || lower.includes('number')) {
    return 'Accurate information you can trust';
  }
  if (lower.includes('sync')) {
    return 'Your data stays in sync properly';
  }
  
  return 'Smoother, more reliable experience';
}

/**
 * Generate benefit text for improvements
 */
function generateImprovementBenefit(improvementText) {
  const lower = improvementText.toLowerCase();
  
  if (lower.includes('performance') || lower.includes('speed') || lower.includes('fast')) {
    return 'Faster, more responsive app';
  }
  if (lower.includes('ui') || lower.includes('visual') || lower.includes('design')) {
    return 'Cleaner, more polished interface';
  }
  
  return 'Enhanced overall experience';
}

/**
 * Get month and year for filename
 */
function getMonthYear() {
  const date = new Date();
  const month = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const year = date.getFullYear();
  return `${month}-${year}`;
}

/**
 * Generate release notes markdown
 */
function generateReleaseNotesMarkdown(version, groupedChanges) {
  const monthYear = getMonthYear();
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let markdown = `# What's New in Harvous v${version}\n\n`;
  markdown += `**Release Date:** ${date}\n`;
  markdown += `**Version:** ${version}\n\n`;
  markdown += `This release includes improvements to navigation, organization, and overall user experience.\n\n`;
  markdown += `---\n\n`;
  markdown += `## Updates in This Release\n\n`;
  
  // Generate sections for each category
  const categories = Object.keys(groupedChanges).sort();
  
  categories.forEach(category => {
    const { whatChanged, howItHelps } = groupedChanges[category];
    
    if (whatChanged.length === 0) return;
    
    markdown += `### ${category}\n\n`;
    
    // What changed section
    markdown += `**What changed:**\n`;
    whatChanged.forEach(change => {
      markdown += `- ${change}\n`;
    });
    markdown += `\n`;
    
    // How it helps section
    markdown += `**How it helps you:**\n`;
    // Deduplicate benefits
    const uniqueBenefits = [...new Set(howItHelps)];
    uniqueBenefits.forEach(benefit => {
      markdown += `- ${benefit}\n`;
    });
    markdown += `\n`;
  });
  
  // Add tips section
  markdown += `---\n\n`;
  markdown += `## Tips for Using New Features\n\n`;
  markdown += `- **Explore the changes:** Try clicking around to discover the improvements\n`;
  markdown += `- **Check tooltips:** Hover over buttons to see what they do\n`;
  markdown += `- **Visit /help:** Detailed guides for all features\n\n`;
  
  markdown += `---\n\n`;
  markdown += `## Need Help?\n\n`;
  markdown += `If you have questions about these updates:\n`;
  markdown += `- Check the \`/help\` folder for detailed guides\n`;
  markdown += `- Most features have hover tooltips that explain what they do\n\n`;
  markdown += `---\n\n`;
  markdown += `*This release note focuses on user experience improvements. For technical details, see the \`Changelog/\` folder.*\n`;
  
  return markdown;
}

/**
 * Save release notes file
 */
function saveReleaseNotes(version, content) {
  const releaseNotesDir = join(__dirname, '..', 'release-notes');
  
  // Create release-notes directory if it doesn't exist
  if (!existsSync(releaseNotesDir)) {
    mkdirSync(releaseNotesDir, { recursive: true });
  }
  
  // Extract major.minor version for filename
  const versionMatch = version.match(/^(\d+\.\d+)/);
  const shortVersion = versionMatch ? versionMatch[1] : version;
  
  const monthYear = getMonthYear();
  const filename = `v${shortVersion}-${monthYear}.md`;
  const filepath = join(releaseNotesDir, filename);
  
  writeFileSync(filepath, content, 'utf-8');
  
  return filepath;
}

/**
 * Main function
 */
export function generateReleaseNotes(version) {
  try {
    console.log(`\n📝 Generating user-friendly release notes for v${version}...`);
    
    // Find the technical changelog
    const changelogPath = join(__dirname, '..', 'Changelog', `${version}.md`);
    
    if (!existsSync(changelogPath)) {
      console.log(`⚠️  Technical changelog not found at ${changelogPath}`);
      console.log(`   Skipping release notes generation.`);
      return null;
    }
    
    // Parse technical changelog
    const changes = parseChangelog(changelogPath);
    
    if (!changes) {
      console.log(`❌ Could not parse changelog`);
      return null;
    }
    
    // Check if there are any changes
    const hasChanges = Object.values(changes).some(arr => arr.length > 0);
    
    if (!hasChanges) {
      console.log(`ℹ️  No changes found in changelog`);
      return null;
    }
    
    // Group changes by user-friendly categories
    const groupedChanges = groupChangesByCategory(changes);
    
    // Generate release notes markdown
    const markdown = generateReleaseNotesMarkdown(version, groupedChanges);
    
    // Save to file
    const filepath = saveReleaseNotes(version, markdown);
    
    console.log(`✅ Release notes generated: ${filepath}`);
    console.log(`   Review and refine the content before sharing with users!\n`);
    
    return filepath;
  } catch (error) {
    console.error(`❌ Error generating release notes: ${error.message}`);
    return null;
  }
}

// If run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('generate-release-notes.js');

if (isMainModule) {
  const version = process.argv[2];
  
  if (!version) {
    console.error('Usage: node generate-release-notes.js <version>');
    console.error('Example: node generate-release-notes.js 1.14.0');
    process.exit(1);
  }
  
  generateReleaseNotes(version);
}

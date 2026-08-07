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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
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
function generateReleaseNotesMarkdown(version, groupedChanges, covered = [version]) {
  const monthYear = getMonthYear();
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  /*
    Titled by date, because that is what the file is. A version number in the
    heading would be a lie the moment the day's next release folds in — and it
    is not what a reader is looking for anyway. The versions covered stay in
    the metadata line, where someone tracing a specific change can find them.
  */
  let markdown = `# What's New in Harvous — ${date}\n\n`;
  markdown += `**Release Date:** ${date}\n`;
  markdown += covered.length > 1
    ? `**Versions:** v${covered[0]}–v${covered[covered.length - 1]}\n\n`
    : `**Version:** v${version}\n\n`;
  /*
    Says what it is, at the top, where nobody can miss it. Everything below is
    derived from commit subjects — written for other developers, about the
    change rather than about what it does for someone. Lines like "Stop asking
    Clerk for the same roster four times a pane" shipped to users because this
    file looked finished. Removing the banner is the last step of the rewrite.
  */
  markdown += `> DRAFT — generated from commit subjects, not written for users yet.\n`;
  markdown += `> Rewrite each line as what changed for the reader, then delete this banner.\n`;
  markdown += `> See release-notes/README.md for tone, or run /marketing-agent.\n\n`;
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

/** Local calendar day, which is the unit a release note is written in. */
function todayIsoDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * One note per day.
 *
 * Named `vX.Y-month-year` until now, which meant a new file per *minor* — and
 * the post-commit hook bumps a minor on every `feat:`. One busy day produced
 * 108 files, and 15 more the day this changed. Nobody reads fifteen release
 * notes for one afternoon, and no reader thinks in minor versions anyway.
 *
 * A day is the honest unit: "here is what changed on the 6th". Nothing reads
 * this folder programmatically — the public changelog is built from
 * `Changelog/*.md` — so the name is free to describe the thing it is.
 */
function releaseNotesPathFor() {
  return join(__dirname, '..', 'release-notes', `${todayIsoDate()}.md`);
}

/**
 * Every version whose changelog is dated today, oldest first.
 *
 * A daily note has to cover the whole day, not the one version that happened
 * to trigger this run — otherwise the third release of an afternoon would
 * describe itself and silently drop the two before it.
 */
function versionsReleasedToday() {
  const changelogDir = join(__dirname, '..', 'Changelog');
  if (!existsSync(changelogDir)) return [];
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return readdirSync(changelogDir)
    .filter((name) => /^\d+\.\d+\.\d+\.md$/.test(name))
    .filter((name) => {
      const body = readFileSync(join(changelogDir, name), 'utf-8');
      return body.includes(`**Release Date**: ${today}`);
    })
    .map((name) => name.replace(/\.md$/, ''))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );
}

/** True while a note is still the generated draft nobody has rewritten. */
function isUnwrittenDraft(path) {
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf-8').includes('> DRAFT —');
}

/**
 * Save release notes — but never over a file that already exists.
 *
 * These are public, hand-edited copy: `release-notes/README.md` and CLAUDE.md
 * put them under the marketing agent, and what this script emits is a draft
 * from commit subjects, not publishable prose. Because the filename is keyed on
 * major.minor, every patch release resolved to the same path — so a `fix:`
 * commit silently replaced a whole month of rewritten notes with boilerplate.
 * That is exactly what happened to v2.21.0's.
 *
 * Existing file → leave it alone and print the entries, so the new work is
 * visible without anything being destroyed. `--force` is the deliberate escape
 * hatch, and it is never taken by the post-commit hook.
 */
function saveReleaseNotes(version, content, { force = false } = {}) {
  const releaseNotesDir = join(__dirname, '..', 'release-notes');
  if (!existsSync(releaseNotesDir)) {
    mkdirSync(releaseNotesDir, { recursive: true });
  }

  const filepath = releaseNotesPathFor();

  /*
    The DRAFT banner is the lock, and deleting it is how you turn the key.

    While it is there, nobody has invested anything in this file, so the day's
    third release can rewrite it to cover all three. The moment a human takes
    the banner off — which is the same moment they rewrite the copy — the file
    stops being generated output and is never touched again.

    That is what makes one-file-per-day safe. Without it, either every release
    clobbers the day's written note (the v2.21.0 bug) or the first release of
    the day claims the file and the rest of the day goes unrecorded.
  */
  if (existsSync(filepath) && !isUnwrittenDraft(filepath) && !force) {
    return { filepath, written: false };
  }

  writeFileSync(filepath, content, 'utf-8');
  return { filepath, written: true };
}

/**
 * Main function
 */
export function generateReleaseNotes(version, { force = false } = {}) {
  try {
    console.log(`\n📝 Generating user-friendly release notes for v${version}...`);
    
    // Find the technical changelog
    const changelogPath = join(__dirname, '..', 'Changelog', `${version}.md`);
    
    if (!existsSync(changelogPath)) {
      console.log(`⚠️  Technical changelog not found at ${changelogPath}`);
      console.log(`   Skipping release notes generation.`);
      return null;
    }
    
    /*
      Parse every version released today, not just this one.

      The note is dated, so it has to describe the day. Three releases between
      lunch and dinner are one afternoon's work to a reader, and a note that
      covered only the last of them would quietly drop the other two.

      Falls back to this version alone if the day scan finds nothing — a
      changelog written without today's date should still produce its note.
    */
    const dayVersions = versionsReleasedToday();
    const covered = dayVersions.includes(version)
      ? dayVersions
      : [...dayVersions, version];

    const changes = covered
      .map((v) => parseChangelog(join(__dirname, '..', 'Changelog', `${v}.md`)))
      .filter(Boolean)
      .reduce((all, parsed) => {
        Object.keys(parsed).forEach((key) => {
          all[key] = [...(all[key] ?? []), ...parsed[key]];
        });
        return all;
      }, {});

    if (!Object.keys(changes).length) {
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
    const markdown = generateReleaseNotesMarkdown(version, groupedChanges, covered);

    const { filepath, written } = saveReleaseNotes(version, markdown, { force });

    if (!written) {
      /*
        The day's note has already been rewritten by a human. Print what would
        have been added rather than writing it, so a late release still
        surfaces its own changes without overwriting their copy.

        Only this version's entries — the rest of the day is already in the
        file they wrote.
      */
      const entries = Object.values(parseChangelog(changelogPath) ?? {}).flat();
      console.log(`ℹ️  ${filepath.replace(join(__dirname, '..') + '/', '')} is already written — leaving it alone.`);
      console.log(`   New in v${version}, to fold in by hand (or via /marketing-agent):`);
      entries.forEach((entry) => console.log(`     - ${entry}`));
      console.log(`   Regenerate from scratch with: npm run release-notes:generate -- ${version} --force\n`);
      return null;
    }

    console.log(`✅ Release notes drafted: ${filepath}`);
    console.log(`   A DRAFT built from commit subjects — rewrite before sharing.\n`);

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
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const version = args.find((arg) => !arg.startsWith('--'));

  if (!version) {
    console.error('Usage: node generate-release-notes.js <version> [--force]');
    console.error('Example: node generate-release-notes.js 1.14.0');
    console.error('');
    console.error('  --force  Overwrite an existing notes file for this month.');
    console.error('           Without it, an existing file is never touched —');
    console.error('           these are hand-edited public copy.');
    process.exit(1);
  }

  generateReleaseNotes(version, { force });
}

#!/usr/bin/env node

/**
 * Commit with Context Helper
 * 
 * This script helps create commit messages with context from Cursor Agent chat conversations.
 * It prompts for the initial reason/context and formats the commit message properly.
 * 
 * Usage:
 *   node scripts/commit-with-context.js
 * 
 * Or create a git alias:
 *   git config alias.cc '!node scripts/commit-with-context.js'
 *   Then use: git cc
 */

import { execSync } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Valid commit types
const COMMIT_TYPES = ['feat', 'fix', 'refactor', 'style', 'perf', 'docs', 'test', 'chore', 'build', 'ci'];

// Create readline interface
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt for input
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
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

// Check if there are staged changes
function hasStagedChanges() {
  try {
    const result = execSync('git diff --cached --name-only', { encoding: 'utf-8' }).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

// Main function
async function main() {
  // Check if we're in a git repository
  if (!isGitRepository()) {
    console.error('❌ Not in a git repository.');
    process.exit(1);
  }
  
  // Check if there are staged changes
  if (!hasStagedChanges()) {
    console.error('❌ No staged changes found.');
    console.error('   Please stage your changes first with: git add <files>');
    process.exit(1);
  }
  
  console.log('📝 Commit with Context Helper\n');
  console.log('This will help you create a commit message with context from your chat conversation.\n');
  
  // Prompt for initial reason/context
  const context = await question('What was the initial reason/context from the chat? (What problem were you solving?)\n> ');
  
  if (!context || !context.trim()) {
    console.error('❌ Context is required. Exiting.');
    rl.close();
    process.exit(1);
  }
  
  // Prompt for commit type
  console.log('\nCommit types: feat, fix, refactor, style, perf, docs, test, chore, build, ci');
  let commitType = await question('Commit type: ');
  commitType = commitType.trim().toLowerCase();
  
  if (!COMMIT_TYPES.includes(commitType)) {
    console.error(`❌ Invalid commit type: ${commitType}`);
    console.error(`   Valid types: ${COMMIT_TYPES.join(', ')}`);
    rl.close();
    process.exit(1);
  }
  
  // Prompt for commit message subject
  const subject = await question('Commit message subject (short description): ');
  
  if (!subject || !subject.trim()) {
    console.error('❌ Commit message subject is required. Exiting.');
    rl.close();
    process.exit(1);
  }
  
  // Prompt for additional details (optional)
  console.log('\nAdditional details (optional, press Enter to skip):');
  const details = await question('> ');
  
  // Build commit message
  let commitMessage = `${commitType}: ${subject.trim()}`;
  
  // Add context section
  commitMessage += `\n\nContext: ${context.trim()}`;
  
  // Add additional details if provided
  if (details && details.trim()) {
    commitMessage += `\n\n${details.trim()}`;
  }
  
  // Show preview
  console.log('\n📋 Commit message preview:');
  console.log('─'.repeat(60));
  console.log(commitMessage);
  console.log('─'.repeat(60));
  
  // Confirm
  const confirm = await question('\nProceed with this commit? (y/n): ');
  
  rl.close();
  
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('❌ Commit cancelled.');
    process.exit(0);
  }
  
  // Execute git commit
  try {
    execSync(`git commit -m "${commitMessage.split('\n').join('" -m "')}"`, {
      stdio: 'inherit',
      encoding: 'utf-8'
    });
    console.log('\n✅ Commit created successfully!');
  } catch (error) {
    console.error('❌ Error creating commit:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  if (error.stack) {
    console.error('\nStack trace:', error.stack);
  }
  rl.close();
  process.exit(1);
});

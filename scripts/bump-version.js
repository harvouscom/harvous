#!/usr/bin/env node

/**
 * Automatic Version Bumping Script
 * 
 * This script automatically bumps the version in package.json based on
 * conventional commit messages. It reads the most recent commit message
 * and determines the appropriate version bump:
 * 
 * - feat: → minor bump (0.10.0 → 0.11.0)
 * - fix: → patch bump (0.10.0 → 0.10.1)
 * - BREAKING CHANGE or ! → major bump (0.10.0 → 1.0.0)
 * - Default → patch bump
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the most recent commit message
function getCommitMessage() {
  try {
    // Get the commit message from the most recent commit
    const commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim();
    return commitMessage;
  } catch (error) {
    console.error('❌ Error getting commit message:', error.message);
    return null;
  }
}

// Check if package.json was modified in the last commit
function wasPackageJsonModifiedInLastCommit() {
  try {
    // Check if package.json is in the list of files changed in HEAD
    const changedFiles = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf-8' }).trim();
    return changedFiles.includes('package.json');
  } catch (error) {
    // If we can't check (e.g., no commits yet), assume false
    return false;
  }
}

// Check if package.json has uncommitted changes
function hasUncommittedChanges() {
  try {
    // Check if package.json has uncommitted changes (staged or unstaged)
    const status = execSync('git status --porcelain package.json', { encoding: 'utf-8' }).trim();
    return status.length > 0;
  } catch (error) {
    // If we can't check, assume false
    return false;
  }
}

// Determine bump type based on commit message
function determineBumpType(commitMessage) {
  if (!commitMessage) {
    return 'patch'; // Default to patch for safety
  }

  // Check for breaking changes
  if (commitMessage.includes('BREAKING CHANGE') || commitMessage.match(/^[^:]+!:/)) {
    return 'major';
  }

  // Check for feature commits (minor bump)
  if (commitMessage.match(/^feat:/i)) {
    return 'minor';
  }

  // Check for fix commits (patch bump)
  if (commitMessage.match(/^fix:/i)) {
    return 'patch';
  }

  // Default to patch for safety
  return 'patch';
}

// Bump version based on type
function bumpVersion(version, bumpType) {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

// Update package.json version
function updatePackageJson(newVersion) {
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  
  packageJson.version = newVersion;
  
  writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf-8'
  );
}

// Main execution
try {
  // Check if we're in a git repository
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch (error) {
    console.log('⚠️  Not in a git repository. Skipping version bump.');
    process.exit(0);
  }

  // Skip version bump if this is a version bump commit itself
  const commitMessage = getCommitMessage();
  if (commitMessage && commitMessage.match(/^chore:.*bump version/i)) {
    console.log('ℹ️  Version bump commit detected. Skipping to avoid recursion.');
    process.exit(0);
  }

  // Read current version
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const currentVersion = packageJson.version;

  // SAFEGUARD 1: Skip if package.json was modified in the last commit
  // This means the version was already bumped and committed
  if (wasPackageJsonModifiedInLastCommit()) {
    console.log('ℹ️  package.json was modified in the last commit. Skipping to avoid recursion.');
    process.exit(0);
  }

  // SAFEGUARD 2: Skip if current version already matches expected version from last commit
  // This means the version was already bumped to the correct value
  try {
    // Try to get the version from the parent commit to calculate expected
    const parentPackageJson = execSync('git show HEAD~1:package.json 2>/dev/null', { encoding: 'utf-8' });
    const parentPackage = JSON.parse(parentPackageJson);
    const parentVersion = parentPackage.version;
    
    // Calculate what the version should be based on the last commit
    const bumpType = determineBumpType(commitMessage);
    const expectedVersion = bumpVersion(parentVersion, bumpType);
    
    // If current version matches expected, it was already bumped correctly
    if (expectedVersion === currentVersion) {
      console.log('ℹ️  Version already matches expected value from last commit. Skipping.');
      process.exit(0);
    }
  } catch (error) {
    // Can't get parent commit (e.g., first commit or no parent), so continue
    // This is expected in some cases, so we don't treat it as an error
  }

  // SAFEGUARD 3: Skip if package.json has uncommitted changes
  // This means user is mid-process (either staging or has unstaged changes)
  if (hasUncommittedChanges()) {
    console.log('ℹ️  package.json has uncommitted changes. Skipping to avoid conflicts.');
    process.exit(0);
  }

  console.log(`🔄 Current version: ${currentVersion}`);

  // Determine bump type
  const bumpType = determineBumpType(commitMessage);
  console.log(`📝 Commit message: ${commitMessage?.substring(0, 50) || 'N/A'}...`);
  console.log(`🎯 Bump type: ${bumpType}`);

  // Calculate new version
  const newVersion = bumpVersion(currentVersion, bumpType);

  if (newVersion === currentVersion) {
    console.log('ℹ️  No version bump needed.');
    process.exit(0);
  }

  // Update package.json
  updatePackageJson(newVersion);
  console.log(`✅ Version bumped: ${currentVersion} → ${newVersion}`);

  // Stage the updated package.json
  try {
    execSync('git add package.json', { stdio: 'ignore' });
  } catch (error) {
    console.warn('⚠️  Could not stage package.json. You may need to stage it manually.');
  }

  console.log(`\n💡 Next step: Run 'git commit --amend --no-edit' to include version bump in your commit,`);
  console.log(`   or create a new commit with 'git commit -m "chore: bump version to ${newVersion}"'`);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}


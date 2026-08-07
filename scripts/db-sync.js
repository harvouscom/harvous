#!/usr/bin/env node

/**
 * Database synchronization helper script
 * This script helps ensure your database schemas stay in sync between
 * local development and production environments.
 *
 * Reports only — pushing is an explicit act. This runs inside `npm run precommit`,
 * where stdin is not reliably a TTY, so it never asks a question it might not be
 * able to hear the answer to. Pass `--auto-push` (or run `npm run db:push`) to
 * actually apply the schema.
 */

import { execSync } from 'child_process';

console.log('🔄 Database Sync Helper');
console.log('------------------------');

try {
  // Check if we're in a git repository
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });

  // Check if server/db/schema.ts has changed
  const gitStatus = execSync('git diff --name-only HEAD -- server/db/').toString().trim();

  if (gitStatus.includes('schema.ts')) {
    console.log('📝 Database schema changes detected (server/db/schema.ts)!');

    if (process.argv.includes('--auto-push')) {
      console.log('🚀 Pushing schema...');
      execSync('npm run db:push', { stdio: 'inherit' });
      console.log('✅ Database schema synchronized successfully!');
    } else {
      console.log('⚠️ Schema changes are not applied to the database yet.');
      console.log('   Run `npm run db:push` when you are ready to apply them.');
    }
  } else {
    console.log('✅ No database schema changes detected.');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

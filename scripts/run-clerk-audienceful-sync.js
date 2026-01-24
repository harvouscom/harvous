#!/usr/bin/env node
/**
 * Script to run Clerk to Audienceful sync migration
 * 
 * Usage:
 *   node scripts/run-clerk-audienceful-sync.js [options]
 * 
 * Options:
 *   --dry-run          Run in dry-run mode (preview only)
 *   --limit=N          Limit number of users to process
 *   --offset=N         Skip first N users
 *   --local            Run against local dev server (default: production)
 *   --key=KEY          Migration key (or set MIGRATION_KEY env var)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  local: args.includes('--local'),
  limit: args.find(arg => arg.startsWith('--limit='))?.split('=')[1],
  offset: args.find(arg => arg.startsWith('--offset='))?.split('=')[1],
  key: args.find(arg => arg.startsWith('--key='))?.split('=')[1] || process.env.MIGRATION_KEY,
};

// Determine base URL
const baseUrl = options.local 
  ? 'http://localhost:4321'
  : 'https://app.harvous.com';

// Build URL with query parameters
const urlParams = new URLSearchParams();
if (options.dryRun) urlParams.set('dryRun', 'true');
if (options.limit) urlParams.set('limit', options.limit);
if (options.offset) urlParams.set('offset', options.offset);

const url = `${baseUrl}/api/migrations/sync-clerk-to-audienceful${urlParams.toString() ? '?' + urlParams.toString() : ''}`;

console.log('🚀 Running Clerk to Audienceful sync migration');
console.log(`📍 Target: ${baseUrl}`);
console.log(`🔗 URL: ${url}`);
console.log(`🔐 Auth: ${options.key ? 'Using migration key' : 'No key (will work if MIGRATION_KEY not set in env)'}`);
console.log(`🧪 Dry Run: ${options.dryRun ? 'YES (preview only)' : 'NO (will make changes)'}`);
if (options.limit) console.log(`📊 Limit: ${options.limit} users`);
if (options.offset) console.log(`⏭️  Offset: ${options.offset} users`);
console.log('');

// Make the request
const headers = {
  'Content-Type': 'application/json',
};
if (options.key) {
  headers['Authorization'] = `Bearer ${options.key}`;
}

try {
  console.log('⏳ Sending request...\n');
  const response = await fetch(url, {
    method: 'POST',
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Migration failed:');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Migration completed successfully!\n');
  console.log('📊 Results:');
  console.log(JSON.stringify(data.results || data, null, 2));

  if (data.results) {
    console.log('\n📈 Summary:');
    console.log(`   Total users processed: ${data.results.totalUsers}`);
    console.log(`   ✅ Successful: ${data.results.successful}`);
    console.log(`   ❌ Failed: ${data.results.failed}`);
    console.log(`   ⏭️  Skipped: ${data.results.skipped}`);
    if (data.results.durationSeconds) {
      console.log(`   ⏱️  Duration: ${data.results.durationSeconds}s`);
    }
    
    if (data.results.errors && data.results.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      data.results.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error.email}: ${error.error}`);
      });
    }
  }
} catch (error) {
  console.error('❌ Error running migration:');
  console.error(error.message);
  if (error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  process.exit(1);
}

#!/usr/bin/env node

/**
 * Database synchronization helper script
 * This script helps ensure your database schemas stay in sync between
 * local development and production environments.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

console.log('🔄 Database Sync Helper');
console.log('------------------------');

try {
  // Check if we're in a git repository
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });

  // Check if server/db/schema.ts has changed
  const gitStatus = execSync('git diff --name-only HEAD -- server/db/').toString().trim();
  
  if (gitStatus.includes('schema.ts')) {
    console.log('📝 Database schema changes detected (server/db/schema.ts)!');
    
    const answer = process.argv.includes('--auto-push') ? 'y' : 
      prompt('Would you like to push these changes to the database? (y/n) ');
    
    if (answer.toLowerCase() === 'y') {
      console.log('🚀 Pushing schema...');
      execSync('npm run db:push', { stdio: 'inherit' });
      console.log('✅ Database schema synchronized successfully!');
    } else {
      console.log('⚠️ Schema changes not pushed. Database may be out of sync.');
    }
  } else {
    console.log('✅ No database schema changes detected.');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

function prompt(question) {
  process.stdout.write(question);
  return require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  }).question('')[0];
} 
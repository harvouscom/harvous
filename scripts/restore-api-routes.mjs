#!/usr/bin/env node
/**
 * Restore API routes from backup for development mode
 * This ensures API routes are available when running `npm run dev`
 */

import { existsSync, renameSync } from 'fs';
import { join } from 'path';

const apiDir = join(process.cwd(), 'src/pages/api');
const apiDirBackup = join(process.cwd(), 'src/pages/api.backup');

try {
  // Restore API directory from backup if it doesn't exist
  if (!existsSync(apiDir) && existsSync(apiDirBackup)) {
    console.log('Restoring API routes from backup for development...');
    renameSync(apiDirBackup, apiDir);
    console.log('API routes restored successfully.');
  } else if (existsSync(apiDir)) {
    console.log('API routes already exist.');
  } else {
    console.log('No API backup found - API routes may need to be created.');
  }
} catch (error) {
  console.error('Failed to restore API routes:', error);
  process.exit(1);
}

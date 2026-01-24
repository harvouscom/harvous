#!/usr/bin/env node
/**
 * Build script for Capacitor that temporarily excludes API routes
 * API routes are handled by the remote Netlify server, not the static build
 */

import { execSync } from 'child_process';
import { existsSync, renameSync } from 'fs';
import { join } from 'path';

const apiDir = join(process.cwd(), 'src/pages/api');
const apiDirBackup = join(process.cwd(), 'src/pages/api.backup');

try {
  // Temporarily rename API directory to exclude it from build
  if (existsSync(apiDir)) {
    console.log('Temporarily excluding API routes from static build...');
    renameSync(apiDir, apiDirBackup);
  }

  // Run the build
  console.log('Building for Capacitor (static output)...');
  execSync('BUILD_TARGET=capacitor astro build', { stdio: 'inherit' });

} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
} finally {
  // Restore API directory
  if (existsSync(apiDirBackup)) {
    console.log('Restoring API routes...');
    renameSync(apiDirBackup, apiDir);
  }
}

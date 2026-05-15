#!/usr/bin/env node
/**
 * Runs XcodeGen from native/Harvous when `xcodegen` is installed (typically macOS).
 * No-op elsewhere so Linux CI `npm ci` stays green.
 *
 * Wired into `npm run precommit` and `postinstall`; do not require manual runs.
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectYml = path.join(root, 'native/Harvous/project.yml');

if (!existsSync(projectYml)) {
  process.exit(0);
}

const which = spawnSync('command', ['-v', 'xcodegen'], {
  cwd: root,
  encoding: 'utf8',
  shell: '/bin/bash',
});
if ((which.status ?? 1) !== 0 || !which.stdout?.trim()) {
  console.warn(
    '[harvous] xcodegen not on PATH — skipping refresh of native/Harvous/Harvous.xcodeproj ' +
      '(install on macOS: brew install xcodegen).'
  );
  process.exit(0);
}

const script = path.join(root, 'scripts/native-xcodegen.sh');
const r = spawnSync('bash', [script], {
  cwd: root,
  stdio: 'inherit',
});

process.exit(typeof r.status === 'number' ? r.status : 1);

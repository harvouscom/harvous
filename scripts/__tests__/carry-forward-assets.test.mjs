/**
 * Each Cloudflare deploy uploads only its own build, so the previous build's hashed chunks
 * 404 the moment it lands and every tab still on the old shell fails its next lazy import.
 * carry-forward-assets keeps 14 days of them in the upload. These pin the three rules that
 * make that safe: files carry across builds, they still age out, and sourcemaps never ride.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MANIFEST, carryForward, planCarryForward } from '../carry-forward-assets.mjs';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1);

let root;
let archiveDir;

/** A fresh `dist-spa/assets` for one build, holding the given files. */
function build(name, files) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f), `${name}:${f}`);
  return dir;
}

const manifest = () => JSON.parse(readFileSync(join(archiveDir, MANIFEST), 'utf8'));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'carry-forward-'));
  archiveDir = join(root, '.asset-archive');
});

describe('carryForward', () => {
  it("carries build A's hashed files into build B", () => {
    const a = build('a', ['index-AAA.js', 'PrototypePinSheet-AAA.js', 'index-AAA.css']);
    carryForward({ assetsDir: a, archiveDir, now: T0 });

    const b = build('b', ['index-BBB.js', 'index-BBB.css']);
    const plan = carryForward({ assetsDir: b, archiveDir, now: T0 + DAY });

    expect(plan.carry).toEqual(['PrototypePinSheet-AAA.js', 'index-AAA.css', 'index-AAA.js']);
    expect(readFileSync(join(b, 'PrototypePinSheet-AAA.js'), 'utf8')).toBe('a:PrototypePinSheet-AAA.js');
    expect(existsSync(join(b, 'index-BBB.js'))).toBe(true);
  });

  it("keeps a carried file's original lastSeen, so it can still age out", () => {
    carryForward({ assetsDir: build('a', ['old-AAA.js']), archiveDir, now: T0 });
    carryForward({ assetsDir: build('b', ['new-BBB.js']), archiveDir, now: T0 + DAY });

    expect(manifest()).toEqual({ 'old-AAA.js': T0, 'new-BBB.js': T0 + DAY });
  });

  it('prunes a file last seen 15 days ago, from both the archive and the upload', () => {
    carryForward({ assetsDir: build('a', ['stale-AAA.js', 'fresh-AAA.js']), archiveDir, now: T0 });
    carryForward({ assetsDir: build('b', ['fresh-AAA.js']), archiveDir, now: T0 + 2 * DAY });

    const c = build('c', ['index-CCC.js']);
    const plan = carryForward({ assetsDir: c, archiveDir, now: T0 + 15 * DAY });

    expect(plan.prune).toEqual(['stale-AAA.js']);
    expect(plan.carry).toEqual(['fresh-AAA.js']);
    expect(existsSync(join(archiveDir, 'stale-AAA.js'))).toBe(false);
    expect(existsSync(join(c, 'stale-AAA.js'))).toBe(false);
    expect(manifest()).not.toHaveProperty('stale-AAA.js');
  });

  it('never carries or archives .map files', () => {
    const a = build('a', ['index-AAA.js', 'index-AAA.js.map']);
    carryForward({ assetsDir: a, archiveDir, now: T0 });
    expect(existsSync(join(archiveDir, 'index-AAA.js.map'))).toBe(false);

    // Even one that reached the archive by some other route stays out of the upload.
    writeFileSync(join(archiveDir, 'smuggled-AAA.js.map'), 'x');
    const m = manifest();
    m['smuggled-AAA.js.map'] = T0;
    writeFileSync(join(archiveDir, MANIFEST), JSON.stringify(m));

    const b = build('b', ['index-BBB.js']);
    const plan = carryForward({ assetsDir: b, archiveDir, now: T0 + DAY });

    expect(plan.carry).toEqual(['index-AAA.js']);
    expect(existsSync(join(b, 'smuggled-AAA.js.map'))).toBe(false);
    expect(existsSync(join(archiveDir, 'smuggled-AAA.js.map'))).toBe(false);
  });

  it('starts cleanly with no archive (first deploy, or the cache was evicted)', () => {
    const a = build('a', ['index-AAA.js']);
    const plan = carryForward({ assetsDir: a, archiveDir, now: T0 });

    expect(plan.carry).toEqual([]);
    expect(manifest()).toEqual({ 'index-AAA.js': T0 });
  });
});

describe('planCarryForward', () => {
  it('drops manifest entries whose file is missing from the archive', () => {
    const plan = planCarryForward({
      currentFiles: ['index-BBB.js'],
      manifest: { 'gone-AAA.js': T0 },
      archiveFiles: [MANIFEST],
      now: T0 + DAY,
    });
    expect(plan.carry).toEqual([]);
    expect(plan.prune).toEqual(['gone-AAA.js']);
    expect(plan.manifest).toEqual({ 'index-BBB.js': T0 + DAY });
  });
});

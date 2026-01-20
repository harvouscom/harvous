#!/usr/bin/env node
/**
 * Backfill version tags + GitHub Releases from Changelog/*.md
 *
 * This script:
 * - Semver-sorts versions based on files in Changelog/<version>.md
 * - For each version in range:
 *   - Finds the commit where the changelog file was added (preferred)
 *   - Creates annotated tag v<version> at that commit (if missing)
 *   - Pushes the tag to origin
 *   - Creates a published GitHub Release (if missing), using the changelog as body
 *
 * Usage:
 *   node scripts/backfill-releases.js [--dry-run] [--from v1.0.1] [--to v1.12.42] [--remote origin]
 */

import { execSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import { join } from 'path'

function sh(command, options = {}) {
  return execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
}

function shInherit(command) {
  return execSync(command, { encoding: 'utf-8', stdio: 'inherit' })
}

function getRepoRoot() {
  return sh('git rev-parse --show-toplevel')
}

function requireCleanWorkingTree() {
  const status = sh('git status --porcelain')
  if (status.length > 0) {
    throw new Error('Working tree is not clean. Commit/stash changes before backfilling releases.')
  }
}

function parseSemver(version) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function normalizeTagOrVersion(input) {
  if (!input) return null
  return input.startsWith('v') ? input.slice(1) : input
}

function tagExists(tagName) {
  try {
    sh(`git rev-parse -q --verify "refs/tags/${tagName}"`, { stdio: ['ignore', 'pipe', 'ignore'] })
    return true
  } catch {
    return false
  }
}

function resolveCommitForChangelog(version) {
  const relPath = `Changelog/${version}.md`

  // Prefer the commit where the file was added (diff-filter=A)
  try {
    const addedCommit = sh(`git log --diff-filter=A -n 1 --format=%H -- "${relPath}"`)
    if (addedCommit) return { commit: addedCommit, method: 'added' }
  } catch {
    // ignore
  }

  // Fallback: any commit that touched it
  try {
    const touchedCommit = sh(`git log -n 1 --format=%H -- "${relPath}"`)
    if (touchedCommit) return { commit: touchedCommit, method: 'touched' }
  } catch {
    // ignore
  }

  return null
}

function ghReleaseExists(tagName) {
  try {
    sh(`gh release view "${tagName}" --json url -q .url`, { stdio: ['ignore', 'pipe', 'ignore'] })
    return true
  } catch {
    return false
  }
}

function getReleaseNotesAtTag(tagName, version, repoRoot) {
  const relPath = `Changelog/${version}.md`

  // Prefer notes from the tag itself (ensures we release what was in that version)
  try {
    return sh(`git show "${tagName}:${relPath}"`)
  } catch {
    // Fallback to current working tree file
    const absPath = join(repoRoot, relPath)
    if (!existsSync(absPath)) return null
    return readFileSync(absPath, 'utf-8')
  }
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const out = {
    dryRun: false,
    from: null,
    to: null,
    remote: 'origin'
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--from') out.from = normalizeTagOrVersion(args[++i])
    else if (a === '--to') out.to = normalizeTagOrVersion(args[++i])
    else if (a === '--remote') out.remote = args[++i] || 'origin'
    else if (a === '--help' || a === '-h') {
      console.log(
        [
          'Usage:',
          '  node scripts/backfill-releases.js [--dry-run] [--from v1.0.1] [--to v1.12.42] [--remote origin]',
          '',
          'Notes:',
          '- Requires gh CLI authenticated (gh auth login).',
          '- Refuses to overwrite existing tags/releases.'
        ].join('\n')
      )
      process.exit(0)
    }
  }

  return out
}

try {
  sh('git rev-parse --is-inside-work-tree', { stdio: 'ignore' })

  // Ensure gh exists early
  sh('gh --version', { stdio: ['ignore', 'pipe', 'ignore'] })

  const { dryRun, from, to, remote } = parseArgs(process.argv)
  const repoRoot = getRepoRoot()

  requireCleanWorkingTree()

  // Verify remote exists
  sh(`git remote get-url "${remote}"`)

  const changelogDir = join(repoRoot, 'Changelog')
  const files = readdirSync(changelogDir)

  const versions = files
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .filter(v => parseSemver(v))
    .sort((va, vb) => compareSemver(parseSemver(va), parseSemver(vb)))

  if (versions.length === 0) {
    console.log('ℹ️  No Changelog/*.md versions found. Nothing to backfill.')
    process.exit(0)
  }

  // Default range: from 1.0.1 (if present), otherwise first v>=1.0.0; to package.json version (if present), otherwise max.
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'))
  const currentVersion = typeof pkg?.version === 'string' ? pkg.version : null

  const defaultFrom =
    versions.includes('1.0.1') ? '1.0.1' : versions.find(v => parseSemver(v)?.major >= 1) || versions[0]
  const defaultTo = currentVersion && versions.includes(currentVersion) ? currentVersion : versions[versions.length - 1]

  const fromVersion = from || defaultFrom
  const toVersion = to || defaultTo

  const fromIdx = versions.indexOf(fromVersion)
  const toIdx = versions.indexOf(toVersion)

  if (fromIdx === -1) throw new Error(`--from version not found in Changelog/: ${fromVersion}`)
  if (toIdx === -1) throw new Error(`--to version not found in Changelog/: ${toVersion}`)
  if (fromIdx > toIdx) throw new Error(`Invalid range: from ${fromVersion} is after to ${toVersion}`)

  const selected = versions.slice(fromIdx, toIdx + 1)

  console.log(`ℹ️  Backfill range: v${fromVersion} → v${toVersion} (${selected.length} versions)`)
  if (dryRun) console.log('ℹ️  Dry-run mode: no tags pushed, no releases created.')

  for (const version of selected) {
    const tagName = `v${version}`
    const relChangelogPath = `Changelog/${version}.md`

    const resolved = resolveCommitForChangelog(version)
    if (!resolved?.commit) {
      console.warn(`⚠️  Skipping ${tagName}: could not resolve commit for ${relChangelogPath}`)
      continue
    }

    const hasTag = tagExists(tagName)
    const hasRelease = ghReleaseExists(tagName)

    console.log(`\n${tagName}`)
    console.log(`- changelog: ${relChangelogPath}`)
    console.log(`- commit: ${resolved.commit} (${resolved.method})`)
    console.log(`- tag: ${hasTag ? 'exists' : 'missing'}`)
    console.log(`- release: ${hasRelease ? 'exists' : 'missing'}`)

    if (dryRun) continue

    if (!hasTag) {
      sh(`git tag -a "${tagName}" "${resolved.commit}" -m "Release ${tagName}"`)
      console.log(`✅ Created tag ${tagName}`)
    }

    // Always push the tag; git will no-op if it already exists remotely.
    shInherit(`git push "${remote}" "${tagName}"`)

    if (hasRelease) continue

    const notes = getReleaseNotesAtTag(tagName, version, repoRoot)
    if (!notes) {
      console.warn(`⚠️  Skipping release ${tagName}: could not load release notes`)
      continue
    }

    const tmpDir = mkdtempSync(join(os.tmpdir(), 'harvous-release-notes-'))
    const notesPath = join(tmpDir, `${tagName}.md`)
    writeFileSync(notesPath, notes, 'utf-8')

    try {
      shInherit(`gh release create "${tagName}" --title "${tagName}" --notes-file "${notesPath}"`)
      console.log(`✅ Published release ${tagName}`)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }

  console.log('\n✅ Backfill complete.')
} catch (error) {
  console.error(`❌ ${error?.message || String(error)}`)
  process.exit(1)
}

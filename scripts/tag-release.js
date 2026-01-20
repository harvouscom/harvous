#!/usr/bin/env node
/**
 * Tag the current version and push the tag.
 *
 * - Reads version from root package.json
 * - Ensures Changelog/<version>.md exists
 * - Requires a clean git working tree
 * - Creates an annotated tag v<version> at HEAD (if missing)
 * - Pushes the tag to origin (triggers GitHub Release workflow)
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

function sh(command, options = {}) {
  return execSync(command, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
}

function getRepoRoot() {
  return sh('git rev-parse --show-toplevel')
}

function requireCleanWorkingTree() {
  const status = sh('git status --porcelain')
  if (status.length > 0) {
    throw new Error('Working tree is not clean. Commit/stash changes before tagging a release.')
  }
}

function tagExists(tagName) {
  try {
    sh(`git rev-parse -q --verify "refs/tags/${tagName}"`, { stdio: ['ignore', 'pipe', 'ignore'] })
    return true
  } catch {
    return false
  }
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2))
  return {
    remote: 'origin',
    allowNonMain: args.has('--allow-non-main')
  }
}

try {
  sh('git rev-parse --is-inside-work-tree', { stdio: 'ignore' })

  const { remote, allowNonMain } = parseArgs(process.argv)
  const repoRoot = getRepoRoot()

  const branch = sh('git rev-parse --abbrev-ref HEAD')
  if (!allowNonMain && branch !== 'main') {
    throw new Error(`Refusing to tag from branch "${branch}". Switch to "main" or pass --allow-non-main.`)
  }

  requireCleanWorkingTree()

  const packageJsonPath = join(repoRoot, 'package.json')
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const version = pkg?.version
  if (!version || typeof version !== 'string') {
    throw new Error('Could not read version from package.json')
  }

  const changelogPath = join(repoRoot, 'Changelog', `${version}.md`)
  if (!existsSync(changelogPath)) {
    throw new Error(`Missing changelog file: Changelog/${version}.md`)
  }

  const tagName = `v${version}`

  if (tagExists(tagName)) {
    console.log(`ℹ️  Tag already exists: ${tagName}`)
    process.exit(0)
  }

  sh(`git tag -a "${tagName}" -m "Release ${tagName}"`)
  console.log(`✅ Created tag ${tagName}`)

  sh(`git push "${remote}" "${tagName}"`, { stdio: 'inherit' })
  console.log(`✅ Pushed tag ${tagName} to ${remote}`)
} catch (error) {
  console.error(`❌ ${error?.message || String(error)}`)
  process.exit(1)
}

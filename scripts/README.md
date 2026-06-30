# Scripts Documentation

This folder contains automation scripts for Harvous development and release management.

## Version Management & Changelogs

### Automatic Version Bumping

**Script:** `bump-version.js`

Automatically bumps the version in `package.json` based on conventional commit messages and generates both technical changelogs and user-friendly release notes.

```bash
npm run version:bump
```

**What it does:**
1. Reads the most recent commit message
2. Determines bump type (major/minor/patch) from commit type
3. Updates `package.json`, `README.md`, and `public/sw.js`
4. Generates technical changelog in `Changelog/`
5. **Generates user-friendly release notes in `release-notes/`** ✨
6. Stages all files for commit

**Commit message format:**
- `feat:` → minor bump (1.13.0 → 1.14.0)
- `fix:` → patch bump (1.13.0 → 1.13.1)
- `BREAKING CHANGE` or `!` → major bump (1.13.0 → 2.0.0)

### Technical Changelog Generation

**Script:** `generate-changelog.js`

Generates technical changelogs from git commit history.

```bash
npm run changelog:generate <version>
# Example: npm run changelog:generate 1.14.0
```

**Output:** `Changelog/<version>.md`

**Format:**
- Groups commits by type (Features, Fixes, Improvements, etc.)
- Uses conventional commit format
- Technical language for developers

### User-Friendly Release Notes Generation

**Script:** `generate-release-notes.js` ✨

Transforms technical changelogs into user-friendly release notes.

```bash
npm run release-notes:generate <version>
# Example: npm run release-notes:generate 1.14.0
```

**Output:** `release-notes/v<major.minor>-<month-year>.md`

**What it does:**
1. Reads the technical changelog for the version
2. Categorizes changes by user-facing impact
3. Transforms technical terms into plain English
4. Generates "what changed" and "how it helps you" sections
5. Adds tips for using new features

**Example transformation:**
```
Technical: "feat: enhance paste handling in TiptapEditor"
User-friendly: 
  What changed: Smarter copy and paste
  How it helps: Saves time when adding content from other sources
```

## Workflow

### Standard Release Process

1. **Make changes and commit:**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

2. **Automatic version bump:**
   ```bash
   npm run version:bump
   ```
   This automatically:
   - Bumps version
   - Generates technical changelog
   - Generates user-friendly release notes ✨
   - Stages all files

3. **Amend or create new commit:**
   ```bash
   # Option A: Amend the last commit
   git commit --amend --no-edit
   
   # Option B: Create new commit
   git commit -m "chore: bump version to 1.14.0"
   ```

4. **Review and refine release notes:**
   ```bash
   # Open the generated release notes
   open release-notes/v1.14-january-2026.md
   
   # Edit to add more context, examples, or polish
   # Then stage the changes
   git add release-notes/
   ```

5. **Push to remote:**
   ```bash
   git push origin main
   ```

### Manual Release Notes Generation

If you need to regenerate or create release notes manually:

```bash
# Generate from existing technical changelog
npm run release-notes:generate 1.14.0

# Or run the script directly with more control
node scripts/generate-release-notes.js 1.14.0
```

## File Structure

```
Harvous/
├── Changelog/              # Technical changelogs (auto-generated)
│   ├── 1.13.0.md
│   ├── 1.13.1.md
│   └── 1.14.0.md
├── release-notes/          # User-friendly release notes (auto-generated)
│   ├── README.md
│   ├── TEMPLATE.md
│   ├── v1.13-january-2026.md
│   └── v1.14-february-2026.md
└── scripts/
    ├── bump-version.js           # Main automation script
    ├── generate-changelog.js     # Technical changelog generator
    └── generate-release-notes.js # User-friendly notes generator ✨
```

## Customization

### Adding New Categories

Edit `scripts/generate-release-notes.js` and add to `USER_FRIENDLY_MAPPINGS`:

```javascript
'your-category': {
  keywords: ['keyword1', 'keyword2'],
  category: 'Your category name',
  transform: (text) => 'User-friendly description'
}
```

Category strings become `###` headings in generated markdown: use plain text only (no emoji). See `release-notes/README.md`.

### Customizing Benefits

Edit the `generateFeatureBenefit`, `generateFixBenefit`, and `generateImprovementBenefit` functions in `generate-release-notes.js`.

## Tips

1. **Review before sharing:** Auto-generated release notes are a starting point. Always review and refine before sharing with users.

2. **Add examples:** The generator creates the structure, but you can add specific examples and screenshots manually.

3. **Combine versions:** If you have multiple patch releases (1.14.0, 1.14.1, 1.14.2), you can manually combine them into one user-friendly release note.

4. **Keep it simple:** Focus on benefits, not implementation. Users care about "what it does for me," not "how it works."

## Git hooks

Install the post-commit hook (not tracked in git):

```bash
cp scripts/git-hooks/post-commit .git/hooks/post-commit && chmod +x .git/hooks/post-commit
```

This runs `bump-version.js` after each commit. Public changelog pages deploy from [harvouscom/harvous.com](https://github.com/harvouscom/harvous.com) — not synced to Webflow from this repo.

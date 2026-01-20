# Automating User-Friendly Release Notes

This guide explains how to integrate user-friendly release notes into your existing changelog automation process.

## Current Setup

Your current automation (in `.github/workflows/` or `scripts/`):
1. Generates technical changelogs in `Changelog/` folder
2. Uses commit messages to create version-specific files
3. Follows format: `Changelog/[version].md`

## Proposed Enhancement

Add a step to create user-friendly release notes alongside technical changelogs.

## Implementation Options

### Option 1: Manual Creation (Recommended for now)

**When to create:**
- At the end of each sprint/release cycle
- When merging significant feature branches
- Before announcing updates to users

**Process:**
1. Review technical changelogs for the version range
2. Copy `release-notes/TEMPLATE.md` to `release-notes/v[X.X]-[month-year].md`
3. Fill in the template with user-friendly explanations
4. Focus on benefits, not implementation details

**Pros:**
- Human touch ensures quality and clarity
- Can group related changes meaningfully
- Flexibility in tone and detail level

**Cons:**
- Requires manual effort
- Not automated

### Option 2: AI-Assisted Generation

**Process:**
1. Automation reads technical changelogs
2. Uses AI (GPT-4, Claude, etc.) to transform technical changes into user-friendly language
3. Generates draft release note from template
4. Human reviews and refines before publishing

**Implementation sketch:**
```javascript
// scripts/generate-release-notes.js
async function generateUserFriendlyNotes(version, technicalChangelog) {
  const prompt = `
    Convert these technical changelog entries into user-friendly release notes.
    Focus on benefits and user experience, not implementation details.
    Use the tone from release-notes/TEMPLATE.md
    
    Technical changes:
    ${technicalChangelog}
  `;
  
  const draft = await callAI(prompt);
  
  // Save draft for human review
  fs.writeFileSync(
    `release-notes/v${version}-${getMonthYear()}.md`,
    draft
  );
  
  console.log('Draft release notes created. Please review and refine.');
}
```

**Pros:**
- Faster than fully manual
- Consistent structure
- Can be integrated into CI/CD

**Cons:**
- Requires AI API setup
- Still needs human review
- May miss nuance or context

### Option 3: Hybrid Approach (Best of both worlds)

**Process:**
1. Maintain a `release-notes/drafts/` folder
2. As features are developed, developers add user-facing notes to drafts
3. At release time, compile drafts into final release note
4. Review and polish before publishing

**Example draft format:**
```markdown
<!-- release-notes/drafts/mobile-nav-improvement.md -->
## 🎯 Smarter Mobile Navigation

**What changed:**
- Navigation button behavior now adapts based on context

**How it helps you:**
- Easier to navigate back from notes
- Two tap targets for better accessibility
```

**Pros:**
- Spreads work across development cycle
- Developers provide context while it's fresh
- Final compilation is quick

**Cons:**
- Requires developer discipline
- Need process to ensure drafts are created

## Recommended Workflow

For Harvous, I recommend **Option 1** (manual) initially, with plans to move to **Option 3** (hybrid):

### Phase 1: Manual (Current)
- Create release notes manually after each significant release
- Use TEMPLATE.md as guide
- Build up examples for future automation

### Phase 2: Developer Drafts (Next)
- Add draft creation to your development workflow
- Developers write user-facing notes when implementing features
- Compile drafts at release time

### Phase 3: AI-Assisted (Future)
- Once you have enough examples, train/prompt AI
- Use AI to generate drafts from technical changelogs
- Human reviews and publishes

## File Naming Convention

```
release-notes/
├── README.md                    # Explains the folder
├── TEMPLATE.md                  # Template for new releases
├── AUTOMATION-GUIDE.md          # This file
├── v1.13-january-2026.md       # Actual release note
├── v1.14-february-2026.md      # Next release
└── drafts/                      # Optional: feature drafts
    ├── feature-name-1.md
    └── feature-name-2.md
```

## Integration with Existing Scripts

If you have a `scripts/changelog.js` or similar:

```javascript
// Add to your existing changelog script
function generateChangelog(version) {
  // Existing technical changelog generation
  generateTechnicalChangelog(version);
  
  // New: Remind to create user-friendly notes
  console.log('\n📝 Reminder: Create user-friendly release notes');
  console.log(`   Template: release-notes/TEMPLATE.md`);
  console.log(`   Save as: release-notes/v${version}-${getMonthYear()}.md`);
  console.log(`   Focus on user benefits, not technical details\n`);
}
```

## Quality Checklist

Before publishing a release note, ensure:
- [ ] No technical jargon (avoid: "refactored", "optimized", "implemented")
- [ ] Benefits are clear (use: "helps you", "makes it easier", "saves time")
- [ ] Examples are concrete (show actual use cases)
- [ ] Tone is friendly and conversational
- [ ] Tips section provides actionable advice
- [ ] Version and date are correct

## Questions?

This is a living document. Update it as your process evolves!

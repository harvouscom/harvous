# Onboarding Notes Guide

This folder contains markdown files that are automatically loaded to create onboarding notes for new users.

## Quick Start

1. **Edit existing files** in `src/data/onboarding/` to update onboarding content
2. **Add new files** with numeric prefixes (e.g., `04-new-topic.md`) to add more notes
3. **Restart the dev server** (`npm run dev`) to see changes

## File Location

All onboarding markdown files are located in:
```
src/data/onboarding/
```

## File Naming Convention

Files must follow this naming pattern:
```
##-filename.md
```

Where `##` is a two-digit number that determines the order of notes:
- `01-welcome.md` - First note (order: 1)
- `02-organize.md` - Second note (order: 2)
- `03-scripture.md` - Third note (order: 3)
- `04-new-topic.md` - Fourth note (order: 4)
- etc.

**Important**: The numeric prefix determines the order. Files are automatically sorted by this prefix.

## File Format

Each markdown file should follow this structure:

```markdown
# Note Title

Your note content goes here. You can use:

- **Bold text** for emphasis
- *Italic text* for subtle emphasis
- Lists (bulleted or numbered)
- Links and other markdown features

The first heading (`# Title`) becomes the note title.
Everything after the first heading becomes the note content.
```

### Example

```markdown
# Welcome to Harvous

This is your first note! You can edit it, add it to threads, or delete it. 

Try clicking on this note to see more options. You can:
- Edit the content
- Add it to different threads
- Delete it when you're done

This thread is special - you can easily erase it and all its notes when you're ready.
```

## Editing Existing Files

1. Open the file you want to edit (e.g., `01-welcome.md`)
2. Make your changes
3. Save the file
4. Restart the dev server (`npm run dev`) for changes to take effect

## Adding New Notes

1. Create a new file with a numeric prefix:
   ```
   04-new-topic.md
   ```
2. Add your content following the format above
3. Save the file
4. Restart the dev server

**Tip**: Use the next available number. If you have files 01-03, your next file should be `04-`.

## Removing Notes

1. Delete the markdown file you want to remove
2. Restart the dev server

**Note**: This only affects new users. Existing users who already have the onboarding thread won't see changes until they reset their account.

## Testing Changes

### For New Users

New users automatically get the onboarding thread when they first sign up. To test:

1. Use the test endpoint: `/api/test/reset-to-new-user` (DELETE request)
2. Then use: `/api/test/create-onboarding-thread` (POST request)
3. Or simply sign up with a new account

### For Existing Users

1. Reset your account data using `/api/test/reset-to-new-user`
2. Create a new onboarding thread using `/api/test/create-onboarding-thread`
3. Check your dashboard to see the updated notes

## How It Works

1. **File Discovery**: The system automatically finds all `.md` files in `src/data/onboarding/`
2. **Sorting**: Files are sorted by their numeric prefix (01, 02, 03, etc.)
3. **Parsing**: Each file is parsed:
   - First heading (`# Title`) becomes the note title
   - Everything after becomes the note content
4. **Conversion**: Markdown content is converted to HTML
5. **Creation**: Notes are created in the database when a new user signs up

## Current Files

- `01-welcome.md` - Welcome message and introduction
- `02-organize.md` - How to organize notes with threads
- `03-scripture.md` - How scripture references work

## Tips

- **Keep it simple**: Onboarding notes should be clear and concise
- **Use examples**: Show users how features work with concrete examples
- **Test thoroughly**: Always test changes with a new user account
- **Number carefully**: Make sure numeric prefixes are sequential and don't have gaps (unless intentional)
- **Markdown support**: You can use standard markdown features (bold, italic, lists, links, etc.)

## Troubleshooting

### Changes not appearing?

1. Make sure you restarted the dev server
2. Check that the file has a valid numeric prefix
3. Verify the file is saved in `src/data/onboarding/`
4. Check the server console for error messages

### Note order is wrong?

- Check that numeric prefixes are correct (01, 02, 03, etc.)
- Files are sorted numerically, so `10-topic.md` comes after `09-topic.md` but before `2-topic.md`
- Use zero-padded numbers: `01`, `02`, `03`, etc.

### Note title is wrong?

- Make sure the first line is a markdown heading: `# Title`
- The heading must be on the first line of the file
- Everything after the first heading becomes the note content



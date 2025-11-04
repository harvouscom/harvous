# StripHtml Spacing Issue

## Problem
When converting HTML content to plain text for preview in `CardNote` components, line breaks between block elements (like `</p><p>`) are not being preserved as spaces, resulting in words running together.

**Example:**
- HTML: `<p>Fun fact: the origin of the app</p><p>Here we are again</p>`
- Expected output: `Fun fact: the origin of the app Here we are again`
- Actual output: `Fun fact: the origin of the appHere we are again`

## Current Implementation

The `stripHtml` function is located in:
- `src/components/react/CardNote.tsx`
- `src/components/CardNote.astro`

## Attempted Solutions

### 1. Regex-based approach
- Inserted spaces between adjacent block tags using regex: `</p><p>` → `</p> <p>`
- Converted closing tags to placeholders (`__SPACE__`)
- Used placeholder replacement before final cleanup
- **Result**: Still not working - spacing not preserved

### 2. DOM-based approach
- Used `document.createElement('div')` to parse HTML
- Inserted spaces between block elements in HTML string before parsing
- Used `innerText` property (which should preserve block element spacing)
- **Result**: Still not working - spacing not preserved

### 3. TreeWalker approach
- Manually walked DOM nodes to detect block elements
- Added spaces between consecutive block elements
- **Result**: Not fully tested, but likely same issue

## Root Cause Analysis Needed

To properly fix this, we need to:
1. **Inspect actual HTML structure** - Check what the real HTML looks like in the database/browser
2. **Test with real examples** - Use actual note content that's showing the issue
3. **Consider alternative approaches**:
   - Use a proper HTML parser library (like `htmlparser2` or `cheerio`)
   - Pre-process HTML in the backend/API before sending to frontend
   - Use CSS `white-space` properties instead of text extraction

## Potential Solutions

1. **Use a proper HTML parsing library**:
   ```javascript
   import { parse } from 'htmlparser2';
   // Parse and extract text with proper spacing
   ```

2. **Backend preprocessing**: Strip HTML on the server side where we have more control

3. **CSS-based solution**: Instead of stripping HTML, use CSS to hide formatting but preserve spacing

4. **Manual regex with more patterns**: Add more comprehensive regex patterns for all possible block element combinations

## Related Files
- `src/components/react/CardNote.tsx` - React component with stripHtml function
- `src/components/CardNote.astro` - Astro component with stripHtml function
- Used in: Card note previews with `line-clamp-2` class

## Testing
To test the fix:
1. Create a note with content that has line breaks between paragraphs
2. Check the preview in card view
3. Verify words are separated by spaces, not run together


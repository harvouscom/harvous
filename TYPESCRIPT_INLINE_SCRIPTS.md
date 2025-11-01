# TypeScript in Inline Scripts - Lessons Learned

## The Problem

**Inline scripts (`<script is:inline>`) in Astro files bypass TypeScript compilation and are sent directly to the browser as JavaScript.**

When TypeScript syntax is used in inline scripts, the browser receives code it cannot understand, causing JavaScript syntax errors.

## What Doesn't Work in `is:inline` Scripts

The following TypeScript-only syntax will cause JavaScript syntax errors:

1. **`declare global`** blocks - TypeScript-only syntax
2. **Type annotations** (`: string`, `: CustomEvent`, `: any`, etc.)
3. **Type assertions** (`as HTMLElement`, `as CustomEvent`, `as unknown as EventListener`)
4. **Interface definitions** (`interface MyInterface {}`)

### Example of Problematic Code

```typescript
// ❌ DON'T DO THIS in <script is:inline>
declare global {
  interface Window {
    myFunction: () => void;
  }
}

function showPanel(panelName: string) {
  const panel = document.getElementById(`${panelName}-panel`) as HTMLElement;
  if (panel) {
    panel.style.display = 'block';
  }
}
```

**Result**: Browser throws syntax errors like:
- `Uncaught SyntaxError: Unexpected identifier 'declare'`
- `Uncaught SyntaxError: Unexpected identifier 'as'`
- `Uncaught SyntaxError: Unexpected token ':'`

## What DOES Work

### Regular `<script>` Tags (Recommended)

Regular `<script>` tags (without `is:inline`) ARE processed by Astro's TypeScript compiler:

```typescript
// ✅ DO THIS - TypeScript is processed by Astro
<script>
  function showPanel(panelName: string) {
    const panel = document.getElementById(`${panelName}-panel`) as HTMLElement;
    if (panel) {
      panel.style.display = 'block';
    }
  }
</script>
```

### Inline Scripts with Plain JavaScript

If you must use `is:inline`, write plain JavaScript:

```javascript
// ✅ DO THIS - Plain JavaScript for inline scripts
<script is:inline>
  function showPanel(panelName) {
    const panel = document.getElementById(`${panelName}-panel`);
    if (panel) {
      panel.style.display = 'block';
    }
  }
</script>
```

### Type Definitions in `.d.ts` Files

Type definitions in `.d.ts` files are used for type checking only, not runtime:

```typescript
// ✅ This works - Type definitions for type checking
// In env.d.ts or similar
declare global {
  interface Window {
    myFunction: () => void;
  }
}
```

## Best Practices for Consistency

### When to Use Each Approach

| Script Type | Use When | TypeScript Support |
|------------|----------|-------------------|
| `<script>` | Standard scripts that need TypeScript type checking | ✅ Full TypeScript |
| `<script is:inline>` | Scripts that must execute before page load, bypass Astro processing | ❌ Plain JavaScript only |
| External `.ts`/`.tsx` files | Complex logic, reusable functions | ✅ Full TypeScript |

### Migration Guide

If you have inline scripts with TypeScript syntax:

1. **Option 1 (Recommended)**: Remove `is:inline` and use regular `<script>` tag
   ```diff
   - <script is:inline>
   + <script>
   ```

2. **Option 2**: Keep `is:inline` but convert to plain JavaScript
   ```diff
   - function showPanel(panelName: string) {
   -   const panel = document.getElementById(`${panelName}-panel`) as HTMLElement;
   + function showPanel(panelName) {
   +   const panel = document.getElementById(`${panelName}-panel`);
   ```

## Real-World Example: profile.astro Fix

### Before (Broken)
```typescript
<script is:inline>
  declare global {
    interface Window {
      closeProfilePanel: () => void;
    }
  }
  
  function showPanel(panelName: string) {
    const panel = document.getElementById(`${panelName}-panel`) as HTMLElement;
    panel.style.display = 'block';
  }
</script>
```

**Result**: Syntax errors prevented script execution.

### After (Working)
```javascript
<script is:inline>
  function showPanel(panelName) {
    const panel = document.getElementById(`${panelName}-panel`);
    if (panel) {
      panel.style.display = 'block';
    }
  }
</script>
```

**Result**: Script executes correctly.

## Checklist for Code Reviews

When reviewing code with inline scripts:

- [ ] If script has `is:inline`, verify it uses plain JavaScript (no TypeScript syntax)
- [ ] If script needs TypeScript, verify it doesn't have `is:inline`
- [ ] Check console for syntax errors after page load
- [ ] Verify script functionality works as expected

## Additional Resources

- Astro Docs: [Client-side Scripts](https://docs.astro.build/en/guides/client-side-scripts/)
- TypeScript Docs: [Type Declarations](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html)


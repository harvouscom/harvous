# TypeScript JSX Configuration - Critical Lessons Learned

## The Problem

When working with Astro + React, you may encounter TypeScript errors about JSX elements having implicit `any` types:

```
JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
```

**DO NOT** fix this by adding JSX compiler options to `tsconfig.json` - this will cause runtime errors!

## ❌ What NOT to Do

**Never add these to `tsconfig.json` when using Astro with React:**

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "astro"
  }
}
```

### Why This Breaks

These settings are for **pure Astro projects** without React integration. When you have `@astrojs/react` installed:

1. **TypeScript gets confused** - It treats React components as if they were Astro components
2. **Runtime errors occur** - React receives Astro component objects instead of React elements
3. **Error message**: `Objects are not valid as a React child (found: object with keys {astro:jsx, type, props})`

Astro's default configuration already handles JSX for both Astro templates AND React components correctly. Adding these settings **breaks** that automatic handling.

## ✅ The Correct Solution

### 1. Add JSX Type Declaration (TypeScript Only)

Add this to `src/env.d.ts` to fix TypeScript type errors:

```typescript
/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

// Ensure JSX types are available for Astro templates
declare namespace JSX {
  interface IntrinsicElements {
    [elem: string]: any;
  }
}
```

This tells TypeScript that HTML elements in Astro templates are valid, without interfering with React's JSX handling.

### 2. Allow Astro Directives on React Components

If you use Astro directives (`client:visible`, `client:load`, etc.) on React components, add them to your component prop interfaces:

```typescript
// In your React component file
interface MyComponentProps {
  title: string;
  'client:load'?: boolean;      // ✅ Allow Astro directives
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:only'?: string | boolean;
  slot?: string;                // ✅ Allow slot prop for Astro
  [key: string]: any;           // ✅ Or use index signature for flexibility
}
```

Or add a global declaration in `src/env.d.ts`:

```typescript
// Allow Astro directives on React components
declare module 'react' {
  interface ComponentProps<T> {
    'client:load'?: boolean;
    'client:visible'?: boolean;
    'client:idle'?: boolean;
    'client:only'?: string | boolean;
    slot?: string;
  }
}
```

### 3. Use Correct Style Syntax in Astro Templates

**In Astro templates**, use string syntax for the `style` attribute:

```astro
<!-- ✅ CORRECT - String syntax for Astro -->
<div style="max-height: 100%">

<!-- ❌ WRONG - JSX object syntax doesn't work in Astro -->
<div style={{ maxHeight: '100%' }}>
```

**In React components**, you can use either:

```tsx
// ✅ Both work in React
<div style={{ maxHeight: '100%' }}>
<div style="max-height: 100%">
```

## Current Configuration

Our `tsconfig.json` should look like this:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "resolveJsonModule": true
    // ✅ NO jsx or jsxImportSource settings!
  },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["node_modules", "dist", "public"]
}
```

## How Astro Handles JSX

Astro automatically:
- **Compiles Astro templates** to HTML (no JSX runtime needed)
- **Compiles React components** using React's JSX runtime
- **Separates concerns** - Astro components and React components are handled differently

When you add `jsx: "preserve"` and `jsxImportSource: "astro"`, you're telling TypeScript to treat **everything** as Astro JSX, which breaks React components.

## Common Errors and Solutions

### Error: "JSX element implicitly has type 'any'"
**Solution**: Add `JSX.IntrinsicElements` declaration to `src/env.d.ts` (see above)

### Error: "Property 'client:visible' does not exist on type..."
**Solution**: Add Astro directives to component prop interfaces (see above)

### Error: "Objects are not valid as a React child (found: object with keys {astro:jsx, type, props})"
**Solution**: Remove `jsx` and `jsxImportSource` from `tsconfig.json` if they exist

### Error: Style attribute syntax errors in Astro templates
**Solution**: Use string syntax `style="..."` instead of object syntax `style={{...}}` in `.astro` files

## Key Takeaways

1. **Astro's default config handles JSX correctly** - Don't override it
2. **TypeScript type errors ≠ Runtime errors** - Fix types with declarations, not compiler options
3. **Astro templates ≠ React components** - They have different syntax rules
4. **When in doubt, check Astro's React integration docs** - It handles JSX automatically

## Related Documentation

- [TYPESCRIPT_INLINE_SCRIPTS.md](./TYPESCRIPT_INLINE_SCRIPTS.md) - TypeScript in inline scripts
- [REACT_ISLANDS_STRATEGY.md](./REACT_ISLANDS_STRATEGY.md) - React components in Astro
- [COMPONENTS.md](./COMPONENTS.md) - Component system overview


import tokenSource from '../../styles/prototype-tokens.css?raw';
import type { CSSProperties } from 'react';

// Read canonical Harvous tokens instead of maintaining a second child palette.
// Re-declare derived variables in the child scope so their primitive references
// resolve locally, leaving the parent's root theme and saved preferences alone.
function declarations(source: string, selector: string) {
  const result: Record<string, string> = {};
  let cursor = 0;
  while ((cursor = source.indexOf(selector + ' {', cursor)) !== -1) {
    const start = source.indexOf('{', cursor);
    let depth = 1; let end = start + 1;
    while (depth && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
    for (const match of source.slice(start + 1, end - 1).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) result[match[1]] = match[2].trim();
    cursor = end;
  }
  return result;
}
export function createChildThemeTokens(css: string) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const base = declarations(source, ':root');
  const dark = declarations(source, ':root[data-color-scheme="dark"]');
  return (mode: 'light' | 'dark'): CSSProperties => ({ ...base, ...(mode === 'dark' ? dark : {}), colorScheme: mode } as CSSProperties);
}
export const childThemeTokens = createChildThemeTokens(tokenSource);

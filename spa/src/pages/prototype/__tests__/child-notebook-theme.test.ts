import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createChildThemeTokens } from '../child-notebook-theme';
const childThemeTokens = createChildThemeTokens(readFileSync('spa/src/styles/prototype-tokens.css', 'utf8'));

describe('child-local Harvous appearance', () => {
  it('resolves light and dark from canonical primitives and re-declares dependent colors', () => {
    const light = childThemeTokens('light') as Record<string, string>;
    const dark = childThemeTokens('dark') as Record<string, string>;
    expect(light['--pds-lch-bg-page']).toBe('100% 0 0');
    expect(dark['--pds-lch-bg-page']).toBe('18% 0.01 285');
    expect(light['--pds-bg-page']).toBe('oklch(var(--pds-lch-bg-page))');
    expect(dark['--pds-bg-page']).toBe(light['--pds-bg-page']);
    expect(dark['--pds-thread-purple']).toBe(light['--pds-thread-purple']);
    expect(light.colorScheme).toBe('light');
    expect(dark.colorScheme).toBe('dark');
  });
  it('does not change the document theme or share mutable preferences between scopes', () => {
    document.documentElement.dataset.colorScheme = 'light';
    const dark = childThemeTokens('dark') as Record<string, string>;
    dark['--pds-lch-bg-page'] = 'changed';
    expect((childThemeTokens('dark') as Record<string, string>)['--pds-lch-bg-page']).toBe('18% 0.01 285');
    expect(document.documentElement.dataset.colorScheme).toBe('light');
    delete document.documentElement.dataset.colorScheme;
  });
});

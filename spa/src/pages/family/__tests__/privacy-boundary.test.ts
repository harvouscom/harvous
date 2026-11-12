import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('isolated child entry', () => {
  it('does not load the adult shell or tracking and does not persist child notes or credentials', () => {
    const source = readFileSync('spa/src/pages/family/child-main.tsx', 'utf8');
    const html = readFileSync('spa/kids.html', 'utf8');
    expect(html).not.toContain('/src/main.tsx');
    expect(html).not.toContain('service-worker-manager');
    expect(source).not.toMatch(/import .*from ['"].*(?:clerk|posthog|diagnostics|\/api['"])/);
    expect(source).not.toMatch(/(?:localStorage|sessionStorage|indexedDB)\./);
    expect(source).toContain("credentials: 'omit'");
    expect(source).toContain("window.history.replaceState(null, '', window.location.pathname");
    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(html).toContain('connect-src');
  });
});

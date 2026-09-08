/**
 * The API bundle must not contain jsdom.
 *
 * `build:fly` bundles the whole server into one `dist-server/api.cjs` and the
 * image copies that file and nothing else. jsdom reads its own
 * `default-stylesheet.css` off disk at require time, so bundling it produces a
 * binary that builds, pushes, starts, and then dies before serving a request:
 *
 *     fatal startup error: ENOENT ... open '/browser/default-stylesheet.css'
 *
 * That is exactly what shipping Discover's server-side `safeRenderHtml` did.
 * Nothing in the failure is visible to `tsc`, to `vitest`, or to the Docker
 * build — only to production — which is why it is asserted here instead.
 *
 * Asserted against the source rather than a built artifact so it runs in the
 * ordinary suite: any server file importing the DOM-dependent renderer is the
 * thing that drags jsdom in.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER_DIR = resolve(process.cwd(), 'server');

function serverSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...serverSourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('the API bundle stays free of jsdom', () => {
  const files = serverSourceFiles(SERVER_DIR);

  it('finds server sources to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('imports neither jsdom nor a module that needs one', () => {
    const offenders = files.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return (
        /from ['"]jsdom['"]/.test(text) ||
        /from ['"]isomorphic-dompurify['"]/.test(text) ||
        // The app's own renderer is DOMPurify underneath; it belongs to the
        // browser and to Astro's build, never to this process.
        /from ['"]@\/utils\/content-renderer['"]/.test(text)
      );
    });
    expect(offenders.map((f) => f.replace(`${process.cwd()}/`, ''))).toEqual([]);
  });
});

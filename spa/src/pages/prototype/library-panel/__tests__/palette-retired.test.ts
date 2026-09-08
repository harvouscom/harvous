/**
 * The command palette stays retired.
 *
 * It merged into the Library panel: ⇧K and ⇧L both open one surface where the tabs are
 * the browsing and the query is the retrieval. A second overlay doing half of that job is
 * exactly what the merge removed, and it is the kind of thing that grows back — someone
 * needs a quick command list, the old component is still in the tree, and now there are
 * two again.
 *
 * Source-text assertions rather than behaviour, deliberately: what is being guarded here
 * is the *absence* of code, which nothing else can observe.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

describe('command palette retirement', () => {
  it('the component is gone', () => {
    expect(existsSync(resolve(root, 'spa/src/pages/prototype/PrototypeCommandPalette.tsx'))).toBe(
      false,
    );
  });

  it('nothing under pages/prototype imports cmdk', () => {
    /*
     * cmdk brought a second, incompatible focus model — its virtual `data-selected`
     * against the real DOM focus the panel's rows already use. Classic's SpotlightSearch
     * still imports it, which is why this is scoped to the prototype rather than the repo.
     */
    const files = listFiles(resolve(root, 'spa/src/pages/prototype'));
    const offenders = files.filter((file) => /^\s*import .*from 'cmdk'/m.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('its stylesheet block is gone', () => {
    const css = readFileSync(resolve(root, 'spa/src/styles/prototype-components.css'), 'utf8');
    expect(css).not.toContain('proto-command-palette');
  });

  it('the shell no longer mounts it', () => {
    const layout = readFileSync(
      resolve(root, 'spa/src/layouts/SimplifiedPrototypeLayout.tsx'),
      'utf8',
    );
    expect(layout).not.toContain('PrototypeCommandPalette');
    /* ⇧K still has to reach something — it now opens the panel's search. */
    expect(layout).toContain('prototypeShortcutOpenCommandPalette');
  });
});

/** Recursive .ts/.tsx listing, so the cmdk check cannot miss a nested directory. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    /* Skip tests — this very file names the import it is looking for. */
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') out.push(...listFiles(full));
    }
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

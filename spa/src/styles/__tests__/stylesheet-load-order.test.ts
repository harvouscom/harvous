/**
 * The prototype's component stylesheet must load before everything written to override it.
 *
 * Equal-specificity ties go to whichever rule lands later in the bundle, and prototype-shell,
 * prototype-tokens and the dock/pill sheets all override `prototype-components.css` that way —
 * `.proto-note-row__main--lead { display: grid }` over `.proto-note-row__main { display: block }`
 * is the one that broke. The order used to hold only because a component imported early (the
 * old sync chip) happened to pull this file in; #270 removed it and the Library panel's rows
 * lost their grid in production. `main.tsx` now imports it first, before `App` drags in the
 * router and its stylesheets. This keeps it there.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAIN = readFileSync(resolve(__dirname, '../../main.tsx'), 'utf8');

function importLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => /^import\s/.test(line))
    .map((line) => line.trim());
}

describe('stylesheet load order', () => {
  it('imports prototype-components.css before anything else in main.tsx', () => {
    expect(importLines(MAIN)[0]).toBe("import './styles/prototype-components.css';");
  });

  it('imports it exactly once there, so a later copy cannot move it back down', () => {
    expect(importLines(MAIN).filter((line) => line.includes('prototype-components.css'))).toHaveLength(1);
  });

  it('loads tokens and shell after it', () => {
    const lines = importLines(MAIN);
    const components = lines.indexOf("import './styles/prototype-components.css';");
    expect(lines.indexOf("import './styles/prototype-tokens.css';")).toBeGreaterThan(components);
    expect(lines.indexOf("import './styles/prototype-shell.css';")).toBeGreaterThan(components);
  });
});

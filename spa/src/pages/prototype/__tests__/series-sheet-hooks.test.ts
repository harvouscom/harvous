import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PrototypeSeriesSheet hook order', () => {
  it('calls no hook after the no-series early return', () => {
    // The sheet mounts with series=null; a hook below this return crashed the page
    // ("Rendered more hooks than during the previous render") when a series was opened.
    const src = readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeSeriesSheet.tsx'), 'utf8');
    const afterReturn = src.slice(src.indexOf('  if (!series) return null;'));
    expect(afterReturn).not.toMatch(/\buse(State|Effect|Ref|Memo|Callback|LayoutEffect|Context)\(/);
  });
});

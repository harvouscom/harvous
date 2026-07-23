import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spaceCoverApiFields } from '@/utils/space-cover';

const dashboardSource = readFileSync(resolve(process.cwd(), 'server/utils/dashboard-data.ts'), 'utf8');
const fnStart = dashboardSource.indexOf('export async function getSpacesWithCounts');
const mappedStart = dashboardSource.indexOf('const mapped = spacesWithThreadCounts.map', fnStart);
const mappedEnd = dashboardSource.indexOf('return attachChurchNamesToSpaces(mapped)', mappedStart);
const mappedBlock = dashboardSource.slice(mappedStart, mappedEnd);

describe('getSpacesWithCounts cover fields', () => {
  it('keeps coverBgLight / coverBgDark on the mapped owner-space objects used by prefetch', () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(mappedStart).toBeGreaterThan(-1);
    expect(mappedBlock).toContain('coverBgLight: space.coverBgLight');
    expect(mappedBlock).toContain('coverBgDark: space.coverBgDark');
  });
});

describe('spaceCoverApiFields (prefetch owner-path contract)', () => {
  it('falls back to family variant 1 when covers are missing (the pre-fix bug)', () => {
    const fields = spaceCoverApiFields(undefined, undefined, 'purple');
    expect(fields.coverBgLight).toEqual({ kind: 'image-preset', presetId: 'purple-1' });
  });

  it('preserves a saved non-default variant from stored cover JSON', () => {
    const fields = spaceCoverApiFields(
      '{"kind":"image-preset","presetId":"purple-3"}',
      '{"kind":"image-preset","presetId":"purple-3-dark"}',
      'purple',
    );
    expect(fields.coverBgLight).toEqual({ kind: 'image-preset', presetId: 'purple-3' });
    expect(fields.coverBgDark).toEqual({ kind: 'image-preset', presetId: 'purple-3-dark' });
  });
});

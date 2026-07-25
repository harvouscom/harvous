import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('user church connection route contracts', () => {
  const route = () => source('server/routes/user.ts');

  it('links HMC picks to registered Churches on update-church', () => {
    expect(route()).toContain("from '../utils/church-connection'");
    expect(route()).toContain('connectionFieldsForHmcChurchId');
    expect(route()).toContain('connectedChurchId: connection.connectedChurchId');
    expect(route()).toContain('connectedOrgId: connection.connectedOrgId');
    expect(route()).toContain('connectedChurchAt: connection.connectedChurchAt');
  });

  it('reconciles connected* on get-profile when HMC is set but org is missing', () => {
    const text = route();
    expect(text).toContain('churchData.hmcChurchId && !churchData.connectedOrgId');
    expect(text.indexOf('get-profile')).toBeLessThan(
      text.indexOf('churchData.hmcChurchId && !churchData.connectedOrgId'),
    );
  });
});

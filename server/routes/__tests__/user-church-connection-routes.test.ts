import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('user church connection route contracts', () => {
  const route = () => source('server/routes/user.ts');

  const updateChurch = () => {
    const text = route();
    const start = text.indexOf("app.post('/api/user/update-church'");
    return text.slice(start, text.indexOf('\napp.', start + 1));
  };

  it('links HMC picks to registered Churches on update-church', () => {
    expect(route()).toContain("from '../utils/church-connection'");
    expect(updateChurch()).toContain('await connectionFieldsForHmcChurchId(nextHmc)');
    // The write itself is shared with the join link — see church-selection-write.ts.
    expect(updateChurch()).toContain('await persistChurchSelection(');
    expect(updateChurch()).toMatch(/persistChurchSelection\(\{[\s\S]*?\bconnection,/);
    const helper = source('server/utils/church-selection-write.ts');
    expect(helper).toContain('connectedChurchId: connection.connectedChurchId');
    expect(helper).toContain('connectedOrgId: connection.connectedOrgId');
    expect(helper).toContain('connectedChurchAt: connection.connectedChurchAt');
  });

  it('keeps a link-only connection through a same-church manual re-save', () => {
    const text = updateChurch();
    const guard = text.indexOf('keepLinkOnlyConnection(existing.connectedChurchId');
    expect(guard).toBeGreaterThan(-1);
    // Only when nothing re-derived a connection: a directory pick still wins.
    expect(text.slice(guard - 300, guard)).toContain('!connection.connectedChurchId');
    expect(guard).toBeLessThan(text.indexOf('await persistChurchSelection('));
  });

  it('reconciles connected* on get-profile when HMC is set but org is missing', () => {
    const text = route();
    expect(text).toContain('churchData.hmcChurchId && !churchData.connectedOrgId');
    expect(text.indexOf('get-profile')).toBeLessThan(
      text.indexOf('churchData.hmcChurchId && !churchData.connectedOrgId'),
    );
  });
});

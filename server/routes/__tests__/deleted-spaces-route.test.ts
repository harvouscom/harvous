import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const spacesSource = readFileSync(resolve(process.cwd(), 'server/routes/spaces.ts'), 'utf8');
const endpointStart = spacesSource.indexOf("route.get('/api/spaces/deleted'");
const endpointEnd = spacesSource.indexOf("route.post('/api/spaces/:spaceId/restore'", endpointStart);
const endpoint = spacesSource.slice(endpointStart, endpointEnd);

describe('GET /api/spaces/deleted', () => {
  it('is a safely ordered authenticated owner-only static route', () => {
    expect(endpointStart).toBeGreaterThan(-1);
    expect(endpointStart).toBeLessThan(spacesSource.indexOf("route.post('/api/spaces/:spaceId/restore'"));
    expect(endpoint).toContain("route.get('/api/spaces/deleted', requireAuth");
    expect(endpoint).toContain('eq(Spaces.userId, auth.userId)');
  });

  it('returns only unexpired non-personal inactive recovery rows in deterministic order', () => {
    expect(endpoint).toContain("ne(Spaces.type, 'personal')");
    expect(endpoint).toContain('isNotNull(Spaces.deletedAt)');
    expect(endpoint).toContain('isNotNull(Spaces.recoveryUntil)');
    expect(endpoint).toContain('gte(Spaces.recoveryUntil, now)');
    expect(endpoint).toContain('eq(Spaces.isActive, false)');
    expect(endpoint).toContain('.orderBy(asc(Spaces.recoveryUntil), asc(Spaces.title), asc(Spaces.id))');
    expect(endpoint).toContain('runBoundedExpiredSpaceMaintenance(now)');
  });

  it('serializes only safe space metadata without notes, members, or invites', () => {
    for (const field of [
      'id: Spaces.id',
      'title: Spaces.title',
      'color: Spaces.color',
      'backgroundGradient: Spaces.backgroundGradient',
      'coverBgLight: Spaces.coverBgLight',
      'coverBgDark: Spaces.coverBgDark',
      'deletedAt: Spaces.deletedAt',
      'recoveryUntil: Spaces.recoveryUntil',
    ]) {
      expect(endpoint).toContain(field);
    }
    expect(endpoint).not.toContain('.from(Notes)');
    expect(endpoint).not.toContain('.from(SpaceMemberships)');
    expect(endpoint).not.toContain('.from(SpaceInvites)');
    expect(endpoint).toContain('deletedAt: space.deletedAt?.toISOString() ?? null');
    expect(endpoint).toContain('recoveryUntil: space.recoveryUntil?.toISOString() ?? null');
  });
});

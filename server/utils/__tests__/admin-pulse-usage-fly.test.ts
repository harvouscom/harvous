/**
 * Source contract: Pulse and Usage must not pin Fly's shared Postgres pool.
 *
 * After the API moved to one always-on process, these two dashboards never
 * loaded. The cause is in the shape of the work: a 20-wide Promise.all of
 * COUNT DISTINCT queries plus a full NoteConnections graph walk, against a
 * pool of ten, with no in-process cache and a browser fetch that waited
 * forever. Netlify hid it — each isolate had its own pool. Fly does not.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const fnBody = (path: string, exportName: string) => {
  const text = source(path);
  const start = text.indexOf(`export async function ${exportName}`);
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('\nexport ', start + 1);
  return text
    .slice(start, end > start ? end : undefined)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
};

describe('admin Pulse / Usage on Fly', () => {
  it('serves Pulse and Usage from the in-process cache', () => {
    const routes = source('server/routes/admin.ts');
    expect(routes).toContain("from '../utils/admin-dashboard-cache'");
    expect(routes).toContain("cachedAdminDashboard(`pulse:${days}`");
    expect(routes).toContain("cachedAdminDashboard(`usage-overview:${days}`");
    expect(routes).toContain("cachedAdminDashboard(`usage-trends:${days}`");
    expect(routes).toContain("cachedAdminDashboard(`usage-discovery:${days}`");
  });

  it('does not open Pulse aggregations all at once', () => {
    const body = fnBody('server/utils/admin-pulse-stats.ts', 'getAdminPulse');
    expect(body).toContain('runBounded');
    expect(body).not.toMatch(/await Promise\.all\(\[/);
  });

  it('does not open Usage overview aggregations all at once', () => {
    const body = fnBody('server/utils/admin-usage-stats.ts', 'getUsageOverview');
    expect(body).toContain('runBounded');
    expect(body).not.toMatch(/await Promise\.all\(\[/);
  });

  /*
   * The paid split reads Entitlements, not the retired `UserMetadata.tier` label.
   *
   * `tier` still exists and is still written — a support surface reads it — so nothing stops
   * someone reaching for it again here, where it is the wrong source. fnBody strips comments,
   * so the docblock naming the column does not trip this.
   */
  it('does not bucket Usage accounts by the retired tier column', () => {
    const body = fnBody('server/utils/admin-usage-stats.ts', 'getUsageOverview');
    expect(body).not.toContain('UserMetadata.tier');
  });

  it('does not block Pulse on a cold full-platform graph walk', () => {
    const threads = source('server/utils/admin-pulse-threads-stats.ts');
    expect(threads).toContain('getPlatformThreadSnapshot');
    expect(threads).toContain('fetchCheapThreadSnapshot');
    expect(threads).toContain('refreshPlatformThreadSnapshot');
    const stats = fnBody('server/utils/admin-pulse-threads-stats.ts', 'getAdminPulseThreadsStats');
    expect(stats).not.toContain('fetchPlatformThreadSnapshot()');
  });

  it('times out the admin browser fetch so Loading… cannot last forever', () => {
    const pulse = source('src/hooks/queries/useAdminPulse.ts');
    const usage = source('src/hooks/queries/useAdminUsage.ts');
    expect(pulse).toContain('AbortSignal.timeout');
    expect(usage).toContain('AbortSignal.timeout');
    expect(pulse).toMatch(/retry:\s*1/);
    expect(usage).toMatch(/retry:\s*1/);
  });
});

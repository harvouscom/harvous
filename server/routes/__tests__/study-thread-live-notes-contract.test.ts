import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const LIVE = 'noteConnectionEndpointsLive()';

/** The text of one function or route handler, from its declaration to the next top-level one. */
function section(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(from, `missing: ${start}`).toBeGreaterThanOrEqual(0);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to === -1 ? undefined : to);
}

describe('Threads are built only from connections whose notes still exist', () => {
  it('filters the Threads list edges before choosing representatives', () => {
    const handler = section(
      source('server/routes/spaces.ts'),
      "route.get('/api/spaces/:spaceId/study-threads', requireAuth",
      '// Build adjacency list',
    );
    expect(handler).toContain(LIVE);
  });

  it('filters the thread graph that GET /api/notes/:id/thread opens', () => {
    expect(source('server/utils/study-thread-graph.ts')).toContain(LIVE);
    expect(
      section(source('server/utils/study-thread-space.ts'), 'async function fetchDirectConnectionsOnNote', 'export function'),
    ).toContain(LIVE);
  });

  it('filters every other cluster builder so counts and representatives agree with the list', () => {
    const clusterCount = source('server/utils/study-thread-cluster-count.ts');
    expect(section(clusterCount, 'async function fetchUserClusterInputs', 'export async function')).toContain(LIVE);
    expect(section(clusterCount, 'export async function countStudyThreadClustersPlatform', 'async function countLegacy')).toContain(LIVE);
    expect(
      section(source('server/utils/study-bible-layer.ts'), 'export async function threadTouchForNote', 'catch (error)'),
    ).toContain(LIVE);
    expect(
      section(source('server/utils/admin-pulse-threads-stats.ts'), 'async function fetchPlatformThreadSnapshot', 'const edgesByUser'),
    ).toContain(LIVE);
  });

  it('does not ship dead edges to synced clients on bootstrap or changes', () => {
    const sync = source('server/routes/sync.ts');
    expect(sync.split(LIVE).length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe('dead connections are not written back', () => {
  it('rebuilds linkedFrom edges only from source notes that still exist', () => {
    const migration = section(
      source('server/utils/prototype-user-migration.ts'),
      'export async function migrateLinkedFromNoteConnectionsForUser',
      'db.insert(NoteConnections)',
    );
    expect(migration).toContain('linkedFromNoteIsLiveOwned()');
  });

  it('clears linkedFromNoteId pointers to deleted notes inside the delete cascade', () => {
    const cascade = source('server/utils/delete-note-cascade.ts');
    const clear = cascade.indexOf('.set({ linkedFromNoteId: null })');
    expect(clear).toBeGreaterThan(cascade.indexOf('.delete(NoteConnections)'));
    expect(clear).toBeLessThan(cascade.indexOf('.delete(Notes)'));
  });
});

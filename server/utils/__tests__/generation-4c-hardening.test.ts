import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Generation 4C public route containment', () => {
  it('synchronizes the scoped html class for TanStack client navigation', () => {
    const app = source('spa/src/App.tsx');
    const bridgeStart = app.indexOf('function PublicRouteClassBridge');
    const bridgeEnd = app.indexOf('function PendingAuthRedirectBridge', bridgeStart);
    const bridge = app.slice(bridgeStart, bridgeEnd);

    expect(bridge).toContain('syncPublicRouteHtmlClass');
    expect(bridge).toContain("router.subscribe('onBeforeNavigate'");
    expect(bridge).toContain("router.subscribe('onResolved'");
  });

  it('wires the public toolbar sign-in action through the standardized pending writer', () => {
    const toolbar = source('spa/src/pages/public/public-shared.tsx');
    expect(toolbar).toContain('writePublicToolbarPendingRedirect(redirectUrl)');
    expect(toolbar).toContain('return writePendingAuthRedirect(destination)');
  });
});

describe('Generation 4C deletion lifecycle', () => {
  it('uses the live 30-day recovery and note-retention policy copy', () => {
    const people = source('spa/src/pages/prototype/PrototypeSpacePeopleSheet.tsx');
    const confirmStart = people.indexOf('{deleteConfirmOpen && deleteConfirmAnchor');
    const confirmEnd = people.indexOf('      ) : null}', confirmStart);
    const confirm = people.slice(confirmStart, confirmEnd);

    // Copy was tightened from a multi-sentence explanation to one concise line;
    // the policy (30-day restore, notes stay in My Home) is unchanged.
    expect(confirm).toContain('Restore within 30 days; notes stay in My Home.');
    expect(confirm).not.toContain('Permanent for everyone');
    expect(confirm).toContain('anchorRect={deleteConfirmAnchor}');

    const handlerStart = people.indexOf('function handleConfirmDeleteSpace');
    const handlerEnd = people.indexOf('const members =', handlerStart);
    const handler = people.slice(handlerStart, handlerEnd);
    expect(handler).toContain('setActiveSpaceId(null)');
    // No `as any`: prototypeHomeRouteTo() now returns a type the router's `to` accepts,
    // so this call site is genuinely type-checked rather than cast past the checker.
    expect(handler).toContain('navigate({ to: prototypeHomeRouteTo(), replace: true })');
    expect(handler).not.toContain('setTimeout');
  });

  it('rate-limits deletion and distinguishes repeat/not-found lifecycle errors', () => {
    const spaces = source('server/routes/spaces.ts');
    const deleteStart = spaces.indexOf("route.delete('/api/spaces/delete'");
    const deleteEnd = spaces.indexOf('// ─── GET /api/spaces/deleted', deleteStart);
    const deleteRoute = spaces.slice(deleteStart, deleteEnd);

    expect(deleteRoute).toContain("requireAuth, rateLimit('write')");
    expect(deleteRoute).toContain("code: 'ALREADY_DELETED' }, 409");
    expect(deleteRoute).toContain("'Space not found or access denied' }, 404");
    expect(deleteRoute).toContain('error instanceof SharedSpaceLifecycleError');
    expect(deleteRoute.indexOf('error instanceof SharedSpaceLifecycleError')).toBeLessThan(
      deleteRoute.indexOf('handleAPIError(error'),
    );
  });
});

describe('Generation 4C deleted-space Thread filtering', () => {
  it('preserves null/personal Threads and excludes soft-deleted collaborative space Threads', () => {
    const data = source('server/utils/dashboard-data.ts');
    const predicateStart = data.indexOf('export function activeOwnerThreadSpacePredicate');
    const predicateEnd = data.indexOf('/**\n * Find (or create)', predicateStart);
    const predicate = data.slice(predicateStart, predicateEnd);
    const allThreadsStart = data.indexOf('export async function getAllThreadsWithCounts');
    const allThreadsEnd = data.indexOf('export async function getSpacesWithCounts', allThreadsStart);
    const singleStart = data.indexOf('export async function getThreadWithCount');
    const singleEnd = data.indexOf('export async function getThreadsWithCountsLimited', singleStart);
    const limitedStart = data.indexOf('export async function getThreadsWithCountsLimited');
    const limitedEnd = data.indexOf('export async function getThreadColorsForNotesBatch', limitedStart);

    expect(predicate).toContain('${Threads.spaceId} IS NULL');
    expect(predicate).toContain('OR EXISTS');
    expect(predicate).toContain("${Spaces.type} = 'personal'");
    expect(predicate).toContain('${Spaces.deletedAt} IS NULL');
    expect(data.slice(allThreadsStart, allThreadsEnd)).toContain('activeOwnerThreadSpacePredicate()');
    expect(data.slice(singleStart, singleEnd)).toContain('activeOwnerThreadSpacePredicate()');
    expect(data.slice(limitedStart, limitedEnd)).toContain('activeOwnerThreadSpacePredicate()');
  });
});

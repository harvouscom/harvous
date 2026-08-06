/**
 * Contract tests for the church library's two lanes.
 *
 * Source assertions rather than a running server, matching the house pattern in
 * church-space-plan-routes.test.ts. What they protect is the difference between
 * the lanes: the staff lane may take an `orgId` because it gates on it, and the
 * congregant lane must never take one at all.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = () => source('server/routes/church-library.ts');
const access = () => source('server/utils/church-library-access.ts');

/** Source of one handler, from its `app.<verb>(` to the next one. */
function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const WRITE_HANDLERS = [
  "app.post('/api/church/library/items/create'",
  "app.post('/api/church/library/items/update'",
  "app.post('/api/church/library/items/archive'",
] as const;

describe('church library routes', () => {
  it.each(WRITE_HANDLERS)('gates %s on manage_library before any DB access', (marker) => {
    const body = handlerBody(routes(), marker);
    const gateAt = body.indexOf('assertCanManageChurchLibrary');
    expect(gateAt, 'handler has no curation gate').toBeGreaterThan(-1);
    for (const write of ['db.insert(', 'db.update(', 'db.delete(', 'db.transaction(']) {
      const at = body.indexOf(write);
      if (at === -1) continue;
      expect(gateAt, `${write} runs before the gate`).toBeLessThan(at);
    }
  });

  it.each(WRITE_HANDLERS)('rate-limits %s', (marker) => {
    const body = handlerBody(routes(), marker);
    expect(body).toContain("rateLimit('write')");
  });

  it('lets a teacher browse the catalog without the right to curate it', () => {
    // Picking a resource for what you teach is not deciding what the church
    // keeps. `sermon_tools`, not `manage_library`.
    const body = handlerBody(routes(), "app.get('/api/church/library'");
    expect(body).toContain('assertCanViewChurchLibrary');
    expect(body).not.toContain('assertCanManageChurchLibrary');
    expect(access()).toMatch(/assertCanViewChurchLibrary[\s\S]*?capability: 'sermon_tools'/);
  });

  it('never takes an orgId on the congregant read', () => {
    // The whole reason a congregant cannot be pointed at another church's
    // shelf. Same rule server/routes/church.ts is contract-tested on.
    const body = handlerBody(routes(), "app.get('/api/library/church'");
    expect(body).not.toMatch(/c\.req\.query\(['"]orgId/);
    expect(body).not.toMatch(/body\.orgId/);
    expect(body).toContain('resolveChurchLibraryViewer(auth.userId)');
  });

  it('filters leaders-only items out of the congregant read', () => {
    const body = handlerBody(routes(), "app.get('/api/library/church'");
    expect(body).toMatch(/access === 'leaders'/);
    expect(body).toContain('scopesAdmitViewer');
  });

  it('never serializes who added an item to congregants', () => {
    // `access` is an audience label and ships; `createdByUserId` names a member
    // of staff to the congregation and must stay in the staff shape only.
    const text = routes();
    const congregantShape = text.slice(
      text.indexOf('function serializeChurchItem'),
      text.indexOf('function serializeStaffItem'),
    );
    expect(congregantShape).toContain('access: row.access');
    expect(congregantShape).not.toContain('createdByUserId');
    expect(congregantShape).not.toContain('fileStorageKey');
    expect(congregantShape).not.toContain('archivedAt');
  });

  it('keeps reads unsponsored and writes sponsored', () => {
    // A lapsed church keeps the library its people already have; only curation
    // stops. Same bargain org note templates strike.
    const text = access();
    expect(text).toMatch(
      /assertCanManageChurchLibrary[\s\S]*?capability: 'manage_library'[\s\S]*?sponsorshipGated: true/,
    );
    expect(text).toMatch(
      /assertCanViewChurchLibrary[\s\S]*?capability: 'sermon_tools'[\s\S]*?sponsorshipGated: false/,
    );
  });

  it('refuses the ministry scope kind rather than writing unqueryable rows', () => {
    const text = routes();
    expect(text).toContain('SCOPE_KIND_UNSUPPORTED');
    expect(access()).toContain("WRITABLE_SCOPE_KINDS = ['org', 'space']");
  });

  it('validates every scoped space belongs to this church', () => {
    // Otherwise a curator could scope an item into another church's room, and
    // it would surface in that church's members' sidebars.
    const text = routes();
    const fn = text.slice(text.indexOf('async function resolveScopes'), text.indexOf('/** Replace'));
    expect(fn).toContain('row.orgId === orgId');
    expect(fn).toContain('isChurchOrgSpaceRow(row)');
  });

  it('resolves items through the library, never from the request', () => {
    // An id from another church's shelf — or a personal one — must read as
    // "not found" rather than confirming it exists.
    for (const marker of [
      "app.post('/api/church/library/items/update'",
      "app.post('/api/church/library/items/archive'",
    ]) {
      const body = handlerBody(routes(), marker);
      expect(body, marker).toContain('eq(LibraryItems.libraryId, library.id)');
    }
  });
});

describe('resolveVisibleItem', () => {
  it('checks personal ownership before doing any church work', () => {
    // The overwhelming majority of resolutions are personal and need no church
    // lookup; putting that first keeps dock chips cheap.
    const text = access();
    const fn = text.slice(text.indexOf('export async function resolveVisibleItem'));
    expect(fn.indexOf("ownerKind, 'user'")).toBeLessThan(fn.indexOf('resolveChurchLibraryViewer'));
  });

  it('applies audience and scope before returning a church item', () => {
    const text = access();
    const fn = text.slice(text.indexOf('export async function resolveVisibleItem'));
    expect(fn).toMatch(/access === 'leaders' && !viewer\.seesLeaderOnly/);
    expect(fn).toContain('scopesAdmitViewer');
  });

  it('treats an unscoped item as church-wide', () => {
    // What a plain "add to the library" and a suggestion approval both produce.
    // Treating it as invisible would make the common case the broken one.
    const text = access();
    const fn = text.slice(text.indexOf('export function scopesAdmitViewer'));
    expect(fn).toMatch(/scopes\.length === 0.*return true/s);
  });
});

describe('suggestion box', () => {
  const suggestions = () => source('server/routes/church-library-suggestions.ts');

  it('takes no orgId on either congregant endpoint', () => {
    // A suggestion can only ever be addressed to the church the caller
    // actually belongs to.
    for (const marker of [
      "app.post('/api/church/library/suggestions/create'",
      "app.get('/api/church/library/suggestions/mine'",
    ]) {
      const body = handlerBody(suggestions(), marker);
      expect(body, marker).not.toMatch(/c\.req\.query\(['"]orgId/);
      expect(body, marker).not.toMatch(/body\.orgId/);
      expect(body, marker).toContain('resolveChurchLibraryViewer(auth.userId)');
    }
  });

  it('scopes "mine" to the caller in the query, not after the fact', () => {
    const body = handlerBody(suggestions(), "app.get('/api/church/library/suggestions/mine'");
    expect(body).toContain('eq(LibraryItemSuggestions.suggestedByUserId, auth.userId)');
  });

  it('never returns a suggester name outside the manage-gated queue', () => {
    // The attribution exception is confined to the staff queue. If this starts
    // failing, a congregant-facing surface has started naming people.
    const text = suggestions();
    const queue = handlerBody(text, "app.get('/api/church/library/suggestions'");
    expect(queue).toContain('assertCanManageChurchLibrary');
    expect(queue).toContain('suggestedByName:');

    for (const marker of [
      "app.post('/api/church/library/suggestions/create'",
      "app.get('/api/church/library/suggestions/mine'",
    ]) {
      // The emitted key, not the word: a handler slice runs to the next
      // `app.`, so it picks up the following handler's docblock, and that
      // docblock legitimately names the field it is explaining.
      expect(handlerBody(text, marker), marker).not.toContain('suggestedByName:');
    }
    // `serializeMine` is what both congregant paths return.
    const mine = text.slice(text.indexOf('function serializeMine'), text.indexOf('// ─── POST'));
    expect(mine).not.toContain('suggestedByUserId');
    expect(mine).not.toContain('reviewedByUserId');
  });

  it('keeps the only user-column read in this one file', () => {
    // "Review is never shared" protects observed behaviour; a submission is a
    // different kind of fact. The exception must not spread — if another
    // church-facing route starts reading names, this test should be the thing
    // that makes someone justify it.
    const text = suggestions();
    expect(text).toContain('UserMetadata.firstName');
    for (const path of [
      'server/routes/church-library.ts',
      'server/routes/church-space-library.ts',
    ]) {
      expect(source(path), `${path} reads a user column`).not.toContain('UserMetadata');
    }
  });

  it('approves inside a transaction so a status change cannot outlive its item', () => {
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/review'");
    const txAt = body.indexOf('db.transaction(');
    expect(txAt).toBeGreaterThan(-1);
    expect(body.indexOf('tx.insert(LibraryItems)')).toBeGreaterThan(txAt);
    expect(body.indexOf('tx\n        .update(LibraryItemSuggestions)')).toBeGreaterThan(txAt);
  });

  it('refuses a second review rather than creating a duplicate item', () => {
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/review'");
    expect(body).toContain('ALREADY_REVIEWED');
    expect(body).toMatch(/status !== 'open'/);
  });

  it('caps open suggestions per person', () => {
    const text = suggestions();
    expect(text).toContain('OPEN_SUGGESTIONS_MAX');
    expect(text).toContain('SUGGESTION_LIMIT');
  });
});

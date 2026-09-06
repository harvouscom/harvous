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

describe('space lane', () => {
  const spaceRoutes = () => source('server/routes/church-space-library.ts');

  const SPACE_WRITE_HANDLERS = [
    "app.post(\n  '/api/church/spaces/:spaceId/library/items/create'",
    "app.post(\n  '/api/church/spaces/:spaceId/library/items/upload'",
    "app.post(\n  '/api/church/spaces/:spaceId/library/pins/set'",
    "app.post(\n  '/api/church/spaces/:spaceId/library/items/archive'",
    "app.post(\n  '/api/church/spaces/:spaceId/library/items/update'",
  ] as const;

  it.each(SPACE_WRITE_HANDLERS)('gates %s before any DB access', (marker) => {
    const body = handlerBody(spaceRoutes(), marker);
    const gateAt = body.indexOf('assertCanManageSpaceLibrary');
    expect(gateAt, 'handler has no curation gate').toBeGreaterThan(-1);
    for (const write of ['db.insert(', 'db.update(', 'db.delete(', 'db.transaction(']) {
      const at = body.indexOf(write);
      if (at === -1) continue;
      expect(gateAt, `${write} runs before the gate`).toBeLessThan(at);
    }
  });

  it.each(SPACE_WRITE_HANDLERS)('rate-limits %s', (marker) => {
    expect(handlerBody(spaceRoutes(), marker)).toContain("rateLimit('write')");
  });

  it('never lets a space write reach org scope', () => {
    // A leader curating their own room must not be able to publish to the whole
    // church. Scope is the room in the path, never a body field.
    for (const marker of SPACE_WRITE_HANDLERS.slice(0, 2)) {
      const body = handlerBody(spaceRoutes(), marker);
      expect(body, marker).toContain("scopeKind: 'space'");
      expect(body, marker).not.toMatch(/scopeKind:\s*'org'/);
      expect(body, marker).not.toContain('body.scopes');
      expect(body, marker).toContain('spaceId: gate.space.id');
    }
  });

  it('writes a scope row only in the church lane', () => {
    // A space-owned item's library *is* its scope; a second statement of it
    // could disagree with the first.
    for (const marker of SPACE_WRITE_HANDLERS.slice(0, 2)) {
      const body = handlerBody(spaceRoutes(), marker);
      const scopeInsert = body.indexOf('tx.insert(LibraryItemScopes)');
      expect(scopeInsert, marker).toBeGreaterThan(-1);
      expect(body.slice(0, scopeInsert), marker).toMatch(/gate\.lane === 'church'/);
    }
  });

  it('pins only items from the library the room actually curates', () => {
    // Otherwise a leader could pin a row off another church's — or another
    // room's — shelf into their own.
    const body = handlerBody(spaceRoutes(), SPACE_WRITE_HANDLERS[2]);
    expect(body).toContain('findChurchLibrary(gate.church.id)');
    expect(body).toContain('findSpaceLibrary(gate.space.id)');
    expect(body).toContain('eq(LibraryItems.libraryId, library.id)');
  });

  it('answers canManage from the write gate, not the read gate', () => {
    // `sermon_tools` lets a teacher read leaders-only material; it does not let
    // them curate. Deriving canManage from the read gate would hand them the
    // add affordances and then have the server refuse.
    const body = handlerBody(spaceRoutes(), "app.get('/api/spaces/:spaceId/library'");
    expect(body).toMatch(/canManage:[\s\S]{0,120}assertCanManageSpaceLibrary/);
    expect(body).not.toMatch(/canManage:\s*seesLeaderOnly/);
  });

  it('gives a personal space no shelf in either direction', () => {
    // A shelf is a thing a room shows other people.
    const body = handlerBody(spaceRoutes(), "app.get('/api/spaces/:spaceId/library'");
    expect(body).toMatch(/space\.type === 'personal'/);
    expect(access()).toMatch(/space\.type === 'personal'\) return refusal/);
  });

  it('gates a churchless room on who runs it, not on church capabilities', () => {
    const text = access();
    const fn = text.slice(
      text.indexOf('export async function assertCanManageSpaceLibrary'),
      text.indexOf('async function memberSpaceIdsForChurch'),
    );
    expect(fn).toContain('canManageSpaceStructure(space, role)');
    expect(fn).toMatch(/lane: 'space'/);
    expect(fn).toMatch(/lane: 'church'/);
  });
});

describe('resolveVisibleItem, space-owned lane', () => {
  it('admits a space item on membership alone', () => {
    // Space-owned items carry no audience or scope rows — the room they belong
    // to already answers both questions.
    const text = access();
    const fn = text.slice(text.indexOf('export async function resolveVisibleItem'));
    const at = fn.indexOf("ownerKind, 'space'");
    expect(at).toBeGreaterThan(-1);
    expect(fn.indexOf("ownerKind, 'user'")).toBeLessThan(at);
    expect(fn.slice(at)).toContain('SpaceMemberships.userId, userId');
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
      "app.post('/api/church/library/suggestions/withdraw'",
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

  it('keeps the only user-column read behind one helper, imported by the two suggestion routes alone', () => {
    // "Review is never shared" protects observed behaviour; a submission is a
    // different kind of fact. The exception must not spread — if another
    // church-facing route starts reading names, this test should be the thing
    // that makes someone justify it. The read itself lives in
    // suggestion-display-names.ts; the church library box and the space
    // study box are its only importers.
    expect(source('server/utils/suggestion-display-names.ts')).toContain('UserMetadata.firstName');
    expect(suggestions()).toContain("from '../utils/suggestion-display-names'");
    expect(source('server/routes/space-study-suggestions.ts')).toContain(
      "from '../utils/suggestion-display-names'",
    );
    for (const path of [
      'server/routes/church-library.ts',
      'server/routes/church-space-library.ts',
    ]) {
      const text = source(path);
      expect(text, `${path} reads a user column`).not.toContain('UserMetadata');
      expect(text, `${path} imports the name helper`).not.toContain('suggestion-display-names');
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

  it('lets someone take back only their own, and only while it waits', () => {
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/withdraw'");
    // All four in the query. Filtering after the fact is how a delete reaches a
    // row that was never the caller's.
    expect(body).toContain('eq(LibraryItemSuggestions.suggestedByUserId, auth.userId)');
    expect(body).toContain("eq(LibraryItemSuggestions.status, 'open')");
    expect(body).toContain('eq(LibraryItemSuggestions.churchId, viewer.church.id)');
    expect(body).toContain('db\n      .delete(LibraryItemSuggestions)');
  });

  it('will not delete a suggestion that has been decided', () => {
    // An approved one has a library item behind it; a delete here orphans it.
    // A declined one is the church's record of what was asked.
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/withdraw'");
    expect(body).not.toMatch(/status, 'approved'/);
    expect(body).not.toMatch(/status, 'declined'/);
  });

  it('answers a withdraw the same way whoever asks', () => {
    // Never yours, already decided, or never existed all read as not found, so
    // a probe cannot tell them apart.
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/withdraw'");
    expect(body.match(/SUGGESTION_NOT_FOUND/g)?.length).toBeGreaterThanOrEqual(2);
    /* The emitted key, not the word — a handler slice runs to the next `app.`
       and picks up the following docblock, which names the field it explains.
       The same trap the attribution test above documents. */
    expect(body).not.toContain('suggestedByName:');
  });

  it('marks read on reading, not on deciding', () => {
    /* The bug this closes: `staffReadAt` was only ever written by a review, so
       every waiting suggestion had a null in it and an unread badge counting
       nulls would have counted the queue. Reading is its own event now, the way
       `admin-support-tickets.ts` stamps a ticket when it is opened. */
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/mark-read'");
    expect(body).toContain('assertCanManageChurchLibrary');
    expect(body).toContain('staffReadAt: new Date()');
    expect(body).toMatch(/status, 'open'/);
    expect(body).toContain('isNull(LibraryItemSuggestions.staffReadAt)');
  });

  it('never lets marking read overwrite when a decision was made', () => {
    // A reviewed row carries the time it was decided. Someone scrolling past it
    // afterwards must not restamp that.
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/mark-read'");
    expect(body).toContain('isNull(LibraryItemSuggestions.staffReadAt)');
    expect(body).not.toMatch(/status, 'approved'/);
    expect(body).not.toMatch(/status, 'declined'/);
  });

  it('marking read names nobody', () => {
    const body = handlerBody(suggestions(), "app.post('/api/church/library/suggestions/mark-read'");
    expect(body).not.toContain('suggestedByName');
    expect(body).not.toContain('displayNamesFor');
  });

  it('caps open suggestions per person', () => {
    const text = suggestions();
    expect(text).toContain('OPEN_SUGGESTIONS_MAX');
    expect(text).toContain('SUGGESTION_LIMIT');
  });
});

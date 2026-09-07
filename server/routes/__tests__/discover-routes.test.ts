/**
 * Contract tests for the Discover catalog.
 *
 * Source assertions rather than a running server, matching the house pattern in
 * church-library-routes.test.ts. What they protect is the seam this feature
 * introduces: the first anonymous read of a user-authored, user-named artifact.
 * Every rule below is one that is cheap to hold now and expensive to discover
 * has been broken.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = () => source('server/routes/discover.ts');
const snapshot = () => source('server/utils/discover-snapshot.ts');
const install = () => source('server/utils/discover-install.ts');

/** Source of one handler, from its `app.<verb>(` to the next one. */
function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const PUBLIC_HANDLERS = [
  "app.get('/api/discover/listings',",
  "app.get('/api/discover/listings/:slug',",
  // The static site's build reads this. It must stay anonymous and stay
  // payload-free for exactly the same reasons the other two do.
  "app.get('/api/discover/export',",
] as const;

const ADMIN_HANDLERS = [
  "app.get('/api/admin/discover/submissions'",
  "app.post('/api/admin/discover/review'",
  "app.post('/api/admin/discover/delist'",
  "app.post('/api/admin/discover/mark-read'",
] as const;

describe('discover routes', () => {
  it('is mounted, or none of the rest of this matters', () => {
    const app = source('server/app.ts');
    expect(app).toContain("import discover from './routes/discover'");
    expect(app).toContain("app.route('/', discover)");
  });

  it.each(PUBLIC_HANDLERS)('%s filters to listed rows in the query itself', (marker) => {
    const body = handlerBody(routes(), marker);
    expect(body).toContain("eq(DiscoverListings.status, 'listed')");
  });

  it.each(PUBLIC_HANDLERS)('%s is anonymous on purpose and stays that way', (marker) => {
    // A route is public here by omitting requireAuth. If someone adds it, the
    // static site's build-time export silently starts 401ing and the catalog
    // empties on the next sync — with nothing failing loudly in between.
    const body = handlerBody(routes(), marker);
    expect(body).not.toContain('requireAuth');
  });

  it.each(PUBLIC_HANDLERS)('%s serializes through serializePublic only', (marker) => {
    const body = handlerBody(routes(), marker);
    expect(body).toContain('serializePublic');
    expect(body).not.toContain('serializeForReview');
    expect(body).not.toContain('serializeMine');
  });

  it('never lets a public serializer emit review state or the submitter', () => {
    const text = routes();
    const start = text.indexOf('function serializePublic');
    const publicSerializer = text.slice(start, text.indexOf('\nfunction ', start + 1));
    for (const forbidden of [
      'submittedByUserId',
      'reviewedByUserId',
      'reviewNote',
      'staffReadAt',
      'row.payload',
    ]) {
      expect(publicSerializer, `serializePublic leaks ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('keeps `payload` private even though the body is now public', () => {
    /*
      A deliberate reversal, recorded here so the next reader does not take it
      for a regression. This used to assert that nothing of the artifact reached
      a public route at all. Listing pages now render the thing behind a fade
      with the CTA over it, so the body has to reach the static site — that is
      the point of a catalog whose pages are meant to rank.

      What did not change: `payload` carries `sourceId` and `sourceVersionId`
      provenance no reader needs, so it stays out. The body travels in
      `preview.bodyHtml`, sanitized on write and again on read.
    */
    for (const marker of PUBLIC_HANDLERS) {
      const body = handlerBody(routes(), marker);
      for (const access of ['row.payload', 'listing.payload', 'DiscoverListings.payload']) {
        expect(body, `${marker} reads ${access}`).not.toContain(access);
      }
    }
  });

  it('sanitizes the public body on the way out as well as the way in', () => {
    // Two passes, one dependency. The write pass cannot cover a row written
    // before it existed, and harvous.com renders this string with `set:html`
    // and no sanitizer of its own.
    const text = routes();
    expect(text).toContain('function sanitizePreviewBody');
    expect(text).toContain('safeRenderHtml(body)');
    const start = text.indexOf('function serializePublic');
    const publicSerializer = text.slice(start, text.indexOf('\nfunction ', start + 1));
    expect(publicSerializer, 'serializePublic emits an unsanitized preview').toContain(
      'sanitizePreviewBody(parsePreview(row.preview))',
    );
  });

  it('sanitizes and caps the body at snapshot time', () => {
    const text = snapshot();
    expect(text).toContain('safeRenderHtml(cut)');
    expect(text).toContain('BODY_HTML_MAX_LENGTH');
    // Every kind that has a body carries one; a resource has none to carry.
    expect(text).toContain('bodyHtml: bodyHtmlOf(template.content)');
    expect(text).toContain('bodyHtml: bodyHtmlOf(note.content)');
    expect(text).toContain('bodyHtml: bodyHtmlOf(firstBody)');
  });

  it('carries what each kind needs to be drawn as itself', () => {
    // A Thread without its colour cannot wear the stripe that says it is a
    // Thread; a link without its image is not a link card.
    const text = snapshot();
    expect(text).toContain("color: thread.color || 'paper'");
    expect(text).toContain('sourceImage: item.sourceImage ?? null');
    expect(text).toContain("noteType: note.noteType || 'default'");
  });

  it.each(ADMIN_HANDLERS)('%s gates on requireHarvousAdmin before touching the database', (marker) => {
    const body = handlerBody(routes(), marker);
    const gateAt = body.indexOf('requireHarvousAdmin');
    expect(gateAt, 'handler has no admin gate').toBeGreaterThan(-1);
    for (const access of ['db.select(', 'db.insert(', 'db.update(', 'db.transaction(']) {
      const at = body.indexOf(access);
      if (at === -1) continue;
      expect(gateAt, `${access} runs before the gate`).toBeLessThan(at);
    }
  });

  it('inserts the install row before the thing it installs, inside the transaction', () => {
    // The whole idempotency story. /api/shared/add-to-harvous is what
    // check-then-act looks like when it goes wrong — it has no guard at all, so
    // a double-tap there writes a second thread and every note again. Here the
    // unique index decides, and it can only decide if it is written to first.
    const body = handlerBody(routes(), "app.post('/api/discover/install'");
    const txAt = body.indexOf('db.transaction(');
    expect(txAt).toBeGreaterThan(-1);
    const guardAt = body.indexOf('tx.insert(DiscoverInstalls)');
    const writeAt = body.indexOf('writeInstall(tx');
    expect(guardAt, 'install row is not written inside the transaction').toBeGreaterThan(txAt);
    expect(writeAt, 'the destination rows are not written inside the transaction').toBeGreaterThan(txAt);
    expect(guardAt, 'the guard must be written first').toBeLessThan(writeAt);
  });

  it('keeps every destination insert inside the caller transaction', () => {
    // writeInstall takes a `tx` and must never reach for `db` itself — a write
    // that escaped the transaction would survive a rolled-back duplicate.
    const body = install().slice(install().indexOf('export async function writeInstall'));
    for (const escape of ['db.insert(', 'db.update(', 'db.transaction(']) {
      expect(body, `writeInstall escapes its transaction via ${escape}`).not.toContain(escape);
    }
    expect(body).toContain('tx.insert(');
  });

  it('re-derives simpleNoteId under FOR UPDATE rather than trusting prepare', () => {
    // Two installs racing would otherwise read the same high-water mark and
    // hand out the same numbers.
    const body = install().slice(install().indexOf('export async function writeInstall'));
    expect(body).toContain(".for('update')");
    expect(body).toContain('firstSimpleNoteId');
  });

  it('treats a unique violation as "already yours" rather than an error', () => {
    const body = handlerBody(routes(), "app.post('/api/discover/install'");
    expect(body).toContain('isUniqueViolationError');
    expect(body).toContain('alreadyInstalled: true');
  });

  it('refuses a self-install', () => {
    const body = handlerBody(routes(), "app.post('/api/discover/install'");
    expect(body).toContain('SELF_INSTALL');
    expect(body).toContain('listing.submittedByUserId === auth.userId');
  });

  it('reads DiscoverInstalls only as the caller, never about anyone else', () => {
    // The row names a person against something they took, which is observed
    // behaviour. Confinement is the whole reason it is safe to store: every
    // read is scoped to the caller, and the public number is a count.
    const text = routes();
    const reads = [...text.matchAll(/\.from\(DiscoverInstalls\)/g)].map((m) => m.index ?? 0);
    expect(reads.length).toBeGreaterThan(0);
    for (const at of reads) {
      const window = text.slice(at, at + 500);
      expect(window, 'a DiscoverInstalls read is not scoped to the caller').toContain(
        'eq(DiscoverInstalls.userId, auth.userId)',
      );
    }
  });

  it('never projects who installed something', () => {
    const text = routes();
    expect(text).not.toContain('DiscoverInstalls.userId,\n      })');
    // The count is derived, not a list of people.
    expect(text).toContain('installCount');
  });

  it('ships only links as resources — never a file', () => {
    // A file-kind item means copying a private Supabase object between owners:
    // a copy path, a size cap, and an abuse story that do not exist.
    const text = snapshot();
    expect(text).toContain('RESOURCE_NOT_A_LINK');
    expect(text).toContain("item.kind !== 'link'");
  });

  it('re-validates a snapshotted link at install, not just at submit', () => {
    // A listing can sit in the catalog for months; the rules that govern what
    // may be stored are the install-time ones.
    const text = install();
    const body = text.slice(text.indexOf('export async function prepareResourceInstall'));
    expect(body).toContain('validateResourceUrl(payload.sourceUrl)');
    expect(body).toContain('extractDomain(');
  });

  it('never lets a browser cache the public catalog', () => {
    /*
      Found by walking the loop end to end: after approving a listing, a repeat of
      the identical URL still returned the old empty list. React Query refetching
      does not help — the HTTP cache sits underneath it — so a newly approved
      listing stays invisible, and worse, `installedSlugs` goes stale right after
      an install and a row offers to add what the reader already took.
    */
    for (const marker of ["app.get('/api/discover/listings',", "app.get('/api/discover/listings/:slug',"]) {
      const body = handlerBody(routes(), marker);
      expect(body, `${marker} may be cached`).toContain(
        "c.header('Cache-Control', 'private, max-age=0, no-store')",
      );
    }
  });

  it('does not become a third importer of the shared name helper', () => {
    // suggestion-display-names.ts is confined to the two suggestion routes by
    // church-library-routes.test.ts. The byline derivation here is duplicated on
    // purpose; duplicating ~15 lines is cheaper than widening that contract.
    expect(routes()).not.toContain("from '../utils/suggestion-display-names'");
  });

  it('snapshots the byline instead of resolving it on read', () => {
    const submit = handlerBody(routes(), "app.post('/api/discover/submit'");
    expect(submit).toContain('resolveAuthorDisplayName');
    // A byline that re-resolves is a byline that can change under someone after
    // they agreed to it.
    for (const marker of PUBLIC_HANDLERS) {
      expect(handlerBody(routes(), marker)).not.toContain('resolveAuthorDisplayName');
    }
  });

  it('refuses to snapshot a church-provisioned template', () => {
    // An org template belongs to the church that provisioned it. The author of
    // the row is not the one who gets to give it away.
    expect(snapshot()).toContain('isNull(NoteTemplates.orgId)');
    expect(snapshot()).toContain('eq(NoteTemplates.userId, userId)');
  });

  it('only snapshots rows the caller owns', () => {
    const text = snapshot();
    expect(text).toContain('eq(Notes.userId, userId)');
    expect(text).toContain('eq(Threads.userId, userId)');
  });

  it('refuses to snapshot a locked note or a shared-space thread', () => {
    const text = snapshot();
    expect(text).toContain('ENCRYPTED_NOTE_CANNOT_SHARE');
    // A thread living in a shared space is the room's, not the owner's alone —
    // the same refusal /api/shared/add-to-harvous makes.
    expect(text).toContain('THREAD_IN_SHARED_SPACE');
    expect(text).toContain("space.type !== 'personal'");
  });

  it('requires a note to already be public before offering it to everyone', () => {
    // Consent ordering, not a technical need: the listing snapshots either way.
    // Threads are exempt on purpose — nothing in the SPA can make one public, so
    // the same gate there would make packs unsubmittable. See snapshotPack.
    const text = snapshot();
    expect(text).toContain('NOTE_NOT_PUBLIC');
    expect(text).not.toContain('THREAD_NOT_PUBLIC');
  });

  it('caps a pack at submit, so an approved listing can never become unbounded', () => {
    const text = snapshot();
    expect(text).toContain('MAX_PACK_NOTES');
    expect(text).toContain('PACK_TOO_LARGE');
    expect(text).toContain('MAX_PAYLOAD_BYTES');
  });

  it('never trusts a client-supplied payload', () => {
    // The payload is built by the server from a row it just verified the caller
    // owns; the route only ever forwards an id.
    const body = handlerBody(routes(), "app.post('/api/discover/submit'");
    expect(body).toContain('snapshotTemplate(sourceId, auth.userId)');
    expect(body).toContain('snapshotNote(sourceId, auth.userId)');
    expect(body).toContain('snapshotPack(sourceId, auth.userId)');
    expect(body).toContain('payload: snapshot.payload');
    expect(body).not.toContain('body.payload');
    expect(body).not.toContain('body.content');
  });

  it('passes the frozen byline into copy attribution — the first caller that does', () => {
    // Both shared.ts callers pass null, because a share link resolves the author
    // live. A listing cannot: its byline was snapshotted at submit.
    const text = install();
    expect(text).toContain('sourceAuthorDisplayName: input.authorDisplayName');
    expect(text).toContain('buildIndependentCopyAttribution');
  });

  it('lands installed copies in My Home, never in a shared space', () => {
    const text = install();
    expect(text).toContain('ensurePersonalHomeSpace');
    expect(text).toContain("addedBy: 'discover'");
    // A pack's thread is personal on arrival.
    expect(text).toMatch(/spaceId: null,\s*\n\s*userId,/);
  });

  it('lets the reviewer file it, not the submitter', () => {
    const submit = handlerBody(routes(), "app.post('/api/discover/submit'");
    expect(submit).toContain('category: null');
    expect(submit).not.toContain('body.category');
    const review = handlerBody(routes(), "app.post('/api/admin/discover/review'");
    expect(review).toContain('isDiscoverCategory');
    expect(review).toContain('BAD_CATEGORY');
  });

  it('assigns the slug inside the approval transaction and refuses a second review', () => {
    const body = handlerBody(routes(), "app.post('/api/admin/discover/review'");
    expect(body).toContain('ALREADY_REVIEWED');
    expect(body).toMatch(/status !== 'submitted'/);
    const txAt = body.indexOf('db.transaction(');
    expect(txAt).toBeGreaterThan(-1);
    expect(body.indexOf('slugify(title)')).toBeGreaterThan(txAt);
  });

  it('frees the slug whenever a listing leaves the catalog', () => {
    // The unique index is partial on `slug IS NOT NULL`. A withdrawn or delisted
    // row that kept its slug would hold a name nobody can reach.
    for (const marker of [
      "app.post('/api/discover/withdraw'",
      "app.post('/api/admin/discover/delist'",
    ]) {
      const body = handlerBody(routes(), marker);
      expect(body, `${marker} keeps its slug`).toContain('slug: null');
    }
  });

  it('either reports an error through handleAPIError or rethrows it — never swallows one', () => {
    const text = routes();
    const catches = [...text.matchAll(/\} catch \(error\) \{/g)].map((m) => m.index ?? 0);
    expect(catches.length).toBeGreaterThan(0);
    for (const at of catches) {
      const block = text.slice(at, at + 400);
      const reports = block.includes('handleAPIError(error, {');
      // The install's duplicate branch is the one catch that handles rather than
      // reports: a unique violation there is the expected answer, not a fault.
      const rethrows = block.includes('throw error');
      expect(reports || rethrows, `a catch block neither reports nor rethrows: ${block.slice(0, 90)}`).toBe(true);
    }
  });
});

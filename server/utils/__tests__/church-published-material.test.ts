/**
 * Contract tests for published material claiming a service.
 *
 * Same style as `church-series-publish.test.ts`: the invariants that matter here
 * are *which checks run and which columns are never touched*, and those are
 * asserted against the source so a second path cannot appear that skips them.
 * A live-DB test would prove one call behaves; this proves no call can't.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
/** Prose explaining a decision is not the code making it. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const util = () => source('server/utils/church-published-material.ts');
const route = () => source('server/routes/church-published-material.ts');

describe('the congregant read re-resolves every claim', () => {
  it('requires the room to still be this org’s', () => {
    expect(util()).toContain('eq(Spaces.orgId, orgId)');
  });

  it('requires the room to still be alive, active, and a ministry channel', () => {
    const text = util();
    expect(text).toContain('isNull(Spaces.deletedAt)');
    expect(text).toContain('if (!row.spaceIsActive) continue;');
    expect(text).toContain('isMinistryBroadcastSpaceRow');
  });

  it('drops a note pulled back out of the channel', () => {
    // Removing the note from the room is the only retract gesture staff have.
    expect(util()).toContain('isNull(SpaceNotes.removedAt)');
  });

  it('caps what one service will render', () => {
    expect(util()).toContain('PUBLISHED_MATERIAL_MAX_PER_SERVICE');
    expect(util()).toContain('items.slice(0, PUBLISHED_MATERIAL_MAX_PER_SERVICE)');
  });

  it('omits a service with nothing attached rather than mapping it to an empty list', () => {
    expect(util()).toContain('if (items.length > 0)');
  });
});

describe('the two writers stay off each other’s rows', () => {
  /*
    `publishSeriesAsStudyPlan` writes ChurchServicePublishedNotes too, and
    `publishedWeekIdsInThread` reads exactly those rows to decide which weeks a
    republish should skip. A replace-set over a step would delete a claim it does
    not own and let the next republish rebuild a step that already exists.
  */
  it('refuses to replace-set a published series step', () => {
    const text = withoutComments(util());
    expect(text).toContain('isPublishedSeriesStep');
    expect(text).toContain('PUBLISHED_SERIES_STEP');
  });

  it('asks the database for that provenance rather than a request body', () => {
    const text = util();
    expect(text).toContain('ChurchSeries.publishedThreadId');
  });

  it('runs the guard before the write, not after', () => {
    const text = withoutComments(util());
    const guard = text.indexOf('isPublishedSeriesStep(noteId)');
    const write = text.indexOf('db.transaction');
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(write);
  });
});

describe('targets are re-scoped, never trusted', () => {
  it('scopes claimed services to the caller’s own church', () => {
    const text = util();
    expect(text).toContain('eq(ChurchServices.churchId, churchId)');
    expect(text).toContain('SERVICE_NOT_FOUND');
  });

  it('scopes claimed series the same way, so a space plan is not a church plan', () => {
    const text = util();
    expect(text).toContain('eq(ChurchSeries.churchId, churchId)');
    expect(text).toContain('SERIES_NOT_FOUND');
  });

  it('refuses a partial match rather than writing the rows it recognised', () => {
    const text = util();
    expect(text).toContain('owned.length !== serviceIds.length');
    expect(text).toContain('owned.length !== seriesIds.length');
  });
});

describe('the attach gate is the room', () => {
  it('gates on authoring in the channel, not on managing the church plan', () => {
    const text = route();
    expect(text).toContain('canAuthorInSpace');
    // manage_teaching_plan is the *other* direction's gate and must not leak here.
    expect(withoutComments(text)).not.toContain('assertCanManageTeachingPlan');
  });

  it('refuses a note that is not in a ministry channel', () => {
    expect(route()).toContain('isMinistryBroadcastSpaceRow');
  });

  it('says 404 rather than 403 on a note the caller cannot see', () => {
    // A stranger must not learn that a note id exists.
    const text = route();
    expect(text).toContain("status: 404, error: 'Note not found'");
  });

  it('gates every route, including the two reads', () => {
    const text = withoutComments(route());
    const handlers = text.match(/app\.(get|post)\(/g) ?? [];
    const gates = text.match(/gateAttachForNote\(/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    // One call per handler, plus the function's own declaration.
    expect(gates.length).toBe(handlers.length + 1);
  });
});

describe('privacy', () => {
  /*
    The congregant learns that their church published something, never who.
    `publishedByUserId` is written and never selected back out.
  */
  it('never returns who published', () => {
    const text = withoutComments(util());
    const selected = text.slice(text.indexOf('export type PublishedMaterialItem'));
    expect(selected.split('publishedByUserId').length - 1).toBeLessThanOrEqual(2);
    expect(text).not.toContain('publishedByUserId: ChurchServicePublishedNotes.publishedByUserId');
  });

  it('keeps the congregant lineage column out of this feature entirely', () => {
    // `Notes.startedFromServiceId` is the congregant's *own* note, scoped to one
    // user. A church-side read of it would be the exact leak the suite in
    // church-services-routes.test.ts exists to prevent.
    for (const path of [
      'server/utils/church-published-material.ts',
      'server/routes/church-published-material.ts',
    ]) {
      expect(withoutComments(source(path)), path).not.toContain('startedFromServiceId');
      expect(withoutComments(source(path)), path).not.toContain('plannedForServiceId');
    }
  });

  it('adds no new reader of the staff draft column', () => {
    const hits = execSync(
      "grep -rl 'plannedForServiceId' server --include='*.ts' | grep -v '__tests__' || true",
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => file.includes('published-material'));
    expect(hits).toEqual([]);
  });
});

describe('the claim survives its note being deleted', () => {
  it('cascades both grains when a note goes', () => {
    const cascade = source('server/utils/delete-note-cascade.ts');
    expect(cascade).toContain('ChurchSeriesPublishedNotes');
    expect(cascade).toContain('.delete(ChurchSeriesPublishedNotes)');
    // And the table is declared in the cascade's own manifest, which is what
    // the sync-tombstone code reads.
    expect(cascade).toContain("'ChurchSeriesPublishedNotes',");
  });
});

describe('the series grain gets its own table, not a nullable column', () => {
  it('keeps both grains uniquely constrained', () => {
    const schema = source('server/db/schema.ts');
    expect(schema).toContain('ChurchSeriesPublishedNotes_series_note_unique');
    // The original constraint must survive untouched — widening `serviceId` to
    // nullable would have retired it silently, since NULLs compare distinct.
    expect(schema).toContain('ChurchServicePublishedNotes_service_note_unique');
    expect(schema).toContain("serviceId: text('serviceId').notNull()");
    expect(schema).toContain("seriesId: text('seriesId').notNull()");
  });
});

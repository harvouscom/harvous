import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ReviewEvents, ReviewItems } from '../../db/schema';
import { deleteChildLookBack, CHILD_LOOK_BACK_CAP } from '../look-back';

vi.mock('../../db/client', () => ({ db: {} }));

describe('Look back (the child review dock)', () => {
  it('deletes the child’s review items and events with the notebook', async () => {
    const tables: unknown[] = []; const wheres: any[] = [];
    const tx = { delete: vi.fn((table: unknown) => { tables.push(table); return { where: (condition: any) => { wheres.push(condition); return Promise.resolve(); } }; }) };
    await deleteChildLookBack(tx as never, 'child_abc');
    expect(tables).toEqual([ReviewEvents, ReviewItems]);
    const dialect = new PgDialect();
    expect(wheres.map(where => dialect.sqlToQuery(where).params)).toEqual([['child_abc'], ['child_abc']]);
  });

  it('keeps a child’s day small', () => {
    expect(CHILD_LOOK_BACK_CAP).toBeLessThan(8);
  });

  it('lets only a child see their own notes in review material; adults keep the child exclusion', () => {
    const service = readFileSync(resolve(process.cwd(), 'server/utils/review-service.ts'), 'utf8');
    expect(service).not.toMatch(/countableUserNotesWhere\(\)\s*[,)]/);
    const helper = service.slice(service.indexOf('function ownNotesWhere'));
    expect(helper.slice(0, 200)).toMatch(/isChildReader\(userId\) \? undefined : countableUserNotesWhere\(\)/);
    expect(service).toMatch(/function isChildReader\(userId: string\) \{\s*return userId\.startsWith\(CHILD_ACCOUNT_ID_PREFIX\);/);
  });

  it('asks a child only what they can answer by tapping or saying aloud', () => {
    const service = readFileSync(resolve(process.cwd(), 'server/utils/review-service.ts'), 'utf8');
    // Step 1 walks past first letters (typed) to the blanks, which are always word tiles.
    expect(service).toMatch(/CHILD_RUNG_PREFERENCES: RungPreferences = \{ skip: new Set\(\['verse\.initials'\]\)/);
    expect(service).toMatch(/if \(isChildReader\(userId\)\) return CHILD_RUNG_PREFERENCES;/);
    // The from-memory cards keep the verse for a child only, to check against after saying it.
    expect(service).toMatch(/if \(!isChildReader\(userId\)\) payload\.verseText = null;/);
    expect(service).toMatch(/if \(payload\.keywords && !isChildReader\(userId\)\) payload\.verseText = null;/);
  });

  it('marks a child’s answer with the adult route’s shared function, not a copy', () => {
    const routes = readFileSync(resolve(process.cwd(), 'server/routes/child-accounts.ts'), 'utf8');
    expect(routes).toContain("import { reviewOutcomeReply } from './review';");
    expect(routes).toMatch(/reviewOutcomeReply\(\{ userId: child\.id \}, item, body\)/);
  });

  it('exports Look back with the notebook', () => {
    const exporter = readFileSync(resolve(process.cwd(), 'server/family/notebook-export.ts'), 'utf8');
    expect(exporter).toContain('lookBack: await exportChildLookBack(child)');
  });
});

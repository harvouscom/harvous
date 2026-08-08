import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foldReferencesIntoHeatmap } from '../church-scripture-heatmap';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('foldReferencesIntoHeatmap', () => {
  it('counts a book once per week that named it', () => {
    const map = foldReferencesIntoHeatmap(['Romans 8:1-11', 'Romans 8:12-25', 'John 3:16']);
    expect(map.books.map((b) => [b.book, b.count])).toEqual([
      ['Romans', 2],
      ['John', 1],
    ]);
    expect(map.totalPlanned).toBe(3);
  });

  it('counts each chapter a cross-chapter range spans — a week in both', () => {
    const map = foldReferencesIntoHeatmap(['Romans 8:1-9:5']);
    expect(map.books[0].chapters).toEqual({ 8: 1, 9: 1 });
  });

  it('follows the canonical parser even where it collapses a chapter range', () => {
    /*
      `Romans 8-9` parses as chapter 8 expanded to its whole verse range, not as
      a chapter span — the shared detector has no chapter-range form. Pinned
      here rather than worked around: one parser decides what a reference means
      everywhere, and a second opinion living in the heatmap would drift.
    */
    const map = foldReferencesIntoHeatmap(['Romans 8-9']);
    expect(map.books[0].chapters).toEqual({ 8: 1 });
  });

  it('breaks ties alphabetically so the order does not shuffle between reloads', () => {
    const map = foldReferencesIntoHeatmap(['Titus 1:1', 'Amos 1:1', 'Mark 1:1']);
    expect(map.books.map((b) => b.book)).toEqual(['Amos', 'Mark', 'Titus']);
  });

  it('ignores weeks with no passage rather than counting them as unreadable', () => {
    const map = foldReferencesIntoHeatmap([null, '', '   ', 'John 3:16']);
    expect(map.totalPlanned).toBe(1);
    expect(map.unparsed).toBe(0);
  });

  it('reports a passage it could not read instead of silently dropping it', () => {
    const map = foldReferencesIntoHeatmap(['Zzzz 4:4', 'John 3:16']);
    expect(map.unparsed).toBe(1);
    expect(map.totalPlanned).toBe(2);
    expect(map.books.map((b) => b.book)).toEqual(['John']);
  });

  it('returns an empty map for a church that has planned nothing', () => {
    expect(foldReferencesIntoHeatmap([])).toEqual({ books: [], totalPlanned: 0, unparsed: 0 });
  });
});

describe('what the heatmap is allowed to read', () => {
  it('reads planned references only, never note content', () => {
    const text = withoutComments(source('server/utils/church-scripture-heatmap.ts'));
    expect(text).toContain('ChurchServices.reference');
    /*
      Aggregating what the congregation wrote would be the first church-facing
      read of note content, which this codebase refuses by name elsewhere. If
      that decision is ever taken it should be taken deliberately, not by a
      table quietly appearing in this query.
    */
    expect(text).not.toMatch(/\bNotes\b/);
    expect(text).not.toContain('NoteScriptureReferences');
    expect(text).not.toContain('ScriptureMetadata');
  });

  it('scopes space-plan rows to this church, not just to the churchId column', () => {
    const text = source('server/utils/church-scripture-heatmap.ts');
    expect(text).toContain('eq(Spaces.orgId, orgId)');
  });
});

describe('the heatmap route', () => {
  const routeBlock = () => {
    const text = source('server/routes/church-teaching-plan.ts');
    const start = text.indexOf("app.get('/api/church/scripture-heatmap'");
    expect(start).toBeGreaterThan(-1);
    return text.slice(start);
  };

  it('uses the same read gate as the plan it folds', () => {
    expect(routeBlock()).toContain('assertCanViewTeachingPlan');
  });

  it('never takes a churchId from the request — only the gate names the church', () => {
    const block = withoutComments(routeBlock());
    expect(block).toContain('gate.church.id');
    expect(block).not.toMatch(/query\(\s*'churchId'\s*\)/);
  });
});

/**
 * Contract tests for the staff side of church review questions.
 *
 * Source assertions, matching church-join-routes.test.ts. What they protect: staff are proven
 * before any write; archiving works for a lapsed church; and the church side never reads a
 * reader's Review — the one number it gets back is floored.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
/** Code only: the docblocks name the tables this file promises never to read. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const routes = () => source('server/routes/church-review.ts');
const access = () => source('server/utils/church-review-access.ts');
const suggestions = () => source('server/utils/church-review-suggestions.ts');

function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const WRITES = [
  "app.post('/api/church/review/exercises/create'",
  "app.post('/api/church/review/exercises/update'",
  "app.post('/api/church/review/suggestions/dismiss'",
] as const;

describe('church review routes', () => {
  it.each(WRITES)('%s is gated for writing before it touches the database', (marker) => {
    const body = handlerBody(routes(), marker);
    const gate = body.search(/await assertChurchReview(Channel|Access)\([\s\S]*?'write',?\s*\)/);
    expect(gate, 'no write gate').toBeGreaterThan(-1);
    for (const write of ['db.insert(', 'db.update(', 'db.delete(']) {
      const at = body.indexOf(write);
      if (at !== -1) expect(gate, `${write} before the gate`).toBeLessThan(at);
    }
    expect(body).toContain("rateLimit('write')");
  });

  it('publishes behind the write gate, and archives behind one a lapsed church passes', () => {
    const loop = routes().slice(routes().indexOf("for (const action of ['publish', 'archive'] as const)"));
    expect(loop).toContain("action === 'publish' ? 'write' : 'retire'");
    const rule = (name: string) => access().slice(access().indexOf(`  ${name}: {`), access().indexOf('  },', access().indexOf(`  ${name}: {`)));
    expect(rule('write')).toContain('sponsorshipGated: true');
    expect(rule('retire')).toContain('sponsorshipGated: false');
    expect(rule('read')).toContain('sponsorshipGated: false');
  });

  it('only accepts this church’s own ministry channel', () => {
    const fn = access().slice(access().indexOf('export async function assertChurchReviewChannel'));
    expect(fn).toContain("channel.type !== 'public'");
    expect(fn).toContain('channel.orgId !== gate.church.orgId');
    expect(fn).toContain('channel.deletedAt');
  });

  it('never reads a reader’s Review, or anyone’s notes', () => {
    for (const text of [routes(), access(), suggestions()].map(code)) {
      for (const table of ['ReviewItems', 'ReviewEvents', 'UserNodeStates', 'Notes.content', 'UserMetadata']) {
        expect(text, `mentions ${table}`).not.toContain(table);
      }
    }
  });

  it('reports "Answered by N" only from five up', () => {
    expect(routes()).toContain('answeredCount: flooredAnsweredCount(row.answeredCount)');
    expect(access()).toContain('export const ANSWERED_COUNT_FLOOR = 5;');
    expect(routes()).not.toMatch(/answeredCount: row\.answeredCount/);
  });

  it('a congregant preview carries no key', () => {
    const fn = routes().slice(routes().indexOf('function previewFor'), routes().indexOf('// ─── GET /api/church/review/channels'));
    // The kind checks read the definition (`'correctIndex' in content`); what is *returned* never does.
    const returned = [...fn.matchAll(/return \{[\s\S]*?\};/g)].map((m) => m[0]).join('\n');
    expect(returned).toContain('options');
    for (const key of ['answerIndex', '.order', '.key', 'correctIndex']) expect(returned).not.toContain(key);
  });

  it('keeps an edit from changing what kind of question it is', () => {
    const body = handlerBody(routes(), "app.post('/api/church/review/exercises/update'");
    expect(body).toContain('kind: row.kind');
    expect(body).toContain("row.status === 'published' ? row.version + 1 : row.version");
  });

  it('dismissal writes a row so the passage is never suggested again', () => {
    const body = handlerBody(routes(), "app.post('/api/church/review/suggestions/dismiss'");
    expect(body).toContain("status: 'dismissed'");
    expect(body).toContain('suggestionKey: shape.reference');
  });
});

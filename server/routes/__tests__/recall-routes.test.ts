/**
 * Contract tests for Recall's routes.
 *
 * Source-level for the same reason as the Challenges and Review files beside it: the property is
 * about *every* handler in the file and so breaks by omission — someone adds a route and forgets
 * the gate — rather than by a request coming back wrong.
 *
 * The batch route is the reason this file exists. Home used to record six impressions as six
 * requests, and folding them into one moved an authenticated write from "one row per request" to
 * "as many rows as the body says", which is worth holding to a shape.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'server/routes/recall.ts'), 'utf8');
const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function registrations(text: string): string[] {
  return text.match(/route\.(get|post)\([\s\S]*?async \(c\) => \{/g) ?? [];
}

describe('every Recall route is gated', () => {
  const lines = registrations(withoutComments);

  it('registers the singular write, the batch write, and the history read', () => {
    expect(lines.length).toBe(3);
  });

  it('requires auth on every route', () => {
    for (const line of lines) expect(line).toContain('requireAuth');
  });

  it('rate-limits reads as reads and writes as writes', () => {
    for (const line of lines) {
      expect(line).toMatch(/rateLimit\('(read|write)'\)/);
      if (line.startsWith('route.post')) expect(line).toContain("rateLimit('write')");
    }
  });
});

describe('the batch write', () => {
  const block = withoutComments.slice(withoutComments.indexOf("'/api/recall/events'"));

  it('is bounded, so one request cannot become unbounded inserts', () => {
    expect(block).toContain('RECALL_EVENT_BATCH_MAX');
    expect(withoutComments).toMatch(/const RECALL_EVENT_BATCH_MAX = \d+;/);
    // Rejected outright rather than truncated: a half-recorded batch is the harder thing to spot.
    expect(block).toContain("code: 'RECALL_EVENTS_TOO_MANY'");
  });

  it('validates every entry with the same function the singular route uses', () => {
    expect(block).toContain('validateRecallEventInput(row)');
  });

  it('reports what it skipped rather than swallowing it', () => {
    // A partial batch is deliberate — these are analytics writes nothing reads back — but a
    // client that starts sending garbage must be visible in the response.
    expect(block).toMatch(/rejected/);
    expect(block).toContain('recorded');
  });
});

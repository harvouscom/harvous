/**
 * How a church's question moves through the Review engine.
 *
 * Source assertions, like review-askable-rules-parity.test.ts: every path is a database call end
 * to end. What they hold is the three promises that make a church question safe to hand to a
 * congregation — the key never reaches the page, the reader's own row is never confused with the
 * church's, and marking can never fall into another kind's grader.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const service = () => source('server/utils/review-service.ts');

function slice(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  expect(start, `${from} not found`).toBeGreaterThan(-1);
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end === -1 ? undefined : end);
}

describe('church questions in the Review engine', () => {
  it('reveal sends options, pieces and columns — never the key', () => {
    const branch = slice(service(), "if (item.kind === 'church') {", 'payload.context =');
    expect(branch).toContain('payload.choice = { options: built.exercise.options, opening: false }');
    expect(branch).toContain('payload.sequence = { phrases: built.exercise.phrases }');
    expect(branch).toContain('payload.match = { left: built.exercise.left, right: built.exercise.right }');
    for (const key of ['answerIndex', '.order', '.key', 'content', 'correctIndex']) {
      expect(branch, `reveal mentions ${key}`).not.toContain(key);
    }
  });

  it('marks church items with the church grader, and nothing else does', () => {
    const door = slice(service(), 'export async function gradeAnswerFor', '/** The definition behind');
    expect(door).toContain("case 'church':\n      return gradeChurchAnswer(item, answer);");
  });

  it('asks, grades and reveals from one rebuild of the same seed', () => {
    const text = service();
    expect(text.match(/buildChurchQuestion\(definition, item\)/g)?.length).toBe(2);
    expect(slice(text, 'function buildChurchQuestion', '/**\n * Marked against')).toContain('reviewSeed(item)');
  });

  it('only a published, readable definition can be asked', () => {
    const defs = source('server/utils/church-review-definitions.ts');
    const rule = slice(defs, 'export function churchQuestionIsAskable', '\n}');
    expect(rule).toContain("definition.status === 'published'");
    expect(rule).toContain('definition.content');
    expect(slice(service(), 'async function loadChurchQuestion', '\n}')).toContain('churchQuestionIsAskable(definition)');
  });

  it('keys a church item by the church’s exercise, before any other field', () => {
    const fn = slice(service(), 'export function reviewSourceKey', 'async function ownsNote');
    const church = fn.indexOf('if (input.churchExerciseId) return `church:${input.churchExerciseId}`;');
    expect(church).toBeGreaterThan(-1);
    expect(church).toBeLessThan(fn.indexOf('switch (input.kind)'));
  });

  it('frames anything a church put here as the church’s', () => {
    const build = slice(service(), 'export async function buildReviewItemViews', '/** What a reader with no stored');
    expect(build).toContain("kind === 'church' || row.origin === 'church'");
    expect(build).toContain('churchFraming(churchDefinition?.channelTitle)');
  });

  it('the definition loader reads no reader’s data', () => {
    const defs = source('server/utils/church-review-definitions.ts');
    for (const table of ['ReviewItems', 'ReviewEvents', 'UserMetadata', 'SpaceMemberships', 'userId']) {
      expect(defs, `loader touches ${table}`).not.toContain(table);
    }
  });
});

/**
 * "lately returning to X" is a study-arc theme, not a Thread title — and not a suggestion.
 *
 * The greeting chip runs `trend.onOpen` rather than opening the Threads list. For the arc and
 * subject clauses that handler is a Library search on the name: proposing the Thread is the
 * Suggestions shelf's job (its arc card still calls `openStudyArc`), and a chip that opened the
 * same proposal sheet made the greeting a second, unlabelled suggestion. The chip wears the
 * magnifying glass, so it opens search. The crossref clause names two passages, so each of its
 * chips opens its passage in the reader.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hook = () =>
  readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/use-home-surface-data.ts'), 'utf8');

function greetingTrendBody(): string {
  const src = hook();
  const start = src.indexOf('const recallTrendGreeting = useMemo');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('}, [', start));
}

describe('greeting returning-to chip', () => {
  it('lets the trend handler run instead of opening the Threads list', () => {
    const greeting = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeHomeGreeting.tsx'),
      'utf8',
    );
    const start = greeting.indexOf('aria-label={`Open ${label}`}');
    expect(start).toBeGreaterThan(-1);
    const body = greeting.slice(start, start + 400);
    expect(body).toContain('onClick={() => trend.onOpen(i)}');
    expect(body).not.toContain("nav.openList('threads')");
  });

  it('searches the theme rather than proposing a Thread', () => {
    const body = greetingTrendBody();
    expect(body).toContain('onOpen: () => searchLibraryFor(theme)');
    expect(body).toContain('onOpen: () => searchLibraryFor(subject)');
    expect(body).not.toContain('onOpen: openStudyArc');
    expect(body).not.toContain('onOpen: openSubjectConnection');
  });

  it('opens each cross-referenced passage rather than proposing a Thread', () => {
    const body = greetingTrendBody();
    expect(body).toContain('onOpen: (labelIndex) => openReaderAt(refs[labelIndex]');
    expect(body).not.toContain('onOpen: openCrossRefConnection');
  });

  it('leaves the proposal to the Suggestions shelf', () => {
    const src = hook();
    const start = src.indexOf('const openStudyArc = useCallback');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('}, [', start));
    expect(body).toContain('proposeThread');
  });
});

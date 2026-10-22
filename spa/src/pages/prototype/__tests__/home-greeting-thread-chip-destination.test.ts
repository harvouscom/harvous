/**
 * "lately returning to X" opens the Thread suggestion, never a search.
 *
 * The greeting chip runs `trend.onOpen` rather than opening the Threads list. For the arc and
 * subject clauses that handler is the same one the Suggestions shelf's card runs: the proposal
 * in a dialog, or the create-Thread sheet prefilled when there is no proposal to review. They
 * used to open a Library search seeded with the name, which answered a different question than
 * the one the tap asked. The crossref clause names two passages, so each of its chips opens its
 * passage in the reader.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hook = () =>
  readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/use-home-surface-data.ts'), 'utf8');

function callbackBody(name: string): string {
  const src = hook();
  const start = src.indexOf(`const ${name} = useCallback`);
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('}, [', start));
}

function greetingTrendBody(): string {
  const src = hook();
  const start = src.indexOf('const recallTrendGreeting = useMemo');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('}, [', start));
}

describe('greeting returning-to chip', () => {
  it('opens the Thread suggestion the shelf card opens', () => {
    const body = greetingTrendBody();
    expect(body).toContain('onOpen: openStudyArc');
    expect(body).toContain('onOpen: openSubjectConnection');
  });

  it('opens each cross-referenced passage rather than proposing a Thread', () => {
    const body = greetingTrendBody();
    expect(body).toContain('onOpen: (labelIndex) => openReaderAt(refs[labelIndex]');
    expect(body).not.toContain('onOpen: openCrossRefConnection');
  });
});

describe('Thread suggestions never fall back to a search', () => {
  it('has no Library search door left in the hook', () => {
    expect(hook()).not.toContain('searchLibraryFor');
    expect(hook()).not.toContain('querySeed');
  });

  it.each(['openStudyArc', 'openSubjectConnection', 'openCrossRefConnection'])(
    '%s proposes, or opens the prefilled create-Thread sheet',
    (name) => {
      const body = callbackBody(name);
      expect(body).toContain('proposeThread(');
      expect(body).toContain('startThreadFor(');
    },
  );

  it('prefills the create-Thread sheet with the notes and the name', () => {
    expect(callbackBody('startThreadFor')).toContain('createThread?.({ noteIds, threadName })');
  });
});

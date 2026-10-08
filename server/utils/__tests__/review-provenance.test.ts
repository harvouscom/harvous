/**
 * Review finds the reader's own marks and notes across range highlights.
 *
 * A reader who drags a highlighter across "John 15:5-7" has marked John 15:6, and a note citing
 * "Romans 8:28-30" cites Romans 8:29. Every lookup that matched the stored reference exactly
 * missed both, so the verse items split out of a range never showed "You marked this", never
 * opened on the reader's own words, and never revealed their annotation.
 *
 * The pure halves (`referenceCoversVerse`, `readerSpanWithinVerse`) are tested where they live.
 * These guard the database half against the source, in the style of review-material-reuse, since
 * the failure is a lookup quietly going back to an exact match.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const service = withoutComments(readFileSync(join(repoRoot, 'server/utils/review-service.ts'), 'utf8'));
const engine = withoutComments(readFileSync(join(repoRoot, 'server/utils/review-opportunities.ts'), 'utf8'));

/** The body of a function, from its declaration to the next top-level declaration. */
function body(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + signature.length);
  const next = rest.search(/\n(export )?(async )?function |\nconst [A-Z_]+ =|\ninterface /);
  return next > 0 ? rest.slice(0, next) : rest;
}

describe('the reader span is found by containment', () => {
  it('prefix-matches the chapter and filters by containment', () => {
    const fn = body(service, 'async function loadReaderSpan(');
    expect(fn).toContain('like(StudyThreadEntries.scriptureReference');
    expect(fn).toContain('marksCoveringReference(');
    expect(service).toMatch(/function marksCoveringReference[\s\S]*referenceCoversVerse\(/);
  });

  it('hands every covering span to the fragment finder, longest first', () => {
    const fn = body(service, 'function marksCoveringReference(');
    expect(fn).toContain('b.length - a.length');
  });

  it('expands the list-side marks per verse, for "You marked this" and the opening cue', () => {
    const facts = body(service, 'function loadFramingFacts(');
    expect(facts).toContain('chapterPrefixesOf(references)');
    expect(facts).not.toMatch(/inArray\(StudyThreadEntries\.scriptureReference, references\),\s*\)/);
    const views = body(service, 'export async function buildReviewItemViews(');
    expect(views).toContain('marksCoveringReference(marks, reference)');
    expect(views).not.toContain('readerSpansByReference');
  });
});

describe('citations are found by containment', () => {
  it('asks for verse <= v and coalesce(verseEnd, verse) >= v', () => {
    const fn = body(service, 'async function loadNoteIdsCitingPassage(');
    expect(fn).toContain('lte(ScriptureMetadata.verse, at.verse)');
    expect(fn).toMatch(/coalesce\(\$\{ScriptureMetadata\.verseEnd\}, \$\{ScriptureMetadata\.verse\}\) >= \$\{at\.verse\}/);
    expect(fn).not.toContain('eq(ScriptureMetadata.verse, at.verse)');
  });
});

describe('the annotation on the reveal', () => {
  it('falls back to the newest covering highlight, one with a thought first, when none is stamped', () => {
    const fn = body(service, 'async function loadItemAnnotation(');
    const fallback = fn.slice(0, fn.indexOf('eq(StudyThreadEntries.id, item.studyThreadEntryId)'));
    expect(fallback).toContain('if (!item.studyThreadEntryId)');
    expect(fallback).toContain('loadCoveringMarks(userId, at)');
    expect(fallback).toContain('covering.find((mark) => mark.thought) ?? covering[0]');
  });

  it('only ever reads the reader\'s own, unarchived marks', () => {
    const fn = body(service, 'export async function loadCoveringMarks(');
    expect(fn).toContain('eq(StudyThreadEntries.userId, userId)');
    expect(fn).toContain('eq(StudyThreadEntries.isArchived, false)');
    expect(fn).toContain('referenceCoversVerse(row.reference, at)');
  });
});

describe('the engine records where a verse item came from', () => {
  it('stamps the covering highlight, a thought first, and never a note', () => {
    const add = engine.slice(engine.indexOf('const addPick = async'));
    expect(add).toContain('loadCoveringMarks(userId, verseParts)');
    expect(add).toContain('covering.find((mark) => mark.thought) ?? covering[0]');
    expect(add).toMatch(/secondaryNoteId: null,\s*studyThreadEntryId,/);
    expect(add).toContain('noteId: pick.noteId');
  });

  it('does not freeze an engine item in its highlight\'s translation', () => {
    const fn = body(service, 'export async function createReviewItem(');
    expect(fn).toContain("input.origin === 'engine' ? null : entry.translation");
  });
});

describe('deleting a highlight', () => {
  const fn = body(service, 'export async function retireReviewForStudyThreadEntry(');

  it('still archives what the reader added from it', () => {
    expect(fn).toContain("item.origin !== 'engine'");
    expect(fn).toContain("status: 'archived'");
  });

  it('unlinks an engine item, archiving it only when nothing of the reader\'s covers the verse', () => {
    expect(fn).toContain('loadCoveringMarks(userId, at, { excludeId: studyThreadEntryId })');
    expect(fn).toContain('loadNoteIdsCitingPassage(userId, at)');
    expect(fn).toContain('remains = covering.length > 0 || citing.length > 0');
    expect(fn).toMatch(/\.set\(\{ studyThreadEntryId: null, updatedAt: now \}\)/);
  });
});

describe('verse-level questions ask about engaged verses only', () => {
  it('reads engaged verses as highlighted or cited, and hands them to the chapter builders', () => {
    const engaged = body(service, 'export async function loadEngagedVerseNumbersInChapter(');
    expect(engaged).toContain('loadReaderHighlightsInChapter(userId, parts)');
    expect(engaged).toContain('loadCitedVerseNumbersInChapter(userId, parts)');
    const chapter = body(service, 'async function loadChapterMaterialUncached(');
    expect(chapter).toContain('chapterFinishCandidates(verses, engagedNumbers)');
    expect(chapter).toContain('engagedCount: chapterEngagedCueCount(verses, engagedNumbers)');
    expect(service).toMatch(/buildChapterVerse\(\{\s*verses: material\.verses,\s*engagedNumbers: material\.engagedNumbers/);
  });

  it('builds "which comes first" from the same partners the probe counted', () => {
    const verse = body(service, 'async function loadVerseMaterialUncached(');
    expect(verse).toContain('beforePartners: verseBeforePartners(at.verse, engagedNumbers).length');
    expect(verse).toContain('engagedNumbers.includes(next.verse)');
    const before = body(service, 'async function buildVerseBeforeFor(');
    expect(before).toContain('verseBeforePartners(at.verse, engagedNumbers)');
    expect(before).not.toContain('neighbourVerseAddresses');
  });
});

/**
 * An annotation put on screen as a review question must be words, not markup.
 *
 * `miniNoteBody` and `notesBody` are HTML — `study-threads.ts` canonicalises them as such on
 * write — and the dock renders the note-annotation stem as *escaped text*, so anything left in
 * the string is shown to the reader literally. An annotation containing a scripture pill was
 * being displayed as `<span data-scripture-reference="…">…</span>` inside curly quotes.
 *
 * The same string is also what the three-word floor is counted over at both call sites, so an
 * unstripped stem let a one-word annotation into the draw on the strength of its tags.
 *
 * Read from source in the style of `review-engine-backlog-cap.test.ts` next door: the rung this
 * guards is a database call end to end, and `annotationTextOf` is private to that module. What
 * this can still do is fail the moment the strip is dropped again — which is the whole history
 * of this bug, since every neighbouring rung already stripped and this one silently did not.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const source = readFileSync(join(repoRoot, 'server/utils/review-service.ts'), 'utf8');

/** The body of `annotationTextOf`, up to the next top-level declaration. */
const annotationTextOf = source.slice(
  source.indexOf('function annotationTextOf('),
  source.indexOf('async function loadNoteMaterial('),
);

describe('the note-annotation stem', () => {
  it('strips HTML before the text reaches the reader', () => {
    expect(annotationTextOf).toContain('stripHtml(');
  });

  it('returns through the strip rather than merely collapsing whitespace', () => {
    /* The old body ended in `.replace(/\s+/g, ' ')` over the raw column and nothing else, which
       is how the markup shipped. `stripHtml` collapses whitespace itself, so the returned
       expression being the strip is the property worth pinning. */
    expect(annotationTextOf).toMatch(/return\s+stripHtml\(/);
  });

  it('is the single seam both the floor check and the builder read through', () => {
    /* If either call site stops routing through it, one of them can disagree about whether an
       annotation is long enough — the floor counting tags while the stem shows words. */
    const callSites = source.match(/annotationTextOf\(/g) ?? [];
    // One declaration + the floor check + the builder.
    expect(callSites.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the note-span stem', () => {
  it('strips the anchor columns too, since the dock renders them as text', () => {
    /* Normally plain text, but the failure branch in study-threads.ts writes the client-supplied
       quote raw — the same way an unstripped string reached the screen on the annotation rung. */
    const spans = source.slice(
      source.indexOf('const spans = quoted'),
      source.indexOf('const span = spans.length'),
    );
    expect(spans).toContain('stripHtml(row.quote)');
    expect(spans).toContain('stripHtml(row.prefix)');
    expect(spans).toContain('stripHtml(row.suffix)');
  });
});

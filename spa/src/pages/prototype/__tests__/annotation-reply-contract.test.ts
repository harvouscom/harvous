/**
 * Answering another member's annotation.
 *
 * A reply is an ordinary annotation that lands on the *same* anchor — no new
 * table, no new route — which is why the rules that make it work live in two
 * places that look unrelated: the dock decides when Reply is offered, and the
 * editor decides what it writes. Asserted against the source, in the style of
 * shared-thread-loop-contract, because each of these is a line that would go
 * quietly wrong rather than fail loudly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const dock = () => withoutComments(source('src/components/react/HighlightDockWeb.tsx'));
const editor = () => source('src/components/react/TiptapEditor.tsx');

/** The `replyToAnnotation` body, sliced off the editor's 11k lines. */
function replyBody(): string {
  const text = withoutComments(editor());
  const start = text.indexOf('const replyToAnnotation = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('const handleHoverPreviewOpen', start);
  return text.slice(start, end === -1 ? start + 4000 : end);
}

describe('Reply is offered exactly where answering is possible', () => {
  it('is not gated on the card being editable', () => {
    /*
      Read-only is the state Reply exists for: someone else's annotation, whose
      text you may not edit and whose point you may want to take up. Putting it
      behind `!readOnly` alongside the editable fields is precisely how
      "you can annotate Sarah's note and she cannot answer" would have survived.
    */
    const text = dock();
    const start = text.indexOf('{onReply &&');
    expect(start).toBeGreaterThan(-1);
    const condition = text.slice(start, text.indexOf('?', start));
    expect(condition).not.toContain('readOnly');
  });

  it('is offered only on someone else’s annotation', () => {
    // Replying to yourself is just writing more, and the note field already is
    // that. Same test that draws the author's name.
    const text = dock();
    const start = text.indexOf('{onReply &&');
    expect(text.slice(start, text.indexOf('?', start))).toContain('showAuthorAttribution');
  });

  it('is supplied only inside a shared room', () => {
    // The dock checks "someone else's"; the editor supplies the room.
    const text = withoutComments(editor());
    const start = text.indexOf('onReply={');
    expect(start).toBeGreaterThan(-1);
    expect(text.slice(start, start + 200)).toContain('sharedAnnotationOverlayMode');
  });
});

describe('a reply lands on the annotation it answers', () => {
  it('copies the anchor off the card instead of a selection', () => {
    const body = replyBody();
    expect(body).toContain('session.range');
    expect(body).toContain('anchorTextSnapshot: snippet');
    // Never the live selection — that is the bug this whole affordance removes.
    expect(body).not.toContain('resolveSelectionBarRange');
    expect(body).not.toContain('state.selection');
  });

  it('converts to a plain-text offset in shared mode, as the selection bar does', () => {
    /*
      The server stores a plain-text offset for a shared annotation, not a
      ProseMirror position. Sending `range.from` unconverted would anchor the
      reply somewhere else in the note — and it would still be a valid number,
      so nothing would fail.
    */
    const body = replyBody();
    expect(body).toContain('sharedAnnotationOverlayMode');
    expect(body).toContain("textBetween(0, range.from, '\\n').length");
  });

  it('inherits the accent it is answering', () => {
    // The overlay paints a group in the colour of whichever entry starts it, so
    // a different accent would claim this is a separate remark on the same words.
    expect(replyBody()).toContain('highlightAccentRaw: session.accent');
  });

  it('never marks the document it is replying inside', () => {
    /*
      The note belongs to someone else and the editor is not editable in shared
      mode; the overlay paints from the entry rows. A `setHighlight` here would
      be an edit of their note.
    */
    const body = replyBody();
    expect(body).not.toContain('setHighlight');
    expect(body).not.toContain('onContentChange');
  });

  it('opens the new annotation rather than leaving the old one on screen', () => {
    const body = replyBody();
    expect(body).toContain('openOrFocusHighlight');
    expect(body).toContain('isOwnHighlight: true');
  });

  it('says so when the reply did not save', () => {
    // The card it opens would otherwise be a reply that exists only on screen.
    const body = replyBody();
    expect(body).toContain('if (!studyId)');
    expect(body).toContain('toast');
  });
});

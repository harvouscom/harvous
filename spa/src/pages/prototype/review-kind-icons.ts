/**
 * The glyph each review item is drawn with.
 *
 * The sibling of `recall-kind-icons.ts`, and here for the same reason: which icon a row wears
 * is a question only the client has, so the shared allowlist in `@/utils/review-item-kinds`
 * never takes a dependency on the icon set.
 *
 * It replaces `item.kind === 'verse' ? 'book-open' : 'arrows-rotate'`, which is the exact
 * failure the recall map was written to end — four of the five kinds wearing one glyph without
 * anyone deciding they should. A row said "Review" when what the reader needed to know at a
 * glance was "a note", "a verse", "a link you made".
 *
 * Every glyph here is the one that thing already wears elsewhere in the app. A review row is
 * not a new kind of object; it is a question about an object the reader already recognises.
 */
import type { IconName } from '@/components/react/Icon';
import type { ReviewItemKind } from '@/utils/review-item-kinds';

export const REVIEW_KIND_ICONS: Record<ReviewItemKind, IconName> = {
  /*
   * `note-sticky` — a note.
   *
   * Not `pen-to-square`, which is the compose-new-note button in the toolbar: on a row about a
   * note you already wrote, that reads as an invitation to write another one. And not
   * `arrow-rotate-left`, recall's "revisit a note", which names the *action* — every row in
   * Review is a revisit, so it would say nothing. The icon is here to name the subject.
   */
  note: 'note-sticky',

  /** The one that was already right, and the reason the rest of this file exists. */
  verse: 'book-open',

  /*
   * `highlighter` — the thing itself.
   *
   * `highlightEntryKindIconName` cannot help here: it picks from the entry's kind, and a review
   * item carries no entry kind. That resolver hands most highlights `note-sticky`, which is
   * spoken for by the note above anyway.
   */
  highlight: 'highlighter',

  /*
   * Both wear `arrow-right-arrow-left`, which is the thread glyph everywhere in the app — the
   * sidebar's thread list, thread rows, the trail, search results — and what
   * `highlightEntryKindIconName` gives a linked note. They share it because they are the same
   * kind of thing seen at two sizes: an edge, and the cluster that edge belongs to. The
   * questions read nothing alike, so the row still tells them apart.
   */
  connection: 'arrow-right-arrow-left',
  thread: 'arrow-right-arrow-left',
};

export function reviewKindIcon(kind: ReviewItemKind): IconName {
  return REVIEW_KIND_ICONS[kind];
}

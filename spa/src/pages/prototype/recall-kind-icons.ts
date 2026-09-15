/**
 * The glyph each recall suggestion is drawn with.
 *
 * Deliberately here rather than beside `RECALL_KIND_LABELS` in `@/utils/recall-opportunity-kinds`:
 * that module is the allowlist the server shares, and which icon a card wears is a question only
 * the client has. Keeping it out means the server never takes a type dependency on the icon set.
 *
 * These used to be twelve loose literals scattered down the generator in
 * `PrototypeSidebarHomeView`, which is how five different kinds ended up wearing the same glyph
 * without anyone deciding they should.
 */
import type { IconName } from '@/components/react/Icon';
import type { RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';

export const RECALL_KIND_ICONS: Record<RecallOpportunityKind, IconName> = {
  revisitNote: 'arrow-rotate-left',

  /*
   * An arc or shared theme is something you keep returning to. It may become a Thread;
   * it is not one yet. The thread glyph is reserved for Threads that already exist —
   * wearing it here made the greeting chip read as an existing Thread named after the theme.
   */
  arc: 'arrow-rotate-left',
  subject: 'arrow-rotate-left',
  searchGap: 'magnifying-glass',
  /* Two notes to join — that one really is a Thread being made. */
  connectNotes: 'arrow-right-arrow-left',

  /*
   * Cross-references do not. They point one passage at another; nothing about them creates or
   * opens a thread, so wearing the thread glyph made them read as thread suggestions and left
   * the shelf looking like it was proposing the same thing five times over.
   *
   * `shuffle` rather than something new: it is already the cross-reference glyph in the
   * scripture dock, where it toggles "Show cross-references" — so the shelf now names the
   * thing with the same mark the surface it opens uses for it.
   */
  crossref: 'shuffle',
  crossrefGap: 'shuffle',

  passage: 'scroll',
  continueBook: 'scroll',
  referenceWord: 'lines-leaning',
  studyPerson: 'circle-user',
  annotateHighlight: 'pen-to-square',

  /*
   * Two kinds vary per card and override this at the call site: `highlight` picks from the
   * highlight's own entry kind (`highlightEntryKindIconName`), and `reflection` shows a
   * calendar during a season. The value here is the ordinary case for each.
   */
  highlight: 'note-sticky',
  reflection: 'pen-to-square',
  /* Marking, not composing: `pen-to-square` is the toolbar's new-note button, and this card
     asks you to go into a note you already have. */
  markNote: 'highlighter',
  /*
   * `pen-to-square` — write. The same glyph `reflection` wears, and for the same reason: what
   * this card offers is a blank note, not a passage to read. `book-open-reader` belongs to the
   * Review row about a chapter, which asks rather than invites.
   */
  readingNote: 'pen-to-square',
  /* The glyph a Thread wears everywhere else in the app. */
  reflectThread: 'arrow-right-arrow-left',
};

export function recallKindIcon(kind: RecallOpportunityKind): IconName {
  return RECALL_KIND_ICONS[kind];
}

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
   * `arrow-right-arrow-left` is the thread glyph everywhere else in the app — the sidebar's
   * thread list, thread rows, the thread trail, search results. These three keep it because
   * what they propose genuinely is a thread: an arc, a shared theme, or two notes to join.
   */
  arc: 'arrow-right-arrow-left',
  subject: 'arrow-right-arrow-left',
  connectNotes: 'arrow-right-arrow-left',

  /*
   * Cross-references do not. They point one passage at another; nothing about them creates or
   * opens a thread, so wearing the thread glyph made them read as thread suggestions and left
   * the shelf looking like it was proposing the same thing five times over.
   */
  crossref: 'link',
  crossrefGap: 'link',

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
};

export function recallKindIcon(kind: RecallOpportunityKind): IconName {
  return RECALL_KIND_ICONS[kind];
}

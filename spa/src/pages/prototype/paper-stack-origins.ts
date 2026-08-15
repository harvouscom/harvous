/**
 * Builders for the origins a sheet can be stacked over. Pure, so the "which cards stack and
 * what does the edge say" decisions can be tested without rendering a carousel.
 */

import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { recallKindCreatesNote, recallKindDisplayLabel } from '@/utils/recall-opportunity-kinds';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import type { PaperStackOrigin } from '../../layouts/proto-shell-context';
import { noteParamSlug } from './proto-route-slugs';

/**
 * Recall kinds whose tap resolves in the sidebar layer or a passage pane rather than in a
 * note — a study arc drills the sidebar to a proposal, a passage opens the standalone pane.
 * Nothing stacks over Home for those, because no sheet is put over anything.
 */
const SIDEBAR_LAYER_RECALL_KINDS: ReadonlySet<string> = new Set([
  'arc',
  'subject',
  'crossref',
  'passage',
  'connectNotes',
]);

export type RecallCardLike = {
  kind: string;
  eyebrow?: string | null;
  title?: string | null;
  meta?: string | null;
  iconName: string;
};

/**
 * The origin for a Home recall card, or null when tapping it does not open a note.
 *
 * Generative kinds create a draft rather than open something, and sidebar-layer kinds never
 * put a sheet over anything, so neither gets an edge. What remains — revisit a note, open a
 * highlight, annotate one, look a word up — is a note opened *because a card sent you*, and
 * that is what the edge exists to say.
 */
export function buildRecallCardStackOrigin(op: RecallCardLike): PaperStackOrigin | null {
  if (recallKindCreatesNote(op.kind as never)) return null;
  if (SIDEBAR_LAYER_RECALL_KINDS.has(op.kind)) return null;

  const eyebrow = op.eyebrow?.trim() || recallKindDisplayLabel(op.kind);
  const title = op.title?.trim() || eyebrow;
  return {
    kind: 'homeCard',
    cardKind: op.kind,
    label: eyebrow,
    icon: op.iconName,
    returnTo: { to: prototypeHomeRouteTo() },
    base: {
      type: 'originCard',
      eyebrow,
      title,
      meta: op.meta?.trim() || undefined,
      icon: op.iconName,
    },
  };
}

/** The origin for Home's standalone "Worth another look" card. */
export function buildRevisitCardStackOrigin(note: {
  title: string | null | undefined;
  meta?: string | null;
}): PaperStackOrigin {
  const eyebrow = 'Worth another look';
  return {
    kind: 'homeCard',
    cardKind: 'revisit',
    label: eyebrow,
    icon: 'arrow-rotate-left',
    returnTo: { to: prototypeHomeRouteTo() },
    base: {
      type: 'originCard',
      eyebrow,
      title: stripServerAutoUntitledNoteTitleForDisplay(note.title) || 'Untitled',
      meta: note.meta?.trim() || undefined,
      icon: 'arrow-rotate-left',
    },
  };
}

/** What a scripture dock's collapse target is, minus the nonce — see `noteDockReturnSearch`. */
export type NoteDockOriginInput = {
  noteId: string;
  noteTitle: string | null | undefined;
  /** The dock's anchor — the reference on the pill, not wherever the reader ends up. */
  reference: string;
  translation: string;
  spaceId?: string | null;
};

/**
 * The origin for a note whose scripture dock expanded into the reader.
 *
 * `returnTo` is frozen here, at expand time, and that is the whole anchor rule: read three
 * chapters on and collapse, and the dock reopens on the pill's reference, because nothing
 * the reader does can reach into this object. `dockReq` is deliberately *not* stored — the
 * note re-opens its dock on a fresh nonce, so it is minted at collapse time instead.
 */
export function buildNoteDockOrigin(input: NoteDockOriginInput): PaperStackOrigin {
  const title = stripServerAutoUntitledNoteTitleForDisplay(input.noteTitle) || 'Your note';
  const space = input.spaceId?.trim() || undefined;
  return {
    kind: 'noteDock',
    label: title,
    icon: 'note-sticky',
    returnTo: {
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(input.noteId) },
      search: {
        ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
        space,
        scriptureRef: input.reference,
        scriptureTranslation: input.translation,
      },
    },
    base: {
      type: 'originCard',
      title,
      meta: `${input.reference} · ${input.translation}`,
      icon: 'note-sticky',
    },
  };
}

/**
 * The search a noteDock collapse navigates with: the frozen returnTo plus a nonce minted
 * now. The nonce is the note page's `requestKey` for its scripture dock, so a fresh one per
 * collapse is what makes the dock reopen on every expand/collapse cycle rather than only the
 * first.
 */
export function noteDockReturnSearch(
  origin: PaperStackOrigin,
  now: number = Date.now(),
): Record<string, string | undefined> {
  return { ...(origin.returnTo.search ?? {}), dockReq: String(now) };
}

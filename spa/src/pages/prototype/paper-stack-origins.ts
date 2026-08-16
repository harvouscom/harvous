/**
 * Builders for the origins a sheet can be stacked over. Pure, so the "which cards stack and
 * what does the edge say" decisions can be tested without rendering a carousel.
 */

import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { recallKindDisplayLabel } from '@/utils/recall-opportunity-kinds';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import type { PaperStackMorphFrom, PaperStackOrigin } from '../../layouts/proto-shell-context';
import { noteParamSlug } from './proto-route-slugs';

/**
 * Recall kinds whose tap resolves in the sidebar layer or a passage pane rather than in the
 * main pane — a study arc drills the sidebar to a proposal, a passage opens the standalone
 * pane, connect-notes opens a thread prefill. Nothing stacks for those, because nothing is
 * put over anything: you are still on Home when they finish.
 */
const SIDEBAR_LAYER_RECALL_KINDS: ReadonlySet<string> = new Set([
  'arc',
  'subject',
  'crossref',
  'passage',
  'connectNotes',
]);

export type RecallCardLike = {
  /** The row's own id on the shelf, so the edge can put it back or rest it. */
  id?: string;
  kind: string;
  eyebrow?: string | null;
  title?: string | null;
  meta?: string | null;
  iconName: string;
};

/**
 * The origin for a Home recall card, or null when tapping it leaves you on Home.
 *
 * Every kind that takes you off the shelf gets an edge — including the ones that open a
 * blank draft. That was not true at first: generative kinds were excluded on the reasoning
 * that a draft is not "opened because a card sent you", which had it backwards. A note that
 * already exists carries its own context; a blank page carries none, so the card that asked
 * for it is the *only* thing on screen that says why you are looking at it. `crossrefGap`
 * was the clearest case — it is classed generative but usually navigates to a note you
 * already have, and it arrived with nothing at the top at all.
 *
 * What is still excluded is what never leaves: the sidebar-layer kinds resolve in the panel
 * beside you, and an edge there would promise a way back to the page you are already on.
 */
export function buildRecallCardStackOrigin(op: RecallCardLike): PaperStackOrigin | null {
  if (SIDEBAR_LAYER_RECALL_KINDS.has(op.kind)) return null;

  const eyebrow = op.eyebrow?.trim() || recallKindDisplayLabel(op.kind);
  const title = op.title?.trim() || eyebrow;
  return {
    kind: 'homeCard',
    cardKind: op.kind,
    suggestion: op.id ? { id: op.id, kind: op.kind } : undefined,
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
  /** The dock card's on-screen rect, so the chapter can grow out of it. */
  morphFrom?: PaperStackMorphFrom;
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
  // `New Note` for an untitled one, matching note rows, search and the mention picker.
  // "Your note" named the pane rather than the note, and read as a label for all of them.
  const title = stripServerAutoUntitledNoteTitleForDisplay(input.noteTitle) || 'New Note';
  const space = input.spaceId?.trim() || undefined;
  return {
    kind: 'noteDock',
    label: title,
    icon: 'note-sticky',
    morphFrom: input.morphFrom,
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

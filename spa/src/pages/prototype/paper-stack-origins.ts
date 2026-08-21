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
 * Recall kinds whose tap resolves in the sidebar layer rather than in the main pane — a study
 * arc drills the sidebar to a proposal, connect-notes opens a thread prefill. Nothing stacks
 * for those, because nothing is put over anything: you are still on Home when they finish.
 *
 * `passage` used to be in here, and the reason was true at the time: it opened a standalone
 * passage pane. That pane is gone and the card now opens the reader, which is a real
 * navigation into the main pane — so it earns an edge like every other kind that takes you
 * off the shelf. It was the one card that could move you somewhere and leave nothing behind
 * saying why.
 */
const SIDEBAR_LAYER_RECALL_KINDS: ReadonlySet<string> = new Set([
  'arc',
  'subject',
  'crossref',
  'connectNotes',
]);

/**
 * Card kinds whose destination is a chapter rather than a note.
 *
 * The teardown table reads this: a Home card's edge normally clears the moment you land on
 * the reader, because the reader is its own base and not something Home stands behind. When
 * the card *is* "open this passage", the chapter you arrive on is the thing it sent you to,
 * so the edge is still telling the truth and stays.
 */
export const READER_DESTINED_CARD_KINDS: ReadonlySet<string> = new Set(['passage']);

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

/**
 * Where the dock band is, and whether a panel is taking part of it.
 *
 * Not the dock card — that is unmounted at collapse time and its slot collapses to a
 * zero-sized box, which is why this exists at all. The band it lives in is mounted either
 * way, and its left edge, width and bottom are exactly what the sidebar's width and the
 * window's size move. The one thing the band does *not* show is the docked inspector's
 * reserve, which is padding on the slot and so only appears while the slot has a card in it
 * — hence the flag beside it.
 *
 * The first version of this read the shell's whole class list instead, which quietly broke
 * the thing it was guarding: the note route carries `--note-chrome` and the reader does not,
 * so expanding from a note and collapsing back could never match, and the morph was
 * suppressed every single time. Route chrome is not layout. Only measure what moves the dock.
 */
export function readPaperStackDockPlacement(): string | null {
  if (typeof document === 'undefined') return null;
  const band = document.querySelector('.proto-shell__study-dock-layer');
  if (!band) return null;
  const rect = band.getBoundingClientRect();
  const inspectorDocked = document.querySelector(
    '.proto-main-pane--inspector-docked, .proto-note-pane-row--inspector-open',
  );
  return [
    Math.round(rect.left),
    Math.round(rect.width),
    Math.round(rect.bottom),
    inspectorDocked ? 'inspector' : '',
  ].join('|');
}

/**
 * The morph rect, if the dock band is still where it was when the rect was taken.
 *
 * A collapse plays the expand in reverse: the clip closes onto the rect captured while the
 * dock was still on screen, minutes and several chapters ago. Between the two the sidebar can
 * collapse or be dragged, an inspector can dock, the window can be resized — each of which
 * puts the dock card somewhere else, and none of which can be found by measuring the card,
 * because the card is not mounted. So the band stands in for it. When the band has moved, the
 * honest answer is no morph: the sheet leaves the way any other sheet does, which is right
 * rather than a flourish aimed at the wrong part of the screen.
 *
 * Pure, and given the placement rather than reading it, so the rule is testable without a
 * DOM. `null` means there was nothing to read — mid-teardown, or a test — and a rect that
 * cannot be checked is not one to animate onto.
 */
export function morphFromIfStillPlaced(
  morphFrom: PaperStackMorphFrom | undefined,
  placement: string | null,
): PaperStackMorphFrom | undefined {
  if (!morphFrom || !placement) return undefined;
  return morphFrom.dockPlacement === placement ? morphFrom : undefined;
}

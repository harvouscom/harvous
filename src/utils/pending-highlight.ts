/**
 * A highlight shown before the server has confirmed it.
 *
 * Tapping Highlight used to wait for `POST /study-threads` before anything moved — no colour,
 * no dock — so the gesture read as broken on anything slower than a fast connection. The
 * editor now paints the mark and opens the dock at once.
 *
 * The mark carries its final id from its first frame: the client proposes one
 * (`newClientStudyThreadEntryId`) and the create route accepts it. That is what makes this
 * safe. An earlier version painted an id-less mark and attached the server's id on reply, and
 * every way that reply could arrive late broke it — a new note's editor remounts a few seconds
 * after creation, and the open-time orphan backfill treats an id-less mark as a row to create,
 * so one highlight became two. With the id already on the mark, neither can happen, and a
 * retried POST is idempotent on the server.
 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import {
  highlightDockStableKey,
  updateDockEntry,
  type StudyDockStack,
} from './study-dock-stack';

/**
 * `generateStudyThreadEntryId`'s shape (`study_<ms>`) plus six random digits, because unlike
 * the server this runs on many machines at once. The route accepts `^study_\d{13,19}$`.
 */
export function newClientStudyThreadEntryId(now: number = Date.now(), random: () => number = Math.random): string {
  return `study_${now}${String(Math.floor(random() * 1e6)).padStart(6, '0')}`;
}

/** Every range whose highlight mark carries `studyThreadEntryId === id`. Position-free. */
export function highlightRangesWithId(
  doc: ProseMirrorNode,
  id: string,
  markTypeName = 'highlight',
): Array<{ from: number; to: number; attrs: Record<string, unknown> }> {
  const out: Array<{ from: number; to: number; attrs: Record<string, unknown> }> = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === markTypeName && m.attrs.studyThreadEntryId === id);
    if (!mark) return;
    const last = out[out.length - 1];
    if (last && last.to === pos) last.to = pos + node.nodeSize;
    else out.push({ from: pos, to: pos + node.nodeSize, attrs: { ...mark.attrs } });
  });
  return out;
}

/** Every highlight-marked run inside `range`, with the attrs it carries. */
function highlightRangesWithin(
  doc: ProseMirrorNode,
  range: { from: number; to: number },
  markTypeName = 'highlight',
): Array<{ from: number; to: number; attrs: Record<string, unknown> }> {
  const out: Array<{ from: number; to: number; attrs: Record<string, unknown> }> = [];
  const from = Math.max(0, range.from);
  const to = Math.min(doc.content.size, range.to);
  if (to <= from) return out;
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === markTypeName);
    if (!mark) return;
    const segFrom = Math.max(pos, from);
    const segTo = Math.min(pos + node.nodeSize, to);
    if (segTo <= segFrom) return;
    out.push({ from: segFrom, to: segTo, attrs: { ...mark.attrs } });
  });
  return out;
}

/**
 * Recolour one highlight in place and return the transaction, or null when it cannot be found.
 *
 * Only `color` changes. The dock used to rebuild the mark from `{ color, studyThreadEntryId }`
 * alone, which dropped every other attribute — and while a new highlight was still waiting on
 * its row, the card's id was null, so the rebuilt mark lost the client id it was painted with.
 * The POST then landed, found no mark carrying that id, and the highlight was an orphan again:
 * the server kept amber, and the next backfill made it a second row. A phone's slower round
 * trip is what made "pick a colour right after highlighting" land in that window.
 *
 * Found by id first (position-free, so text typed since cannot misplace it). With no id, by the
 * range the card was opened for — and if a mark there carries an id of its own (the pending
 * client id), by that id after all.
 */
export function recolorHighlightTransaction(
  state: EditorState,
  target: { id: string | null; range: { from: number; to: number } | null },
  color: string,
  markTypeName = 'highlight',
): Transaction | null {
  const markType = state.schema.marks[markTypeName];
  if (!markType) return null;
  let ranges = target.id ? highlightRangesWithId(state.doc, target.id, markTypeName) : [];
  if (ranges.length === 0 && target.range) {
    const within = highlightRangesWithin(state.doc, target.range, markTypeName);
    const ownId = within.find((r) => typeof r.attrs.studyThreadEntryId === 'string')?.attrs
      .studyThreadEntryId as string | undefined;
    const byOwnId = ownId ? highlightRangesWithId(state.doc, ownId, markTypeName) : [];
    ranges = byOwnId.length > 0 ? byOwnId : within;
  }
  if (ranges.length === 0) return null;
  const tr = state.tr;
  for (const r of ranges) {
    tr.addMark(r.from, r.to, markType.create({ ...r.attrs, color }));
  }
  return tr;
}

/** The colour the highlight carrying `id` is painted in now, or null if there is none. */
export function highlightColorWithId(doc: ProseMirrorNode, id: string, markTypeName = 'highlight'): string | null {
  const [first] = highlightRangesWithId(doc, id, markTypeName);
  const color = first?.attrs.color;
  return typeof color === 'string' ? color : null;
}

/**
 * Give the dock card opened for `range` its row id.
 *
 * The card opens id-less so it cannot PATCH a row that does not exist yet; the dock holds
 * anything typed meanwhile and flushes it when the id lands. Re-keying the card, rather than
 * opening a second one under the id, keeps one highlight one card.
 */
export function adoptHighlightEntryId(
  stack: StudyDockStack,
  range: { from: number; to: number },
  studyThreadEntryId: string,
): StudyDockStack {
  const pendingKey = highlightDockStableKey(null, range);
  const entry = stack.entries.find((e) => e.stableKey === pendingKey && e.kind === 'highlight');
  if (!entry) return stack;
  return updateDockEntry(stack, entry.id, (e) =>
    e.kind === 'highlight'
      ? {
          ...e,
          stableKey: highlightDockStableKey(studyThreadEntryId, range),
          session: { ...e.session, studyThreadEntryId },
        }
      : e,
  );
}

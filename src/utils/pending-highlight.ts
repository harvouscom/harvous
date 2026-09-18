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

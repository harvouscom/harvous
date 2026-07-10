import { Mark, getMarkRange } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { MENTION_KINDS, type MentionKind } from './mention-pill-types';

/**
 * A saved mention span is only honored when its kind is a known mention kind and it carries a
 * non-empty entity id. Anything else (corrupted/hand-edited spans) loads as plain text instead
 * of re-hydrating a broken pill — same policy as pillSpanIsValidReference for scripture pills.
 */
export function mentionSpanIsValid(kind: string | null, entityId: string | null): boolean {
  if (!kind || !MENTION_KINDS.includes(kind as MentionKind)) return false;
  if (!entityId || !entityId.trim()) return false;
  return true;
}

export interface MentionPillOptions {
  HTMLAttributes: Record<string, any>;
}

export interface InsertMentionPillArgs {
  kind: MentionKind;
  entityId: string;
  spaceId: string | null;
  label: string;
  /** The `@query` range to replace (from = position of `@`, to = caret). */
  range: { from: number; to: number };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mentionPill: {
      /**
       * Replace the active `@query` range with a mention pill followed by a spacer space.
       */
      insertMentionPill: (args: InsertMentionPillArgs) => ReturnType;
    };
  }
}

export const MentionPill = Mark.create<MentionPillOptions>({
  name: 'mentionPill',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      kind: {
        default: null,
        parseHTML: element => element.getAttribute('data-mention-kind'),
        renderHTML: attributes => {
          if (!attributes.kind) {
            return {};
          }
          return {
            'data-mention-kind': attributes.kind,
          };
        },
      },
      entityId: {
        default: null,
        parseHTML: element => element.getAttribute('data-mention-id'),
        renderHTML: attributes => {
          if (!attributes.entityId) {
            return {};
          }
          return {
            'data-mention-id': attributes.entityId,
          };
        },
      },
      spaceId: {
        default: null,
        parseHTML: element => element.getAttribute('data-mention-space-id'),
        renderHTML: attributes => {
          if (!attributes.spaceId) {
            return {};
          }
          return {
            'data-mention-space-id': attributes.spaceId,
          };
        },
      },
    };
  },

  // CRITICAL: Set inclusive to false to prevent mark "stickiness" at boundaries
  inclusive: false,

  // Exclude ALL other marks to prevent inheritance when typing after a pill
  excludes: '_',

  parseHTML() {
    return [
      {
        // :not([data-scripture-reference]) keeps scripture pills out; NoteLink spans carry
        // data-note-id, never data-mention-*, so there is no overlap in the other direction.
        tag: 'span[data-mention-kind][data-mention-id]:not([data-scripture-reference])',
        getAttrs: element => {
          const el = element as HTMLElement;
          const kind = el.getAttribute('data-mention-kind');
          const entityId = el.getAttribute('data-mention-id');
          if (!mentionSpanIsValid(kind, entityId)) {
            return false;
          }
          const spaceId = el.getAttribute('data-mention-space-id');
          return { kind, entityId, spaceId: spaceId || null };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = HTMLAttributes['data-mention-kind'] || null;
    const entityId = HTMLAttributes['data-mention-id'] || null;

    if (!mentionSpanIsValid(kind, entityId)) {
      return ['span', {}, 0];
    }

    // Minimal inline style so stored HTML degrades gracefully on surfaces without the CSS
    // (native, emails, previews). IMPORTANT: border-radius must NOT be the first property —
    // the sanitizer soup-stripper in scripture-pill-display.ts keys on the exact string
    // `style="border-radius: 12px`. No user-select: all (that hack is scripture-pill-only and
    // is what breaks ProseMirror click positions there).
    const baseStyle =
      'padding: 2px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; font-weight: 500; font-style: normal; font-size: inherit; color: var(--color-deep-grey); vertical-align: baseline; line-height: inherit; white-space: normal; cursor: pointer;';

    return [
      'span',
      {
        ...this.options.HTMLAttributes,
        ...HTMLAttributes,
        class: 'mention-pill',
        style: baseStyle,
      },
      0,
    ];
  },

  addCommands() {
    return {
      insertMentionPill: ({ kind, entityId, spaceId, label, range }) => ({ state, tr, dispatch }) => {
        const markType = state.schema.marks.mentionPill;
        if (!markType) return false;
        const text = (label || '').trim();
        if (!text || !mentionSpanIsValid(kind, entityId)) return false;
        if (dispatch) {
          const from = range.from;
          // Replace the `@query` with the label plus a trailing spacer space (same convention
          // as scripture pills) so the caret lands outside the mark and typing continues plain.
          tr.insertText(text + ' ', range.from, range.to);
          tr.addMark(from, from + text.length, markType.create({ kind, entityId, spaceId }));
          tr.setSelection(TextSelection.create(tr.doc, from + text.length + 1));
          tr.setStoredMarks([]);
        }
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      // Safety net: strip mentionPill from stored marks when the cursor is not inside a pill,
      // preventing the mark from "sticking" to newly typed text.
      new Plugin({
        key: new PluginKey('mentionPillStoredMarks'),
        appendTransaction(_transactions, _oldState, newState) {
          const { selection, storedMarks } = newState;
          if (!storedMarks) return null;

          const hasPillMark = storedMarks.some(m => m.type.name === 'mentionPill');
          if (!hasPillMark) return null;

          const $from = selection.$from;
          const insidePill = $from.marks().some(m => m.type.name === 'mentionPill');

          if (!insidePill) {
            const cleaned = storedMarks.filter(m => m.type.name !== 'mentionPill');
            return newState.tr.setStoredMarks(cleaned);
          }

          return null;
        },
      }),
      // If the collapsed cursor lands inside a mention pill (inclusive:false + last-in-block),
      // snap it to the position after the mark — mirror of scripturePillSnapCursor.
      new Plugin({
        key: new PluginKey('mentionPillSnapCursor'),
        appendTransaction(_transactions, _oldState, newState) {
          const sel = newState.selection;
          if (!(sel instanceof TextSelection)) return null;
          const markType = newState.schema.marks.mentionPill;
          if (!markType) return null;

          const $from = sel.$from;
          const parent = $from.parent;
          const offset = $from.parentOffset;

          const after = parent.childAfter(offset);
          const afterInPill = after.node?.marks.some((m: any) => m.type === markType) ?? false;
          const before = parent.childBefore(offset);
          const beforeInPill = before.node?.marks.some((m: any) => m.type === markType) ?? false;

          if (!afterInPill && !beforeInPill) return null;
          // Collapsed cursor at a pill's LEFT edge is already outside the pill — leave it so the
          // front of a block that starts with a pill stays reachable.
          if (afterInPill && !beforeInPill && sel.empty) return null;
          // Cursor right after the pill with nothing following — already outside the mark.
          if (beforeInPill && !afterInPill && sel.empty) return null;

          const range = getMarkRange($from, markType) || (beforeInPill ? getMarkRange(newState.doc.resolve(Math.max(0, sel.from - 1)), markType) : null);
          if (!range) return null;
          if (sel.empty && sel.from === range.to) return null;
          return newState.tr
            .setSelection(TextSelection.create(newState.doc, range.to))
            .setStoredMarks([])
            .setMeta('addToHistory', false);
        },
      }),
    ];
  },
});

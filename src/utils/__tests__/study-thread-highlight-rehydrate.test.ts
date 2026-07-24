import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import Highlight from '@tiptap/extension-highlight';
import {
  rehydrateMissingBodyHighlightMarks,
  studyThreadEligibleForBodyMarkRehydrate,
  type StudyThreadRehydrateRow,
} from '@/utils/study-thread-highlight-rehydrate';

const highlightMark = Highlight.configure({
  multicolor: true,
  HTMLAttributes: {},
}).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      studyThreadEntryId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-study-thread-id'),
        renderHTML: (attrs) =>
          attrs.studyThreadEntryId
            ? { 'data-study-thread-id': String(attrs.studyThreadEntryId) }
            : {},
      },
      color: {
        default: 'warmAmber',
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (attrs) => ({ 'data-color': attrs.color }),
      },
    };
  },
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    highlight: highlightMark,
  },
});

function stateWithText(text: string) {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text(text))]);
  return EditorState.create({ doc });
}

function applyHighlight(
  state: EditorState,
  range: { from: number; to: number },
  attrs: { color: string; studyThreadEntryId: string },
): EditorState {
  const markType = schema.marks.highlight;
  const tr = state.tr.addMark(range.from, range.to, markType.create(attrs));
  return state.apply(tr);
}

describe('studyThreadEligibleForBodyMarkRehydrate', () => {
  it('includes miniNote with snippet', () => {
    expect(
      studyThreadEligibleForBodyMarkRehydrate({
        id: 't1',
        entryKind: 'miniNote',
        sourceSnippet: 'hello world',
      }),
    ).toBe(true);
  });

  it('excludes passage-only scriptureLink', () => {
    expect(
      studyThreadEligibleForBodyMarkRehydrate({
        id: 't2',
        entryKind: 'scriptureLink',
        scripturePassageExcerpt: 'In the beginning',
        scripturePassageTranslation: 'NET',
      }),
    ).toBe(false);
  });
});

describe('rehydrateMissingBodyHighlightMarks', () => {
  it('applies mark when anchor matches snippet', () => {
    const snippet = 'daily thing';
    const text = `Surrendering your life to Jesus is a ${snippet}.`;
    let state = stateWithText(text);
    const anchorLocation = 1 + text.indexOf(snippet);
    const anchorLength = snippet.length;

    const row: StudyThreadRehydrateRow = {
      id: 'hl-1',
      entryKind: 'miniNote',
      sourceSnippet: snippet,
      anchorTextSnapshot: snippet,
      anchorLocation,
      anchorLength,
      highlightAccentRaw: 'warmAmber',
    };

    let applyCount = 0;
    const applied = rehydrateMissingBodyHighlightMarks({
      editor: { state },
      studyThreads: [row],
      applyMark: (range, attrs) => {
        applyCount += 1;
        expect(range.from).toBe(anchorLocation);
        expect(range.to).toBe(anchorLocation + anchorLength);
        expect(attrs.studyThreadEntryId).toBe('hl-1');
        state = applyHighlight(state, range, attrs);
        return true;
      },
    });

    expect(applied).toBe(1);
    expect(applyCount).toBe(1);
  });

  it('skips when mark already present', () => {
    const row: StudyThreadRehydrateRow = {
      id: 'hl-2',
      entryKind: 'miniNote',
      sourceSnippet: 'world',
      anchorLocation: 7,
      anchorLength: 5,
    };
    let state = stateWithText('hello world');
    const editor = {
      state: {
        doc: {
          ...state.doc,
          descendants: (
            fn: (
              node: {
                isText: boolean;
                marks: Array<{ type: { name: string }; attrs: Record<string, unknown> }>;
                nodeSize: number;
              },
              pos: number,
            ) => boolean | void,
          ) => {
            fn(
              {
                isText: true,
                marks: [{ type: { name: 'highlight' }, attrs: { studyThreadEntryId: 'hl-2' } }],
                nodeSize: 5,
              },
              7,
            );
          },
        },
      },
    };

    let applyCount = 0;
    const applied = rehydrateMissingBodyHighlightMarks({
      editor,
      studyThreads: [row],
      applyMark: () => {
        applyCount += 1;
        return true;
      },
    });

    expect(applied).toBe(0);
    expect(applyCount).toBe(0);
  });

  it('skips ambiguous duplicate snippets', () => {
    const text = 'daily thing and another daily thing';
    let state = stateWithText(text);
    const row: StudyThreadRehydrateRow = {
      id: 'hl-3',
      entryKind: 'miniNote',
      sourceSnippet: 'daily thing',
    };

    const applied = rehydrateMissingBodyHighlightMarks({
      editor: { state },
      studyThreads: [row],
      applyMark: (range, attrs) => {
        state = applyHighlight(state, range, attrs);
        return true;
      },
    });

    expect(applied).toBe(0);
  });
});

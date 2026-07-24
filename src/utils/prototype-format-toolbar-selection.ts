export type FormatToolbarSelectionRange = { from: number; to: number };

type FormatToolbarDoc = {
  content: {
    size: number;
    childCount: number;
    lastChild: { textContent: string } | null;
  };
  resolve: (pos: number) => {
    parent: { textContent: string };
    index: (depth: number) => number;
  };
};

/** Caret at the trailing empty paragraph after body content (common stale snapshot). */
export function isEmptyTrailingDocEndSelection(
  doc: FormatToolbarDoc,
  from: number,
  to: number,
): boolean {
  if (from !== to) return false;
  const lastChild = doc.content.lastChild;
  if (!lastChild || lastChild.textContent.trim().length > 0) return false;

  try {
    const docSize = doc.content.size;
    const pos = Math.min(Math.max(1, from), docSize);
    const $pos = doc.resolve(pos);
    return (
      $pos.index(0) === doc.content.childCount - 1 && $pos.parent.textContent.trim().length === 0
    );
  } catch {
    return false;
  }
}

/** Selection worth remembering as "last in body" while the editor had focus. */
export function isMeaningfulFormatBodySelection(doc: FormatToolbarDoc, from: number, to: number): boolean {
  const docSize = doc.content.size;
  if (docSize === 0) return false;
  try {
    const $from = doc.resolve(Math.min(from, docSize));
    if ($from.parent.textContent.trim().length > 0) return true;
    const isAtEnd = from >= docSize - 1 && to >= docSize - 1;
    return !isAtEnd;
  } catch {
    return false;
  }
}

/** True when DOM focus is in the portaled / inline format toolbar (not ProseMirror). */
export function isEditorFormatChromeFocused(activeElement: Element | null | undefined): boolean {
  if (!activeElement || !(activeElement instanceof HTMLElement)) return false;
  return !!activeElement.closest(
    '[data-prototype-format-toolbar], .proto-editor-bottom-bar, .tiptap-toolbar',
  );
}

/** Skip prop→editor content sync while the user is using format toolbar chrome. */
export function shouldDeferEditorContentSyncForChromeFocus(opts: {
  editorIsFocused: boolean;
  proseMirrorFocused: boolean;
  formatToolbarPointerDown: boolean;
  formatToolbarInteractionUntilMs?: number;
  nowMs?: number;
  activeElement: Element | null | undefined;
}): boolean {
  const now = opts.nowMs ?? Date.now();
  return (
    opts.editorIsFocused ||
    opts.proseMirrorFocused ||
    opts.formatToolbarPointerDown ||
    (typeof opts.formatToolbarInteractionUntilMs === 'number' &&
      now < opts.formatToolbarInteractionUntilMs) ||
    isEditorFormatChromeFocused(opts.activeElement)
  );
}

export type PickFormatToolbarSelectionArgs = {
  frozen: FormatToolbarSelectionRange | null;
  liveFrom: number;
  liveTo: number;
  docSize: number;
  lastInBody: FormatToolbarSelectionRange | null;
  isEmptyTrailingDocEnd: (from: number, to: number) => boolean;
};

/** Pick the best selection for a portaled toolbar command (avoid stale doc-end snapshots). */
export function pickFormatToolbarSelection(args: PickFormatToolbarSelectionArgs): FormatToolbarSelectionRange {
  const live = { from: args.liveFrom, to: args.liveTo };
  const frozen = args.frozen;

  const liveIsBadEnd = args.isEmptyTrailingDocEnd(live.from, live.to);
  const frozenIsBadEnd = frozen ? args.isEmptyTrailingDocEnd(frozen.from, frozen.to) : true;

  if (frozen && !frozenIsBadEnd) {
    return frozen;
  }
  if (!liveIsBadEnd) {
    return live;
  }
  if (args.lastInBody) {
    return args.lastInBody;
  }
  if (frozen) {
    return frozen;
  }
  return live;
}

/** @deprecated Use pickFormatToolbarSelection — kept for simple call sites. */
export function resolveFormatToolbarSelection(
  frozen: FormatToolbarSelectionRange | null,
  liveFrom: number,
  liveTo: number,
): FormatToolbarSelectionRange {
  return pickFormatToolbarSelection({
    frozen,
    liveFrom,
    liveTo,
    docSize: Math.max(liveFrom, liveTo),
    lastInBody: null,
    isEmptyTrailingDocEnd: () => false,
  });
}

export function clampFormatToolbarSelection(
  range: FormatToolbarSelectionRange,
  docSize: number,
): FormatToolbarSelectionRange {
  const minPos = docSize > 0 ? 1 : 0;
  const from = Math.min(Math.max(minPos, range.from), docSize);
  const to = Math.min(Math.max(from, range.to), docSize);
  return { from, to };
}

/** Restore selection before running a format command (portaled toolbar parity with selection bar). */
import { isTiptapViewReady } from '@/utils/tiptap-helpers';

export function runFormatCommandWithPreservedSelection(
  editor: {
    chain: () => {
      focus: () => unknown;
      setTextSelection: (range: { from: number; to: number }) => unknown;
      run: () => boolean;
    };
    commands: {
      focus: () => boolean;
      setTextSelection: (range: { from: number; to: number }) => boolean;
    };
    view: { focus: () => void; dom: HTMLElement };
    state: { doc: { content: { size: number } } };
  },
  range: FormatToolbarSelectionRange,
  apply: (chain: ReturnType<typeof editor.chain>) => ReturnType<typeof editor.chain>,
): boolean {
  const selection = clampFormatToolbarSelection(range, editor.state.doc.content.size);

  if (!isTiptapViewReady(editor)) return false;

  try {
    editor.view.focus();
  } catch {
    /* ignore */
  }

  const runFocusedChain = () => apply(editor.chain().focus().setTextSelection(selection)).run();
  if (runFocusedChain()) return true;

  editor.commands.focus();
  editor.commands.setTextSelection(selection);
  if (apply(editor.chain().focus()).run()) return true;

  try {
    editor.view.dom.focus();
    editor.commands.setTextSelection(selection);
    if (apply(editor.chain()).run()) return true;
  } catch {
    /* ignore */
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.warn('[format-toolbar] command failed after selection restore', { selection });
  }
  return false;
}

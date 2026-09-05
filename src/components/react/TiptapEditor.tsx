import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
// BubbleMenu replaced with custom createPortal-based floating toolbar for reliability
import StarterKit from '@tiptap/starter-kit';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import {
  isDocTextEmpty,
  isTiptapBodyEmpty,
  normalizeEmptyBodyHtmlForEditor,
  preferredCaretPosForEmptyDoc,
} from '@/utils/prototype-note-empty';
import { shouldForcePrototypeNoteBodyHydrate } from '@/utils/prototype-note-editor-hydration';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import { getMarkRange } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';
import { NoteLink } from './TiptapNoteLink';
import { ScripturePill } from './TiptapScripturePill';
import { MentionPill } from './TiptapMentionPill';
import MentionPickerPanel, {
  cycleMentionKindFilter,
  mentionKindFilterOrderFor,
  type MentionKindFilter,
} from './MentionPickerPanel';
import {
  MENTION_KINDS,
  type MentionKind,
  type MentionPickerItem,
  type MentionPillClickPayload,
} from './mention-pill-types';
import { findMentionTrigger } from '@/utils/mention-trigger';
import {
  ScriptureDraft,
  enterScriptureDraftView,
  confirmScriptureDraftView,
  confirmAnyScriptureDraftView,
  cancelScriptureDraftView,
  getScriptureDraftRange,
  getScriptureDraftAnchorPos,
  getScriptureDraftAnchorElement,
  findDetachedScriptureDraft,
  hasActiveScriptureDraft,
  hasDraftContinuationTailInDoc,
  unifyScriptureDraftAtCursor,
  scheduleMobileDraftTailCaretSync,
  canSafelyResyncMobileDraftIdleCaret,
  resyncMobileCaret,
  getScriptureDraftValidity,
  editScripturePillAsDraft,
  SCRIPTURE_DRAFT_CONFIRMED_EVENT,
} from './TiptapScriptureDraft';
import { BoldCustom } from './TiptapBoldCustom';
import { isScriptureQuoteBlockquoteNode, ScriptureQuoteBlockquote } from './TiptapScriptureQuoteBlockquote';
import { HighlightCustom } from './TiptapHighlightCustom';
import { ParagraphCustom } from './TiptapParagraphCustom';
import { isSelectionActionBarEligible } from './selection-action-bar-eligibility';
import { contentSyncWouldClobberInlineImage } from './inline-image-insert';
import { contentSyncWouldClobberScripturePillAccent } from '@/utils/scripture-pill-accent-sync';
import {
  noteClipboardPlainTextFromFragment,
  noteClipboardPlainTextFromRange,
} from '@/utils/note-clipboard-plain-text';
import {
  isEmptyTrailingDocEndSelection,
  isMeaningfulFormatBodySelection,
  pickFormatToolbarSelection,
  runFormatCommandWithPreservedSelection,
  shouldDeferEditorContentSyncForChromeFocus,
  type FormatToolbarSelectionRange,
} from '@/utils/prototype-format-toolbar-selection';
import { flushCoalescedNoteHtmlOnUnmount } from '@/utils/prototype-note-content-propagation';
import { isTiptapViewReady } from '@/utils/tiptap-helpers';
import ScripturePillDeleteConfirm from './ScripturePillDeleteConfirm';

export { isSelectionActionBarEligible } from './selection-action-bar-eligibility';

/** HTML from the live editor; optionally normalize empty paragraphs for parent state. */
function noteHtmlFromEditor(editor: { getHTML: () => string }, canonicalizeBlankLines = false): string {
  const html = editor.getHTML();
  return canonicalizeBlankLines ? canonicalizeNoteHtmlLineBreaks(html) : html;
}
import {
  ReferenceSuggestion,
  createDictionaryReferenceProvider,
  REFERENCE_SUGGESTION_REFRESH_META,
  type ReferenceProvider,
  type EastonsIndex,
} from './TiptapReferenceSuggestion';
import { UrlLink, isAllowedExternalHref } from './TiptapUrlLink';
import { TextIndent } from './TiptapTextIndent';
import { normalizeScriptureReference, detectScriptureReferences, isResolvableScriptureReference, matchTrailingTranslationAbbreviation, matchAnchoredTrailingTranslationAbbreviation, type ScriptureReference, type ScriptureReferenceWithTranslation } from '@/utils/scripture-detector';
import {
  extractResolvedScripturePillReferencesFromHtml,
  filterReferencesWithoutExistingPills,
} from '@/utils/scripture-pill-paste-html';
import {
  isOrphanScriptureSuffix,
  isScriptureReferenceContinuationKey,
  mergeReferenceWithOrphanSuffix,
} from '@/utils/scripture-pill-orphan';
import { findAdjacentPillBoundaries } from '@/utils/scripture-pill-adjacent';
import { rangeContainsScripturePillMark, scripturePillSkipLeftTarget } from '@/utils/scripture-pill-range';
import { hasBlockGapAfter, hasLostBlockGaps } from '@/utils/scripture-pill-block-gaps';
import { onProtoViewportSettle } from '@/utils/proto-viewport-settle';
import { useCoarsePointer } from '../../../spa/src/lib/use-coarse-pointer';
import {
  ensureScripturePillSpacing,
  rangeCrossesHardBreak,
  type ScripturePillSpacingMode,
} from '@/utils/scripture-pill-spacing';
import {
  detectScriptureReferenceEndingAtCursor,
  findScriptureReferenceAtCursor,
  findTextWithFlexibleMatching,
  isChapterOnlyScriptureReference,
  mapReferenceEndInSliceToDocPos,
  shouldSchedulePassiveScriptureDetection,
} from '@/utils/scripture-pill-position';
import { pointerIsInsideElementRect, isTouchPointerEvent } from '@/utils/pointer-hit-test';
import { getVisualViewportBox } from '@/utils/visual-viewport-box';
import { sanitizeScripturePillHtml } from '@/utils/scripture-pill-display';
import { safeRenderHtml } from '@/utils/content-renderer';
import {
  findScripturePillBoundariesInDoc,
  insertScriptureQuoteAt,
  resolveSourcePillBoundaries,
} from '@/utils/insert-scripture-quote';
import {
  syncAdjacentScriptureQuoteAccents,
  syncAdjacentScriptureQuotesForPillApply,
} from '@/utils/sync-scripture-quotes-for-pill';
import { isStudyHighlightAccentKey, type StudyHighlightAccentKey, STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL, STUDY_HIGHLIGHT_ACCENT_LABELS, studyDockAccentCssVar } from '@/utils/study-highlight-accents';
import { TRANSLATION_ORDER, TRANSLATIONS } from '@/data/translations';
import { getCachedProfileData, getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl, extractIdFromPath, noteUrlForCurrentSurface } from '@/utils/url-helpers';
import { pushNavStack } from '@/utils/nav-stack';
import { shouldProcessDocument, getTextToProcess, resetTracker, cleanupTracker } from '@/utils/incremental-scripture-detection';
import { debug } from '@/utils/logger';
import { getOrCreateScriptureNote } from '@/utils/scripture-note-utils';
import ScripturePillChromeWeb from './ScripturePillChromeWeb';
import HighlightDockWeb from './HighlightDockWeb';
import StudyDockCarouselWeb from './StudyDockCarouselWeb';
import { deriveHighlightFocusTitle } from '@/utils/study-thread-focus-title';
import {
  activeHighlightEntryId,
  buildHighlightDockSessionForDeepLink,
  closeDockEntry,
  collapseActiveScriptureIfActive,
  deserializeStudyDockStack,
  emptyStudyDockStack,
  isPersistableStudyDockNoteId,
  moveDockEntryToIndex,
  highlightDockStableKey,
  buildReadOnlyScriptureSession,
  isHighlightDockReadOnly,
  openOrFocusHighlight,
  openOrFocusReference,
  openOrFocusResource,
  openOrFocusScripture,
  pruneStudyDockStack,
  resolveScriptureLinkPassageContext,
  scriptureDockStableKey,
  serializeStudyDockStack,
  setActiveDockEntry,
  shouldOpenHighlightRequestImmediately,
  studyDockStackHasEntries,
  studyDockContextKey,
  studyDockStackStorageKey,
  studyThreadContextQuery,
  updateDockEntry,
  withStudyThreadContext,
  type HighlightDockOpenMetadata,
  type HighlightDockSession,
  type ReferenceDockSession,
  type ResourceDockSession,
  type ScripturePillDockSession,
  type StudyDockEntry,
  type StudyDockStack,
} from '@/utils/study-dock-stack';
import { saveReferenceStudyThread } from '@/utils/save-reference-study-thread';
import { hasSeenSharedHighlightTip, markSharedHighlightTipSeen } from '@/utils/shared-highlight-tip';
import { notifyStudyThreadListChanged } from '@/utils/prototype-study-thread-list-sync';
import { backfillOrphanHighlights } from '@/utils/orphan-highlight-backfill';
import { syncStudyHighlightMarksOverlayCovered } from '@/utils/note-html-highlight-marks';
import { scriptureReferenceContainsReference } from '@/utils/scripture-verse-keys';
import LinkPreviewCard from './LinkPreviewCard';
import UrlLinkPromptUI from './UrlLinkPromptUI';
import ReferenceDockWeb from './ReferenceDockWeb';
import ResourceDockChipWeb from './ResourceDockChipWeb';
import { useEditorHoverPreview } from './useEditorHoverPreview';
import { useEastonsSlugIndex } from '../../../spa/src/hooks/useEastonsSlugIndex';
import PrototypeConnectNoteSheet from '../../../spa/src/pages/prototype/PrototypeConnectNoteSheet';
import ConnectedNoteHighlightPopup from './ConnectedNoteHighlightPopup';
import '@/styles/tiptap-editor.css';

// Icon component for inline SVGs (allows CSS styling)
import Icon from './Icon';

/** Prototype format toolbar — Font Awesome fill icons (matches proto chrome; not Tabler stroke). */
const PROTO_FORMAT_ICON_SIZE = 18;

/** Movement (px) past which a toolbar-button press is treated as a scroll, not a tap. */
const TOOLBAR_TAP_MOVE_THRESHOLD = 10;

// Track pending pill creation to prevent duplicates from concurrent calls
// This is a module-level Set to track references currently being processed
const pendingPillCreations = new Set<string>();

// Track a recently created pill that hasn't had its translation resolved yet.
// On the next space/Enter, we check if the user typed a translation abbreviation after it.
// Map of normalized reference → pending entry (keyed so multiple pills created at once each get a window)
const pendingTranslationPills = new Map<string, {
  reference: string;
  editorId: string;
  timeoutId: ReturnType<typeof setTimeout> | null;
}>();

// Toast is declared globally elsewhere - no need to redeclare here

interface TiptapEditorProps {
  content: string;
  id?: string;
  name?: string;
  placeholder?: string;
  minimalToolbar?: boolean;
  toolbarAtBottom?: boolean;
  /** When toolbarAtBottom, margin below the toolbar in px. Default 12. Use 0 when the parent provides the gap (e.g. Save/Cancel row has top margin). */
  toolbarBottomMargin?: number;
  tabindex?: number;
  /**
   * Notify the parent of new body HTML. `meta.programmatic` is set for emissions that are NOT user
   * edits — open-time pill/translation normalization, orphan-highlight backfill — so consumers can
   * sync content without treating it as a dirtying edit (which would re-save and bump `updatedAt`).
   */
  onContentChange?: (content: string, meta?: { programmatic?: boolean }) => void;
  /** Synchronous mirror of the latest body HTML (on every doc change) for unmount save. */
  onLiveBodyHtmlChange?: (content: string) => void;
  scrollPosition?: number;
  enableCreateNoteFromSelection?: boolean;
  /** Foreign shared note: selection + highlight dock without mutating the read-only body. */
  sharedAnnotationOverlayMode?: boolean;
  /** Co-edited note where someone else holds the pen — watch the body, don't type in it. */
  coEditFollower?: boolean;
  /** Ranges where a shared overlay covers in-body marks — hide underline so only the fill shows. */
  sharedOverlayPmRanges?: { from: number; to: number }[];
  onSharedAnnotationCreated?: () => void;
  parentThreadId?: string;
  sourceNoteId?: string; // ID of the note this editor is editing (for hyperlink creation)
  spaceId?: string;
  /**
   * Enables @ mention pills: given the text typed after `@`, return matching notes /
   * study threads / folders. Absent → the @ typeahead never triggers (classic shell).
   */
  mentionSource?: (query: string) => MentionPickerItem[] | Promise<MentionPickerItem[]>;
  /**
   * Kinds `mentionSource` can actually return here. Drives which picker tabs
   * exist — a shared-space note omits 'library' because personal library items
   * can't resolve for other members. Defaults to all kinds.
   */
  mentionKinds?: readonly MentionKind[];
  /** Tap/click on a mention pill (editable and read-only). Navigation is owned by the parent. */
  onMentionPillClick?: (payload: MentionPillClickPayload) => void;
  /** Explicit shared-space read context. Omitted for personal/My Home. */
  contextSpaceId?: string | null;
  onEditorReady?: (editor: any) => void;
  onEditorInstanceReady?: (editor: any) => void; // Callback when editor instance is ready for direct access
  /** Legacy hint for layouts that host the editor in a bottom sheet; caret scroll uses `[data-keyboard-open]` + `toolbarAtBottom`. */
  inBottomSheet?: boolean;
  /**
   * When `prototypeNative`, bottom chrome follows native-like rules: format bar while the body
   * is focused (unless scripture picker/confirm is open), and the parent can show a note action bar when not.
   */
  editorChromeMode?: 'default' | 'prototypeNative';
  /**
   * Prototype edit-note-content: bump to force one body replace from props (list preview →
   * full GET …/details). Consumed once per revision so later prop syncs stay non-clobbering.
   */
  forceBodyReplaceFromProps?: number;
  onPrototypeChromeModeChange?: (
    mode: 'format' | 'selection' | 'scripture' | 'noteActions' | 'highlight' | 'reference' | 'hidden',
  ) => void;
  /**
   * Prototype-only: when false and no inline `noteActions` host is rendered, use `hidden` instead of `noteActions`
   * when the editor would otherwise switch to note-actions chrome (blur or no format bar).
   */
  prototypeNoteActionsChrome?: boolean;
  /**
   * Prototype-only: portal target for highlight dock (accent / remove) — sibling to format + scripture hosts.
   * @deprecated Use `studyDockCarouselPortalTarget` (single host for scripture + highlight carousel).
   */
  highlightChromePortalTarget?: HTMLElement | null;
  /** Prototype-only: portal target for per-note scripture/highlight dock carousel. */
  studyDockCarouselPortalTarget?: HTMLElement | null;
  /** Prototype-only: when set, auto-opens the reference dock for this word once the editor mounts. */
  initialReferenceWord?: string | null;
  /** Distinct per request (e.g. dockReq nonce) so re-opens fire each time. */
  initialReferenceRequestKey?: string | null;
  /** Prototype-only: called after a reference deep-link dock handoff completes (strip URL search keys). */
  onReferenceDeepLinkHandoff?: () => void;
  /** Prototype-only: docks a Resource Library chip once the editor mounts (`?libItem=`). */
  initialResourceDock?: {
    /** Distinct per request (dockReq nonce) so re-opens fire each time. */
    requestKey: string;
    session: ResourceDockSession;
  } | null;
  /** Opens a file library item (signed-URL resolve lives with the SPA's data layer). */
  onOpenResourceFile?: (libraryItemId: string) => void;
  /**
   * Prototype-only: a scripture dock expanding one step further, into the Bible reader. The
   * SPA stacks the reader over this note and collapses back to the dock; the editor only
   * hands over what the dock is showing.
   */
  onExpandScriptureToReader?: (payload: { reference: string; translation: string }) => void;
  /** A scripture dock is showing this passage — see `ScripturePillChromeWeb.onPassageShown`. */
  onScripturePassageShown?: (payload: { reference: string; translation: string }) => void;
  /**
   * Prototype-only: when provided, the prototype-native format toolbar is rendered
   * via `createPortal` into this element instead of inline. This lets the parent
   * pin the bar to the bottom of the editor column (sibling of the scroll
   * container) so it stays glued to the viewport bottom regardless of content.
   */
  formatToolbarPortalTarget?: HTMLElement | null;
  /**
   * Bottom host for macOS-style scripture pill chrome (`ScripturePillChromeWeb`).
   * @deprecated Use `studyDockCarouselPortalTarget`.
   */
  scriptureChromePortalTarget?: HTMLElement | null;
  /**
   * Prototype: set when the user taps a scripture pill in read-only HTML preview; TipTap opens the dock once the editor mounts.
   */
  prototypeScripturePillOpenRequest?: {
    reference: string;
    translation: string | null;
    noteId: string | null;
    pillAccent: string | null;
  } | null;
  onPrototypeScripturePillOpenRequestConsumed?: () => void;
  /** Prototype: the scripture-pill open request couldn't find a matching pill in the note (poll timed out). */
  onPrototypeScripturePillOpenRequestUnresolved?: () => void;
  /** Prototype: after the source scripture dock opens, auto-open this cross-ref as a read-only card. */
  prototypeCrossRefTarget?: {
    reference: string;
    requestKey?: string;
  } | null;
  /**
   * Prototype: set when the user taps a highlight elsewhere (e.g. the Home "revisit" card); TipTap finds
   * the matching highlight mark by study-thread id and opens its dock once the editor mounts.
   */
  prototypeHighlightOpenRequest?: {
    studyThreadEntryId: string;
    requestKey?: string;
    metadata?: HighlightDockOpenMetadata;
    range?: { from: number; to: number } | null;
    /** Opened by an "Add a thought" suggestion — land the caret in the dock's note field. */
    focusMiniNote?: boolean;
  } | null;
  onPrototypeHighlightOpenRequestConsumed?: () => void;
  onPrototypeActiveHighlightEntryChange?: (entryId: string | null) => void;
}

const PROTOTYPE_FORMAT_BAR_HIDE_MS = 2000;

function openSourceScriptureDockWithOptionalCrossRef(
  stack: StudyDockStack,
  session: ScripturePillDockSession,
  crossRefTarget: string | null | undefined,
  sourceNoteId: string | null,
  translation: string | null,
): StudyDockStack {
  const targetRef = crossRefTarget?.trim();
  // Marked on the source card, not the target: the target is the answer, and the source is
  // where the list of eight related passages needs to say which one was meant.
  let next = openOrFocusScripture(
    stack,
    targetRef ? { ...session, highlightCrossRef: targetRef } : session,
  );
  if (targetRef) {
    next = openOrFocusScripture(
      next,
      buildReadOnlyScriptureSession(targetRef, translation, sourceNoteId),
      { openedFromDockId: next.activeId ?? undefined },
    );
  }
  return next;
}


/** Collapsed caret must sit inside the mark; expanded selection must intersect the pill span. */
function selectionIntersectsScripturePillBoundaries(
  from: number,
  to: number,
  boundaries: { from: number; to: number },
): boolean {
  const pillFrom = boundaries.from;
  const pillTo = boundaries.to;
  if (from === to) {
    return from >= pillFrom && from < pillTo;
  }
  return from < pillTo && to > pillFrom;
}

/** Resolve live mark range from stored dock boundaries (positions can drift after spacing normalize). */
function resolveScripturePillMarkRangeFromBoundaries(
  editor: any,
  boundaries: { from: number; to: number },
): { from: number; to: number } {
  try {
    const markType = editor?.state?.schema?.marks?.scripturePill;
    if (!markType) return boundaries;
    const $from = editor.state.doc.resolve(boundaries.from);
    const range = getMarkRange($from, markType);
    if (range && typeof range.from === 'number' && typeof range.to === 'number') {
      return { from: range.from, to: range.to };
    }
  } catch {
    /* ignore */
  }
  return boundaries;
}

/** Sync `data-pill-accent` on live pill spans — ProseMirror may skip attr-only mark DOM patches. */
function syncScripturePillAccentDom(
  editor: any,
  from: number,
  to: number,
  accent: string | null,
): void {
  if (!editor?.view?.domAtPos) return;
  const markType = editor?.state?.schema?.marks?.scripturePill;
  if (!markType) return;
  const seen = new Set<HTMLElement>();
  try {
    editor.state.doc.nodesBetween(from, to, (node: any, pos: number) => {
      if (!node.isText) return;
      const hasPill = node.marks.some((m: any) => m.type === markType);
      if (!hasPill) return;
      const domPos = editor.view.domAtPos(pos);
      const domNode = domPos.node as Node;
      const el =
        domNode.nodeType === Node.ELEMENT_NODE
          ? (domNode as HTMLElement)
          : (domNode as Text).parentElement;
      const pill = el?.closest?.('.scripture-pill') as HTMLElement | null;
      if (!pill || seen.has(pill)) return;
      seen.add(pill);
      if (accent) {
        pill.setAttribute('data-pill-accent', accent);
      } else {
        pill.removeAttribute('data-pill-accent');
      }
    });
  } catch {
    /* ignore */
  }
}

/** Resolve mark + range for accent updates (boundaries can drift after spacing normalize). */
function resolveScripturePillMarkForAccentChange(
  editor: any,
  boundaries: { from: number; to: number },
  reference?: string | null,
): { mark: any; from: number; to: number } | null {
  const markType = editor?.state?.schema?.marks?.scripturePill;
  if (!markType) return null;

  const { from, to } = resolveScripturePillMarkRangeFromBoundaries(editor, boundaries);

  let existingMark: any = null;
  editor.state.doc.nodesBetween(from, to, (node: any) => {
    if (!existingMark && node.isText) {
      const m = node.marks.find((x: any) => x.type?.name === 'scripturePill');
      if (m) existingMark = m;
    }
  });
  if (existingMark) return { mark: existingMark, from, to };

  for (const pos of [from, Math.max(0, to - 1)]) {
    try {
      const $pos = editor.state.doc.resolve(pos);
      const range = getMarkRange($pos, markType);
      if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') continue;
      let mark: any = null;
      editor.state.doc.nodesBetween(range.from, range.to, (node: any) => {
        if (!mark && node.isText) {
          const m = node.marks.find((x: any) => x.type?.name === 'scripturePill');
          if (m) mark = m;
        }
      });
      if (mark) return { mark, from: range.from, to: range.to };
    } catch {
      /* try next probe */
    }
  }

  if (reference && editor.view?.dom) {
    try {
      const root = editor.view.dom as HTMLElement;
      const pills = root.querySelectorAll('.scripture-pill[data-scripture-reference]');
      for (const pill of pills) {
        if (pill.getAttribute('data-scripture-reference') !== reference) continue;
        const domRange = resolveScripturePillDOMRange(editor, pill as HTMLElement);
        if (!domRange) continue;
        let mark: any = null;
        editor.state.doc.nodesBetween(domRange.from, domRange.to, (node: any) => {
          if (!mark && node.isText) {
            const m = node.marks.find((x: any) => x.type?.name === 'scripturePill');
            if (m) mark = m;
          }
        });
        if (mark) return { mark, from: domRange.from, to: domRange.to };
      }
    } catch {
      /* ignore */
    }
  }

  debug('[scripture-pill] accent change: could not resolve mark range');
  return null;
}

/** Resolve scripture pill boundaries from clicked DOM span (captures-phase handler). */
function resolveScripturePillDOMRange(editor: any, pillEl: HTMLElement): { from: number; to: number } | null {
  try {
    if (!editor?.view?.posAtDOM) return null;
    const pos = editor.view.posAtDOM(pillEl, 0);
    const $pos = editor.state.doc.resolve(pos);
    const markType = editor.state.schema.marks.scripturePill;
    if (!markType) return null;
    const range = getMarkRange($pos, markType);
    if (range && typeof range.from === 'number' && typeof range.to === 'number') {
      return { from: range.from, to: range.to };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function findHighlightRangeByStudyThreadId(editor: any, studyId: string): { from: number; to: number } | null {
  if (!editor?.state?.doc) return null;
  let found: { from: number; to: number } | null = null;
  try {
    editor.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return true;
      const hl = node.marks.find(
        (m: any) => m.type?.name === 'highlight' && m.attrs?.studyThreadEntryId === studyId,
      );
      if (hl) {
        found = { from: pos, to: pos + node.nodeSize };
        return false;
      }
      return true;
    });
  } catch {
    return null;
  }
  return found;
}

function studyDockEntryStillValid(editor: any, entry: StudyDockEntry): boolean {
  if (!editor || editor.isDestroyed || !editor.state?.doc) return true;
  if (entry.kind === 'scripture') {
    // Read-only passage cards (cross-refs) aren't tied to a pill mark — always valid.
    if (entry.session.readOnly || !entry.session.boundaries) return true;
    // Keep the entry valid as long as a scripturePill mark still occupies the resolved
    // range — do NOT require the mark's reference to equal the (possibly stale) session
    // reference. The reference legitimately changes while the dock is open (e.g. toggling
    // a verse range), and onApply rewrites the pill text before the session catches up;
    // requiring equality here would prune the entry mid-edit and dismiss the dock.
    const { from, to } = resolveScripturePillMarkRangeFromBoundaries(editor, entry.session.boundaries);
    let found = false;
    try {
      editor.state.doc.nodesBetween(from, to, (node: any) => {
        if (found || !node.isText) return;
        if (node.marks.some((x: any) => x.type?.name === 'scripturePill')) {
          found = true;
        }
      });
    } catch {
      return false;
    }
    return found;
  }
  // Reference docks are user-dismissed (pending hints + saved references both persist while open).
  if (entry.kind === 'reference') return true;
  // Resource chips have no anchor in the doc at all — nothing to prune against.
  if (entry.kind === 'resource') return true;
  // scriptureLink highlights are anchored to a persisted study thread, not an editor range
  // (passage selections have range: null and no matching highlight mark in the doc). Keep them
  // user-dismissed so the prune-on-update effect can't racily remove them.
  if (entry.session.entryKind === 'scriptureLink') return true;
  const sid = entry.session.studyThreadEntryId;
  if (sid) {
    if (findHighlightRangeByStudyThreadId(editor, sid)) return true;
    // Anchor-only highlights (shared overlay) have no in-doc mark — keep until user dismisses.
    return true;
  }
  const range = entry.session.range;
  if (range) {
    let hasMark = false;
    try {
      editor.state.doc.nodesBetween(range.from, range.to, (node: any) => {
        if (hasMark || !node.isText) return;
        hasMark = node.marks.some((x: any) => x.type?.name === 'highlight');
      });
    } catch {
      return false;
    }
    return hasMark;
  }
  return false;
}

// Helper function to find text positions in ProseMirror document
function findTextPositions(doc: any, searchText: string, skipMarked: boolean = true): { from: number; to: number } | null {
  const allPositions = findAllTextPositions(doc, searchText, skipMarked);
  return allPositions.length > 0 ? allPositions[0] : null;
}

// Helper function to find pill boundaries (start and end positions of a pill mark)
// Returns null if position is not inside a pill. Defaults to scripture pills; pass
// `markName` for other pill marks (e.g. mentionPill).
function findPillBoundaries(doc: any, pos: number, markName: string = 'scripturePill'): { start: number; end: number } | null {
  let pillStart = pos;
  let pillEnd = pos;

  // Find start of pill
  for (let p = pos; p >= 0; p--) {
    try {
      const $p = doc.resolve(p);
      const marks = $p.marks();
      const hasPill = marks.some((m: any) => m.type.name === markName);
      // Also check nodeAfter marks — $p.marks() misses inclusive:false marks at the start boundary
      const nodeAfterHasPill = $p.nodeAfter?.marks?.some((m: any) => m.type.name === markName);
      if (!hasPill && !nodeAfterHasPill) {
        pillStart = p + 1;
        break;
      }
      if (p === 0) {
        pillStart = 0;
        break;
      }
    } catch (e) {
      pillStart = p + 1;
      break;
    }
  }

  // Find end of pill
  for (let p = pos; p <= doc.content.size; p++) {
    try {
      const $p = doc.resolve(p);
      const marks = $p.marks();
      const hasPill = marks.some((m: any) => m.type.name === markName);
      if (!hasPill) {
        pillEnd = p;
        break;
      }
    } catch (e) {
      pillEnd = p;
      break;
    }
  }

  // If start and end are the same, we're not inside a pill
  if (pillStart === pillEnd && pillStart === pos) {
    // Check if we're actually at a pill boundary
    try {
      const $pos = doc.resolve(pos);
      const marks = $pos.marks();
      const hasPill = marks.some((m: any) => m.type.name === markName);
      if (!hasPill) {
        return null; // Not inside a pill
      }
    } catch (e) {
      return null;
    }
  }

  return { start: pillStart, end: pillEnd };
}

type ScripturePillDeleteConfirmState = {
  rect: DOMRect;
  reference: string;
  boundaries: { start: number; end: number };
};

/**
 * Container for the note-body selection actions.
 *
 * `inChromeBar` (touch): the actions render as a row in the bottom chrome slot. iOS puts its own
 * text callout — "Copy | Look Up | Translate" — directly over anything floating at the selection,
 * and there is no web API to suppress it, so we vacate that space entirely. It is the same trade
 * the scripture dock already makes for passage selections, and it buys full-width touch targets.
 *
 * Otherwise: a fixed capsule just below the selection, positioned by the caller.
 */
function SelectionBarShell({
  inChromeBar,
  barRef,
  top,
  left,
  children,
}: {
  inChromeBar: boolean;
  barRef: React.RefObject<HTMLDivElement | null>;
  top: number;
  left: number;
  children: React.ReactNode;
}) {
  if (inChromeBar) {
    return (
      <div ref={barRef} className="selection-action-bar selection-action-bar--chrome-bar">
        {children}
      </div>
    );
  }
  return (
    <div
      ref={barRef}
      data-harvous-bottom-sheet-floating=""
      className="selection-action-bar"
      style={{
        position: 'fixed',
        top,
        left,
        transform: 'translateX(-50%)',
        /*
         * The popover tier, not a number above everything. At 99999 this floated over
         * modals, Settings and toasts — and over the Library panel, which is where it was
         * noticed. The bar is a popover attached to a selection and belongs on that tier.
         * The fallback keeps the old value where the prototype tokens are not defined.
         */
        zIndex: 'var(--pds-z-popover, 99999)' as unknown as number,
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>
  );
}

type MentionPickerState = {
  /** The `@query` range in the doc: from = position of `@`, to = caret. */
  range: { from: number; to: number };
  query: string;
  rect: { top: number; left: number; bottom: number; right: number; width: number };
  /** Full unfiltered result set from mentionSource — sectioned by kind (notes, folders, threads). */
  items: MentionPickerItem[];
  /** Active kind tab; 'all' shows every kind grouped under section headers. */
  kindFilter: MentionKindFilter;
  /** Index into the FILTERED (visible) item list, not `items` — see visibleMentionItems. */
  activeIndex: number;
};

/** Items belonging to the active kind tab (or all of them, grouped, when kindFilter is 'all'). */
function visibleMentionItems(state: MentionPickerState): MentionPickerItem[] {
  return state.kindFilter === 'all' ? state.items : state.items.filter((i) => i.kind === state.kindFilter);
}

/** Fixed-position style for the mention picker: below the caret, clamped to the viewport, flipped above when the keyboard/viewport bottom is too close. */
function mentionPickerPortalStyle(rect: MentionPickerState['rect']): React.CSSProperties {
  const maxHeight = 320;
  /** Content-sized menu; clamp so it never spills past the viewport edge. */
  const maxWidth = Math.min(320, Math.max(160, window.innerWidth - 16));
  const openAbove =
    rect.bottom + 6 + maxHeight > window.innerHeight - 12 && rect.top > maxHeight + 12;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - maxWidth - 8));
  const style: React.CSSProperties = {
    position: 'fixed',
    left,
    width: 'max-content',
    maxWidth,
    maxHeight,
    zIndex: 99999,
    pointerEvents: 'auto',
  };
  if (openAbove) {
    style.bottom = Math.max(8, window.innerHeight - rect.top + 6);
  } else {
    style.top = rect.bottom + 6;
  }
  return style;
}

/** Replace the active `@query` with a mention pill for the chosen item, then close the picker. */
function commitMentionPickerItem(
  editor: any,
  state: MentionPickerState,
  item: MentionPickerItem,
  closePicker: () => void,
): void {
  try {
    editor
      .chain()
      .focus()
      .insertMentionPill({
        kind: item.kind,
        entityId: item.entityId,
        spaceId: item.spaceId || null,
        label: item.title,
        range: state.range,
      })
      .run();
  } catch {
    /* ignore — stale range after a concurrent doc change */
  }
  closePicker();
}

/**
 * Backspace on (or just after) a committed scripture pill converts it back to an editable draft
 * instead of arming a delete.
 *
 * Rationale: a pill used to be destroyable in two keystrokes with no way to fix a typo'd reference
 * from the keyboard. Now the first Backspace only changes mode — the reference becomes ordinary
 * text you can edit, and the ✓ re-commits it. Deleting the pill still works, it just costs the
 * keystrokes of actually erasing it (or the explicit "Remove" in the floater). Forward Delete keeps
 * the old confirm-then-delete behaviour, so there is still a fast destructive path.
 *
 * Returns false (declining the keystroke) whenever there's no pill to edit, so the delete-confirm
 * and atomic-block handlers after it still get their turn.
 */
function tryEditScripturePillOnBackspace(
  editor: any,
  event: KeyboardEvent,
  view: any,
  deleteConfirmPillRef: React.MutableRefObject<ScripturePillDeleteConfirmState | null>,
): boolean {
  if (event.key !== 'Backspace') return false;
  // A confirm floater is already up — let the existing handler complete that interaction.
  if (deleteConfirmPillRef.current) return false;
  // Already editing a reference: Backspace must delete characters, not re-enter edit mode.
  if (hasActiveScriptureDraft(view.state)) return false;

  const { from, to } = view.state.selection;
  if (from !== to) return false;

  const $from = view.state.selection.$from;
  const insidePill = $from.marks().some((m: any) => m.type.name === 'scripturePill');
  const boundaries = insidePill
    ? findPillBoundaries(view.state.doc, from)
    : findAdjacentPillBoundaries(view.state.doc, from, 'before');
  if (!boundaries) return false;

  // A stray range suffix between the pill and the caret (e.g. the "-15" of a half-typed range)
  // must stay ordinary editable text — backspacing it is how the orphan-merge flow works.
  const realPill = findPillBoundaries(view.state.doc, boundaries.start);
  if (realPill && from > realPill.end) {
    const gapText = view.state.doc.textBetween(realPill.end, from);
    if (gapText && isOrphanScriptureSuffix(gapText)) return false;
  }

  event.preventDefault();
  return editScripturePillAsDraft(view, boundaries.start, boundaries.end);
}

/** Backspace/Delete/Escape handling for scripture pill delete confirmation. */
function tryHandleScripturePillDeleteKey(
  editor: any,
  event: KeyboardEvent,
  view: any,
  deleteConfirmPillRef: React.MutableRefObject<ScripturePillDeleteConfirmState | null>,
  setDeleteConfirmPill: (value: ScripturePillDeleteConfirmState | null) => void,
): boolean {
  if (event.key === 'Escape' && deleteConfirmPillRef.current) {
    setDeleteConfirmPill(null);
    deleteConfirmPillRef.current = null;
    return true;
  }

  if (!(event.key === 'Backspace' || event.key === 'Delete')) {
    return false;
  }

  const { from, to } = view.state.selection;
  if (from !== to) {
    return false;
  }

  const $from = view.state.selection.$from;
  const scripturePillMark = $from.marks().find((mark: any) => mark.type.name === 'scripturePill');

  const existingConfirm = deleteConfirmPillRef.current;
  if (existingConfirm) {
    event.preventDefault();
    setDeleteConfirmPill(null);
    deleteConfirmPillRef.current = null;
    editor
      .chain()
      .deleteRange({ from: existingConfirm.boundaries.start, to: existingConfirm.boundaries.end })
      .run();
    return true;
  }

  let pillBoundaries: { start: number; end: number } | null = null;
  let pillReference: string | null = null;

  if (scripturePillMark) {
    pillBoundaries = findPillBoundaries(view.state.doc, from);
    pillReference = scripturePillMark.attrs.reference;
  } else {
    const direction = event.key === 'Backspace' ? 'before' : 'after';
    const adj = findAdjacentPillBoundaries(view.state.doc, from, direction);
    if (adj) {
      pillBoundaries = adj;
      try {
        const midPos = Math.floor((adj.start + adj.end) / 2);
        const $mid = view.state.doc.resolve(midPos);
        const mark =
          $mid.marks().find((m: any) => m.type.name === 'scripturePill') ||
          $mid.nodeAfter?.marks?.find((m: any) => m.type.name === 'scripturePill');
        pillReference = mark?.attrs.reference || null;
      } catch (_) {}
    }
  }

  if (!pillBoundaries || !pillReference) {
    return false;
  }

  const realPill = findPillBoundaries(view.state.doc, pillBoundaries.start);
  if (realPill) {
    const gapText =
      from > realPill.end
        ? view.state.doc.textBetween(realPill.end, from)
        : from < realPill.start
          ? view.state.doc.textBetween(from, realPill.start)
          : '';
    if (gapText && isOrphanScriptureSuffix(gapText)) {
      return false;
    }
  }

  event.preventDefault();
  const pillEl = editor.view.dom.querySelector(
    `.scripture-pill[data-scripture-reference="${CSS.escape(pillReference)}"]`,
  ) as HTMLElement | null;
  const rect = pillEl ? pillEl.getBoundingClientRect() : new DOMRect(0, 0, 0, 0);
  const confirmData = { rect, reference: pillReference, boundaries: pillBoundaries };
  setDeleteConfirmPill(confirmData);
  deleteConfirmPillRef.current = confirmData;
  return true;
}

/**
 * Backspace/Delete on or next to a mention pill removes the whole pill in one keystroke.
 * Simpler sibling of tryHandleScripturePillDeleteKey — mentions are trivially recreated,
 * so there is no confirm step.
 */
function tryHandleMentionPillDeleteKey(editor: any, event: KeyboardEvent, view: any): boolean {
  if (!(event.key === 'Backspace' || event.key === 'Delete')) {
    return false;
  }

  const { from, to } = view.state.selection;
  if (from !== to) {
    return false;
  }

  const $from = view.state.selection.$from;
  const insidePill = $from.marks().some((m: any) => m.type.name === 'mentionPill');

  let boundaries: { start: number; end: number } | null = null;
  if (insidePill) {
    boundaries = findPillBoundaries(view.state.doc, from, 'mentionPill');
  } else {
    const direction = event.key === 'Backspace' ? 'before' : 'after';
    boundaries = findAdjacentPillBoundaries(view.state.doc, from, direction, 'mentionPill');
  }
  if (!boundaries) {
    return false;
  }

  event.preventDefault();
  editor.chain().deleteRange({ from: boundaries.start, to: boundaries.end }).run();
  return true;
}

/** Move cursor after a leading scripture pill (e.g. VOTD → Create note); end-of-doc can still resolve inside the mark. */
export function placeCursorAfterLeadingScripturePill(editor: any): void {
  try {
    const { doc } = editor.state;
    if (doc.textContent.trim().length === 0) {
      editor.commands.setTextSelection(1);
      return;
    }
    const maxPos = doc.content.size;
    editor.commands.setTextSelection(maxPos);
    let $from = editor.state.selection.$from;
    let inPill = $from.marks().some((m: any) => m.type.name === 'scripturePill');
    if (!inPill) {
      return;
    }
    const probePos = Math.min(Math.max(1, $from.pos), maxPos - 1);
    const boundaries = findPillBoundaries(doc, probePos);
    if (!boundaries) {
      return;
    }
    let pos = boundaries.end;
    while (pos <= maxPos) {
      try {
        const marks = doc.resolve(pos).marks();
        const stillIn = marks.some((m: any) => m.type.name === 'scripturePill');
        if (!stillIn) {
          editor.commands.setTextSelection(pos);
          return;
        }
      } catch {
        editor.commands.setTextSelection(pos);
        return;
      }
      pos += 1;
    }
    editor.commands.setTextSelection(maxPos);
  } catch {
    try {
      editor.commands.setTextSelection(editor.state.doc.content.size);
    } catch {
      /* ignore */
    }
  }
}

/** Empty docs: caret at start of first block; otherwise optional end-of-doc placement. */
function placeCaretForEmptyOrEnd(editor: any, preferEndWhenNonEmpty: boolean): void {
  const doc = editor.state.doc;
  if (isDocTextEmpty(doc)) {
    editor.commands.setTextSelection(preferredCaretPosForEmptyDoc(doc));
  } else if (preferEndWhenNonEmpty) {
    editor.commands.setTextSelection(doc.content.size);
  }
}

/** If the cursor (collapsed or user-select:all range) is inside a scripture pill, move it after the pill. */
export function snapCursorOutsideScripturePill(editor: any): void {
  if (!editor || editor.isDestroyed || !editor.state) return;
  try {
    const { state } = editor;
    const sel = state.selection;

    const markType = state.schema.marks.scripturePill;
    if (!markType) return;

    const $from = sel.$from;
    const parent = $from.parent;
    const offset = $from.parentOffset;

    const after = parent.childAfter(offset);
    const afterInPill = after.node?.marks.some((m: any) => m.type === markType) ?? false;
    const before = parent.childBefore(offset);
    const beforeInPill = before.node?.marks.some((m: any) => m.type === markType) ?? false;

    if (!afterInPill && !beforeInPill) return;

    // A collapsed caret resting at a pill's LEFT edge (the pill is the next node, with nothing pill-y
    // before it) is already OUTSIDE the pill — e.g. the start of a note that begins with a pill.
    // Snapping it to the pill's end would make the front unreachable by ArrowLeft / Home / click and
    // break navigation to the start. Leave it here; inclusive:false keeps any typed text out of the
    // pill. (A caret genuinely INSIDE the pill is beforeInPill && afterInPill and still snaps below.)
    if (sel.empty && afterInPill && !beforeInPill) return;

    // Cursor right after pill: insert a trailing space when prose follows flush
    // against the pill so the caret has a non-pill landing spot.
    if (beforeInPill && !afterInPill) {
      const range =
        getMarkRange($from, markType) ||
        (beforeInPill ? getMarkRange(state.doc.resolve(Math.max(0, sel.from - 1)), markType) : null);
      const pillEnd = range?.to ?? $from.pos;
      const atEndOfParent = offset === parent.content.size;
      const $pillEnd = state.doc.resolve(Math.min(pillEnd, state.doc.content.size - 1));
      const blockEnd = $pillEnd.end($pillEnd.depth);
      const skipTrailingSpace =
        hasBlockGapAfter(state.doc, pillEnd) ||
        hasHardBreakAfter(state.doc, pillEnd) ||
        hasLineBreakAfter(state.doc, pillEnd, blockEnd);
      const charAfter = !atEndOfParent ? state.doc.textBetween(pillEnd, Math.min(pillEnd + 1, $from.end($from.depth))) : '';
      if (
        !skipTrailingSpace &&
        (atEndOfParent || (charAfter && charAfter !== ' ' && charAfter !== '\n' && charAfter !== '\t'))
      ) {
        const tr = state.tr;
        const insertPos = atEndOfParent ? $from.end($from.depth) : pillEnd;
        tr.insertText(' ', insertPos);
        tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
        tr.setStoredMarks([]);
        tr.setMeta('addToHistory', false);
        editor.view.dispatch(tr);
        return;
      }
      if (skipTrailingSpace && sel.empty && sel.from !== pillEnd) {
        const tr = state.tr
          .setSelection(TextSelection.create(state.doc, pillEnd))
          .setStoredMarks([])
          .setMeta('addToHistory', false);
        editor.view.dispatch(tr);
        return;
      }
      if (charAfter === ' ' && sel.empty && sel.from !== pillEnd + 1) {
        const tr = state.tr
          .setSelection(TextSelection.create(state.doc, pillEnd + 1))
          .setStoredMarks([])
          .setMeta('addToHistory', false);
        editor.view.dispatch(tr);
        return;
      }
      if (sel.empty) return;
    }

    const range = getMarkRange($from, markType)
      || (beforeInPill ? getMarkRange(state.doc.resolve(Math.max(0, sel.from - 1)), markType) : null);
    if (!range) return;
    if (sel.empty && sel.from === range.to) return;

    const tr = state.tr
      .setSelection(TextSelection.create(state.doc, range.to))
      .setStoredMarks([])
      .setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  } catch {
    /* ignore */
  }
}

// Helper function to check if there's a hard break node at a given position
// Hard breaks should be preserved even if there's no text content after a mark
function hasHardBreakAfter(doc: any, pos: number): boolean {
  try {
    const nodeAtPos = doc.nodeAt(pos);
    if (nodeAtPos && nodeAtPos.type.name === 'hardBreak') {
      return true;
    }
    // Also check the next position
    if (pos < doc.content.size) {
      const nextNode = doc.nodeAt(pos + 1);
      if (nextNode && nextNode.type.name === 'hardBreak') {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Helper function to check if there's a newline/line break (whitespace that should be preserved) after a position
// This includes hard breaks, newline characters, or whitespace that represents line breaks
function hasLineBreakAfter(doc: any, pos: number, paragraphEnd: number): boolean {
  try {
    // First check for hard break nodes
    if (hasHardBreakAfter(doc, pos)) {
      return true;
    }
    
    // Check if there's whitespace that includes newlines after the position
    const textAfter = doc.textBetween(pos, Math.min(pos + 20, paragraphEnd - 1));
    if (textAfter && /\n|\r/.test(textAfter)) {
      return true;
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Helper function to check if a position range is within a single paragraph
// Returns true if both from and to positions are in the same paragraph node
// Also ensures the 'to' position doesn't extend beyond the paragraph boundary
function isWithinSingleParagraph(doc: any, from: number, to: number): boolean {
  try {
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    
    // Find the paragraph node for the 'from' position
    let fromParagraph: any = null;
    let fromParagraphStart = 0;
    let fromParagraphEnd = 0;
    for (let i = $from.depth; i > 0; i--) {
      const node = $from.node(i);
      if (node.type.name === 'paragraph') {
        fromParagraph = node;
        // Calculate the start and end positions of this paragraph
        const paragraphPos = $from.start(i);
        fromParagraphStart = paragraphPos + 1; // +1 to skip the paragraph node itself
        fromParagraphEnd = paragraphPos + node.nodeSize - 1; // -1 because end is exclusive
        break;
      }
    }
    
    // Find the paragraph node for the 'to' position
    let toParagraph: any = null;
    let toParagraphStart = 0;
    let toParagraphEnd = 0;
    for (let i = $to.depth; i > 0; i--) {
      const node = $to.node(i);
      if (node.type.name === 'paragraph') {
        toParagraph = node;
        // Calculate the start and end positions of this paragraph
        const paragraphPos = $to.start(i);
        toParagraphStart = paragraphPos + 1; // +1 to skip the paragraph node itself
        toParagraphEnd = paragraphPos + node.nodeSize - 1; // -1 because end is exclusive
        break;
      }
    }
    
    // If we couldn't find paragraphs, assume it's valid (might be in a different block type)
    if (!fromParagraph || !toParagraph) {
      return true;
    }
    
    // Check if they're the same paragraph node
    if (fromParagraph !== toParagraph) {
      return false;
    }
    
    // Additional check: ensure 'to' position doesn't extend beyond the paragraph boundary
    // The 'to' position should be within the paragraph's text content, not at the boundary
    // This prevents marks from affecting paragraph breaks
    if (to >= toParagraphEnd) {
      return false; // 'to' extends to or beyond paragraph boundary
    }
    
    // CRITICAL: Also check if 'to' is at the very end of the paragraph's text content
    // Marks ending at the last character of a paragraph can still affect paragraph breaks
    // Find the actual end of text content in this paragraph
    const paragraphStartPos = $to.start($to.depth);
    let paragraphTextEnd = paragraphStartPos + 1; // Start after paragraph node
    let pos = paragraphStartPos + 1;
    
    toParagraph.content.forEach((child: any) => {
      if (child.isText) {
        paragraphTextEnd = pos + child.text.length;
      }
      pos += child.nodeSize;
    });
    
    // If 'to' is at or very close to the end of paragraph text, reject it
    // This prevents marks from ending at paragraph boundaries
    if (to >= paragraphTextEnd) {
      return false; // 'to' is at the end of paragraph text
    }
    
    return true;
  } catch (e) {
    // If we can't resolve positions, assume it's valid to avoid breaking functionality
    return true;
  }
}

// Helper function to adjust a position to ensure it doesn't extend beyond paragraph boundaries
// Returns an adjusted position with 'to' moved back if it's at a paragraph boundary
// CRITICAL: Marks must NEVER end exactly at paragraph boundaries to prevent affecting paragraph breaks
function adjustPositionForParagraphBoundary(doc: any, from: number, to: number): { from: number; to: number } {
  try {
    if (to <= from) {
      return { from, to };
    }
    
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    
    // Find the paragraph node for 'from'
    let fromParagraph: any = null;
    let fromParagraphStart = 0;
    for (let i = $from.depth; i > 0; i--) {
      const node = $from.node(i);
      if (node.type.name === 'paragraph') {
        fromParagraph = node;
        fromParagraphStart = $from.start(i);
        break;
      }
    }
    
    // Find the paragraph node for 'to'
    let toParagraph: any = null;
    let toParagraphStart = 0;
    for (let i = $to.depth; i > 0; i--) {
      const node = $to.node(i);
      if (node.type.name === 'paragraph') {
        toParagraph = node;
        toParagraphStart = $to.start(i);
        break;
      }
    }
    
    // If we're in different paragraphs, adjust to end in the fromParagraph
    if (fromParagraph && toParagraph && fromParagraph !== toParagraph) {
      // Find the end of text content in fromParagraph
      let paragraphTextEnd = fromParagraphStart + 1;
      let currentOffset = 0;
      
      fromParagraph.content.forEach((child: any) => {
        if (child.isText) {
          const childStart = fromParagraphStart + 1 + currentOffset;
          paragraphTextEnd = childStart + child.text.length;
        }
        currentOffset += child.nodeSize;
      });
      
      // Ensure we end BEFORE the paragraph boundary (not at it)
      const adjustedTo = Math.max(from, paragraphTextEnd);
      return { from, to: adjustedTo };
    }
    
    // If we're in the same paragraph, ensure 'to' doesn't extend to the paragraph boundary
    if (fromParagraph && toParagraph && fromParagraph === toParagraph) {
      // Walk through the paragraph content to find the actual end of text
      let paragraphTextEnd = fromParagraphStart + 1;
      let pos = fromParagraphStart + 1;
      
      fromParagraph.content.forEach((child: any) => {
        if (child.isText) {
          paragraphTextEnd = pos + child.text.length;
        }
        pos += child.nodeSize;
      });
      
      // CRITICAL: Ensure 'to' ends BEFORE the paragraph boundary
      // If 'to' equals or exceeds paragraphTextEnd, it's at or beyond the boundary
      // We must end it strictly before the boundary to prevent affecting paragraph breaks
      if (to >= paragraphTextEnd) {
        // Move back to end of the last text character (paragraphTextEnd is already the end position)
        // But we want to ensure we're not at the boundary, so if to == paragraphTextEnd, move back by 1
        const adjustedTo = to > paragraphTextEnd ? paragraphTextEnd : Math.max(from, paragraphTextEnd);
        // Double-check: if adjustedTo is still at boundary, move back one more
        if (adjustedTo >= paragraphTextEnd && adjustedTo > from) {
          return { from, to: adjustedTo - 1 };
        }
        return { from, to: adjustedTo };
      }
    }
    
    // Check if 'to' is at the start of a new block (next paragraph)
    if ($to.depth === 1 && $to.parentOffset === 0) {
      // We're at the start of a new block - move 'to' back
      const adjustedTo = Math.max(from, to - 1);
      return { from, to: adjustedTo };
    }
    
    return { from, to };
  } catch (e) {
    // If we can't resolve positions, return original
    return { from, to };
  }
}

// Helper function to find ALL text positions in ProseMirror document
// Returns all occurrences that don't already have a scripture pill mark
function findAllTextPositions(doc: any, searchText: string, skipMarked: boolean = true): Array<{ from: number; to: number }> {
  const fullText = doc.textContent;
  
  if (!fullText || fullText.trim().length === 0) {
    return [];
  }
  
  // Find all matches with flexible spacing handling
  const matches = findTextWithFlexibleMatching(fullText, searchText);
  
  if (matches.length === 0) {
    return [];
  }

  // Sort indices to process in order
  matches.sort((a, b) => a.index - b.index);
  
  const positions: Array<{ from: number; to: number }> = [];
  let currentPos = 0;
  
  // Build a map of text positions to document positions
  const textToDocMap: Array<{ textStart: number; textEnd: number; docStart: number }> = [];
  
  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (node.isText) {
      const text = node.text || '';
      const nodeStart = currentPos;
      const nodeEnd = currentPos + text.length;
      
      textToDocMap.push({
        textStart: nodeStart,
        textEnd: nodeEnd,
        docStart: pos
      });
      
      currentPos = nodeEnd;
    }
  });
  
  // For each match, find the corresponding document position
  for (const match of matches) {
    const searchIndex = match.index;
    const matchLength = match.length;
    
    // Find which text node contains this index
    for (const map of textToDocMap) {
      if (searchIndex >= map.textStart && searchIndex < map.textEnd) {
        const offset = searchIndex - map.textStart;
        let candidateFrom = map.docStart + offset;
        let candidateTo = candidateFrom + matchLength;
        
        // Verify the end position is correct by checking what's actually at that position
        // and ensuring we don't cross paragraph boundaries
        try {
          const $from = doc.resolve(candidateFrom);
          const $to = doc.resolve(candidateTo);
          
          // Check if we're crossing paragraph boundaries
          let fromParagraph: any = null;
          let toParagraph: any = null;
          
          for (let i = $from.depth; i > 0; i--) {
            const node = $from.node(i);
            if (node.type.name === 'paragraph') {
              fromParagraph = node;
              break;
            }
          }
          
          for (let i = $to.depth; i > 0; i--) {
            const node = $to.node(i);
            if (node.type.name === 'paragraph') {
              toParagraph = node;
              break;
            }
          }
          
          // If we're crossing paragraph boundaries, adjust candidateTo to end at paragraph boundary
          if (fromParagraph && toParagraph && fromParagraph !== toParagraph) {
            // Find the end of the fromParagraph's text content
            const paragraphStart = $from.start($from.depth);
            let paragraphTextEnd = paragraphStart + 1;
            let currentOffset = 0;
            
            fromParagraph.content.forEach((child: any) => {
              if (child.isText) {
                const childStart = paragraphStart + 1 + currentOffset;
                paragraphTextEnd = childStart + child.text.length;
              }
              currentOffset += child.nodeSize;
            });
            
            // Adjust candidateTo to be at the end of the paragraph's text, not beyond
            candidateTo = Math.min(candidateTo, paragraphTextEnd);
            
            // If the adjusted position is before candidateFrom, skip this match
            if (candidateTo <= candidateFrom) {
              break;
            }
          }
        } catch (e) {
          // If we can't resolve, skip this position to be safe
          break;
        }
        
        // Skip only when the ENTIRE range [candidateFrom, candidateTo) is already inside
        // scripture pills. If only part of the range has a pill (e.g. "Matthew 1:12" in a pill
        // and " -13" plain), we still return this position so the caller can replace/extend
        // with one pill for the full reference.
        if (skipMarked) {
          try {
            const rangeLen = candidateTo - candidateFrom;
            // Sample positions across the range; skip only if every sampled position has a pill
            const sampleCount = Math.min(rangeLen, 8);
            const step = rangeLen <= sampleCount ? 1 : Math.max(1, Math.floor(rangeLen / (sampleCount - 1)));
            let allHavePill = true;
            for (let i = 0; i < rangeLen; i += step) {
              const pos = candidateFrom + (i === 0 ? 0 : Math.min(i, rangeLen - 1));
              try {
                const $p = doc.resolve(pos);
                // Check both $p.marks() and nodeAfter.marks for non-inclusive mark boundary handling
                const hasPill = $p.marks().some((m: any) => m.type.name === 'scripturePill')
                  || ($p.nodeAfter?.marks?.some((m: any) => m.type.name === 'scripturePill') ?? false);
                if (!hasPill) {
                  allHavePill = false;
                  break;
                }
              } catch (e) {
                allHavePill = false;
                break;
              }
            }
            // Also check the last position in the range
            if (allHavePill && rangeLen > 0) {
              try {
                const $last = doc.resolve(candidateTo - 1);
                const lastHasPill = $last.marks().some((m: any) => m.type.name === 'scripturePill')
                  || ($last.nodeAfter?.marks?.some((m: any) => m.type.name === 'scripturePill') ?? false);
                if (!lastHasPill) {
                  allHavePill = false;
                }
              } catch (e) {
                allHavePill = false;
              }
            }
            if (allHavePill) {
              continue; // Entire range already in pill(s), skip
            }
          } catch (e) {
            // If we can't resolve, don't skip so caller can try to apply
          }
        }
        
        // Validate that this position doesn't span across paragraph boundaries
        // This prevents marks from affecting paragraph breaks
        try {
          if (!isWithinSingleParagraph(doc, candidateFrom, candidateTo)) {
            // Skip positions that span paragraphs
            break;
          }
        } catch (e) {
          // If we can't validate, skip this position to be safe
          break;
        }
        
        // Check if this position overlaps with any already found position
        const overlaps = positions.some(p => 
          (candidateFrom >= p.from && candidateFrom < p.to) ||
          (candidateTo > p.from && candidateTo <= p.to) ||
          (candidateFrom <= p.from && candidateTo >= p.to)
        );
        
        if (!overlaps) {
          positions.push({ from: candidateFrom, to: candidateTo });
        }
        break;
      }
    }
  }
  
  return positions;
}

// Helper function to check if reference is already wrapped in a pill
function isReferenceWrapped(htmlContent: string, reference: string): boolean {
  // Normalize the reference to match how it's stored in HTML
  const normalizedRef = normalizeScriptureReference(reference);
  const escapedRef = normalizedRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<span[^>]*data-scripture-reference=["']${escapedRef.replace(/"/g, '&quot;')}["'][^>]*>`, 'i');
  return pattern.test(htmlContent);
}

/**
 * Space, newline, or cursor at the start of a block (e.g. after Return splits a paragraph).
 * ProseMirror does not insert \\n in the text node for paragraph breaks, so we must treat
 * parentOffset === 0 as a boundary — same role as Space for creating a pill.
 */
function isScripturePillBoundaryCursor($from: any, doc: any): boolean {
  if ($from.parentOffset > 0) {
    const charBefore = doc.textBetween($from.pos - 1, $from.pos);
    return charBefore === ' ' || charBefore === '\n' || charBefore === '\r';
  }
  // New paragraph/block after Enter: not document start (pos 1 = empty first block)
  if ($from.parentOffset === 0 && $from.pos > 1) {
    return true;
  }
  return false;
}

/** Up to 60 chars before cursor, may span blocks so "ref + Enter" still sees the reference. */
function getTextBeforeCursorForScripture(editor: any): string {
  const { from } = editor.state.selection;
  const textStart = Math.max(0, from - 60);
  return editor.state.doc.textBetween(textStart, from);
}

// Helper function to check/create scripture note and get noteId

/**
 * Resolves all pending translation pills for this editor. For each pill, checks the text
 * immediately after it for a valid translation abbreviation. If found, applies it and deletes
 * the abbreviation. Otherwise applies the user's default translation.
 * @returns true if any abbreviation was consumed from the text (so we can skip normal detection)
 */
function resolvePendingTranslationPill(editor: any): boolean {
  if (!editor || editor.isDestroyed) return false;
  const editorId = String(editor.view?.dom?.id || 'default');
  const entries = Array.from(pendingTranslationPills.entries()).filter(([, v]) => v.editorId === editorId);
  if (entries.length === 0) return false;

  // Clear all entries for this editor upfront
  for (const [key, entry] of entries) {
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    pendingTranslationPills.delete(key);
  }

  let anyConsumed = false;
  try {
    const view = editor.view;
    const doc = view.state.doc;
    const markType = view.state.schema.marks.scripturePill;
    if (!markType) return false;

    for (const [, { reference }] of entries) {
      try {
        let pillFrom = -1, pillTo = -1;
        doc.descendants((node: any, pos: number) => {
          if (pillFrom !== -1) return false;
          if (!node.isText) return;
          const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill' && !m.attrs.translation);
          if (pillMark && normalizeScriptureReference(pillMark.attrs.reference) === normalizeScriptureReference(reference)) {
            pillFrom = pos;
            pillTo = pos + node.nodeSize;
            return false;
          }
        });

        if (pillFrom === -1) continue;

        const cursorPos = view.state.selection.from;
        const scanEnd = Math.min(cursorPos, doc.content.size);
        let textAfterPill = '';
        if (pillTo < scanEnd) {
          try { textAfterPill = doc.textBetween(pillTo, scanEnd); } catch (_) {}
        }

        const trailing = matchAnchoredTrailingTranslationAbbreviation(textAfterPill);
        if (trailing) {
          const deleteFrom = pillTo;
          const deleteTo = pillTo + trailing.consumed.length;
          const tr = view.state.tr;
          tr.delete(deleteFrom, deleteTo);
          tr.addMark(pillFrom, pillTo, markType.create({ reference, noteId: 'pending', translation: trailing.canonicalId }));
          tr.setMeta('addToHistory', false);
          tr.setStoredMarks([]);
          view.dispatch(tr);
          anyConsumed = true;
        } else {
          const resolvedTranslation = getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation();
          const tr = view.state.tr;
          tr.addMark(pillFrom, pillTo, markType.create({ reference, noteId: 'pending', translation: resolvedTranslation }));
          tr.setMeta('addToHistory', false);
          view.dispatch(tr);
        }
      } catch (e) {
        console.error('[TiptapEditor] Error resolving pending translation pill:', e);
      }
    }
  } catch (e) {
    console.error('[TiptapEditor] Error in resolvePendingTranslationPill:', e);
  }
  return anyConsumed;
}

/**
 * If text after any pending pill is already a full translation abbreviation, consume it and set
 * the mark on all pending pills for this editor. Does not apply the profile default (so the user
 * can still type an abbrev after a lone "ref + space").
 * @returns true if an abbreviation was consumed from any pill
 */
function tryConsumeTranslationAbbrevAfterPill(editor: any): boolean {
  if (!editor || editor.isDestroyed) return false;
  const editorId = String(editor.view?.dom?.id || 'default');
  const entries = Array.from(pendingTranslationPills.entries()).filter(([, v]) => v.editorId === editorId);
  if (entries.length === 0) return false;

  try {
    const view = editor.view;
    const doc = view.state.doc;
    const markType = view.state.schema.marks.scripturePill;
    if (!markType) return false;

    const pendingRefs = new Set(entries.map(([, v]) => normalizeScriptureReference(v.reference)));
    const cursorPos = view.state.selection.from;

    // The pill the user just typed an abbreviation after = the pending pill ending nearest before
    // the cursor. Match regardless of an existing translation so editing can CHANGE it (e.g. a
    // carried "NLT" → typed "ESV"), and abbrev-only so the profile default is never applied here.
    let pillFrom = -1, pillTo = -1, pillRef = '';
    doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      const pm = node.marks.find((m: any) => m.type.name === 'scripturePill');
      if (!pm || !pendingRefs.has(normalizeScriptureReference(pm.attrs.reference))) return;
      const end = pos + node.nodeSize;
      if (end <= cursorPos && end > pillTo) {
        pillFrom = pos;
        pillTo = end;
        pillRef = pm.attrs.reference;
      }
    });
    if (pillFrom === -1) return false;

    let textAfterPill = '';
    if (pillTo < cursorPos) {
      try { textAfterPill = doc.textBetween(pillTo, Math.min(cursorPos, doc.content.size)); } catch (_) {}
    }
    const trailing = matchAnchoredTrailingTranslationAbbreviation(textAfterPill);
    if (!trailing) return false;

    const key = normalizeScriptureReference(pillRef);
    const entry = pendingTranslationPills.get(key);
    if (entry?.timeoutId) clearTimeout(entry.timeoutId);
    pendingTranslationPills.delete(key);

    const existingMark = doc.nodeAt(pillFrom)?.marks.find((m: any) => m.type === markType);
    const tr = view.state.tr;
    tr.delete(pillTo, pillTo + trailing.consumed.length);
    tr.addMark(
      pillFrom,
      pillTo,
      markType.create({
        ...(existingMark ? existingMark.attrs : { reference: pillRef, noteId: 'pending' }),
        reference: pillRef,
        translation: trailing.canonicalId,
      }),
    );
    tr.setMeta('addToHistory', false);
    tr.setStoredMarks([]);
    view.dispatch(tr);
    return true;
  } catch (e) {
    console.error('[TiptapEditor] Error in tryConsumeTranslationAbbrevAfterPill:', e);
    return false;
  }
}

function schedulePendingTranslationAfterPillCreation(
  editor: any,
  references: (ScriptureReference | ScriptureReferenceWithTranslation)[],
) {
  if (!references?.length) return;
  const editorId = String(editor.view?.dom?.id || 'default');

  // Register every reference in the map so each gets its own detection window
  for (const ref of references) {
    const key = normalizeScriptureReference(ref.reference);
    const existing = pendingTranslationPills.get(key);
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);
    pendingTranslationPills.set(key, { reference: ref.reference, editorId, timeoutId: null });
  }

  // Try to immediately consume an already-typed abbreviation
  if (!tryConsumeTranslationAbbrevAfterPill(editor)) {
    // Set a 3-second timeout per reference; whichever fires last wins
    for (const ref of references) {
      const key = normalizeScriptureReference(ref.reference);
      const entry = pendingTranslationPills.get(key);
      if (!entry) continue;
      const timeoutId = setTimeout(() => {
        const current = pendingTranslationPills.get(key);
        if (current?.editorId === editorId) {
          resolvePendingTranslationPill(editor);
        }
      }, 3000);
      entry.timeoutId = timeoutId;
    }
  }
}

// Helper function to convert scripture references to pills using processed results data
// This is more reliable than parsing HTML since Tiptap may have already parsed/removed spans
// Helper function to create pending pills for detected scripture references
function normalizeRefForPillCompare(s: string): string {
  return s.replace(/\s*[-–—]\s*/g, '-').replace(/\s*:\s*/g, ':').trim();
}

/** Apply or refresh a scripture pill mark on [pillFrom, pillTo); returns final end position. */
function applyScripturePillToRange(
  tr: any,
  markType: any,
  pillFrom: number,
  pillTo: number,
  reference: string,
  attrs: { noteId: string | null; translation?: string | null; pillAccent?: string | null },
): number {
  if (!isWithinSingleParagraph(tr.doc, pillFrom, pillTo) || rangeCrossesHardBreak(tr.doc, pillFrom, pillTo)) {
    return pillTo;
  }
  const currentText = tr.doc.textBetween(pillFrom, pillTo);
  const noteId = attrs.noteId ?? 'pending';
  const translation = attrs.translation ?? null;
  const pillAccent = attrs.pillAccent ?? null;
  if (normalizeRefForPillCompare(currentText) !== normalizeRefForPillCompare(reference)) {
    const textNode = tr.doc.schema.text(reference, [
      markType.create({ reference, noteId, translation, pillAccent }),
    ]);
    tr.replaceWith(pillFrom, pillTo, textNode);
    return pillFrom + reference.length;
  }
  tr.removeMark(pillFrom, pillTo, markType);
  tr.addMark(
    pillFrom,
    pillTo,
    markType.create({ reference, noteId, translation, pillAccent }),
  );
  return pillTo;
}

function resolveExtendedReference(
  existingRef: string,
  gapText: string,
  detectedRef: string,
): string | null {
  const merged = mergeReferenceWithOrphanSuffix(existingRef, gapText);
  if (merged) return isResolvableScriptureReference(merged) ? merged : null;
  const pillTrim = existingRef.trim();
  const detTrim = detectedRef.trim();
  if (detTrim.length > pillTrim.length && detTrim.toLowerCase().startsWith(pillTrim.toLowerCase())) {
    // A longer prefix-match is only an extension if it still resolves; otherwise it's
    // the same dropped-hyphen corruption in a different disguise.
    return isResolvableScriptureReference(detectedRef) ? detectedRef : null;
  }
  return null;
}

function insertScriptureContinuationAtPillEnd(
  editor: any,
  boundaries: { start: number; end: number },
  key: string,
  pillAttrs: { reference: string; noteId: string | null; translation?: string | null; pillAccent?: string | null },
): void {
  if (!editor?.view) return;
  const view = editor.view;
  const markType = view.state.schema.marks.scripturePill;
  if (!markType) return;

  let tr = view.state.tr;
  const insertPos = boundaries.end;
  tr.insertText(key, insertPos, [
    markType.create({
      reference: pillAttrs.reference,
      noteId: pillAttrs.noteId,
      translation: pillAttrs.translation ?? null,
      pillAccent: pillAttrs.pillAccent ?? null,
    }),
  ]);
  const newEnd = insertPos + key.length;
  const merged =
    mergeReferenceWithOrphanSuffix(pillAttrs.reference, tr.doc.textBetween(boundaries.end, newEnd)) ||
    detectScriptureReferences(tr.doc.textBetween(boundaries.start, newEnd))[0]?.reference ||
    null;

  const finalRef = merged ?? pillAttrs.reference;

  // Only let the pill swallow the keystroke if the result still points at a real passage.
  // Detection accepts unbounded digit runs, so when iOS eats the `-` of `16:16-20` this
  // path used to grow the pill through `16:162` to `16:1620` and store that as the
  // reference — a pill the server can never resolve. Falling back to plain text keeps the
  // digits visible and editable instead of baking in a broken pill.
  const grownText = tr.doc.textBetween(boundaries.start, newEnd);
  if (!isResolvableScriptureReference(finalRef) || !isResolvableScriptureReference(grownText)) {
    const plain = view.state.tr;
    plain.insertText(key, insertPos);
    plain.removeMark(insertPos, insertPos + key.length, markType);
    plain.setSelection(TextSelection.create(plain.doc, insertPos + key.length));
    plain.setStoredMarks([]);
    plain.setMeta('addToHistory', true);
    view.dispatch(plain);
    return;
  }
  const finalEnd = applyScripturePillToRange(tr, markType, boundaries.start, newEnd, finalRef, {
    noteId: pillAttrs.noteId,
    translation: pillAttrs.translation,
    pillAccent: pillAttrs.pillAccent,
  });

  tr.setSelection(TextSelection.create(tr.doc, finalEnd));
  tr.setStoredMarks([]);
  tr.setMeta('addToHistory', true);
  view.dispatch(tr);
}

/** Merge plain verse suffixes immediately after scripture pills (e.g. chapter pill + ":2"). */
export function absorbOrphanSuffixesAfterPills(
  editor: any,
  spacingMode: ScripturePillSpacingMode = 'live',
): boolean {
  if (!editor || editor.isDestroyed || !editor.view) return false;
  try {
    const view = editor.view;
    const markType = view.state.schema.marks.scripturePill;
    if (!markType) return false;

    const pillSpans: { from: number; mark: any }[] = [];
    view.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      const m = node.marks.find((mk: any) => mk.type.name === 'scripturePill');
      if (m) pillSpans.push({ from: pos, mark: m });
    });
    if (pillSpans.length === 0) return false;

    let tr = view.state.tr;
    let modified = false;

    for (let i = pillSpans.length - 1; i >= 0; i--) {
      // Probe one position INSIDE the pill, not at its node start: scripture pills are
      // inclusive:false, so $pos.marks() strips the pill at the start boundary and
      // findPillBoundaries' forward end-scan would fail and return null.
      const boundaries = findPillBoundaries(tr.doc, pillSpans[i].from + 1);
      if (!boundaries) continue;

      const $end = tr.doc.resolve(boundaries.end);
      const blockEnd = $end.end($end.depth);
      if (boundaries.end >= blockEnd) continue;

      const gapText = tr.doc.textBetween(boundaries.end, blockEnd);
      const suffixMatch = gapText.match(/^[\s:,\d\-–—]+/);
      if (!suffixMatch || !isOrphanScriptureSuffix(suffixMatch[0])) continue;

      const suffix = suffixMatch[0];
      const existingRef = pillSpans[i].mark.attrs.reference as string;
      const merged = mergeReferenceWithOrphanSuffix(existingRef, suffix);
      if (!merged) continue;

      const pillTo = boundaries.end + suffix.length;
      applyScripturePillToRange(tr, markType, boundaries.start, pillTo, merged, {
        noteId: pillSpans[i].mark.attrs.noteId,
        translation: pillSpans[i].mark.attrs.translation,
        pillAccent: pillSpans[i].mark.attrs.pillAccent,
      });
      modified = true;
    }

    if (modified) {
      ensureScripturePillSpacing(tr, 'scripturePill', spacingMode);
      tr.setMeta('addToHistory', false);
      tr.setStoredMarks([]);
      view.dispatch(tr);
    }
    return modified;
  } catch {
    return false;
  }
}

function dispatchScripturePillSpacing(editor: any, mode: ScripturePillSpacingMode = 'live'): void {
  if (!editor?.view) return;
  try {
    const tr = editor.state.tr;
    if (ensureScripturePillSpacing(tr, 'scripturePill', mode)) {
      tr.setMeta('addToHistory', false);
      tr.setStoredMarks([]);
      editor.view.dispatch(tr);
    }
  } catch {
    /* ignore */
  }
}

function hasValidPrecomputedPosition(
  precomputed: { reference: string; from: number | null; to: number | null } | null | undefined,
  reference: string,
): precomputed is PrecomputedPillPosition {
  return (
    !!precomputed &&
    precomputed.from != null &&
    precomputed.to != null &&
    normalizeScriptureReference(precomputed.reference) === normalizeScriptureReference(reference)
  );
}

function findScripturePillMarkAtCursor(doc: any, cursorPos: number): any | null {
  try {
    const $pos = doc.resolve(cursorPos);
    let pillMark = $pos.marks().find((m: any) => m.type.name === 'scripturePill');
    if (!pillMark && $pos.nodeAfter?.marks) {
      pillMark = $pos.nodeAfter.marks.find((m: any) => m.type.name === 'scripturePill');
    }
    if (!pillMark && cursorPos > 1) {
      const $before = doc.resolve(cursorPos - 1);
      pillMark = $before.marks().find((m: any) => m.type.name === 'scripturePill');
    }
    return pillMark ?? null;
  } catch {
    return null;
  }
}

/** Skip chapter-only detection inside a pill that already spans a longer reference (e.g. "Exodus 5" in "Exodus 5:1-2"). */
function isChapterOnlyInsideLongerPill(doc: any, cursorPos: number, chapterRef: string): boolean {
  const pillMark = findScripturePillMarkAtCursor(doc, cursorPos);
  if (!pillMark) return false;
  const pillRef = String(pillMark.attrs.reference ?? '').trim();
  const chapterTrim = chapterRef.trim();
  if (!pillRef.includes(':')) return false;
  return pillRef.toLowerCase().startsWith(chapterTrim.toLowerCase());
}

/** Apply cursor-anchored detection with detectScriptureReferences fallback. Returns applied reference. */
function applyDetectionAtCursor(editor: any, cursorPos: number): string | null {
  const doc = editor.state.doc;
  const cursorResult = detectScriptureReferenceEndingAtCursor(doc, cursorPos);

  if (cursorResult) {
    if (
      isChapterOnlyScriptureReference(cursorResult.reference) &&
      isChapterOnlyInsideLongerPill(doc, cursorPos, cursorResult.reference)
    ) {
      return null;
    }
    const precomputed = hasValidPrecomputedPosition(cursorResult, cursorResult.reference)
      ? { reference: cursorResult.reference, from: cursorResult.from!, to: cursorResult.to! }
      : undefined;
    const applied = createPendingPillsForReferences(
      editor,
      [{ reference: cursorResult.reference }],
      undefined,
      cursorPos,
      precomputed,
    );
    return applied ? cursorResult.reference : null;
  }

  const textStart = Math.max(0, cursorPos - 60);
  const textBeforeCursor = doc.textBetween(textStart, cursorPos);
  if (textBeforeCursor.trim().length === 0) return null;

  const refs = detectScriptureReferences(textBeforeCursor);
  if (refs.length === 0) return null;

  const lastRef = refs[refs.length - 1];
  const applied = createPendingPillsForReferences(editor, [lastRef], undefined, cursorPos);
  return applied ? lastRef.reference : null;
}

type PrecomputedPillPosition = { reference: string; from: number; to: number };

function lockPendingPillCreation(reference: string): void {
  const normalizedRef = normalizeScriptureReference(reference);
  if (pendingPillCreations.has(normalizedRef)) return;
  pendingPillCreations.add(normalizedRef);
  setTimeout(() => {
    pendingPillCreations.delete(normalizedRef);
  }, 500);
}

/** Run detection + pending pill creation at the current cursor (desktop, mobile, safety net). */
function runScriptureDetectionAtCursor(editor: any): void {
  if (!editor || editor.isDestroyed || !editor.view) return;
  try {
    resolvePendingTranslationPill(editor);

    const { from, to } = editor.state.selection;
    if (from !== to || from < 2) return;

    const $from = editor.state.doc.resolve(from);
    const doc = editor.state.doc;
    const cursorEnding = detectScriptureReferenceEndingAtCursor(doc, from);
    const insidePill = $from.marks().some((m: any) => m.type.name === 'scripturePill');
    if (insidePill && !cursorEnding) return;
    if (
      !shouldSchedulePassiveScriptureDetection(doc, from, isScripturePillBoundaryCursor($from, doc))
    ) {
      return;
    }

    const appliedRef = applyDetectionAtCursor(editor, from);
    if (appliedRef) {
      schedulePendingTranslationAfterPillCreation(editor, [{ reference: appliedRef }]);
    }
    absorbOrphanSuffixesAfterPills(editor);
  } catch {
    /* ignore */
  }
}

// ── Inline edit-mode (draft) detection (prototype) ────────────────────────────

/**
 * A reference ends at the caret and should schedule draft entry. Chapter-only refs (e.g.
 * "Exodus 5") only schedule at a word boundary — otherwise typing "Exodus 5:6-9" would draft
 * "Exodus 5" the instant the chapter is typed and orphan ":6-9". Mirrors
 * `shouldSchedulePassiveScriptureDetection`.
 */
function shouldScheduleDraftDetection(
  doc: any,
  cursorPos: number,
  isBoundaryCursor: boolean,
): boolean {
  const cursorEnding = detectScriptureReferenceEndingAtCursor(doc, cursorPos);
  if (cursorEnding == null) return false;
  if (!isChapterOnlyScriptureReference(cursorEnding.reference)) return true;
  return isBoundaryCursor;
}

/** Wrap the reference ending at the caret in the draft mark (caret stays inside it). */
function enterScriptureDraftAtCursor(
  editor: any,
  cursorPos: number,
  isBoundaryCursor: boolean,
): boolean {
  const doc = editor.state.doc;
  const cursorResult = detectScriptureReferenceEndingAtCursor(doc, cursorPos);
  if (!cursorResult) return false;
  const reference = cursorResult.reference;
  if (isChapterOnlyScriptureReference(reference)) {
    // Don't draft a bare chapter mid-stream — the user may still be typing the verse.
    if (!isBoundaryCursor) return false;
    if (isChapterOnlyInsideLongerPill(doc, cursorPos, reference)) return false;
  }
  const pos =
    cursorResult.from != null && cursorResult.to != null
      ? { from: cursorResult.from, to: cursorResult.to }
      : findScriptureReferenceAtCursor(doc, reference, cursorPos) ||
        mapReferenceEndInSliceToDocPos(doc, cursorPos, reference);
  if (!pos) return false;
  return enterScriptureDraftView(editor.view, pos.from, pos.to);
}

/**
 * Passive draft detection for the prototype: enter edit-mode instead of committing a pill.
 * One draft at a time — the draft stays fixed to the detected reference; a range tail typed
 * after it stays plain text and is absorbed when the draft is confirmed (no live growth, which
 * split into multiple draft pills on iOS).
 */
function runScriptureDraftDetectionAtCursor(editor: any): void {
  if (!editor || editor.isDestroyed || !editor.view) return;
  try {
    const state = editor.state;
    const { from, to } = state.selection;
    if (from !== to || from < 2) return;
    const $from = state.doc.resolve(from);
    // Don't start a draft inside a committed pill.
    if ($from.marks().some((m: any) => m.type.name === 'scripturePill')) return;
    // A draft already exists anywhere — leave it (it's confirmed on tap-✓ / detach).
    if (getScriptureDraftAnchorPos(state) != null) return;
    enterScriptureDraftAtCursor(editor, from, isScripturePillBoundaryCursor($from, state.doc));
  } catch {
    /* ignore */
  }
}

// Helper function to create pending pills for detected scripture references
// This is called after space key press to show visual feedback
function createPendingPillsForReferences(
  editor: any,
  references: (ScriptureReference | ScriptureReferenceWithTranslation)[],
  translation?: string,
  cursorPos?: number,
  precomputed?: PrecomputedPillPosition | null,
): boolean {
  if (!editor || !references || references.length === 0) {
    return false;
  }

  const newReferences = references.filter((ref) => {
    const normalizedRef = normalizeScriptureReference(ref.reference);
    return !pendingPillCreations.has(normalizedRef);
  });

  if (newReferences.length === 0) {
    return false;
  }

  try {
    const view = editor.view;
    let state = view.state;
    let tr = state.tr;
    let modified = false;

    const anchorCursorPos = cursorPos ?? state.selection.from;

    for (const ref of newReferences) {
      const reference = ref.reference;
      if (!reference) continue;
      
      const doc = tr.doc;
      let positions = findAllTextPositions(doc, reference, true);

      if (hasValidPrecomputedPosition(precomputed, reference)) {
        positions = [{ from: precomputed.from, to: precomputed.to }];
      } else {
        const anchored = findScriptureReferenceAtCursor(doc, reference, anchorCursorPos);
        if (anchored) {
          positions = [anchored];
        } else if (positions.length === 0) {
          const fallback = mapReferenceEndInSliceToDocPos(doc, anchorCursorPos, reference);
          if (fallback) positions = [fallback];
        } else if (positions.length > 1) {
          positions = [
            positions.reduce((best, p) => {
              const bestDist = Math.min(Math.abs(best.to - anchorCursorPos), Math.abs(best.from - anchorCursorPos));
              const pDist = Math.min(Math.abs(p.to - anchorCursorPos), Math.abs(p.from - anchorCursorPos));
              return pDist < bestDist ? p : best;
            }),
          ];
        }
      }

      if (positions.length === 0 && import.meta.env.DEV) {
        console.warn('[TiptapEditor] No positions for scripture reference:', reference);
      }

      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];
        
        try {
          const $from = doc.resolve(pos.from);
          // Non-inclusive marks may not appear in $pos.marks() at boundaries.
          // Check both $from.marks() and the text node at this position.
          let pillMark = $from.marks().find((m: any) => m.type.name === 'scripturePill');
          if (!pillMark) {
            // Check text node at pos.from (nodeAfter) for the mark
            const nodeAt = $from.nodeAfter;
            if (nodeAt) {
              pillMark = nodeAt.marks.find((m: any) => m.type.name === 'scripturePill');
            }
          }
          if (!pillMark && pos.from + 1 <= doc.content.size) {
            // Check one position inside
            try {
              const $inside = doc.resolve(pos.from + 1);
              pillMark = $inside.marks().find((m: any) => m.type.name === 'scripturePill');
            } catch (_) {}
          }

          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) continue;
          if (rangeCrossesHardBreak(doc, adjustedPos.from, adjustedPos.to)) continue;

          const markType = state.schema.marks.scripturePill;
          if (!markType) continue;

          // Extend an existing pill when detection found a longer reference (e.g. Romans 12 → Romans 12:2).
          if (pillMark) {
            const boundaries = findPillBoundaries(doc, pos.from);
            if (!boundaries) continue;
            const gapText = doc.textBetween(boundaries.end, adjustedPos.to);
            const extendedRef = resolveExtendedReference(
              pillMark.attrs.reference as string,
              gapText,
              reference,
            );
            if (!extendedRef) continue;

            applyScripturePillToRange(
              tr,
              markType,
              boundaries.start,
              adjustedPos.to,
              extendedRef,
              {
                noteId: pillMark.attrs.noteId,
                translation: pillMark.attrs.translation ?? translation ?? null,
                pillAccent: pillMark.attrs.pillAccent,
              },
            );

            modified = true;
            lockPendingPillCreation(reference);
            continue;
          }

          {
            // Data-loss safety net (duplicate-reference bug): we only reach this "create a fresh
            // pill" branch when no pill was detected at the anchor, but non-inclusive mark detection
            // at boundaries is unreliable, so the resolved range can still land on an EXISTING pill —
            // e.g. typing the same chapter ("John 3") a second time can resolve back onto the first
            // pill. applyScripturePillToRange would then tr.replaceWith over it and destroy it.
            // Reliably re-scan the target range against the live transaction doc and skip if any node
            // already carries a scripturePill mark (legit extension goes through the branch above).
            if (rangeContainsScripturePillMark(tr.doc, adjustedPos.from, adjustedPos.to)) continue;

            const pillTranslation = translation || null;

            applyScripturePillToRange(tr, markType, adjustedPos.from, adjustedPos.to, reference, {
              noteId: 'pending',
              translation: pillTranslation,
            });

            modified = true;
            lockPendingPillCreation(reference);
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (modified) {
      ensureScripturePillSpacing(tr);
      tr.setMeta('addToHistory', false);
      tr.setStoredMarks([]);
      view.dispatch(tr);
      state = view.state;
    }

    absorbOrphanSuffixesAfterPills(editor);

    if (modified) {
      const spacingTr = view.state.tr;
      if (ensureScripturePillSpacing(spacingTr)) {
        spacingTr.setMeta('addToHistory', false);
        spacingTr.setStoredMarks([]);
        view.dispatch(spacingTr);
      }
    }

    // Safety-net: clear stored marks after a brief delay so the next typed
    // character won't inherit the pill mark.  Do NOT reposition the cursor —
    // the space was already inserted and the cursor is already in the correct
    // position (after the space, outside the pill).  Calling Selection.near()
    // can snap the cursor to before the space in some edge cases, eating it.
    setTimeout(() => {
      if (!editor || editor.isDestroyed) return;
      const view = editor.view;
      const curState = view.state;

      // Only act if stored marks still contain the pill mark
      const stored = curState.storedMarks;
      if (stored && stored.some((m: any) => m.type.name === 'scripturePill')) {
        const clearTr = curState.tr.setStoredMarks(
          stored.filter((m: any) => m.type.name !== 'scripturePill')
        );
        clearTr.setMeta('addToHistory', false);
        view.dispatch(clearTr);
      }

      // If the cursor somehow ended up inside the pill, nudge it just past the pill end
      try {
        const $cur = view.state.doc.resolve(view.state.selection.from);
        const insidePill = $cur.marks().some((m: any) => m.type.name === 'scripturePill')
          || ($cur.nodeAfter?.marks?.some((m: any) => m.type.name === 'scripturePill') && $cur.nodeBefore === null);
        if (insidePill) {
          // Find pill end
          let pillEnd = view.state.selection.from;
          for (let p = pillEnd; p <= view.state.doc.content.size; p++) {
            const $p = view.state.doc.resolve(p);
            if (!$p.marks().some((m: any) => m.type.name === 'scripturePill')) {
              pillEnd = p;
              break;
            }
          }
          const moveTr = view.state.tr.setSelection(
            TextSelection.create(view.state.doc, pillEnd)
          );
          moveTr.setStoredMarks([]);
          moveTr.setMeta('addToHistory', false);
          view.dispatch(moveTr);
        }
      } catch (_) {}
    }, 10);

    return modified;
  } catch (error) {
    console.error('Error creating pending pills:', error);
    return false;
  }
}

export async function convertScriptureReferencesToPills(
  editor: any, 
  scriptureResults: Array<{ reference: string; noteId: string }>
) {
  if (!editor) {
    return;
  }
  
  try {
    // Get fresh document state after content was set
    const doc = editor.state.doc;
    
    // If no results, remove all pending pills (they weren't validated)
    if (!scriptureResults || scriptureResults.length === 0) {
      const pendingPills: Array<{from: number, to: number}> = [];

      doc.descendants((node: any, pos: number) => {
        if (node.marks) {
          const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill');
          if (pillMark && pillMark.attrs.noteId === 'pending') {
            pendingPills.push({ from: pos, to: pos + node.nodeSize });
          }
        }
      });

      // Batch all removals into a single transaction (one view update)
      if (pendingPills.length > 0) {
        const tr = editor.state.tr;
        for (let i = pendingPills.length - 1; i >= 0; i--) {
          tr.removeMark(pendingPills[i].from, pendingPills[i].to, editor.state.schema.marks.scripturePill);
        }
        editor.view.dispatch(tr);
      }
      return;
    }
    
    const validReferences = new Set(scriptureResults.map(r => normalizeScriptureReference(r.reference)));
    
    // Step 1: Remove pending pills that weren't validated by server
    const pendingPillsToRemove: Array<{from: number, to: number, reference: string}> = [];
    
    doc.descendants((node: any, pos: number) => {
      if (node.marks) {
        const pillMark = node.marks.find((m: any) => m.type.name === 'scripturePill');
        if (pillMark && pillMark.attrs.noteId === 'pending') {
          const normalizedRef = normalizeScriptureReference(pillMark.attrs.reference);
          if (!validReferences.has(normalizedRef)) {
            // This pending pill wasn't validated - mark for removal
            pendingPillsToRemove.push({
              from: pos,
              to: pos + node.nodeSize,
              reference: pillMark.attrs.reference
            });
          }
        }
      }
    });
    
    // Batch remove invalid pending pills in a single transaction
    if (pendingPillsToRemove.length > 0) {
      const tr = editor.state.tr;
      for (let i = pendingPillsToRemove.length - 1; i >= 0; i--) {
        tr.removeMark(pendingPillsToRemove[i].from, pendingPillsToRemove[i].to, editor.state.schema.marks.scripturePill);
      }
      editor.view.dispatch(tr);
    }
    
    // Step 2: Collect all mark operations, then apply in a single transaction
    // This avoids dispatching per-pill (each dispatch triggers a full view update).
    type MarkOp = { from: number; to: number; normalizedRef: string; noteId: string; translation?: string | null };
    const markOps: MarkOp[] = [];

    for (const result of scriptureResults) {
      const { reference, noteId } = result;
      if (!reference || !noteId) continue;

      const normalizedRef = normalizeScriptureReference(reference);
      const positions = findAllTextPositions(doc, reference, false);
      if (positions.length === 0) continue;

      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];

        try {
          const $from = doc.resolve(pos.from);
          // Non-inclusive marks may not appear in $pos.marks() at boundaries
          let pillMark = $from.marks().find((m: any) => m.type.name === 'scripturePill');
          if (!pillMark && $from.nodeAfter) {
            pillMark = $from.nodeAfter.marks.find((m: any) => m.type.name === 'scripturePill');
          }
          if (!pillMark && pos.from + 1 <= doc.content.size) {
            try {
              const $inside = doc.resolve(pos.from + 1);
              pillMark = $inside.marks().find((m: any) => m.type.name === 'scripturePill');
            } catch (_) {}
          }

          if (pillMark) {
            if (pillMark.attrs.noteId === 'pending') {
              markOps.push({ from: pos.from, to: pos.to, normalizedRef, noteId, translation: pillMark.attrs.translation });
            }
            continue;
          }

          if (!isWithinSingleParagraph(doc, pos.from, pos.to)) continue;

          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) continue;

          // Verify text matches and trim trailing whitespace
          try {
            let textAtPosition = doc.textBetween(adjustedPos.from, adjustedPos.to);
            const trimmedText = textAtPosition.trimEnd();
            if (normalizeScriptureReference(trimmedText) !== normalizeScriptureReference(reference)) continue;

            if (textAtPosition !== trimmedText) {
              adjustedPos.to -= (textAtPosition.length - trimmedText.length);
              if (adjustedPos.to <= adjustedPos.from) continue;
            }
          } catch (e) { continue; }

          // Check paragraph end boundary
          try {
            const $to = doc.resolve(adjustedPos.to);
            const paragraphStart = $to.start($to.depth);
            const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;

            if (adjustedPos.to >= paragraphEnd - 1) continue;

            if (!hasLineBreakAfter(doc, adjustedPos.to, paragraphEnd)) {
              const textAfterMark = doc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
              if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) continue;
            }
          } catch (e) { continue; }

          markOps.push({ from: adjustedPos.from, to: adjustedPos.to, normalizedRef, noteId });
        } catch (e) {
          continue;
        }
      }
    }

    // Apply all mark operations in a single transaction (one view update)
    if (markOps.length > 0) {
      try {
        const tr = editor.state.tr;
        const markType = editor.state.schema.marks.scripturePill;
        const noteLinkMark = editor.state.schema.marks.noteLink;
        if (markType) {
          // Sort by position descending so earlier operations don't shift later positions
          markOps.sort((a, b) => b.from - a.from);
          for (const op of markOps) {
            tr.removeMark(op.from, op.to, markType);
            tr.addMark(op.from, op.to, markType.create({ reference: op.normalizedRef, noteId: op.noteId, translation: op.translation || null }));
            if (noteLinkMark) {
              tr.removeMark(op.from, op.to, noteLinkMark);
            }
          }
          editor.view.dispatch(tr);
        }
      } catch (e) {
        console.error('Error batching scripture pill marks:', e);
      }
    }
  } catch (error) {
    console.error('Error converting scripture references to pills:', error);
  }
}

/**
 * Load-time cleanup: a scripture pill may be immediately followed by a translation
 * abbreviation as plain text — e.g. "<pill>Exodus 5:1-10</pill> NLT and see…". This happens when
 * content is bridged from native, when Settings default changed but the pill still carries NET,
 * or when a translation abbreviation was typed after a pill that had already resolved to the default.
 * The typing-time consume only handles freshly-created *pending* pills, so on reopen the orphan
 * abbreviation can linger. Consume the anchored abbrev into the pill (when stale/missing) or drop
 * redundant text when it matches the pill translation.
 */
function shouldAdoptTrailingTranslationForPill(pillTranslation: string | null | undefined): boolean {
  if (!pillTranslation) return true;
  if (pillTranslation === 'NET') return true;
  return false;
}

export function applyDefaultTranslationToScripturePills(
  editor: any,
  defaultTranslation: string,
  previousDefault?: string,
): boolean {
  if (!editor || editor.isDestroyed || !editor.view) return false;
  try {
    const markType = editor.view.state.schema.marks.scripturePill;
    if (!markType) return false;

    const tr = editor.view.state.tr;
    let modified = false;

    editor.view.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      const m = node.marks.find((mk: any) => mk.type.name === 'scripturePill');
      if (!m) return;
      const current = m.attrs.translation as string | null | undefined;
      const shouldUpdate =
        !current ||
        current === 'NET' ||
        (previousDefault && current === previousDefault);
      if (!shouldUpdate || current === defaultTranslation) return;

      tr.removeMark(pos, pos + node.nodeSize, markType);
      tr.addMark(
        pos,
        pos + node.nodeSize,
        markType.create({ ...m.attrs, translation: defaultTranslation }),
      );
      modified = true;
    });

    if (modified) {
      tr.setMeta('addToHistory', false);
      tr.setStoredMarks([]);
      editor.view.dispatch(tr);
    }
    return modified;
  } catch (e) {
    console.error('[TiptapEditor] applyDefaultTranslationToScripturePills error:', e);
    return false;
  }
}

export function consumeTrailingTranslationAfterPills(editor: any): boolean {
  if (!editor || editor.isDestroyed || !editor.view) return false;
  try {
    const view = editor.view;
    const markType = view.state.schema.marks.scripturePill;
    if (!markType) return false;

    // Snapshot pill ranges + their mark first; we mutate the doc afterwards.
    const pills: { from: number; to: number; mark: any }[] = [];
    view.state.doc.descendants((node: any, pos: number) => {
      if (!node.isText) return;
      const m = node.marks.find((mk: any) => mk.type.name === 'scripturePill');
      if (m) pills.push({ from: pos, to: pos + node.nodeSize, mark: m });
    });
    if (pills.length === 0) return false;

    const tr = view.state.tr;
    let modified = false;
    // Right-to-left so earlier positions remain valid after each delete.
    for (let i = pills.length - 1; i >= 0; i--) {
      const pill = pills[i];
      try {
        const $to = tr.doc.resolve(pill.to);
        const blockEnd = $to.end($to.depth);
        if (pill.to >= blockEnd) continue;

        let onlyText = true;
        tr.doc.nodesBetween(pill.to, blockEnd, (n: any) => {
          if (!n.isText && n.isInline) onlyText = false;
        });
        if (!onlyText) continue;

        const textAfter = tr.doc.textBetween(pill.to, blockEnd);
        const trailing = matchAnchoredTrailingTranslationAbbreviation(textAfter);
        if (!trailing) continue;

        const deleteTo = pill.to + trailing.consumed.length;
        tr.delete(pill.to, deleteTo);

        const pillTrans = pill.mark.attrs.translation as string | null | undefined;
        if (shouldAdoptTrailingTranslationForPill(pillTrans)) {
          tr.addMark(pill.from, pill.to, markType.create({
            ...pill.mark.attrs,
            translation: trailing.canonicalId,
          }));
        }
        modified = true;
      } catch (_) {
        /* skip this pill on any position error */
      }
    }

    if (modified) {
      tr.setMeta('addToHistory', false);
      tr.setStoredMarks([]);
      view.dispatch(tr);
    }
    return modified;
  } catch (e) {
    console.error('[TiptapEditor] consumeTrailingTranslationAfterPills error:', e);
    return false;
  }
}

// Helper function to convert note-link spans and scripture-pill spans to proper scripturePill marks
// This handles cases where HTML contains spans that should be scripture pills but weren't parsed correctly
// (Fallback method for when Tiptap's parseHTML doesn't correctly convert the spans to marks)
export async function convertNoteLinksToScripturePills(editor: any) {
  if (!editor) return;
  
  try {
    const htmlContent = editor.getHTML();
    const doc = editor.state.doc;
    
    // Find all note-link spans and scripture-pill spans in the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // First, handle scripture-pill spans that have both data-scripture-reference and data-note-id
    // These should already be parsed correctly, but may need to be converted to marks
    const scripturePillSpans = tempDiv.querySelectorAll('span.scripture-pill[data-scripture-reference][data-note-id], span[data-scripture-reference][data-note-id]');
    
    for (const pillSpan of Array.from(scripturePillSpans)) {
      const reference = (pillSpan as HTMLElement).getAttribute('data-scripture-reference');
      const noteId = (pillSpan as HTMLElement).getAttribute('data-note-id');
      const pillTranslation = (pillSpan as HTMLElement).getAttribute('data-scripture-translation') || null;
      const pillAccent = (pillSpan as HTMLElement).getAttribute('data-pill-accent') || null;
      const pillText = pillSpan.textContent || '';
      
      if (!reference || !noteId || !pillText) continue;

      // Guard against re-hydrating corrupted/over-broad pills: only re-apply when both the
      // reference attribute and the pill's visible text are actual scripture references.
      if (
        detectScriptureReferences(reference).length === 0 ||
        detectScriptureReferences(pillText.trim()).length === 0
      ) {
        continue;
      }

      const normalizedRef = normalizeScriptureReference(reference);
      
      // Find positions of this text in the document
      const positions = findAllTextPositions(doc, pillText, false); // Don't skip marked positions
      
      // Convert each occurrence to a scripture pill if not already
      for (let i = positions.length - 1; i >= 0; i--) {
        const pos = positions[i];
        
        try {
          const $from = doc.resolve(pos.from);
          const marks = $from.marks();
          const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
          
          if (hasPill) {
            continue; // Already a pill mark
          }
          
          // Validate that the position doesn't span across paragraph boundaries
          // This prevents line breaks from being lost when scripture pills are created
          if (!isWithinSingleParagraph(doc, pos.from, pos.to)) {
            // Skip this position if it spans across paragraphs
            // This ensures paragraph breaks are preserved
            continue;
          }
          
          // Adjust position to ensure it doesn't extend beyond paragraph boundaries
          // This prevents marks from affecting paragraph breaks
          const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
          
          // Validate again after adjustment
          if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) {
            continue;
          }
          
          // CRITICAL: Verify the text at this position actually matches the reference
          // This ensures we're not applying marks to text that spans paragraphs
          // Also ensure we don't include trailing whitespace/newlines in the mark
          try {
            let textAtPosition = doc.textBetween(adjustedPos.from, adjustedPos.to);
            // Remove trailing whitespace/newlines from the text before matching
            // This ensures marks don't consume line breaks
            const trimmedText = textAtPosition.trimEnd();
            const normalizedPositionText = normalizeScriptureReference(trimmedText);
            const normalizedSearchRef = normalizeScriptureReference(reference);
            
            // If the text doesn't match (might include paragraph breaks), skip it
            if (normalizedPositionText !== normalizedSearchRef) {
              continue;
            }
            
            // If there's trailing whitespace/newline, adjust the 'to' position to exclude it
            // This prevents the mark from consuming the line break
            if (textAtPosition !== trimmedText) {
              const trailingWhitespaceLength = textAtPosition.length - trimmedText.length;
              adjustedPos.to = adjustedPos.to - trailingWhitespaceLength;
              // Validate the adjusted position is still valid
              if (adjustedPos.to <= adjustedPos.from) {
                continue;
              }
            }
          } catch (e) {
            // If we can't verify, skip to be safe
            continue;
          }
          
          // CRITICAL: Check if there's content after the mark in the same paragraph
          // If the mark ends at the end of the paragraph, skip it to prevent affecting paragraph breaks
          // But allow marks that end before hard breaks (<br>) - these should be preserved
          try {
            const $to = doc.resolve(adjustedPos.to);
            const paragraphStart = $to.start($to.depth);
            const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;
            
            // Check if there's any content after the mark in this paragraph
            if (adjustedPos.to >= paragraphEnd - 1) {
              // Mark ends at or very close to paragraph end - skip it
              continue;
            }
            
            // Check if there's a line break (hard break or newline) right after the mark (these should be preserved)
            if (hasLineBreakAfter(doc, adjustedPos.to, paragraphEnd)) {
              // There's a line break after the mark - this is fine, allow it
              // The line break will be preserved
            } else {
              // Check if there's actual text content after the mark
              const textAfterMark = doc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
              // If there's no text after the mark (or only whitespace), and we're near the paragraph end, skip
              if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) {
                continue;
              }
            }
          } catch (e) {
            // If we can't check, skip to be safe
            continue;
          }
          
          // Apply scripture pill mark using transaction API directly to avoid selection issues
          try {
            const tr = editor.state.tr;
            const markType = editor.state.schema.marks.scripturePill;
            if (markType) {
              tr.removeMark(adjustedPos.from, adjustedPos.to, markType);
              tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId, translation: pillTranslation, pillAccent }));
              // Remove noteLink mark if present
              const noteLinkMark = editor.state.schema.marks.noteLink;
              if (noteLinkMark) {
                tr.removeMark(adjustedPos.from, adjustedPos.to, noteLinkMark);
              }
              editor.view.dispatch(tr);
            }
          } catch (e) {
            // If transaction fails, fall back to chain API
            editor.chain()
              .setTextSelection(adjustedPos)
              .unsetMark('noteLink')
              .setMark('scripturePill', { reference: normalizedRef, noteId, translation: pillTranslation, pillAccent })
              .run();
          }
        } catch (e) {
          // Skip if we can't resolve the position
          continue;
        }
      }
    }
    
    // Then, handle note-link spans that might reference scripture notes
    const noteLinks = tempDiv.querySelectorAll('span.note-link[data-note-id]');
    
    if (noteLinks.length === 0) {
      dispatchScripturePillSpacing(editor, 'hydrate');
      return;
    }
    
    // Check each note-link to see if it references a scripture note
    for (const noteLink of Array.from(noteLinks)) {
      const noteId = (noteLink as HTMLElement).getAttribute('data-note-id');
      // Skip if no noteId or if it's a pending pill (not yet saved)
      if (!noteId || noteId === 'pending') continue;
      
      // Check if this note is a scripture note
      try {
        const checkResponse = await fetch(`/api/notes/${noteId}/details`, {
          method: 'GET',
          credentials: 'include'
        });
        
        if (checkResponse.ok) {
          const noteData = await checkResponse.json();
          if (noteData.note && noteData.note.noteType === 'scripture') {
            // This is a scripture note - we need to get the scripture reference
            // Try to detect it from the link text or fetch from scripture metadata
            const linkText = noteLink.textContent || '';
            
            // First, try to detect if the link text is a scripture reference
            const detectResponse = await fetch('/api/scripture/detect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: linkText }),
              credentials: 'include'
            });
            
            let reference = '';
            if (detectResponse.ok) {
              const detection = await detectResponse.json();
              if (detection.isScripture && detection.references && detection.references.length > 0) {
                reference = detection.references[0].reference;
              }
            }
            
            // If we couldn't detect it, try to get it from the note title (scripture notes often have reference as title)
            if (!reference && noteData.note.title) {
              const titleDetectResponse = await fetch('/api/scripture/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: noteData.note.title }),
                credentials: 'include'
              });
              
              if (titleDetectResponse.ok) {
                const titleDetection = await titleDetectResponse.json();
                if (titleDetection.isScripture && titleDetection.references && titleDetection.references.length > 0) {
                  reference = titleDetection.references[0].reference;
                }
              }
            }
            
            if (reference) {
              const normalizedRef = normalizeScriptureReference(reference);
              // Get translation from note's scripture metadata if available
              const noteTranslation =
                noteData.note?.scriptureVersion ||
                noteData.note?.translation ||
                (getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation());

              // Find positions of this text in the document
              // Use the linkText which should match what's in the document
              const positions = findAllTextPositions(doc, linkText, true);
              
              // Convert each occurrence to a scripture pill
              for (let i = positions.length - 1; i >= 0; i--) {
                const pos = positions[i];
                
                // Check if this position already has a scripture pill mark
                try {
                  const $from = doc.resolve(pos.from);
                  const marks = $from.marks();
                  const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
                  
                  if (hasPill) {
                    continue; // Already a pill
                  }
                  
                  // Validate that the position doesn't span across paragraph boundaries
                  // This prevents line breaks from being lost when scripture pills are created
                  if (!isWithinSingleParagraph(doc, pos.from, pos.to)) {
                    // Skip this position if it spans across paragraphs
                    // This ensures paragraph breaks are preserved
                    continue;
                  }
                  
                  // Adjust position to ensure it doesn't extend beyond paragraph boundaries
                  // This prevents marks from affecting paragraph breaks
                  const adjustedPos = adjustPositionForParagraphBoundary(doc, pos.from, pos.to);
                  
                  // Validate again after adjustment
                  if (!isWithinSingleParagraph(doc, adjustedPos.from, adjustedPos.to)) {
                    continue;
                  }
                  
                  // CRITICAL: Verify the text at this position actually matches the linkText
                  // This ensures we're not applying marks to text that spans paragraphs
                  try {
                    const textAtPosition = doc.textBetween(adjustedPos.from, adjustedPos.to);
                    const normalizedPositionText = normalizeScriptureReference(textAtPosition.trim());
                    const normalizedLinkText = normalizeScriptureReference(linkText.trim());
                    
                    // If the text doesn't match (might include paragraph breaks), skip it
                    if (normalizedPositionText !== normalizedLinkText) {
                      continue;
                    }
                  } catch (e) {
                    // If we can't verify, skip to be safe
                    continue;
                  }
                  
                  // CRITICAL: Check if there's text after the mark in the same paragraph
                  // If the mark ends at the end of the paragraph, skip it to prevent affecting paragraph breaks
                  try {
                    const $to = doc.resolve(adjustedPos.to);
                    const paragraphStart = $to.start($to.depth);
                    const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;
                    
                    // Check if there's any text content after the mark in this paragraph
                    if (adjustedPos.to >= paragraphEnd - 1) {
                      // Mark ends at or very close to paragraph end - skip it
                      continue;
                    }
                    
                    // Check if there's actual text content after the mark
                    const textAfterMark = doc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
                    // If there's no text after the mark (or only whitespace), and we're near the paragraph end, skip
                    if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) {
                      continue;
                    }
                  } catch (e) {
                    // If we can't check, skip to be safe
                    continue;
                  }
                  
                  // Apply scripture pill mark using transaction API directly to avoid selection issues
                  try {
                    const tr = editor.state.tr;
                    const markType = editor.state.schema.marks.scripturePill;
                    if (markType) {
                      tr.removeMark(adjustedPos.from, adjustedPos.to, markType);
                      tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId, translation: noteTranslation }));
                      // Remove noteLink mark if present
                      const noteLinkMark = editor.state.schema.marks.noteLink;
                      if (noteLinkMark) {
                        tr.removeMark(adjustedPos.from, adjustedPos.to, noteLinkMark);
                      }
                      editor.view.dispatch(tr);
                    }
                  } catch (e) {
                    // If transaction fails, fall back to chain API
                    editor.chain()
                      .setTextSelection(adjustedPos)
                      .unsetMark('noteLink')
                      .setMark('scripturePill', { reference: normalizedRef, noteId, translation: noteTranslation })
                      .run();
                  }
                } catch (e) {
                  // Skip if we can't resolve the position
                  continue;
                }
              }
            }
          }
        }
      } catch (error) {
        // Skip if we can't check the note type
        continue;
      }
    }
    dispatchScripturePillSpacing(editor, 'hydrate');
  } catch (error) {
    console.error('Error converting note-links to scripture pills:', error);
  }
}

// Helper function to detect and create scripture notes
async function detectAndCreateScriptureNotes(editor: any, parentThreadId?: string, editorId?: string, isDetectingRef?: React.MutableRefObject<boolean>) {
  
  if (!editor) {
    return;
  }
  
  // Mark as detecting to prevent concurrent detections
  if (isDetectingRef) {
    isDetectingRef.current = true;
  }

  try {
    // Store current cursor position before processing
    const currentSelection = editor.state.selection;
    const currentCursorPos = currentSelection.anchor;
    
    // Extract plain text from editor
    const fullText = editor.state.doc.textContent;
    
    if (!fullText || fullText.trim().length < 5) {
      return;
    }

    // Use incremental detection - only process if document has changed
    // Use provided editorId or fallback to 'default' if not available
    const id = editorId || 'default';
    let textForDetection: string = fullText;
    
    // Try incremental detection, but fall back gracefully if it fails
    try {
      if (typeof shouldProcessDocument === 'function' && typeof getTextToProcess === 'function') {
        if (!shouldProcessDocument(id, fullText)) {
          return; // Document hasn't changed, skip detection
        }

        // Get text segment to process (optimized for incremental detection)
        const result = getTextToProcess(id, fullText);
        
        // For incremental detection, we still need to check the full document context
        // to find all occurrences, but we can optimize by only sending new text to API
        // However, for now, we'll use the full text but track state to avoid reprocessing
        textForDetection = result.isFullDocument ? result.text : fullText; // Use full text for context
      }
    } catch (incrementalError) {
      // If incremental detection fails, fall back to processing full text
      // This ensures the app continues to work even if incremental detection has issues
      textForDetection = fullText;
    }

    // Call detection API with optimized text
    const detectResponse = await fetch('/api/scripture/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textForDetection }),
      credentials: 'include'
    });

    if (!detectResponse.ok) {
      return;
    }

    const detection = await detectResponse.json();
    
    if (!detection.isScripture || !detection.references?.length) {
      return;
    }

    const htmlContent = editor.getHTML();
    const doc = editor.state.doc;
    
    // Track if any pills were created in this detection cycle
    let pillsCreated = false;

    // Process each detected reference
    for (const ref of detection.references) {
      const reference = ref.reference || ref;
      if (!reference) continue;

      // Normalize reference for consistent checking
      const normalizedRef = normalizeScriptureReference(reference);

      // Find ALL positions in document (will skip positions already marked)
      const allPositions = findAllTextPositions(doc, reference, true);
      
      if (allPositions.length === 0) {
        continue;
      }
      
      // Early exit optimization: Check if ALL positions already have pills
      // This prevents unnecessary processing and visual cycling
      let allPositionsHavePills = true;
      for (const positions of allPositions) {
        try {
          const $from = doc.resolve(positions.from);
          const marks = $from.marks();
          const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
          if (!hasPill) {
            allPositionsHavePills = false;
            break;
          }
        } catch (e) {
          // If we can't resolve, assume it doesn't have a pill
          allPositionsHavePills = false;
          break;
        }
      }
      
      // Skip this reference entirely if all positions already have pills
      if (allPositionsHavePills) {
        continue;
      }
      
      // For real-time detection, create pills WITHOUT creating scripture notes
      // Notes will be created when the note is saved
      // Set noteId to null/undefined to indicate pending state
      const noteId = null; // Defer note creation until save
      
      debug('[TiptapEditor] Creating pill without noteId (deferred)', {
        reference: normalizedRef,
        positionsCount: allPositions.length
      });
      
      // Helper function to validate reference context before creating pill
      // This is a conservative check - only rejects clear false positives
      // The main validation happens in scripture-detector.ts, this is a secondary check
      const validateReferenceContext = (doc: any, from: number, to: number, refText: string): boolean => {
        try {
          // Get text around the reference position
          const fullText = doc.textContent;
          const textBefore = fullText.substring(Math.max(0, from - 30), from).trim();
          const textAfter = fullText.substring(to, Math.min(to + 30, fullText.length)).trim();
          
          // Only check for very clear false positives
          // Pattern like "John 3 years ago" - check for number + time word + "ago"
          const falsePositivePattern = /^\s*(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\s+(ago|later|before|after)\b/i;
          if (falsePositivePattern.test(textAfter)) {
            // Check if reference is chapter-only (no colon) - more likely to be false positive
            if (!refText.includes(':')) {
              return false; // Likely false positive like "John 3 years ago"
            }
          }
          
          // Check for "Book Number" followed immediately by time/quantity words (no space)
          // This catches cases where regex matched but it's actually part of a phrase
          const immediateFalsePositive = /^(years?|months?|days?|dollars?|people)\b/i;
          if (immediateFalsePositive.test(textAfter) && !refText.includes(':')) {
            // Chapter-only reference followed by quantity word - likely false positive
            return false;
          }
          
          // Default: allow the reference (be permissive - main validation is in scripture-detector.ts)
          return true;
        } catch (e) {
          // If we can't validate, allow it (safer to allow than block)
          return true;
        }
      };
      
      // Process each occurrence
      // Note: We process in reverse order (from end to start) to avoid position shifts
      // when marks are applied, since applying a mark doesn't change document size
      // but we'll still process in order for safety
      for (let i = allPositions.length - 1; i >= 0; i--) {
        const positions = allPositions[i];
        
        // Get fresh document state after previous mark applications
        const currentDoc = editor.state.doc;
        
        // Validate reference context before creating pill
        if (!validateReferenceContext(currentDoc, positions.from, positions.to, reference)) {
          // Skip this position - it's not in a valid scripture context
          continue;
        }
        
        // Double-check that this position doesn't already have a pill mark
        // (in case it was marked between when we found it and now)
        try {
          const $from = currentDoc.resolve(positions.from);
          const marks = $from.marks();
          const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
          if (hasPill) {
            continue; // Skip if already marked
          }
        } catch (e) {
          // If we can't resolve, skip this position
          continue;
        }
        
        // Validate that the position doesn't span across paragraph boundaries
        // This prevents line breaks from being lost when scripture pills are created
        if (!isWithinSingleParagraph(currentDoc, positions.from, positions.to)) {
          // Skip this position if it spans across paragraphs
          // This ensures paragraph breaks are preserved
          continue;
        }
        
        // Adjust position to ensure it doesn't extend beyond paragraph boundaries
        // This prevents marks from affecting paragraph breaks
        const adjustedPos = adjustPositionForParagraphBoundary(currentDoc, positions.from, positions.to);
        
        // Validate again after adjustment
        if (!isWithinSingleParagraph(currentDoc, adjustedPos.from, adjustedPos.to)) {
          continue;
        }
        
        // CRITICAL: Verify the text at this position actually matches the reference
        // This ensures we're not applying marks to text that spans paragraphs
        try {
          const textAtPosition = currentDoc.textBetween(adjustedPos.from, adjustedPos.to);
          const normalizedPositionText = normalizeScriptureReference(textAtPosition.trim());
          const normalizedSearchRef = normalizeScriptureReference(reference);
          
          // If the text doesn't match (might include paragraph breaks), skip it
          if (normalizedPositionText !== normalizedSearchRef) {
            continue;
          }
        } catch (e) {
          // If we can't verify, skip to be safe
          continue;
        }
        
        // CRITICAL: Check if there's content after the mark in the same paragraph
        // If the mark ends at the end of the paragraph, skip it to prevent affecting paragraph breaks
        // But allow marks that end before hard breaks (<br>) - these should be preserved
        try {
          const $to = currentDoc.resolve(adjustedPos.to);
          const paragraphStart = $to.start($to.depth);
          const paragraphEnd = paragraphStart + $to.node($to.depth).nodeSize;
          
          // Check if there's any content after the mark in this paragraph
          if (adjustedPos.to >= paragraphEnd - 1) {
            // Mark ends at or very close to paragraph end - skip it
            continue;
          }
          
          // Check if there's a hard break right after the mark (these should be preserved)
          if (hasHardBreakAfter(currentDoc, adjustedPos.to)) {
            // There's a hard break after the mark - this is fine, allow it
            // The hard break will be preserved
          } else {
            // Check if there's actual text content after the mark
            const textAfterMark = currentDoc.textBetween(adjustedPos.to, Math.min(adjustedPos.to + 10, paragraphEnd - 1));
            // If there's no text after the mark (or only whitespace), and we're near the paragraph end, skip
            if (!textAfterMark.trim() && adjustedPos.to >= paragraphEnd - 5) {
              continue;
            }
          }
        } catch (e) {
          // If we can't check, skip to be safe
          continue;
        }
        
        // Apply scripture pill mark using transaction API directly to avoid selection issues
        // Note: noteId is null for real-time pills (will be set on save)
        try {
          const tr = editor.state.tr;
          const markType = editor.state.schema.marks.scripturePill;
          if (markType) {
            tr.removeMark(adjustedPos.from, adjustedPos.to, markType);
            const userTranslation = getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation();
            tr.addMark(adjustedPos.from, adjustedPos.to, markType.create({ reference: normalizedRef, noteId: noteId || undefined, translation: userTranslation }));
            // Remove noteLink mark if present
            const noteLinkMark = editor.state.schema.marks.noteLink;
            if (noteLinkMark) {
              tr.removeMark(adjustedPos.from, adjustedPos.to, noteLinkMark);
            }
            editor.view.dispatch(tr);
            pillsCreated = true; // Track that we created a pill

            debug('[TiptapEditor] Pill mark applied', {
              reference: normalizedRef,
              from: adjustedPos.from,
              to: adjustedPos.to,
              noteId: noteId || 'pending'
            });
          }
        } catch (e) {
          // If transaction fails, fall back to chain API
          const userTranslation = getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation();
          editor.chain()
            .setTextSelection(adjustedPos)
            .unsetMark('noteLink')
            .setMark('scripturePill', { reference: normalizedRef, noteId: noteId || undefined, translation: userTranslation })
            .run();
          pillsCreated = true; // Track that we created a pill

          debug('[TiptapEditor] Pill mark applied via chain API', {
            reference: normalizedRef,
            from: adjustedPos.from,
            to: adjustedPos.to,
            noteId: noteId || 'pending'
          });
        }
      }
    }
    
    // Restore cursor position after all pills are created
    // Check if cursor is inside a pill and move it after if needed
      debug('[TiptapEditor] Starting cursor positioning after pill creation', {
        currentCursorPos,
        docSize: editor.state.doc.content.size
      });
    
    try {
      const doc = editor.state.doc;
      const $current = doc.resolve(currentCursorPos);
      const currentMarks = $current.marks();
      const isInsidePill = currentMarks.some((m: any) => m.type.name === 'scripturePill');
      
      debug('[TiptapEditor] Cursor position check', {
        currentCursorPos,
        isInsidePill,
        marks: currentMarks.map((m: any) => m.type.name),
        editorFocused: editor.isFocused
      });
      
      if (isInsidePill) {
        // Find pill boundaries and move cursor after it
        const boundaries = findPillBoundaries(doc, currentCursorPos);
        debug('[TiptapEditor] Pill boundaries found', {
          boundaries,
          currentCursorPos
        });
        
        if (boundaries) {
          // ProseMirror marks are inclusive at boundaries, so boundaries.end still has the pill mark
          // We need to find the first position AFTER the pill that doesn't have the mark
          let cursorPos = boundaries.end;
          const maxPos = doc.content.size;
          let foundPosition = false;
          
          debug('[TiptapEditor] Searching for safe position after pill', {
            startPos: boundaries.end,
            maxPos
          });
          
          // Find first position without pill mark (up to 10 positions ahead)
          for (let pos = boundaries.end; pos <= Math.min(boundaries.end + 10, maxPos); pos++) {
            try {
              const $pos = doc.resolve(pos);
              const marks = $pos.marks();
              const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
              if (!hasPill) {
                cursorPos = pos;
                foundPosition = true;
                debug('[TiptapEditor] Found safe position', { pos, marks: marks.map((m: any) => m.type.name) });
                break;
              }
            } catch (e) {
              // If we can't resolve, use this position
              cursorPos = pos;
              foundPosition = true;
              debug('[TiptapEditor] Using position after resolve error', { pos, error: e });
              break;
            }
          }
          
          // If we're at the end of document and still inside pill, use document end
          // The stored marks clearing will ensure typing works
          if (!foundPosition && boundaries.end >= maxPos - 1) {
            cursorPos = maxPos;
            debug('[TiptapEditor] Using document end as safe position', { cursorPos });
          }
          
          // Double-check the final cursor position doesn't have pill mark
          // If it does, move forward one more position
          // Keep checking until we find a position without the pill mark
          let attempts = 0;
          const maxAttempts = 20;
          while (attempts < maxAttempts && cursorPos < maxPos) {
            try {
              const $finalPos = doc.resolve(cursorPos);
              const finalMarks = $finalPos.marks();
              const finalHasPill = finalMarks.some((m: any) => m.type.name === 'scripturePill');
              if (!finalHasPill) {
                debug('[TiptapEditor] Verified safe position', { cursorPos, attempts });
                break; // Found a safe position
              }
              cursorPos = Math.min(cursorPos + 1, maxPos);
              attempts++;
            } catch (e) {
              // If we can't resolve, use this position
              debug('[TiptapEditor] Using position after verification error', { cursorPos, error: e });
              break;
            }
          }
          
          debug('[TiptapEditor] Setting cursor position', {
            cursorPos,
            attempts,
            editorFocused: editor.isFocused
          });
          
          // Use transaction to set cursor and clear stored marks in one operation
          const tr = editor.state.tr;
          tr.setSelection(TextSelection.create(tr.doc, cursorPos));
          tr.setStoredMarks([]);
          
          // CRITICAL: Ensure the editor is editable before dispatching
          // Check if editor is in a state that can accept input
          if (!editor.isEditable) {
            // Editor not editable - skip cursor positioning
            return;
          }
          
          editor.view.dispatch(tr);
          
          // CRITICAL: After dispatching transaction, ensure view is updated and can receive input
          // Force a view update to ensure ProseMirror processes the transaction
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            if (editor && !editor.isDestroyed && editor.view) {
              // Force view to update its state - this ensures ProseMirror processes the transaction
              try {
                // CRITICAL: Don't call updateState with the same state - this can cause issues
                // Instead, just ensure the view is ready for input
                // The view should already be updated by the dispatch above
                
                // Verify editor can still receive input
                const dom = editor.view.dom as HTMLElement;
                const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                const targetElement = contentEditable || dom;
                
                const isEditable = targetElement.contentEditable === 'true';
                const isDisabled = (targetElement as any).disabled;
                const isReadOnly = (targetElement as any).readOnly;
                
                // If editor is not editable, this is a critical issue
                if (!isEditable || isDisabled || isReadOnly) {
                  console.error('[TiptapEditor] CRITICAL: Editor cannot receive input after transaction!', {
                    isEditable,
                    isDisabled,
                    isReadOnly,
                    contentEditable: targetElement.contentEditable
                  });
                  
                  // Try to force it to be editable
                  if (targetElement.contentEditable !== 'true') {
                    targetElement.contentEditable = 'true';
                  }
                }
                
                // CRITICAL: Ensure the view is ready to receive input by focusing it
                // This might be needed if the transaction somehow disrupted focus handling
                setTimeout(() => {
                  if (editor && !editor.isDestroyed && editor.view) {
                    const dom = editor.view.dom as HTMLElement;
                    const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                    const targetElement = contentEditable || dom;
                    
                    // Force focus one more time
                    targetElement.focus({ preventScroll: true });
                    editor.commands.focus();
                    
                    // Verify focus
                    const isFocused = document.activeElement === targetElement || 
                                     document.activeElement === dom ||
                                     editor.isFocused;
                    
                  }
                }, 0);
              } catch (e) {
                console.error('[TiptapEditor] Error in post-transaction update', e);
              }
            }
          });
          
          // CRITICAL: Reset isDetecting flag immediately after cursor positioning
          // This ensures typing can continue right away, even before the setTimeout
          if (isDetectingRef) {
            isDetectingRef.current = false;
          }
          
          // Double-check stored marks are actually cleared
          const storedMarksAfter = editor.state.storedMarks || [];
          if (storedMarksAfter.length > 0) {
            // Force clear them again
            const clearTr = editor.state.tr.setStoredMarks([]);
            editor.view.dispatch(clearTr);
          }
          
          // Immediately try to focus after transaction (before setTimeout)
          // This helps in form contexts where focus might be stolen
          try {
            if (editor.view && editor.view.dom) {
              const dom = editor.view.dom as HTMLElement;
              
              // Force focus with multiple methods for form contexts
              dom.focus({ preventScroll: true });
              editor.commands.focus();
              
              // Also try focusing the contentEditable element directly if it exists
              const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
              if (contentEditable) {
                contentEditable.focus({ preventScroll: true });
              }
              
              // Verify focus and check if element can receive input
              const isFocused = document.activeElement === dom || document.activeElement === contentEditable;
              const canReceiveInput = dom.contentEditable === 'true' || contentEditable?.contentEditable === 'true';
              
              // If still not focused, try one more time after a microtask
              if (!isFocused) {
                Promise.resolve().then(() => {
                  if (editor && !editor.isDestroyed && editor.view && editor.view.dom) {
                    const dom = editor.view.dom as HTMLElement;
                    dom.focus({ preventScroll: true });
                    editor.commands.focus();
                  }
                });
              }
            }
          } catch (e) {
            console.error('[TiptapEditor] Error in immediate focus', e);
          }
          
          // Verify cursor position after transaction - if still inside pill, move it again
          // Also ensure stored marks are cleared
          setTimeout(() => {
            try {
              if (!editor || editor.isDestroyed) {
                debug('[TiptapEditor] Editor destroyed during verification, skipping');
                return;
              }
              if (!editor.view || !editor.view.docView) {
                debug('[TiptapEditor] Editor view invalid during verification, skipping');
                return;
              }
              
              // Get fresh state after transaction
              const freshState = editor.state;
              const currentSelection = freshState.selection;
              const currentPos = currentSelection.anchor;
              const $current = freshState.doc.resolve(currentPos);
              const currentMarks = $current.marks();
              const stillInsidePill = currentMarks.some((m: any) => m.type.name === 'scripturePill');
              
              debug('[TiptapEditor] Verifying cursor position after transaction', {
                currentPos,
                stillInsidePill,
                marks: currentMarks.map((m: any) => m.type.name),
                storedMarks: freshState.storedMarks?.map((m: any) => m.type.name) || [],
                editorFocused: editor.isFocused
              });
              
              if (stillInsidePill) {
                debug('[TiptapEditor] Cursor still inside pill, repositioning', { currentPos });
                // Still inside pill - find a safe position after it
                const safeBoundaries = findPillBoundaries(freshState.doc, currentPos);
                debug('[TiptapEditor] Safe boundaries for repositioning', { safeBoundaries, currentPos });
                
                if (safeBoundaries) {
                  let safePos = safeBoundaries.end;
                  const maxPos = freshState.doc.content.size;
                  
                  // Find first position without pill mark (check up to 20 positions)
                  for (let pos = safeBoundaries.end; pos <= Math.min(safeBoundaries.end + 20, maxPos); pos++) {
                    try {
                      const $pos = freshState.doc.resolve(pos);
                      const marks = $pos.marks();
                      const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
                      if (!hasPill) {
                        safePos = pos;
                        debug('[TiptapEditor] Found safe position in verification', { safePos, pos });
                        break;
                      }
                    } catch (e) {
                      safePos = pos;
                      debug('[TiptapEditor] Using position after resolve error in verification', { safePos, pos, error: e });
                      break;
                    }
                  }
                  
                  // Check if there's a space after the safe position - if not, insert one
                  const textAfter = freshState.doc.textBetween(safePos, Math.min(safePos + 1, maxPos));
                  const needsSpace = textAfter !== ' ' && textAfter !== '\n';
                  
                  debug('[TiptapEditor] Space check for safe position', { safePos, textAfter, needsSpace });
                  
                  if (needsSpace && safePos < maxPos) {
                    // Insert a space after the pill to ensure typing works smoothly
                    const insertTr = freshState.tr;
                    insertTr.insertText(' ', safePos);
                    insertTr.setSelection(TextSelection.create(insertTr.doc, safePos + 1));
                    insertTr.setStoredMarks([]);
                    editor.view.dispatch(insertTr);
                    
                    debug('[TiptapEditor] Inserted space and repositioned cursor', {
                      safePos: safePos + 1,
                      spaceInserted: true
                    });
                  } else {
                    // Move cursor to safe position and clear stored marks again
                    const safeTr = freshState.tr;
                    safeTr.setSelection(TextSelection.create(safeTr.doc, safePos));
                    safeTr.setStoredMarks([]);
                    editor.view.dispatch(safeTr);
                    
                    debug('[TiptapEditor] Repositioned cursor to safe position', { safePos });
                  }
                }
              } else {
                // Not inside pill, but ensure stored marks are cleared anyway
                if (freshState.storedMarks && freshState.storedMarks.length > 0) {
                  debug('[TiptapEditor] Clearing stored marks', {
                    storedMarks: freshState.storedMarks.map((m: any) => m.type.name)
                  });
                  const clearTr = freshState.tr.setStoredMarks([]);
                  editor.view.dispatch(clearTr);
                } else {
                  debug('[TiptapEditor] No stored marks to clear');
                }
              }
              
              // Force focus using view directly (more reliable in form contexts)
              const { view } = editor;
              if (view && view.dom) {
                const dom = view.dom as HTMLElement;
                const finalPos = editor.state.selection.anchor;
                
                
                // Multiple focus attempts for form contexts
                // 1. Focus the editor DOM element directly
                dom.focus({ preventScroll: true });
                
                // 2. Use commands.focus() as backup
                editor.commands.focus();
                
                // 3. Also try focusing the contentEditable element directly if it exists
                const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                if (contentEditable) {
                  contentEditable.focus({ preventScroll: true });
                }
                
                // 4. Force focus via requestAnimationFrame (ensures it happens after any form handlers)
                requestAnimationFrame(() => {
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.dom) return;
                  
                  const dom = editor.view.dom as HTMLElement;
                  dom.focus({ preventScroll: true });
                  editor.commands.focus();
                  
                  const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                  if (contentEditable) {
                    contentEditable.focus({ preventScroll: true });
                  }
                  
                  // 5. One more attempt after a short delay to ensure focus sticks
                  setTimeout(() => {
                    if (!editor || editor.isDestroyed) return;
                    if (!editor.view || !editor.view.dom) return;
                    
                    const dom = editor.view.dom as HTMLElement;
                    const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                    const isFocused = document.activeElement === dom || 
                                    document.activeElement === contentEditable || 
                                    editor.isFocused;
                    
                    
                    if (!isFocused) {
                      // Last resort: force focus again
                      dom.focus({ preventScroll: true });
                      editor.commands.focus();
                      if (contentEditable) {
                        contentEditable.focus({ preventScroll: true });
                      }
                    }
                  }, 50);
                });
                
                // CRITICAL: Verify editor can actually receive input
                setTimeout(() => {
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.dom) return;
                  
                  const dom = editor.view.dom as HTMLElement;
                  const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                  const targetElement = contentEditable || dom;
                  
                  // Check if element is actually focusable and can receive input
                  const isFocusable = targetElement.tabIndex >= 0 || targetElement.contentEditable === 'true';
                  const isDisabled = (targetElement as any).disabled || targetElement.contentEditable === 'false';
                  const isReadOnly = (targetElement as any).readOnly;
                  
                  // Force focus one more time and verify
                  if (targetElement && isFocusable && !isDisabled && !isReadOnly) {
                    targetElement.focus({ preventScroll: true });
                    editor.commands.focus();
                  }
                }, 150);
                
                // CRITICAL: Force focus and test if editor can actually receive input
                setTimeout(() => {
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.dom) return;
                  
                  const dom = editor.view.dom as HTMLElement;
                  const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
                  const targetElement = contentEditable || dom;
                  
                  // Force focus multiple times to ensure it sticks
                  targetElement.focus({ preventScroll: true });
                  editor.commands.focus();
                  
                  // Also try clicking to focus (sometimes needed in form contexts)
                  if (targetElement) {
                    targetElement.click();
                  }
                  
                  // Verify after a microtask
                  Promise.resolve().then(() => {
                    const isFocused = document.activeElement === targetElement || 
                                     document.activeElement === dom ||
                                     editor.isFocused;
                    
                    // If still not focused, try one more time with a small delay
                    if (!isFocused) {
                      setTimeout(() => {
                        targetElement.focus({ preventScroll: true });
                        editor.commands.focus();
                      }, 50);
                    }
                  });
                }, 10);
                
                // Ensure the cursor is visible by scrolling only the editor content area (not the window/sheet)
                try {
                  const coords = view.coordsAtPos(finalPos);
                  if (coords) {
                    const scrollEl = dom.closest('.tiptap-content') as HTMLElement | null;
                    if (scrollEl) {
                      const scrollRect = scrollEl.getBoundingClientRect();
                      if (coords.top < scrollRect.top) {
                        scrollEl.scrollTop -= scrollRect.top - coords.top;
                      } else if (coords.bottom > scrollRect.bottom) {
                        scrollEl.scrollTop += coords.bottom - scrollRect.bottom;
                      }
                      debug('[TiptapEditor] Scrolled cursor into view within editor', { finalPos, coords });
                    }
                  }
                } catch (scrollError) {
                  debug('[TiptapEditor] Error scrolling cursor into view', { scrollError });
                }
              } else {
                debug('[TiptapEditor] Cannot focus - view or dom missing', {
                  hasView: !!view,
                  hasDom: !!(view && view.dom)
                });
              }
            } catch (e) {
              debug('[TiptapEditor] Error during focus', { error: e });
            }
          }, 10); // Small delay to ensure transaction is processed
          
          // CRITICAL: Additional focus attempt after a longer delay
          // This ensures focus sticks even if form handlers interfere
          setTimeout(() => {
            try {
              if (!editor || editor.isDestroyed) return;
              if (!editor.view || !editor.view.dom) return;
              
              const dom = editor.view.dom as HTMLElement;
              const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
              
              // Force focus one more time
              if (contentEditable) {
                contentEditable.focus({ preventScroll: true });
              } else {
                dom.focus({ preventScroll: true });
              }
              editor.commands.focus();
              
              // Verify focus
              const isFocused = document.activeElement === dom || document.activeElement === contentEditable;
            } catch (e) {
              console.error('[TiptapEditor] Error in delayed focus', e);
            }
          }, 100); // Longer delay to ensure form handlers have finished
          
          // FINAL ATTEMPT: After all delays, force focus and test input capability
          setTimeout(() => {
            if (!editor || editor.isDestroyed) return;
            if (!editor.view || !editor.view.dom) return;
            
            const dom = editor.view.dom as HTMLElement;
            const contentEditable = dom.querySelector('[contenteditable="true"]') as HTMLElement;
            const targetElement = contentEditable || dom;
            
            
            // Force focus with all methods
            if (targetElement) {
              // Method 1: Direct focus
              targetElement.focus({ preventScroll: true });
              
              // Method 2: Click to focus (sometimes needed)
              const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
              targetElement.dispatchEvent(clickEvent);
              
              // Method 3: Editor commands
              editor.commands.focus();
              
              // Method 4: Set selection to ensure cursor is visible
              try {
                const doc = editor.state.doc;
                const endPos = doc.content.size;
                editor.commands.setTextSelection(endPos);
              } catch (e) {
                // Ignore
              }
            }
            
            // Verify after microtask
            Promise.resolve().then(() => {
              const isFocused = document.activeElement === targetElement || 
                               document.activeElement === dom ||
                               editor.isFocused;
              
            });
          }, 200); // Even longer delay to ensure everything has settled
          
          // TEST: Try to programmatically insert text to verify editor can receive input
          setTimeout(() => {
            if (!editor || editor.isDestroyed) return;
            if (!editor.view || !editor.view.dom) return;
            
            try {
              // Try to insert a test character programmatically
              const testChar = 'X';
              const { from, to } = editor.state.selection;
              
              // Test programmatic insertion (but undo immediately)
              if (editor.can().insertContent(testChar)) {
                editor.commands.insertContent(testChar);
                // Immediately undo to not affect user's content
                setTimeout(() => {
                  if (editor && !editor.isDestroyed) {
                    editor.commands.undo();
                  }
                }, 10);
              }
            } catch (e) {
              console.error('[TiptapEditor] Error testing programmatic insertion', e);
            }
          }, 250);
        } else {
          // Fallback: try to move cursor forward a bit
          const newPos = Math.min(currentCursorPos + 1, doc.content.size);
          const tr = editor.state.tr;
          tr.setSelection(TextSelection.create(tr.doc, newPos));
          tr.setStoredMarks([]);
          editor.view.dispatch(tr);
        }
      } else {
        // Restore original position if not inside pill
        // But first check if that position now has a pill mark (pill might have been created there)
        const $restorePos = doc.resolve(currentCursorPos);
        const restoreMarks = $restorePos.marks();
        const restoreHasPill = restoreMarks.some((m: any) => m.type.name === 'scripturePill');
        
        if (restoreHasPill) {
          // The restore position is now inside a pill, find position after it
          const restoreBoundaries = findPillBoundaries(doc, currentCursorPos);
          if (restoreBoundaries) {
            let cursorPos = restoreBoundaries.end;
            const maxPos = doc.content.size;
            
            // Find first position without pill mark
            let foundPosition = false;
            for (let pos = restoreBoundaries.end; pos <= Math.min(restoreBoundaries.end + 10, maxPos); pos++) {
              try {
                const $pos = doc.resolve(pos);
                const marks = $pos.marks();
                const hasPill = marks.some((m: any) => m.type.name === 'scripturePill');
                if (!hasPill) {
                  cursorPos = pos;
                  foundPosition = true;
                  break;
                }
              } catch (e) {
                cursorPos = pos;
                foundPosition = true;
                break;
              }
            }
            
            // If at end of document, use document end
            if (!foundPosition && restoreBoundaries.end >= maxPos - 1) {
              cursorPos = maxPos;
            }
            
            const tr = editor.state.tr;
            tr.setSelection(TextSelection.create(tr.doc, cursorPos));
            tr.setStoredMarks([]);
            editor.view.dispatch(tr);
            
            // Ensure editor is focused and ready for input
            setTimeout(() => {
              try {
                if (!editor || editor.isDestroyed) return;
                if (!editor.view || !editor.view.docView) return;
                
                // Force focus using view directly (more reliable in form contexts)
                const { view } = editor;
                if (view && view.dom) {
                  (view.dom as HTMLElement).focus();
                  editor.commands.focus();
                }
              } catch (e) {
                // Ignore errors during focus
              }
            }, 0);
          } else {
            // Fallback: clear marks at restore position
            const tr = editor.state.tr;
            tr.setSelection(TextSelection.create(tr.doc, currentCursorPos));
            tr.setStoredMarks([]);
            editor.view.dispatch(tr);
          }
        } else {
          // Position is safe, restore it
          const tr = editor.state.tr;
          tr.setSelection(TextSelection.create(tr.doc, currentCursorPos));
          tr.setStoredMarks([]);
          editor.view.dispatch(tr);
          
          // Ensure editor stays focused
          setTimeout(() => {
            try {
              if (!editor || editor.isDestroyed) return;
              if (!editor.view || !editor.view.docView) return;
              
              // Only focus if editor was already focused (don't steal focus unnecessarily)
              if (editor.isFocused) {
                const { view } = editor;
                if (view && view.dom) {
                  (view.dom as HTMLElement).focus();
                  editor.commands.focus();
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }, 0);
        }
      }
    } catch (e) {
      // If cursor position is invalid, try to place cursor at end of document
      try {
        const doc = editor.state.doc;
        const endPos = doc.content.size;
        const tr = editor.state.tr;
        tr.setSelection(TextSelection.create(tr.doc, endPos));
        tr.setStoredMarks([]);
        editor.view.dispatch(tr);
      } catch (fallbackError) {
        // If even that fails, just leave it where it is
      }
    }
    // NOTE: Flag is now set immediately after pill transaction (see above)
    // This ensures it's ready when user types, before cursor positioning logic runs
  } catch (error) {
    console.error('Error in scripture detection:', error);
    // Don't show error toast for detection errors to avoid spam
  }
}

/**
 * Formatting toolbar button row. Browsers often skip CSS @keyframes that start on the same
 * frame the element mounts; we paint a prep state first, then arm after one rAF (prep already
 * separates commits — a second rAF was stacking delay on cold first paint vs warm title↔body focus).
 */
function FormatToolbarDivider() {
  return <span className="tiptap-toolbar__group-divider tiptap-toolbar__group-divider--prototype" aria-hidden />;
}

function TiptapToolbarTrack({
  placement,
  compact = false,
  skipEnterAnimation = false,
  children,
}: {
  placement: 'top' | 'bottom';
  compact?: boolean;
  skipEnterAnimation?: boolean;
  children: React.ReactNode;
}) {
  const [enterArmed, setEnterArmed] = useState(false);

  useLayoutEffect(() => {
    if (skipEnterAnimation) return;
    setEnterArmed(false);
    const raf1 = requestAnimationFrame(() => {
      setEnterArmed(true);
    });
    return () => {
      cancelAnimationFrame(raf1);
    };
  }, [placement, skipEnterAnimation]);

  const prepClass =
    placement === 'top' ? 'tiptap-toolbar__track--enter-prep-top' : 'tiptap-toolbar__track--enter-prep-bottom';
  const runClass =
    placement === 'top' ? 'tiptap-toolbar__track--enter-from-top' : 'tiptap-toolbar__track--enter-from-bottom';

  const animClass = skipEnterAnimation ? '' : enterArmed ? runClass : prepClass;

  return (
    <div
      className={`tiptap-toolbar__track flex items-center flex-nowrap ${compact ? '' : 'w-full min-w-0'} ${animClass}`}
    >
      {children}
    </div>
  );
}

// Detect mobile device for different handling
// On mobile, we don't want to interfere with native keyboard behavior (e.g., double-space-to-period)
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

type SelectionActionBarState = {
  top: number;
  left: number;
  from: number;
  to: number;
  snippet: string;
};

function rangeHasHighlightMark(editor: any, from: number, to: number): boolean {
  if (!editor?.state?.doc || !editor.schema?.marks?.highlight || from === to) return false;
  try {
    return editor.state.doc.rangeHasMark(from, to, editor.schema.marks.highlight);
  } catch {
    return false;
  }
}

function selectionIntersectsHighlightMark(editor: any): boolean {
  if (!editor?.state?.selection || !editor.schema?.marks?.highlight) return false;
  const { from, to } = editor.state.selection;
  return rangeHasHighlightMark(editor, from, to);
}

const ONE_SHOT_ATOMIC_BLOCK_TYPES = new Set(['horizontalRule', 'image']);

/** Delete adjacent HR/image in one keystroke (avoids NodeSelection flash + selection bar). */
function tryDeleteAdjacentAtomicBlock(editor: any, view: any, event: KeyboardEvent): boolean {
  if (!(event.key === 'Backspace' || event.key === 'Delete')) return false;
  const { from, to } = view.state.selection;
  if (from !== to) return false;

  const $from = view.state.selection.$from;

  if (event.key === 'Backspace') {
    if ($from.parentOffset !== 0) return false;
    const cutPos = $from.before();
    const nodeBefore = view.state.doc.resolve(cutPos).nodeBefore;
    if (!nodeBefore) return false;
    if (isScriptureQuoteBlockquoteNode(nodeBefore)) {
      event.preventDefault();
      editor
        .chain()
        .focus()
        .deleteRange({ from: cutPos - nodeBefore.nodeSize, to: cutPos })
        .run();
      return true;
    }
    if (!ONE_SHOT_ATOMIC_BLOCK_TYPES.has(nodeBefore.type.name)) return false;
    event.preventDefault();
    editor.chain().focus().deleteRange({ from: cutPos - nodeBefore.nodeSize, to: cutPos }).run();
    return true;
  }

  if ($from.parentOffset !== $from.parent.content.size) return false;
  const cutPos = $from.after();
  const nodeAfter = view.state.doc.resolve(cutPos).nodeAfter;
  if (!nodeAfter) return false;
  if (isScriptureQuoteBlockquoteNode(nodeAfter)) {
    event.preventDefault();
    editor.chain().focus().deleteRange({ from: cutPos, to: cutPos + nodeAfter.nodeSize }).run();
    return true;
  }
  if (!ONE_SHOT_ATOMIC_BLOCK_TYPES.has(nodeAfter.type.name)) return false;
  event.preventDefault();
  editor.chain().focus().deleteRange({ from: cutPos, to: cutPos + nodeAfter.nodeSize }).run();
  return true;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  content,
  id = "content",
  name = "content",
  placeholder = "Write something...",
  minimalToolbar = false,
  toolbarAtBottom = false,
  toolbarBottomMargin = 12,
  tabindex,
  onContentChange,
  onLiveBodyHtmlChange,
  scrollPosition,
  enableCreateNoteFromSelection = false,
  sharedAnnotationOverlayMode = false,
  coEditFollower = false,
  sharedOverlayPmRanges = [],
  onSharedAnnotationCreated,
  parentThreadId,
  sourceNoteId,
  spaceId,
  mentionSource,
  mentionKinds = MENTION_KINDS,
  onMentionPillClick,
  contextSpaceId = null,
  onEditorReady,
  onEditorInstanceReady,
  inBottomSheet = false,
  editorChromeMode = 'default',
  forceBodyReplaceFromProps = 0,
  onPrototypeChromeModeChange,
  prototypeNoteActionsChrome = false,
  formatToolbarPortalTarget,
  scriptureChromePortalTarget = null,
  highlightChromePortalTarget = null,
  studyDockCarouselPortalTarget = null,
  initialReferenceWord = null,
  initialReferenceRequestKey = null,
  onReferenceDeepLinkHandoff,
  initialResourceDock = null,
  onOpenResourceFile,
  onExpandScriptureToReader,
  onScripturePassageShown,
  prototypeScripturePillOpenRequest = null,
  onPrototypeScripturePillOpenRequestConsumed,
  onPrototypeScripturePillOpenRequestUnresolved,
  prototypeCrossRefTarget = null,
  prototypeHighlightOpenRequest = null,
  onPrototypeHighlightOpenRequestConsumed,
  onPrototypeActiveHighlightEntryChange,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  /** Bump when the editor gains focus from an unfocused state so the toolbar remounts and the enter animation can run. */
  const [toolbarEnterEpoch, setToolbarEnterEpoch] = useState(0);
  const editorWasFocusedForToolbarRef = useRef(false);
  /** Dock mousedown uses preventDefault so blur relatedTarget is often null — still treat as in-chrome. */
  const studyDockPointerDownRef = useRef(false);
  const [activeStates, setActiveStates] = useState({
    canUndo: false,
    canRedo: false,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    orderedList: false,
    bulletList: false,
    urlLink: false,
    /* Not read for its own sake — it is what makes the toolbar re-render when the selection
       opens or collapses, so the Link button's enabled state can follow it. */
    hasSelection: false,
    headingLevel: 0, // 0 = normal/paragraph, 2 = H2, 3 = H3
  });
  const [showCreateNoteButton, setShowCreateNoteButton] = useState(false);

  // Custom floating selection action bar (replaces BubbleMenu which has reliability issues across Tiptap versions)
  const [selectionActionBar, setSelectionActionBar] = useState<SelectionActionBarState | null>(null);
  // Floating ✓ confirm for an inline scripture draft (prototype). Rendered OUTSIDE the editor —
  // an inline contentEditable=false widget blocks iOS text entry next to it.
  const [scriptureDraftConfirm, setScriptureDraftConfirm] = useState<{
    top: number;
    left: number;
    to: number;
    /** Set when the reference parses but doesn't resolve against the canon — the ✓ won't commit. */
    invalidReason: string | null;
  } | null>(null);
  const [connectFromSelectionOpen, setConnectFromSelectionOpen] = useState(false);
  const [connectFromSelectionAnchorRect, setConnectFromSelectionAnchorRect] = useState<DOMRect | null>(null);
  const [connectFromSelectionRange, setConnectFromSelectionRange] = useState<{
    from: number;
    to: number;
    text: string;
    anchorLocation: number;
    anchorLength: number;
  } | null>(null);
  const [postConnectHighlight, setPostConnectHighlight] = useState<{
    studyThreadId: string;
    linkedNoteId: string;
    from: number;
    to: number;
    accent: StudyHighlightAccentKey;
    top: number;
    centerX: number;
  } | null>(null);
  const [connectedNoteHighlightPopup, setConnectedNoteHighlightPopup] = useState<{
    studyThreadId: string;
    linkedNoteId: string;
    accent: StudyHighlightAccentKey;
    anchorRect: { top: number; left: number; bottom: number; right: number; width: number; height: number };
    from: number;
    to: number;
  } | null>(null);

  const [translationPicker, setTranslationPicker] = useState<{
    rect: { top: number; left: number; bottom: number; right: number; width: number };
    translation: string | null;
    noteId: string | null;
    reference: string;
    updating?: boolean; // true while API call is in flight
  } | null>(null);
  // Reactive, unlike the `isMobileDevice()` UA sniff — an iPad gaining a trackpad flips this live.
  const isCoarsePointer = useCoarsePointer();
  const [deleteConfirmPill, setDeleteConfirmPill] = useState<{
    rect: DOMRect;
    reference: string;
    boundaries: { start: number; end: number };
  } | null>(null);
  // URL link prompt (Phase A): floating input over the current selection / existing url-link.
  const [urlLinkPrompt, setUrlLinkPrompt] = useState<{
    rect: { top: number; left: number; bottom: number; right: number; width: number };
    range: { from: number; to: number };
    initialHref: string;
    mode: 'create' | 'edit';
  } | null>(null);
  /* Mirrors openUrlLinkPrompt for Mod-K inside handleKeyDown. `editorProps` is built once, on
     the render that creates the editor, so a direct reference there would freeze that render's
     closure — same stale-closure reason as deleteConfirmPillRef below. */
  const openUrlLinkPromptRef = useRef<((range?: { from: number; to: number }) => void) | null>(null);
  // Ref mirrors deleteConfirmPill for reading inside handleKeyDown (avoids stale closure)
  const deleteConfirmPillRef = useRef<{
    rect: DOMRect;
    reference: string;
    boundaries: { start: number; end: number };
  } | null>(null);
  // @ mention typeahead. State drives the portal; the ref mirror is read inside
  // handleKeyDown and editor event listeners (same stale-closure pattern as deleteConfirmPillRef).
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState | null>(null);
  const mentionPickerRef = useRef<MentionPickerState | null>(null);
  /** Position of an `@` the user Escaped from — suppresses instant reopen until the trigger goes away. */
  const mentionDismissedAtRef = useRef<number | null>(null);
  /** Monotonic token guarding async mentionSource results against stale application. */
  const mentionQueryTokenRef = useRef(0);
  const mentionFetchTimerRef = useRef<number | null>(null);
  const mentionSourceRef = useRef(mentionSource);
  mentionSourceRef.current = mentionSource;
  // Read inside the ProseMirror keydown handler, which closes over stale props.
  const mentionKindsRef = useRef(mentionKinds);
  mentionKindsRef.current = mentionKinds;
  const onMentionPillClickRef = useRef(onMentionPillClick);
  onMentionPillClickRef.current = onMentionPillClick;
  const [contentOverflowing, setContentOverflowing] = useState(false);
  const [contentHasScrolledDown, setContentHasScrolledDown] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  /** Coalesces per-keystroke parent `onContentChange` propagation to one call per animation frame so
   *  rapid typing doesn't re-render the (large) parent on every character. Autosave is debounced
   *  downstream, so a one-frame delay is immaterial. The hidden input stays synchronous for form submit. */
  const contentPropagateRafRef = useRef<number | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const latestNoteHtmlRef = useRef<string>('');
  // True when a genuine, user-initiated DOM content edit (beforeinput/paste/drop/cut) occurred. Lets
  // onUpdate tell real edits from PROGRAMMATIC doc changes (hydrate pill/translation/spacing
  // normalization, etc.) so the latter don't mark the note dirty and re-stamp updatedAt on mere view.
  // Reset each time onUpdate consumes it; `pendingEmitUserEditRef` carries it across the rAF coalesce.
  const sawUserContentInputRef = useRef(false);
  const pendingEmitUserEditRef = useRef(false);
  const editorRef = useRef<any>(null);
  const tiptapContentRef = useRef<HTMLDivElement>(null);
  const createNoteBubbleRef = useRef<HTMLDivElement>(null);
  /** Frozen range for the portaled selection bar — survives editor selection collapse on bar click. */
  const selectionBarRangeRef = useRef<{
    from: number;
    to: number;
    snippet: string;
  } | null>(null);
  /** Latest editor selection while focused — survives portaled format-toolbar click focus theft. */
  const formatToolbarSelectionRef = useRef<FormatToolbarSelectionRange | null>(null);
  /** Last caret/selection inside meaningful body text — fallback when live/frozen snap to doc end. */
  const lastInBodySelectionRef = useRef<FormatToolbarSelectionRange | null>(null);
  /** True for the duration of a format-toolbar press — blocks stale selection snapshots + content sync. */
  const formatToolbarPointerDownRef = useRef(false);
  /** Last consumed `forceBodyReplaceFromProps` revision (preview→full body upgrade). */
  const lastAppliedForceBodyReplaceRef = useRef(0);
  /** Grace window after toolbar use so RAF-deferred parent content sync cannot clobber the editor. */
  const formatToolbarInteractionUntilRef = useRef(0);
  /** Pointer start for the active toolbar-button press — used to tell a tap from a horizontal scroll. */
  const toolbarBtnPointerStartRef = useRef<{ x: number; y: number; id: number } | null>(null);
  /** True once the active toolbar-button press moves past the tap threshold (i.e. it's a scroll, not a tap). */
  const toolbarBtnPointerMovedRef = useRef(false);
  const skipScriptureDockDismissRef = useRef(false);
  /** Pending timer that clears the dock-dismiss suppression window (see suppressScriptureDockDismiss). */
  const skipScriptureDockDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timestamp of the last genuine user interaction (pointer/key) inside the editor body. Lets the
   * scripture-dock dismiss distinguish a user navigating off the pill (should collapse) from a
   * programmatic caret jump like a post-save setContent injection (must NOT collapse). */
  const editorBodyInteractedAtRef = useRef(0);
  /**
   * Open a suppression window so a dock-driven pill edit (verse-range/book/chapter/verse rewrite or a
   * translation change) does not collapse the scripture dock. A single-consume boolean can't cover the
   * *cascade* of selection updates one change triggers, and a one-frame RAF window closes before the
   * async paths settle — the translation change awaits a fetch + fires a `noteUpdated` content re-sync,
   * and the passage refetch re-renders the dock. So we hold the flag for a short trailing window and
   * re-arm it on back-to-back calls rather than letting an earlier clear fire mid-cascade.
   */
  const suppressScriptureDockDismiss = useCallback(() => {
    skipScriptureDockDismissRef.current = true;
    if (skipScriptureDockDismissTimerRef.current != null) {
      clearTimeout(skipScriptureDockDismissTimerRef.current);
    }
    skipScriptureDockDismissTimerRef.current = setTimeout(() => {
      skipScriptureDockDismissRef.current = false;
      skipScriptureDockDismissTimerRef.current = null;
    }, 150);
  }, []);
  /** Latest selection-bar evaluation fn, so a dock-stack change can re-run it without forcing the
   *  listener-registration effect (and its `editor.on`/`document` listeners) to tear down and rewire. */
  const runSelectionEvalRef = useRef<() => void>(() => {});
  const [studyDockStack, setStudyDockStack] = useState<StudyDockStack>(emptyStudyDockStack);
  /**
   * The highlight whose note field should take the caret, or null.
   *
   * Deliberately component state rather than a field on `HighlightDockSession`: the stack is
   * serialized to localStorage, so a flag stored there would steal focus again on every
   * reload of the note. Keyed by study-thread id and not by dock entry id, because
   * `openOrFocusHighlight` mints the entry id internally and the opener never sees it.
   */
  const [focusMiniNoteThreadId, setFocusMiniNoteThreadId] = useState<string | null>(null);
  const studyDockStackRef = useRef(studyDockStack);
  studyDockStackRef.current = studyDockStack;
  const dockContextKey = studyDockContextKey(sourceNoteId, contextSpaceId);
  const studyThreadContextSuffix = studyThreadContextQuery(contextSpaceId);
  const [studyDockStackContextKey, setStudyDockStackContextKey] = useState(dockContextKey);
  const studyDockRehydratedForContextRef = useRef<string | null>(null);
  /** Last editor selection/caret — used for smart scripture quote insert placement. */
  const lastEditorSelectionForQuoteRef = useRef<{ from: number; to: number; at: number } | null>(null);
  const studyDockPortalTarget =
    studyDockCarouselPortalTarget ?? scriptureChromePortalTarget ?? highlightChromePortalTarget;

  // Reference (dictionary) docks now live in the study-dock carousel alongside scripture pills
  // and highlights, instead of a separate floating portal. This opens or focuses one.
  const openReferenceDock = useCallback(
    (session: ReferenceDockSession, openedFromDockId?: string | null) => {
      setStudyDockStack((s) => openOrFocusReference(s, session, { openedFromDockId }));
    },
    [],
  );

  // Open a referenced passage (e.g. a cross-reference) as a NEW read-only carousel card.
  const openScripturePassage = useCallback(
    (reference: string, translation: string, openedFromDockId?: string | null) => {
      setStudyDockStack((s) =>
        openOrFocusScripture(s, buildReadOnlyScriptureSession(reference, translation, sourceNoteId ?? null), {
          openedFromDockId,
        }),
      );
    },
    [sourceNoteId],
  );

  const [selectionExpanded, setSelectionExpanded] = useState(false);
  const [showFormatBarForActivity, setShowFormatBarForActivity] = useState(false);
  const [isPointerOverFormatToolbar, setIsPointerOverFormatToolbar] = useState(false);
  /** Native `preferOrbChromeUntilNextFormatSignal` parity — suppress format bar after dock chrome relinquishes until body click/typing. */
  const suppressFormatBarUntilBodySignalRef = useRef(false);
  const formatBarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStudyDockChromeTakesOverRef = useRef(false);
  // Debounce timer for mobile scripture detection (mobile runs detection in onUpdate,
  // not the desktop space keydown handler). Referenced in onUpdate's mobile branch.
  const mobileScriptureDetectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopScriptureDetectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounce timer for the desktop orphan-suffix absorb (e.g. an "Exodus 4:18" pill
  // followed by a typed "-20"). Debounced so multi-digit suffixes (":16", "-200") merge
  // once the user pauses, instead of locking in a shorter ref ("John 3:1") mid-number.
  const desktopOrphanAbsorbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpFormatToolbarActivity = useCallback(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    setShowFormatBarForActivity(true);
    if (formatBarHideTimerRef.current) {
      clearTimeout(formatBarHideTimerRef.current);
      formatBarHideTimerRef.current = null;
    }
    /*
     * No idle timer on touch.
     *
     * The 2s auto-hide is a mouse idea: with a cursor, "you stopped moving" is a decent
     * proxy for "you are done". With a finger there is no idle — you are either typing or
     * looking at the screen holding still, and the second one looked identical to the first,
     * so the bar kept vanishing mid-thought and reappearing on the next tap. Blur already
     * clears this flag, which is the event that actually means the toolbar is done.
     */
    if (isCoarsePointer) return;
    formatBarHideTimerRef.current = setTimeout(() => {
      setShowFormatBarForActivity(false);
      formatBarHideTimerRef.current = null;
    }, PROTOTYPE_FORMAT_BAR_HIDE_MS);
  }, [editorChromeMode, isCoarsePointer]);
  // This prevents errors when editor is destroyed but handlers still fire
  const isEditorValid = (editorInstance: any): boolean => isTiptapViewReady(editorInstance);

  /** Doc has text but paragraph nodeViews still show Placeholder empty chrome (contenteditable=false). */
  const proseMirrorViewLooksDesynced = (editorInstance: any): boolean => {
    if (!isEditorValid(editorInstance)) return false;
    const stateText = editorInstance.state?.doc?.textContent ?? '';
    if (!stateText.trim()) return false;
    const domText = editorInstance.view.dom?.textContent ?? '';
    if (stateText === domText) return false;
    const block = editorInstance.view.docView?.children?.[0];
    if (block?.dom?.getAttribute('contenteditable') === 'false') return true;
    return stateText.trim().length > 0 && !domText.trim();
  };

  const [viewRepairGeneration, setViewRepairGeneration] = useState(0);
  const viewRepairAttemptsRef = useRef(0);

  // When keyboard layout is active
  const scrollSelectionIntoViewAboveToolbar = (editorInstance: any) => {
    if (!isEditorValid(editorInstance)) return;
    const host = editorInstance.view.dom.closest('[data-keyboard-open]');
    const protoKeyboardOpen =
      typeof document !== 'undefined' &&
      document.documentElement.hasAttribute('data-proto-keyboard-open');
    if (!host && !protoKeyboardOpen) return;
    const { from } = editorInstance.state.selection;
    const { node } = editorInstance.view.domAtPos(from);
    const el =
      node.nodeType === Node.TEXT_NODE
        ? (node as Text).parentElement
        : node instanceof HTMLElement
          ? node
          : null;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }
  };

  const scheduleScrollSelectionIntoViewAboveToolbar = (editorInstance: any) => {
    const run = () => scrollSelectionIntoViewAboveToolbar(editorInstance);
    setTimeout(run, 350);
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      setTimeout(run, 400);
      setTimeout(run, 600);
    }
  };

  // Restore scroll position when provided
  useEffect(() => {
    if (scrollPosition && scrollPosition > 0) {
      const timer = setTimeout(() => {
        const editorContent = document.querySelector('.tiptap-content');
        if (editorContent) {
          editorContent.scrollTop = scrollPosition;
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [scrollPosition]);

  // Reference-suggestion plumbing. The Easton's index loads async (below) so the plugin
  // reads it lazily through a ref; the chrome-mode ref gates suggestions to the
  // prototype/native surface. Both are captured once when the extension is configured.
  const eastonsIndexRef = useRef<EastonsIndex>(undefined);
  const editorChromeModeRef = useRef(editorChromeMode);
  editorChromeModeRef.current = editorChromeMode;
  const referenceProvidersRef = useRef<ReferenceProvider[]>([
    createDictionaryReferenceProvider(() => eastonsIndexRef.current),
  ]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Exclude default Heading extension so we can add custom one with restricted levels
        heading: false,
        // Exclude underline from StarterKit to avoid duplicate extension warning
        underline: false,
        // Exclude bold from StarterKit so we can use custom Bold extension
        bold: false,
        // Custom paragraph keeps blank lines as `<p><br></p>` in getHTML output
        paragraph: false,
        // Scripture passage quotes carry pill accent on the blockquote element
        blockquote: false,
        // Disable StarterKit's bundled Link extension — we use our own UrlLink mark which
        // renders a <span data-url-link> instead of <a>. Without this, StarterKit wraps
        // bare URLs in <a> tags, causing a double underline (browser <a> default + .url-link).
        link: false,
      }),
      ScriptureQuoteBlockquote,
      ParagraphCustom,
      Heading.configure({
        levels: [2, 3], // H1 reserved for note titles
      }),
      Underline,
      Superscript,
      BoldCustom, // Use custom Bold extension that prevents application after pills
      HighlightCustom, // Use custom Highlight extension that prevents application after pills
      ReferenceSuggestion.configure({
        // Ephemeral dotted-underline hints for saved references (Dictionary today).
        // Gated to the prototype/native chrome; reads the Easton's index lazily.
        getProviders: () => referenceProvidersRef.current,
        enabled: () => editorChromeModeRef.current === 'prototypeNative',
      }),
      ScripturePill, // Must come before NoteLink so scripture pills are parsed correctly
      ScriptureDraft, // Inline edit-mode reference (prototype) — confirms into a ScripturePill
      MentionPill, // Content mentions (@ notes/threads/folders) — before NoteLink for parse precedence
      NoteLink,
      UrlLink, // External URL links — parse priority lower so note/scripture spans win
      TextIndent,
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder: placeholder,
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
    ],
    content: normalizeEmptyBodyHtmlForEditor(sanitizeScripturePillHtml(safeRenderHtml(content))) || '<p></p>',
    onCreate: ({ editor }) => {
      if (onEditorReady) {
        onEditorReady(editor);
      }
      queueMicrotask(() => {
        try {
          if (!isEditorValid(editor)) return;
          if (editor.getHTML().includes('scripture-pill')) {
            placeCursorAfterLeadingScripturePill(editor);
          }
        } catch {
          /* ignore */
        }
      });
    },
    onUpdate: ({ editor }) => {
      const htmlContent = noteHtmlFromEditor(editor, true);

      // Update hidden input (kept synchronous so a form submit always reads the latest body).
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = htmlContent;
      }

      latestNoteHtmlRef.current = htmlContent;
      onLiveBodyHtmlChange?.(htmlContent);

      // Classify this change: a doc change preceded by a trusted DOM input event is a real user edit;
      // anything else (hydrate normalization, programmatic dispatches) is programmatic and must NOT
      // mark the note dirty. Accumulate across the rAF coalesce so a mixed frame counts as a user edit.
      if (sawUserContentInputRef.current) {
        pendingEmitUserEditRef.current = true;
        sawUserContentInputRef.current = false;
      }

      // Notify parent component — coalesced to one call per animation frame. On rapid typing this
      // collapses N per-keystroke parent re-renders into one per frame with the latest HTML; autosave
      // is debounced downstream so the sub-frame delay is immaterial.
      if (onContentChange) {
        if (contentPropagateRafRef.current == null) {
          contentPropagateRafRef.current = requestAnimationFrame(() => {
            contentPropagateRafRef.current = null;
            const wasUserEdit = pendingEmitUserEditRef.current;
            pendingEmitUserEditRef.current = false;
            // Programmatic emissions stay un-dirtied by CardFullEditable.handleContentChange.
            onContentChangeRef.current?.(
              latestNoteHtmlRef.current,
              wasUserEdit ? undefined : { programmatic: true },
            );
          });
        }
      }

      // Auto-capitalize first letter (post-input transformation)
      // Only run when the cursor is near the start of the document to avoid
      // traversing doc.firstChild on every keystroke throughout the document.
      try {
        const { from: cursorPos } = editor.state.selection;
        // Only check when cursor is within the first 3 positions (typing at start)
        if (cursorPos <= 3) {
          const doc = editor.state.doc;
          const firstChild = doc.firstChild;
          if (firstChild && firstChild.isTextblock && firstChild.textContent.length >= 1) {
            const firstChar = firstChild.textContent[0];
            if (/^[a-z]$/.test(firstChar)) {
              const from = 1;
              const to = 2;
              editor.commands.command(({ tr, dispatch }) => {
                if (dispatch) {
                  tr.replaceWith(from, to, editor.state.schema.text(firstChar.toUpperCase()));
                  dispatch(tr);
                }
                return true;
              });
            }
          }
        }
      } catch (e) {
        // Silently ignore errors (e.g., empty document, destroyed editor)
      }

      // Mobile: detect scripture references after space, newline, or Return (new paragraph)
      // Desktop uses the space keydown handler; mobile uses onUpdate to avoid
      // intercepting keydown events which breaks iOS double-space-to-period.
      // We gate scheduling on word boundaries (or pending translation) so plain
      // typing does not constantly reset the debounce timer.
      if (isMobileDevice()) {
        const { from: mobFrom, to: mobTo } = editor.state.selection;
        if (mobFrom === mobTo && mobFrom >= 2) {
          const $mobFrom = editor.state.doc.resolve(mobFrom);
          const thisEditorId = String(editor.view?.dom?.id || 'default');
          const draftMode = editorChromeMode === 'prototypeNative';
          const hasActiveDraft = draftMode && hasActiveScriptureDraft(editor.state);
          const needsScripturePass =
            Array.from(pendingTranslationPills.values()).some(e => e.editorId === thisEditorId) ||
            hasActiveDraft ||
            (draftMode
              ? shouldScheduleDraftDetection(
                  editor.state.doc,
                  mobFrom,
                  isScripturePillBoundaryCursor($mobFrom, editor.state.doc),
                )
              : shouldSchedulePassiveScriptureDetection(
                  editor.state.doc,
                  mobFrom,
                  isScripturePillBoundaryCursor($mobFrom, editor.state.doc),
                ));
          if (!needsScripturePass) {
            if (mobileScriptureDetectionTimer.current) {
              clearTimeout(mobileScriptureDetectionTimer.current);
              mobileScriptureDetectionTimer.current = null;
            }
          } else {
            if (mobileScriptureDetectionTimer.current) {
              clearTimeout(mobileScriptureDetectionTimer.current);
            }
            mobileScriptureDetectionTimer.current = setTimeout(() => {
              if (!editor || editor.isDestroyed) return;
              if (draftMode) {
                runScriptureDraftDetectionAtCursor(editor);
                // Debounced grow: the per-keystroke grow plugin is disabled on mobile (mutating the
                // draft mark mid-type desyncs iOS contenteditable), so snap a range tail typed as
                // plain text into the draft now that the user has paused.
                if (editor.view) unifyScriptureDraftAtCursor(editor.view);
              } else {
                runScriptureDetectionAtCursor(editor);
              }
              // Live-ish: flip the pill's translation label when an abbreviation is typed after it.
              tryConsumeTranslationAbbrevAfterPill(editor);
            }, 250);
          }

          if (
            draftMode &&
            hasActiveDraft &&
            editor.view
          ) {
            const range = getScriptureDraftRange(editor.state);
            if (range && hasDraftContinuationTailInDoc(editor.state, range.to)) {
              scheduleMobileDraftTailCaretSync(editor.view);
            }
          }
        }
      } else {
        const { from: deskFrom, to: deskTo } = editor.state.selection;
        if (deskFrom === deskTo && deskFrom >= 2) {
          const $deskFrom = editor.state.doc.resolve(deskFrom);
          const thisEditorId = String(editor.view?.dom?.id || 'default');
          const draftMode = editorChromeMode === 'prototypeNative';
          const needsScripturePass =
            Array.from(pendingTranslationPills.values()).some((e) => e.editorId === thisEditorId) ||
            (draftMode
              ? shouldScheduleDraftDetection(
                  editor.state.doc,
                  deskFrom,
                  isScripturePillBoundaryCursor($deskFrom, editor.state.doc),
                )
              : shouldSchedulePassiveScriptureDetection(
                  editor.state.doc,
                  deskFrom,
                  isScripturePillBoundaryCursor($deskFrom, editor.state.doc),
                ));
          if (needsScripturePass) {
            if (desktopScriptureDetectionTimer.current) {
              clearTimeout(desktopScriptureDetectionTimer.current);
            }
            desktopScriptureDetectionTimer.current = setTimeout(() => {
              desktopScriptureDetectionTimer.current = null;
              if (!editor || editor.isDestroyed) return;
              if (draftMode) runScriptureDraftDetectionAtCursor(editor);
              else runScriptureDetectionAtCursor(editor);
              // Live-ish: flip the pill's translation label when an abbreviation is typed after it.
              tryConsumeTranslationAbbrevAfterPill(editor);
            }, 250);
          } else if (desktopScriptureDetectionTimer.current) {
            clearTimeout(desktopScriptureDetectionTimer.current);
            desktopScriptureDetectionTimer.current = null;
          }
        }

        // Orphan suffix absorb when verse/range continuation is typed after a pill.
        // Skipped in the prototype: inline draft mode is the creation/extend path there,
        // so the fragile adjacent-merge (the source of the stray-space bug) is unused.
        try {
          const { from, to } = editor.state.selection;
          const charBefore = from >= 2 ? editor.state.doc.textBetween(from - 1, from) : '';
          if (editorChromeMode !== 'prototypeNative' && from === to && /[\d:,\-–—]/.test(charBefore)) {
            if (desktopOrphanAbsorbTimer.current) clearTimeout(desktopOrphanAbsorbTimer.current);
            desktopOrphanAbsorbTimer.current = setTimeout(() => {
              desktopOrphanAbsorbTimer.current = null;
              if (!editor || editor.isDestroyed) return;
              try {
                absorbOrphanSuffixesAfterPills(editor);
              } catch {
                /* ignore */
              }
            }, 250);
          }
        } catch {
          /* ignore */
        }
      }

      // Scroll cursor into view when content changes
      // Use rAF to batch with the browser's next paint instead of forcing layout synchronously
      requestAnimationFrame(() => {
        try {
          const view = editor.view;
          if (!view || editor.isDestroyed) return;
          const editorDom = view.dom;
          // Keyboard-open layout: scroll-margin + selectionUpdate scroll handle caret; manual scroll fights CSS and causes a gap above the toolbar
          if (editorDom.closest('[data-keyboard-open]')) return;
          const { from } = editor.state.selection;
          const coords = view.coordsAtPos(from);
          if (coords) {
            const scrollContainer = editorDom.closest('.tiptap-content') || editorDom.closest('.card-stack__inner');
            if (scrollContainer) {
              const scrollRect = scrollContainer.getBoundingClientRect();
              // If cursor is below the visible area (with 80px buffer for footer)
              if (coords.bottom > scrollRect.bottom - 80) {
                scrollContainer.scrollTop += (coords.bottom - scrollRect.bottom + 100);
              }
            }
          }
        } catch (e) {
          // Silently ignore scroll errors
        }
      });
    },
    // Creation-time value only — tiptap never syncs `editable` from options after
    // mount (its setOptions path explicitly preserves editor.isEditable). The
    // effect below is what actually drives editability over time.
    editable: !sharedAnnotationOverlayMode && !coEditFollower,
    editorProps: {
      clipboardTextSerializer: (slice) => noteClipboardPlainTextFromFragment(slice.content),
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none [&_ol]:list-decimal [&_ul]:list-disc',
        style: 'font-family: var(--font-sans); font-size: 16px; font-weight: 500; line-height: 1.6; color: var(--color-deep-grey); min-height: 200px;',
        tabindex: (tabindex || 0).toString(),
      },
      // NOTE: beforeinput handler removed - using plugin's handleTextInput instead
      // This prevents conflicts between DOM-level and ProseMirror-level handlers
      handleDOMEvents: {
        // Let ProseMirror handle all DOM events naturally
        // This ensures cursor placement works correctly on tap
      },
      handleClick: (view, _pos, _event) => {
        if (isDocTextEmpty(view.state.doc)) {
          const tr = view.state.tr.setSelection(
            TextSelection.create(view.state.doc, preferredCaretPosForEmptyDoc(view.state.doc)),
          );
          view.dispatch(tr);
          view.focus();
          return true;
        }
        return false;
      },
      transformPastedHTML: (html: string) => {
        // Transform heading levels when pasting:
        // H1 → H2, H2 → H3, H3 → H3, H4+ → H3
        if (!html || typeof html !== 'string') {
          return html;
        }
        
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          // Process all heading tags
          const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach((heading) => {
            const level = parseInt(heading.tagName.charAt(1));
            if (isNaN(level) || level < 1 || level > 6) {
              return; // Skip invalid headings
            }
            
            let newLevel: number;
            
            if (level === 1) {
              newLevel = 2; // H1 → H2
            } else if (level === 2) {
              newLevel = 3; // H2 → H3
            } else {
              newLevel = 3; // H3, H4, H5, H6 → H3 (clamp to max for classic paste behavior)
            }

            // Only transform if newLevel is in allowed range [2, 3]
            if (newLevel >= 2 && newLevel <= 3) {
              const newHeading = document.createElement(`h${newLevel}`);
              newHeading.innerHTML = heading.innerHTML;
              // Copy attributes
              Array.from(heading.attributes).forEach(attr => {
                newHeading.setAttribute(attr.name, attr.value);
              });
              if (heading.parentNode) {
                heading.parentNode.replaceChild(newHeading, heading);
              }
            } else {
              // If somehow we get an invalid level, convert to paragraph
              const p = document.createElement('p');
              p.innerHTML = heading.innerHTML;
              Array.from(heading.attributes).forEach(attr => {
                if (attr.name !== 'class' || !attr.value.includes('heading')) {
                  p.setAttribute(attr.name, attr.value);
                }
              });
              if (heading.parentNode) {
                heading.parentNode.replaceChild(p, heading);
              }
            }
          });
          
          return tempDiv.innerHTML;
        } catch (error) {
          return html; // Return original HTML on error
        }
      },
      handlePaste: (view, event, slice) => {
        const editor = editorRef.current;
        if (!editor) {
          return false;
        }

        // Check if editor is still valid (not destroyed)
        if (!isEditorValid(editor)) {
          return false;
        }

        // If selection starts inside a pill, don't add extra paste behavior
        // (let ProseMirror handle paste normally to avoid pill edge cases)
        try {
          const $from = view.state.selection.$from;
          const hasPillAtCursor = $from.marks().some((m: any) => m.type.name === 'scripturePill');
          if (hasPillAtCursor) {
            return false;
          }
        } catch (e) {
          // Ignore selection resolution issues and continue
        }

        // Try to get HTML from clipboard to check for existing scripture pills
        let pastedHTML = '';
        try {
          pastedHTML = (event as any)?.clipboardData?.getData?.('text/html') || '';
        } catch (e) {
          // ignore
        }

        const existingPillsWithNoteIds = extractResolvedScripturePillReferencesFromHtml(pastedHTML);

        // Prefer clipboard plain text, fall back to Slice text
        let pastedText = '';
        try {
          pastedText = (event as any)?.clipboardData?.getData?.('text/plain') || '';
        } catch (e) {
          // ignore
        }

        if (!pastedText) {
          try {
            pastedText = slice?.content?.textBetween?.(0, slice.content.size, '\n\n') || '';
          } catch (e) {
            // ignore
          }
        }

        pastedText = (pastedText || '').trim();
        if (!pastedText) {
          return false;
        }

        // Detect references in pasted text
        const references = detectScriptureReferences(pastedText);
        if (!references || references.length === 0) {
          return false;
        }

        // We have references: handle paste ourselves, then create pills immediately
        try {
          (event as any)?.preventDefault?.();
        } catch (e) {
          // ignore
        }

        try {
          const tr = view.state.tr.replaceSelection(slice);
          tr.setStoredMarks([]);
          view.dispatch(tr);
        } catch (e) {
          // If our manual paste fails, fall back to default paste behavior
          return false;
        }

        // After pasting, check the document for pills with noteIds that were parsed from HTML
        // This handles cases where HTML wasn't available from clipboard but ProseMirror parsed it
        setTimeout(async () => {
          try {
            if (!editor || editor.isDestroyed) return;
            
            const doc = editor.state.doc;
            const htmlContent = editor.getHTML();
            
            for (const ref of extractResolvedScripturePillReferencesFromHtml(htmlContent)) {
              existingPillsWithNoteIds.add(ref);
            }

            // Also check ProseMirror marks directly for pills with noteIds
            // This is more reliable than HTML parsing
            doc.descendants((node: any, pos: number) => {
              if (node.marks) {
                node.marks.forEach((mark: any) => {
                  if (mark.type.name === 'scripturePill' && mark.attrs.noteId && 
                      mark.attrs.noteId !== 'pending' && mark.attrs.noteId !== 'null' && mark.attrs.noteId !== '') {
                    const normalizedRef = normalizeScriptureReference(mark.attrs.reference);
                    existingPillsWithNoteIds.add(normalizedRef);
                  }
                });
              }
            });

            const referencesNeedingPills = filterReferencesWithoutExistingPills(
              references,
              existingPillsWithNoteIds,
            );

            // Only create pending pills for references that don't already have pills with noteIds
            if (referencesNeedingPills.length > 0) {
              const applied = createPendingPillsForReferences(editor, referencesNeedingPills);
              if (applied) {
                schedulePendingTranslationAfterPillCreation(editor, referencesNeedingPills);
              }
            }

            // If editing an existing note, immediately process scripture references
            // This creates scripture notes instantly without requiring a save
            if (sourceNoteId && (referencesNeedingPills.length > 0 || references.length > 0)) {
              try {
                const currentHtml = editor.getHTML();
                const currentThreadId = parentThreadId || 'thread_unorganized';

                // Call API to process scripture references with current editor content
                const processResponse = await fetch(`/api/notes/${sourceNoteId}/process-scripture-references`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    threadId: currentThreadId,
                    contentOverride: currentHtml
                  }),
                  credentials: 'include'
                });

                if (processResponse.ok) {
                  const processResult = await processResponse.json();
                  
                  // Convert results to format expected by convertScriptureReferencesToPills
                  // Only include results where scripture notes were created or added (not skipped)
                  const rawResults = Array.isArray(processResult?.results) ? processResult.results : [];
                  const scriptureResults = rawResults
                    .filter((r: any) => r.action === 'created' || r.action === 'added')
                    .map((r: any) => ({
                      reference: r.reference,
                      noteId: r.noteId
                    }));

                  if (scriptureResults.length > 0) {
                    // Update pills with real noteIds
                    await convertScriptureReferencesToPills(editor, scriptureResults);
                  }
                } else {
                  console.error('[TiptapEditor] Error processing scripture references after paste:', processResponse.status);
                }
              } catch (processError) {
                // Non-critical error - scripture notes will be created on save
                console.error('[TiptapEditor] Error processing scripture references after paste:', processError);
              }
            }
          } catch (e) {
            console.error('[TiptapEditor] Error checking for existing pills after paste:', e);
            // Fallback: create pending pills for all references if check fails
            const applied = createPendingPillsForReferences(editor, references);
            if (applied) {
              schedulePendingTranslationAfterPillCreation(editor, references);
            }
          }
        }, 0);

        return true;
      },
      handleKeyDown: (view, event) => {
        const editor = editorRef.current;
        if (!editor) {
          return false;
        }
        
        // Check if editor is still valid (not destroyed)
        if (!isEditorValid(editor)) {
          return false;
        }
        
        // Check if view.docView is still valid (docView exists at runtime but not in TS types)
        if (!view || !(view as any).docView) {
          return false;
        }

        /* Mod-K over a selection raises the link prompt — the shortcut every editor has.
           The live selection is trustworthy here, unlike from the toolbar, because the keypress
           happened with focus in the document. Passed over when nothing is selected so the
           browser's own Cmd-K is not swallowed for no reason. */
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
          if (!editor.state.selection.empty) {
            event.preventDefault();
            openUrlLinkPromptRef.current?.();
            return true;
          }
        }

        // @ mention picker keyboard navigation. NEVER intercepts the space key (iOS
        // double-space-to-period) — a space simply breaks the trigger regex and the
        // picker closes on the next sync.
        const mentionState = mentionPickerRef.current;
        if (mentionState && !event.metaKey && !event.ctrlKey && !event.altKey) {
          if (event.key === 'Escape') {
            event.preventDefault();
            mentionDismissedAtRef.current = mentionState.range.from;
            mentionPickerRef.current = null;
            setMentionPicker(null);
            return true;
          }
          // Shift+← / Shift+→ cycle kind filters — same gesture as sidebar list mode.
          if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            const step = event.key === 'ArrowRight' ? 1 : -1;
            const next = {
              ...mentionState,
              kindFilter: cycleMentionKindFilter(
                mentionState.kindFilter,
                step,
                mentionKindFilterOrderFor(mentionKindsRef.current),
              ),
              activeIndex: 0,
            };
            mentionPickerRef.current = next;
            setMentionPicker(next);
            return true;
          }
          const visible = visibleMentionItems(mentionState);
          if (visible.length > 0) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const delta = event.key === 'ArrowDown' ? 1 : -1;
              const count = visible.length;
              const nextIndex = (mentionState.activeIndex + delta + count) % count;
              const next = { ...mentionState, activeIndex: nextIndex };
              mentionPickerRef.current = next;
              setMentionPicker(next);
              return true;
            }
            if (event.key === 'Enter' || event.key === 'NumpadEnter' || event.key === 'Tab') {
              event.preventDefault();
              const item = visible[mentionState.activeIndex] || visible[0];
              commitMentionPickerItem(editor, mentionState, item, () => {
                mentionPickerRef.current = null;
                setMentionPicker(null);
                mentionDismissedAtRef.current = null;
              });
              return true;
            }
          }
        }

        // Handle Cmd+Enter to submit form (dispatch event for parent panels to handle)
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('submitPanelForm'));
          return true; // Prevent default for Cmd+Enter only
        }
        
        // Handle Select All (Cmd+A on Mac, Ctrl+A on Windows/Linux)
        if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
          event.preventDefault();
          editor.commands.selectAll();
          return true;
        }
        
        // Handle scripture pill editing prevention
        const { from, to } = view.state.selection;
        const $from = view.state.selection.$from;
        const scripturePillMark = $from.marks().find(mark => mark.type.name === 'scripturePill');

        // Arrow key atomic pill navigation: skip over a pill in one keystroke
        if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && from === to &&
            !event.shiftKey && !event.metaKey && !event.altKey && !event.ctrlKey) {
          const $from = view.state.selection.$from;
          const parent = $from.parent;
          const parentOffset = $from.parentOffset;

          if (event.key === 'ArrowRight') {
            const childAfterInfo = parent.childAfter(parentOffset);
            const pillMarkAfter = childAfterInfo.node && childAfterInfo.offset === parentOffset
              ? ['scripturePill', 'mentionPill'].find((name) =>
                  childAfterInfo.node!.marks.some((m: any) => m.type.name === name))
              : undefined;
            if (pillMarkAfter) {
              const boundaries = findPillBoundaries(view.state.doc, from + 1, pillMarkAfter);
              if (boundaries) {
                event.preventDefault();
                editor.commands.setTextSelection(boundaries.end);
                return true;
              }
            }
          } else {
            // Cross a pill leftward in one press — even when the caret sits after the pill's invisible
            // trailing spacer (otherwise the first ArrowLeft only crosses the spacer and looks inert).
            const target =
              scripturePillSkipLeftTarget(view.state.doc, from) ??
              scripturePillSkipLeftTarget(view.state.doc, from, 'mentionPill');
            if (target != null) {
              event.preventDefault();
              editor.commands.setTextSelection(target);
              return true;
            }
          }
        }

        // EARLY CHECK: Handle Backspace/Delete adjacent to or inside a pill
        // This must fire first to prevent ProseMirror's default backspace from eating pill characters
        if (tryHandleMentionPillDeleteKey(editor, event, view)) {
          return true;
        }
        // Backspace-to-edit runs BEFORE the delete-confirm handler so Backspace on a pill changes
        // mode rather than arming a deletion. It declines whenever there's no pill to edit, so the
        // handler below still owns forward Delete and the orphan-suffix cases.
        if (
          editorChromeModeRef.current === 'prototypeNative' &&
          tryEditScripturePillOnBackspace(editor, event, view, deleteConfirmPillRef)
        ) {
          return true;
        }
        if (tryHandleScripturePillDeleteKey(editor, event, view, deleteConfirmPillRef, setDeleteConfirmPill)) {
          return true;
        }

        if (tryDeleteAdjacentAtomicBlock(editor, view, event)) {
          return true;
        }

        // Inline edit-mode (draft) scripture pill: while the caret is inside a draft, handle
        // confirm / cancel gestures and keep the reference contiguous. Backspace, arrows,
        // digits, ':' ',' '-' all fall through to edit the draft normally.
        const draftRange = getScriptureDraftRange(view.state);
        if (draftRange) {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelScriptureDraftView(view);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'NumpadEnter') {
            // Commit WITHOUT `focus` — the resync it would schedule targets the pre-split caret,
            // which the block split below is about to invalidate. We re-run it after the split.
            const committed = confirmScriptureDraftView(view, undefined, {});
            if (!committed) {
              // The draft refused to commit — mid-range entry (`Numbers 5:5` + a plain `-1` tail),
              // or a reference outside the canon (`Exodus 16:1315`). Don't swallow the key: a
              // Return that does nothing reads as broken. Resolve the draft first so no orphan
              // dashed span survives the line break (it would serialize into the saved HTML and
              // read as stuck bold text), then let ProseMirror insert the newline on fresh state.
              cancelScriptureDraftView(view);
              return false;
            }
            // Return means "done with this line", not just "accept the pill" — break the line too.
            // splitBlock (the command Enter normally maps to) handles list items and the other
            // block types correctly, where a raw tr.split would throw at some positions.
            event.preventDefault();
            editor
              .chain()
              .splitBlock()
              .command(({ tr }: { tr: any }) => {
                tr.setStoredMarks([]);
                tr.scrollIntoView();
                return true;
              })
              .run();
            // The new block is empty, so plain domAtPos placement is correct here — no pill
            // adjacency, hence no markFrom/markTo.
            resyncMobileCaret(view, { focus: true, pos: view.state.selection.from });
            return true;
          }
          // Double-space confirms (desktop only — never intercept space on mobile: it breaks
          // iOS double-space-to-period). A single space stays in the draft.
          if (event.key === ' ' && !isMobileDevice()) {
            const caret = view.state.selection.from;
            const prevChar = caret >= 1 ? view.state.doc.textBetween(caret - 1, caret) : '';
            if (prevChar === ' ') {
              event.preventDefault();
              confirmScriptureDraftView(view);
              return true;
            }
            return false;
          }
          // A non-continuation printable char ends the reference: confirm, then type the char
          // after the committed pill (desktop only — mobile relies on the ✓ button / tap-away).
          if (
            !isMobileDevice() &&
            event.key.length === 1 &&
            !event.metaKey && !event.ctrlKey && !event.altKey &&
            event.key !== ' ' &&
            !isScriptureReferenceContinuationKey(event.key)
          ) {
            event.preventDefault();
            confirmScriptureDraftView(view);
            const tr = view.state.tr.insertText(event.key);
            tr.setStoredMarks([]);
            view.dispatch(tr);
            return true;
          }
          // Other keys (Backspace, arrows, digits, ':' ',' '-') edit the draft in place.
          return false;
        }

        // Detect scripture references when space, Enter, comma, or period is pressed (desktop only)
        // On mobile, scripture detection happens in onUpdate to avoid interfering
        // with native keyboard behavior (e.g., iOS double-space-to-period)
        const isDetectionTrigger =
          event.key === ' ' || event.key === 'Enter' || event.key === 'NumpadEnter' ||
          event.key === ',' || event.key === '.';
        const isSyncTrigger = event.key === ' ' || event.key === ',' || event.key === '.';
        const isEnterTrigger = event.key === 'Enter' || event.key === 'NumpadEnter';
        const cursorEndingAtKeydown = detectScriptureReferenceEndingAtCursor(view.state.doc, from);
        const skipChapterInsideLongerPill =
          cursorEndingAtKeydown != null &&
          isChapterOnlyScriptureReference(cursorEndingAtKeydown.reference) &&
          isChapterOnlyInsideLongerPill(view.state.doc, from, cursorEndingAtKeydown.reference);
        const allowDetectionAtCursor =
          (!scripturePillMark || (cursorEndingAtKeydown != null && !skipChapterInsideLongerPill)) &&
          !skipChapterInsideLongerPill;
        // In the prototype, creation goes through inline draft mode (passive detection +
        // confirm gestures above), so the keydown commit-on-space path is disabled there.
        if (isDetectionTrigger && from === to && allowDetectionAtCursor && !event.metaKey && !event.ctrlKey && !event.altKey && !isMobileDevice() && editorChromeModeRef.current !== 'prototypeNative') {
          // Step 1: Resolve any pending translation pill from a previous keypress
          // (Check if user typed a translation abbreviation like "ESV" after the last pill)
          const consumedAbbrev = resolvePendingTranslationPill(editor);
          if (consumedAbbrev) {
            if (isSyncTrigger) {
              event.preventDefault();
              const tr = editor.view.state.tr;
              tr.insertText(event.key, editor.view.state.selection.from);
              tr.setStoredMarks([]);
              editor.view.dispatch(tr);
              return true;
            }
            // For Enter / NumpadEnter, let the newline happen naturally
          }

          // Step 2: Detect scripture reference ending at cursor (with fallback)
          const liveView = editor.view;
          const doc = liveView.state.doc;
          const detectFrom = liveView.state.selection.from;
          const textStart = Math.max(0, detectFrom - 60);
          const textBeforeCursor = doc.textBetween(textStart, detectFrom);
          const hasDetectableText =
            detectScriptureReferenceEndingAtCursor(doc, detectFrom) != null ||
            (textBeforeCursor.trim().length > 0 && detectScriptureReferences(textBeforeCursor).length > 0);

          try {
            if (hasDetectableText) {
              if (isSyncTrigger) {
                event.preventDefault();

                const tr = liveView.state.tr;
                tr.insertText(event.key, liveView.state.selection.from);
                tr.setStoredMarks([]);
                liveView.dispatch(tr);

                const appliedRef = applyDetectionAtCursor(editor, editor.state.selection.from);
                if (appliedRef) {
                  schedulePendingTranslationAfterPillCreation(editor, [{ reference: appliedRef }]);
                }
                return true;
              }

              if (isEnterTrigger) {
                const appliedRef = applyDetectionAtCursor(editor, detectFrom);
                if (appliedRef) {
                  schedulePendingTranslationAfterPillCreation(editor, [{ reference: appliedRef }]);
                }
              }
            }
          } catch (e) {
            console.error('[TiptapEditor] Error in space/enter detection:', e);
          }
        }
        
        if (scripturePillMark) {
          // Helper to check if entire pill is selected
          const isEntirePillSelected = (doc: any, from: number, to: number): boolean => {
            const boundaries = findPillBoundaries(doc, from);
            if (!boundaries) return false;
            return from === boundaries.start && to === boundaries.end;
          };
          
          const boundaries = findPillBoundaries(view.state.doc, from);
          
          // CRITICAL: Check if cursor is at the END boundary of the pill
          // The key insight: check if NEXT position does NOT have a pill mark
          let atEndOfPill = false;
          let nextHasPill = true; // default to true (inside pill)
          
          if (boundaries) {
            try {
              // Check if next position exists and doesn't have pill mark
              if (from < view.state.doc.content.size) {
                const $next = view.state.doc.resolve(from + 1);
                const nextMarks = $next.marks();
                nextHasPill = nextMarks.some((m: any) => m.type.name === 'scripturePill');
                
                // If next doesn't have pill AND we're at or past the boundary, we're truly after the pill
                if (!nextHasPill && from >= boundaries.end - 1) {
                  atEndOfPill = true;
                }
              } else {
                // At end of document
                if (from >= boundaries.end) {
                  atEndOfPill = true;
                  nextHasPill = false;
                }
              }
            } catch (e) {
              console.error('[TiptapEditor] Error checking next position:', e);
              // If we can't check next position, we're probably at the end of doc
              if (from >= boundaries.end) {
                atEndOfPill = true;
              }
            }
          }
          
          if (atEndOfPill) {
            if (
              boundaries &&
              from === to &&
              isScriptureReferenceContinuationKey(event.key) &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            ) {
              event.preventDefault();
              insertScriptureContinuationAtPillEnd(editor, boundaries, event.key, scripturePillMark.attrs);
              return true;
            }
            return false; // Let ProseMirror handle the character insertion
          }
          
          if (boundaries) {
            // Handle Tab and Space to exit scripture pills
            if (from === to) {
              if (event.key === 'Tab') {
                event.preventDefault();
                // Move cursor to end of pill and unset marks
                editor.chain()
                  .setTextSelection(boundaries.end)
                  .unsetAllMarks()
                  .run();
                return true;
              } else if (event.key === ' ') {
                // On mobile: Don't interfere with native keyboard behavior
                // Let the space be handled naturally for double-space-to-period, etc.
                if (isMobileDevice()) {
                  // Just move cursor to end of pill, let native handle the space
                  editor.chain()
                    .setTextSelection(boundaries.end)
                    .unsetAllMarks()
                    .run();
                  return false; // Let native keyboard handle the space
                }

                // On desktop: manually handle the space
                event.preventDefault();
                // Insert a space after the pill and move cursor after it
                editor.chain()
                  .setTextSelection(boundaries.end)
                  .insertContent(' ')
                  .setTextSelection(boundaries.end + 1)
                  .unsetAllMarks()
                  .run();
                return true;
              }
            }
            
          if (from === to) {
            // Check if this is a printable character (not a control key)
            const isControlKey = event.key.length > 1 || 
              ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete'].includes(event.key);
            
            if (!isControlKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
              if (isScriptureReferenceContinuationKey(event.key)) {
                event.preventDefault();
                insertScriptureContinuationAtPillEnd(editor, boundaries, event.key, scripturePillMark.attrs);
                return true;
              }
              // Move cursor to end of pill and then let ProseMirror handle character insertion
              editor.chain()
                .setTextSelection(boundaries.end)
                .run();
              return false;
            }
          }
          }
        }

        // Auto-capitalize first letter is now handled via onUpdate handler below
        // (using post-input transformation instead of keydown prevention to avoid
        // race conditions with mobile keyboards that cause double letters like "Wwhenever")

        return false;
      },
    },
    // Prototype SPA is client-only — render immediately so EditorContent rebinds cleanly.
    // immediatelyRender:false leaves paragraph nodeViews desynced after draft→persist nav.
    immediatelyRender: editorChromeMode === 'prototypeNative',
  }, [viewRepairGeneration]);

  // Editability has to change *live* for pass-the-pen, and the options path can't
  // do it: `useEditor` has a non-empty deps array, so tiptap takes the
  // destroy-and-recreate branch rather than setOptions — and setOptions wouldn't
  // propagate `editable` anyway. Adding coEditFollower to those deps would rebuild
  // the editor from the `content` prop on every handoff, which in prototypeNative
  // is a downstream mirror that can lag live ProseMirror (see the reconciliation
  // effect below) — i.e. it would drop in-flight text. setEditable touches one
  // ProseMirror prop and leaves doc, selection, plugins, and refs alone.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const nextEditable = !sharedAnnotationOverlayMode && !coEditFollower;
    if (editor.isEditable === nextEditable) return;
    // emitUpdate=false: the default fires onUpdate, which would dirty the note and
    // queue a no-op autosave every time the pen changes hands.
    editor.setEditable(nextEditable, false);
  }, [editor, sharedAnnotationOverlayMode, coEditFollower]);

  // Self-heal prototype editor when ProseMirror state and DOM diverge (regression from 8fdb3a10).
  useLayoutEffect(() => {
    if (!editor || !isEditorValid(editor)) return;
    if (editorChromeMode !== 'prototypeNative') return;

    const maybeRepairView = () => {
      if (!isEditorValid(editor)) return;
      // Never recreate the editor while the user is actively editing it — recreation
      // reloads from the (possibly stale) content prop and discards just-typed text,
      // scripture pills, and freshly-added blank lines. The genuine desync this guards
      // against (regression 8fdb3a10) happens on draft→persist navigation, not mid-typing.
      if (editor.isFocused) return;
      if (!proseMirrorViewLooksDesynced(editor)) return;
      if (import.meta.env.DEV) {
        console.warn('[TiptapEditor] ProseMirror view desynced — recreating editor', {
          sourceNoteId,
          stateText: editor.state?.doc?.textContent,
          domText: editor.view?.dom?.textContent,
        });
      }
      if (viewRepairAttemptsRef.current >= 3) return;
      viewRepairAttemptsRef.current += 1;
      setViewRepairGeneration((g) => g + 1);
    };

    const onFocus = () => maybeRepairView();
    editor.on('focus', onFocus);
    queueMicrotask(maybeRepairView);

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('focus', onFocus);
      }
    };
  }, [editor, editorChromeMode, viewRepairGeneration]);

  useEffect(() => {
    // Reset the repair budget only when switching notes — NOT on every content change.
    // Autosave updates `content` on each keystroke; re-arming here let the self-heal
    // recreate the editor repeatedly mid-edit, dropping pills and blank lines.
    viewRepairAttemptsRef.current = 0;
  }, [sourceNoteId]);

  // Auto-open the reference dock when initialReferenceWord is set (e.g. navigated from sidebar row)
  const initialReferenceWordFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialReferenceWord) {
      initialReferenceWordFiredRef.current = null;
      return;
    }
    if (initialReferenceWordFiredRef.current === (initialReferenceRequestKey ?? initialReferenceWord)) return;
    if (!editor || !isEditorValid(editor)) return;
    initialReferenceWordFiredRef.current = initialReferenceRequestKey ?? initialReferenceWord;
    openReferenceDock({ query: initialReferenceWord });
    onReferenceDeepLinkHandoff?.();
  }, [initialReferenceWord, initialReferenceRequestKey, editor, openReferenceDock, onReferenceDeepLinkHandoff]);

  // Dock a resource chip from `?libItem=` (Resources sidebar row → this note).
  const initialResourceDockFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialResourceDock) {
      initialResourceDockFiredRef.current = null;
      return;
    }
    if (initialResourceDockFiredRef.current === initialResourceDock.requestKey) return;
    if (!editor || !isEditorValid(editor)) return;
    initialResourceDockFiredRef.current = initialResourceDock.requestKey;
    setStudyDockStack((s) => openOrFocusResource(s, initialResourceDock.session));
  }, [initialResourceDock, editor]);

  useEffect(() => {
    const empty = emptyStudyDockStack();
    studyDockStackRef.current = empty;
    setStudyDockStack(empty);
    setStudyDockStackContextKey(dockContextKey);
    studyDockRehydratedForContextRef.current = null;
    initialReferenceWordFiredRef.current = null;
    onPrototypeActiveHighlightEntryChange?.(null);

    if (!editor || editorChromeMode !== 'prototypeNative') return;
    if (!isPersistableStudyDockNoteId(sourceNoteId)) return;
    try {
      const key = studyDockStackStorageKey(sourceNoteId!, contextSpaceId);
      const stored = deserializeStudyDockStack(localStorage.getItem(key));
      if (stored && studyDockStackHasEntries(stored)) {
        const pruned = pruneStudyDockStack(stored, (entry) => studyDockEntryStillValid(editor, entry));
        if (studyDockStackHasEntries(pruned)) {
          studyDockStackRef.current = pruned;
          setStudyDockStack(pruned);
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    } finally {
      studyDockRehydratedForContextRef.current = dockContextKey;
    }
  }, [
    contextSpaceId,
    dockContextKey,
    editor,
    editorChromeMode,
    onPrototypeActiveHighlightEntryChange,
    sourceNoteId,
  ]);

  // On note change / unmount: cancel the pending RAF and flush the latest HTML synchronously so
  // CardFullEditable's editContentRef is current before the editor is destroyed (child unmounts
  // before parent). Safe because cleanup runs while the parent card is still mounted.
  useEffect(() => {
    return () => {
      const pendingRafId = contentPropagateRafRef.current;
      contentPropagateRafRef.current = null;
      flushCoalescedNoteHtmlOnUnmount({
        pendingRafId,
        latestHtml: latestNoteHtmlRef.current,
        onContentChange: onContentChangeRef.current,
        /*
         * Wrapped, not passed. A bare `cancelAnimationFrame` is a native method torn off
         * `window`, so calling it through the options object threw "Illegal invocation" and
         * took the editor down with it — and only on the unmount that had a frame still
         * pending, which is exactly the one after a keystroke: type, start another note, and
         * the editor crashed into the error boundary. The helper's own test has always said
         * it needs a window-bound function; this call site was the one that did not.
         */
        cancelAnimationFrame: (id) => cancelAnimationFrame(id),
        wasUserEdit: pendingEmitUserEditRef.current,
      });
    };
  }, [sourceNoteId]);

  useEffect(() => {
    if (!editor || editorChromeMode !== 'prototypeNative') return;
    const prune = () => {
      setStudyDockStack((s) => pruneStudyDockStack(s, (e) => studyDockEntryStillValid(editor, e)));
    };
    editor.on('update', prune);
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('update', prune);
      }
    };
  }, [editor, editorChromeMode]);

  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    if (!isPersistableStudyDockNoteId(sourceNoteId)) return;
    if (studyDockStackContextKey !== dockContextKey) return;
    if (studyDockRehydratedForContextRef.current !== dockContextKey) return;
    try {
      const key = studyDockStackStorageKey(sourceNoteId!, contextSpaceId);
      if (studyDockStackHasEntries(studyDockStack)) {
        localStorage.setItem(key, serializeStudyDockStack(studyDockStack));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [
    contextSpaceId,
    dockContextKey,
    editorChromeMode,
    sourceNoteId,
    studyDockStack,
    studyDockStackContextKey,
  ]);

  useEffect(() => {
    onPrototypeActiveHighlightEntryChange?.(activeHighlightEntryId(studyDockStack));
  }, [onPrototypeActiveHighlightEntryChange, studyDockStack]);

  // Hover preview card for scripture pills + note links (+ urlLink later in Phase A).
  // Adds a new affordance without changing existing click behavior.
  const hoverPreviewDisabled = !!(
    selectionActionBar ||
    translationPicker ||
    studyDockStackHasEntries(studyDockStack) ||
    deleteConfirmPill ||
    urlLinkPrompt
  );
  const { preview: hoverPreview, cancelHide: cancelHoverPreviewHide, dismiss: dismissHoverPreview } = useEditorHoverPreview({
    containerRef: tiptapContentRef,
    disabled: hoverPreviewDisabled || !editor,
  });

  // Easton's slug index — loaded once, used to detect single-word selections worth looking up.
  const { data: eastonsIndex } = useEastonsSlugIndex();
  eastonsIndexRef.current = eastonsIndex;

  // When the index finishes loading after the editor mounted, force the suggestion
  // plugin to recompute (a static doc won't otherwise re-run its decoration pass).
  useEffect(() => {
    if (!editor || editor.isDestroyed || !eastonsIndex) return;
    if (editorChromeModeRef.current !== 'prototypeNative') return;
    editor.view.dispatch(editor.state.tr.setMeta(REFERENCE_SUGGESTION_REFRESH_META, true));
  }, [editor, eastonsIndex]);

  const clearSelectionActionBar = useCallback(() => {
    selectionBarRangeRef.current = null;
    setSelectionActionBar(null);
    setShowCreateNoteButton(false);
  }, []);

  const resolveSelectionBarRange = useCallback((): { from: number; to: number; snippet: string } | null => {
    const frozen = selectionBarRangeRef.current;
    if (frozen && frozen.from !== frozen.to) {
      return frozen;
    }
    if (selectionActionBar && selectionActionBar.from !== selectionActionBar.to) {
      return {
        from: selectionActionBar.from,
        to: selectionActionBar.to,
        snippet: selectionActionBar.snippet,
      };
    }
    if (!editor || !isEditorValid(editor)) return null;
    const { from, to } = editor.state.selection;
    if (from === to) {
      if (import.meta.env.DEV) {
        console.warn('[TiptapEditor] selection bar action: empty range');
      }
      return null;
    }
    return {
      from,
      to,
      snippet: noteClipboardPlainTextFromRange(editor.state.doc, from, to),
    };
  }, [selectionActionBar, editor]);

  const applyHighlightMark = useCallback(
    (
      range: { from: number; to: number },
      attrs: { color: string; studyThreadEntryId?: string; reference?: string; linkedNoteId?: string },
      opts?: { focusEditor?: boolean },
    ) => {
      if (!editor || !isEditorValid(editor)) return false;
      const markType = editor.state.schema.marks.highlight;
      if (!markType) return false;
      const { from, to } = range;
      if (from === to) return false;
      const focusEditor = opts?.focusEditor !== false;
      const chain = focusEditor ? editor.chain().focus() : editor.chain();
      // Clear stored marks after applying so the next typed character doesn't inherit the
      // highlight (belt-and-suspenders alongside inclusive:false + the highlightStoredMarks plugin).
      const chained = chain
        .setTextSelection({ from, to })
        .setHighlight(attrs)
        .command(({ tr }) => {
          tr.setStoredMarks([]);
          return true;
        })
        .run();
      if (chained) return true;
      try {
        const tr = editor.state.tr;
        tr.removeMark(from, to, markType);
        tr.addMark(from, to, markType.create(attrs));
        tr.setStoredMarks([]);
        editor.view.dispatch(tr);
        return true;
      } catch {
        return false;
      }
    },
    [editor],
  );

  const releaseEditorFocusForStudyDock = useCallback(() => {
    if (!editor || !isEditorValid(editor)) return;
    try {
      const { to } = editor.state.selection;
      editor.commands.setTextSelection(to);
      const dom = editor.view.dom as HTMLElement | undefined;
      dom?.blur();
    } catch {
      /* ignore */
    }
  }, [editor]);

  /**
   * Hand focus off to a dock the moment one expands, from whatever route opened it.
   *
   * On mobile the entire dock layer is `display: none` while the soft keyboard is up
   * (`html[data-proto-keyboard-open] .proto-shell__study-dock-layer`, prototype-shell.css), so a
   * dock that opens with the editor still focused is simply invisible. Individual open routes
   * (pill tap, highlight tap) already blurred by hand; doing it on the transition covers the ones
   * that didn't — cross-reference taps, reference suggestions, deep links — and any added later.
   * Fires only on the false→true edge, so tapping back into the editor is never fought.
   */
  const anyStudyDockExpanded = studyDockStack.entries.some((e) => e.expanded);
  const prevAnyStudyDockExpandedRef = useRef(false);
  useEffect(() => {
    const wasExpanded = prevAnyStudyDockExpandedRef.current;
    prevAnyStudyDockExpandedRef.current = anyStudyDockExpanded;
    if (!wasExpanded && anyStudyDockExpanded && editorChromeMode === 'prototypeNative') {
      releaseEditorFocusForStudyDock();
    }
  }, [anyStudyDockExpanded, editorChromeMode, releaseEditorFocusForStudyDock]);

  const syncStudyThreadList = useCallback(
    (parentNoteId?: string | null) => {
      notifyStudyThreadListChanged(spaceId, parentNoteId ?? sourceNoteId);
    },
    [spaceId, sourceNoteId],
  );

  const orphanBackfillNoteRef = useRef<string | null>(null);

  useEffect(() => {
    orphanBackfillNoteRef.current = null;
  }, [sourceNoteId]);

  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative' || !sourceNoteId || !spaceId || !editor || !isEditorValid(editor)) {
      return;
    }
    if (orphanBackfillNoteRef.current === sourceNoteId) return;
    orphanBackfillNoteRef.current = sourceNoteId;

    void backfillOrphanHighlights({
      editor,
      sourceNoteId,
      spaceId,
      applyMark: (range, attrs) => applyHighlightMark(range, attrs, { focusEditor: false }),
    }).then((count) => {
      if (count <= 0 || !editor || !isEditorValid(editor)) return;
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = editor.getHTML();
      }
      // Orphan-highlight backfill is an automatic open-time repair, not a user edit.
      onContentChange?.(editor.getHTML(), { programmatic: true });
    });
  }, [editor, editorChromeMode, sourceNoteId, spaceId, applyHighlightMark, onContentChange]);

  /**
   * Persist a reference for the word at `range`: create the server-side `reference`
   * study-thread entry (prototype/native only), apply the `data-reference` highlight mark,
   * and (unless `openDock: false`) open the dock in its saved state. Shared by the
   * typed-suggestion "Save reference" path and saved-reference reopen flows.
   */
  const saveReferenceHighlight = useCallback(
    async (
      range: { from: number; to: number },
      word: string,
      opts?: { openDock?: boolean },
    ): Promise<string | null> => {
      if (!editor || !isEditorValid(editor)) return null;
      const { from, to } = range;
      if (from === to) return null;
      const snippet = editor.state.doc.textBetween(from, to) || word;
      const defaultAccent: StudyHighlightAccentKey = 'warmAmber';

      /*
       * Mark the text and flip the dock to its saved chrome right away — both used to wait on
       * the POST below, so tapping Save did nothing visible until the round trip finished. On
       * anything but a fast connection that reads as "the save didn't work," because the only
       * feedback (the highlight appearing, the checkmark becoming the accent swatch) was tied
       * to the network rather than the tap. `studyThreadEntryId` starts undefined and gets
       * patched in once the id is known, the same tolerance `HighlightDockWeb` already has for
       * the reader's own Annotate flow.
       */
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .setHighlight({ color: defaultAccent, reference: snippet })
        .run();
      onContentChange?.(editor.getHTML());
      if (opts?.openDock !== false) {
        openReferenceDock({
          query: snippet,
          noteHighlightRange: { from, to },
          noteHighlightAccent: defaultAccent,
          studyThreadEntryId: null,
        });
      }

      let studyId: string | null = null;
      if (editorChromeMode === 'prototypeNative' && sourceNoteId) {
        try {
          const res = await fetch(`/api/notes/${sourceNoteId}/study-threads`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              withStudyThreadContext(
                {
                  entryKind: 'reference',
                  sourceSnippet: snippet,
                  highlightAccentRaw: defaultAccent,
                  anchorTextSnapshot: snippet,
                  anchorLocation: from,
                  anchorLength: Math.max(0, to - from),
                  focusTitle: snippet,
                },
                contextSpaceId,
              ),
            ),
          });
          if (res.ok) {
            const data = await res.json();
            studyId = data.studyThread?.id ?? null;
            syncStudyThreadList(sourceNoteId);
          }
        } catch {
          /* fall through to local-only mark */
        }
      }
      if (!studyId) return null;
      if (!editor || !isEditorValid(editor)) return studyId;
      // Backfill the real id onto the mark already showing, so a later tap can resolve it
      // (open its dock, delete it, etc.) rather than finding an anonymous highlight.
      editor
        .chain()
        .setTextSelection({ from, to })
        .setHighlight({ color: defaultAccent, reference: snippet, studyThreadEntryId: studyId })
        .run();
      onContentChange?.(editor.getHTML());
      if (opts?.openDock !== false) {
        openReferenceDock({
          query: snippet,
          noteHighlightRange: { from, to },
          noteHighlightAccent: defaultAccent,
          studyThreadEntryId: studyId,
        });
      }
      return studyId;
    },
    [contextSpaceId, editor, editorChromeMode, sourceNoteId, onContentChange, syncStudyThreadList],
  );

  /** Persist a passage reference from the scripture pill dock (study-thread only, no note mark). */
  const savePassageReference = useCallback(
    async (
      word: string,
      passage: { reference: string; translation: string; sourceNoteId: string },
    ): Promise<string | null> => {
      if (editorChromeMode !== 'prototypeNative') return null;
      // The POST itself lives in `saveReferenceStudyThread`, shared with the Bible reader
      // so both surfaces save the same thing. What stays here is the editor's own part:
      // refreshing this note's thread list once the entry exists.
      const studyId = await saveReferenceStudyThread({
        noteId: passage.sourceNoteId,
        word,
        reference: passage.reference,
        translation: passage.translation,
        spaceId: contextSpaceId,
      });
      if (studyId) syncStudyThreadList(passage.sourceNoteId);
      return studyId;
    },
    [contextSpaceId, editorChromeMode, syncStudyThreadList],
  );

  const handleHoverPreviewOpen = useCallback(() => {
    if (!hoverPreview) return;
    const p = hoverPreview.payload;
    if (hoverPreview.kind === 'url' && p.href) {
      dismissHoverPreview();
      if (isAllowedExternalHref(p.href)) {
        window.open(p.href, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    const rawNoteId = p.noteId || p.scriptureNoteId;
    if (!rawNoteId || rawNoteId === 'pending' || rawNoteId === 'null') {
      dismissHoverPreview();
      return;
    }
    const fullNoteId = rawNoteId.startsWith('note_') ? rawNoteId : `note_${rawNoteId}`;
    let threadContext: string | undefined;
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('thread');
      if (fromQuery && fromQuery.startsWith('thread_')) threadContext = fromQuery;
    } catch { /* ignore */ }
    const currentNoteId = extractIdFromPath(window.location.pathname);
    if (!threadContext && currentNoteId?.startsWith('note_')) {
      try {
        const cached = localStorage.getItem(`harvous-note-thread-${currentNoteId}`);
        if (cached && cached.startsWith('thread_')) threadContext = cached;
      } catch { /* ignore */ }
    }
    if (currentNoteId?.startsWith('note_') && threadContext) {
      pushNavStack(currentNoteId, threadContext);
    }
    if (threadContext && threadContext !== 'thread_unorganized') {
      fetch(`/api/notes/${fullNoteId}/add-thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadContext }),
        credentials: 'include',
      })
        .then((res) => {
          if (res.ok) {
            window.dispatchEvent(
              new CustomEvent('noteAddedToThread', {
                detail: { noteId: fullNoteId, threadId: threadContext, source: 'inlineAddThread' },
              }),
            );
          }
        })
        .catch(() => {});
    }
    dismissHoverPreview();
    safeNavigate(noteUrlForCurrentSurface(fullNoteId, threadContext, currentNoteId || undefined));
  }, [hoverPreview, dismissHoverPreview]);

  /**
   * Raise the href prompt over a range.
   *
   * `explicitRange` is for callers that cannot trust the live selection — the format toolbar
   * collapses it on pointer-down, which is why it freezes a copy first. Callers with focus in
   * the editor (the selection bar, the keyboard shortcut) can leave it out.
   */
  const openUrlLinkPrompt = useCallback((explicitRange?: { from: number; to: number }) => {
    if (!editor || !isEditorValid(editor)) return;
    const { from, to } = explicitRange ?? editor.state.selection;
    if (from === to) return;
    const existingMark = editor.state.doc.rangeHasMark(from, to, editor.state.schema.marks.urlLink);
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const rect = {
      top: Math.min(start.top, end.top),
      left: Math.min(start.left, end.left),
      bottom: Math.max(start.bottom, end.bottom),
      right: Math.max(start.right, end.right),
      width: Math.abs(end.right - start.left),
    };
    let initialHref = '';
    if (existingMark) {
      editor.state.doc.nodesBetween(from, to, (node) => {
        const m = node.marks.find((mk) => mk.type.name === 'urlLink');
        if (m && typeof m.attrs.href === 'string') initialHref = m.attrs.href;
      });
    }
    clearSelectionActionBar();
    setUrlLinkPrompt({
      rect,
      range: { from, to },
      initialHref,
      mode: existingMark ? 'edit' : 'create',
    });
  }, [editor, clearSelectionActionBar]);

  useEffect(() => {
    openUrlLinkPromptRef.current = openUrlLinkPrompt;
  }, [openUrlLinkPrompt]);

  const applyUrlLink = useCallback((rawHref: string) => {
    if (!editor || !urlLinkPrompt) return;
    const href = rawHref.trim();
    if (!href) { setUrlLinkPrompt(null); return; }
    let normalized = href;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    // Strip formatting marks on the range — URL link pills set their own inline styles
    // (font-weight:500, no italics, no underline) so inherited bold/italic/etc. would
    // wrap the pill in <strong>/<em>/etc. without visible effect but polluting the HTML.
    editor
      .chain()
      .focus()
      .setTextSelection(urlLinkPrompt.range)
      .unsetMark('bold')
      .unsetMark('italic')
      .unsetMark('code')
      .unsetMark('strike')
      .unsetMark('underline')
      .setUrlLink({ href: normalized })
      .run();
    setUrlLinkPrompt(null);
  }, [editor, urlLinkPrompt]);

  const removeUrlLinkAtCurrentRange = useCallback(() => {
    if (!editor || !urlLinkPrompt) return;
    editor
      .chain()
      .focus()
      .setTextSelection(urlLinkPrompt.range)
      .unsetUrlLink()
      .run();
    setUrlLinkPrompt(null);
  }, [editor, urlLinkPrompt]);

  // Get the full mark range from a DOM anchor element (used by hover-card remove/edit).
  const getUrlLinkRangeFromAnchorEl = useCallback((anchorEl: HTMLElement): { from: number; to: number } | null => {
    if (!editor) return null;
    try {
      const pos = editor.view.posAtDOM(anchorEl, 0);
      const $pos = editor.state.doc.resolve(pos);
      const markType = editor.state.schema.marks.urlLink;
      if (!markType) return null;
      const range = getMarkRange($pos, markType);
      if (!range) return null;
      return { from: range.from, to: range.to };
    } catch {
      return null;
    }
  }, [editor]);

  const removeUrlLinkFromHoverCard = useCallback(() => {
    if (!editor || !hoverPreview || hoverPreview.kind !== 'url') return;
    const range = getUrlLinkRangeFromAnchorEl(hoverPreview.anchorEl);
    if (!range) return;
    dismissHoverPreview();
    editor.chain().focus().setTextSelection(range).unsetUrlLink().run();
  }, [editor, hoverPreview, getUrlLinkRangeFromAnchorEl, dismissHoverPreview]);

  const editUrlLinkFromHoverCard = useCallback(() => {
    if (!editor || !hoverPreview || hoverPreview.kind !== 'url') return;
    const range = getUrlLinkRangeFromAnchorEl(hoverPreview.anchorEl);
    if (!range) return;
    dismissHoverPreview();
    const start = editor.view.coordsAtPos(range.from);
    const end = editor.view.coordsAtPos(range.to);
    const rect = {
      top: Math.min(start.top, end.top),
      left: Math.min(start.left, end.left),
      bottom: Math.max(start.bottom, end.bottom),
      right: Math.max(start.right, end.right),
      width: Math.abs(end.right - start.left),
    };
    setUrlLinkPrompt({
      rect,
      range,
      initialHref: hoverPreview.payload.href ?? '',
      mode: 'edit',
    });
  }, [editor, hoverPreview, getUrlLinkRangeFromAnchorEl, dismissHoverPreview]);

  // Store editor in ref for handleKeyDown access
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
      // Initialize previous text content reference
      
      // Call onEditorInstanceReady callback to notify parent components
      if (onEditorInstanceReady) {
        onEditorInstanceReady(editor);
      }
    }
    
    // Cleanup tracker and debounce timer when editor is destroyed
    return () => {
      if (id) {
        cleanupTracker(id);
      }
    };
  }, [editor, id, onEditorInstanceReady]);

  const handlePassageQuoteToNote = useCallback(
    (payload: { excerpt: string; reference: string; translation: string }, session: ScripturePillDockSession) => {
      if (!editor || !isEditorValid(editor) || !sourceNoteId) return;
      // `session.readOnly` (a cross-reference card) used to block this outright — but
      // `insertScriptureQuoteAt` doesn't need an existing pill to attribute to: with no
      // `boundaries`, `findScripturePillBoundariesInDoc` below simply won't find one (there
      // isn't one, this passage was never embedded), `shouldOmitScriptureQuoteAttribution`
      // has nothing adjacent to dedupe against, and the quote gets its own fresh scripture
      // pill for `session.reference` instead of pointing at a pill that doesn't exist.

      let boundaries = session.boundaries;
      if (boundaries) {
        boundaries = resolveSourcePillBoundaries(editor, boundaries);
      } else {
        boundaries = findScripturePillBoundariesInDoc(editor, session.reference);
      }

      let sourcePillReference = session.reference;
      let sourcePillTranslation = session.translation;
      let pillAccent: string | null = session.pillAccent ?? null;

      if (boundaries) {
        editor.state.doc.nodesBetween(boundaries.from, boundaries.to, (node: any) => {
          const mark = node.marks?.find((m: any) => m.type?.name === 'scripturePill');
          if (mark) {
            sourcePillReference = mark.attrs.reference ?? sourcePillReference;
            sourcePillTranslation = mark.attrs.translation ?? sourcePillTranslation;
            pillAccent = mark.attrs.pillAccent ?? pillAccent;
          }
        });
      }

      sawUserContentInputRef.current = true;
      pendingEmitUserEditRef.current = true;
      if (contentPropagateRafRef.current != null) {
        cancelAnimationFrame(contentPropagateRafRef.current);
        contentPropagateRafRef.current = null;
      }

      const caretAfter = insertScriptureQuoteAt(editor, {
        excerpt: payload.excerpt,
        reference: payload.reference,
        translation: payload.translation,
        sourceNoteId,
        sourcePillBoundaries: boundaries,
        sourcePillReference,
        sourcePillTranslation,
        attributionPillAccent: pillAccent,
        lastEditorSelection: lastEditorSelectionForQuoteRef.current,
      });

      if (caretAfter == null) return;

      lastEditorSelectionForQuoteRef.current = { from: caretAfter, to: caretAfter, at: Date.now() };
      const html = noteHtmlFromEditor(editor, true);
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = html;
      }
      latestNoteHtmlRef.current = html;
      // User-initiated passage quote — propagate like onApply (not programmatic normalization).
      onContentChange?.(html);

      setStudyDockStack((s) => collapseActiveScriptureIfActive(s));

      try {
        editor.commands.focus();
      } catch {
        /* ignore */
      }

      requestAnimationFrame(() => {
        try {
          const root = editor.view.dom as HTMLElement;
          const blockquotes = root.querySelectorAll('blockquote[data-scripture-quote-accent]');
          const last = blockquotes[blockquotes.length - 1];
          last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch {
          /* ignore */
        }
      });
    },
    [editor, sourceNoteId, onContentChange],
  );

  useEffect(() => {
    if (!editor) return;
    const trackSelectionForQuote = () => {
      if (!isEditorValid(editor)) return;
      const { from, to } = editor.state.selection;
      lastEditorSelectionForQuoteRef.current = { from, to, at: Date.now() };
    };
    editor.on('selectionUpdate', trackSelectionForQuote);
    trackSelectionForQuote();
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', trackSelectionForQuote);
      }
    };
  }, [editor]);

  // Store editor reference on DOM for fallback event injection (backup method)
  useEffect(() => {
    if (!editor || !editor.view || !editor.view.dom) return;

    const dom = editor.view.dom as HTMLElement;
    const editorId = dom.id;

    // Only store for new-note-content editor
    if (editorId !== 'new-note-content') return;

    // Store editor reference on DOM element so fallback can access it
    (dom as any).__tiptapEditor = editor;
  }, [editor, id]);

  // Normalize scripture pill translations after editor hydrates (runs even when HTML already matches props).
  const pillNormalizeContentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || !content) return;
    if (!isEditorValid(editor)) return;
    if (pillNormalizeContentRef.current === content) return;

    const timer = setTimeout(async () => {
      if (!isEditorValid(editor)) return;
      if (editorChromeMode === 'prototypeNative' && studyDockStackHasEntries(studyDockStackRef.current)) {
        return;
      }
      const defaultTrans = getEffectiveDefaultTranslation();
      applyDefaultTranslationToScripturePills(editor, defaultTrans);
      await convertNoteLinksToScripturePills(editor);
      consumeTrailingTranslationAfterPills(editor);
      absorbOrphanSuffixesAfterPills(editor, 'hydrate');
      dispatchScripturePillSpacing(editor, 'hydrate');

      try {
        const incoming = canonicalizeNoteHtmlLineBreaks(content);
        const outgoing = canonicalizeNoteHtmlLineBreaks(noteHtmlFromEditor(editor, true));
        pillNormalizeContentRef.current = content;
        if (outgoing !== incoming && !hasLostBlockGaps(incoming, outgoing)) {
          const liveEditorHtml = noteHtmlFromEditor(editor, true);
          if (contentSyncWouldClobberScripturePillAccent(liveEditorHtml, outgoing)) {
            return;
          }
          if (hiddenInputRef.current) {
            hiddenInputRef.current.value = outgoing;
          }
          // Hydrate-time pill normalization (translation pills, link→pill, spacing) — not a user edit.
          onContentChange?.(outgoing, { programmatic: true });
        }
      } catch {
        /* ignore */
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [editor, content, onContentChange]);

  // Update content from props, but only if it's different and editor is not focused
  // Exception: new-note panel can hydrate prefill from localStorage after the editor mounts empty;
  // onEditorReady may already have focused, so we must still setContent when editor.isEmpty.
  useEffect(() => {
    if (!editor || !content) return;

    if (!isEditorValid(editor)) return;

    const normalizedContent = normalizeEmptyBodyHtmlForEditor(sanitizeScripturePillHtml(safeRenderHtml(content)));
    const currentContent = editor.getHTML();

    if (currentContent === normalizedContent) {
      return;
    }
    if (isTiptapBodyEmpty(currentContent) && isTiptapBodyEmpty(content)) return;

    if (contentSyncWouldClobberInlineImage(currentContent, normalizedContent)) {
      return;
    }

    if (contentSyncWouldClobberScripturePillAccent(currentContent, normalizedContent)) {
      return;
    }

    const isNewNoteEditor = id === 'new-note-content';
    const forceReplaceRevision =
      typeof forceBodyReplaceFromProps === 'number' ? forceBodyReplaceFromProps : 0;
    const pendingForceReplace =
      forceReplaceRevision > 0 &&
      forceReplaceRevision !== lastAppliedForceBodyReplaceRef.current;
    const shouldForceHydratePrefill = shouldForcePrototypeNoteBodyHydrate({
      editorChromeMode,
      editorId: id,
      editorIsEmpty: editor.isEmpty,
      incomingContent: content,
      allowPreviewToFullUpgrade: pendingForceReplace,
    });

    // Study dock normally freezes prop sync so open cards aren't rewritten underneath.
    // Preview→full / empty hydrate must still apply or truncated list HTML can stick.
    if (
      editorChromeMode === 'prototypeNative' &&
      studyDockStackHasEntries(studyDockStackRef.current) &&
      !shouldForceHydratePrefill
    ) {
      return;
    }

    // Prototype always-editing note body: remount on note switch (CardFullEditable key).
    // editContent is a downstream mirror — never rewind live ProseMirror from stale props,
    // except one-time hydrate when the editor is still empty and props have the saved body,
    // or one preview→full upgrade signaled by forceBodyReplaceFromProps.
    if (editorChromeMode === 'prototypeNative' && id === 'edit-note-content' && !shouldForceHydratePrefill) {
      return;
    }

    const proseMirrorFocused =
      typeof document !== 'undefined' && !!document.activeElement?.closest('.ProseMirror');
    // Prototype + classic: live ProseMirror wins while focused — never clobber mid-typing.
    // Also defer while format-toolbar chrome holds focus (portaled bar is outside .ProseMirror).
    if (
      shouldDeferEditorContentSyncForChromeFocus({
        editorIsFocused: editor.isFocused,
        proseMirrorFocused,
        formatToolbarPointerDown: formatToolbarPointerDownRef.current,
        formatToolbarInteractionUntilMs: formatToolbarInteractionUntilRef.current,
        activeElement: typeof document !== 'undefined' ? document.activeElement : null,
      }) &&
      !shouldForceHydratePrefill
    ) {
      return;
    }

    editor.commands.setContent(normalizedContent, { emitUpdate: false });
    if (pendingForceReplace) {
      lastAppliedForceBodyReplaceRef.current = forceReplaceRevision;
    }
    const needsCursorAfterScripturePill =
      isNewNoteEditor && content.includes('scripture-pill');

    const cursorTimeout = setTimeout(() => {
      if (!isEditorValid(editor)) return;
      try {
        if (needsCursorAfterScripturePill) {
          placeCursorAfterLeadingScripturePill(editor);
          editor.commands.focus();
        } else if (!editor.isFocused) {
          placeCaretForEmptyOrEnd(editor, true);
        }
        snapCursorOutsideScripturePill(editor);
      } catch {
        /* ignore */
      }
    }, 100);

    const conversionTimeout = setTimeout(async () => {
      if (isEditorValid(editor)) {
        await convertNoteLinksToScripturePills(editor);
        // Drop/absorb any orphan translation abbreviation left as plain text right after a pill
        // (native-bridged content, or an abbrev typed after an already-resolved pill).
        consumeTrailingTranslationAfterPills(editor);
        absorbOrphanSuffixesAfterPills(editor);
        dispatchScripturePillSpacing(editor, 'hydrate');
      }
    }, 500);

    return () => {
      clearTimeout(cursorTimeout);
      clearTimeout(conversionTimeout);
    };
  }, [editor, content, id, editorChromeMode, forceBodyReplaceFromProps]);

  // When Settings default translation changes, update in-editor pills that still carry NET / prior default.
  useEffect(() => {
    if (!editor) return;

    const handler = (e: Event) => {
      if (!isEditorValid(editor)) return;
      const detail = (e as CustomEvent<{ defaultTranslation?: string; previousDefault?: string }>).detail;
      const defaultTranslation = detail?.defaultTranslation;
      if (!defaultTranslation) return;

      const updated = applyDefaultTranslationToScripturePills(
        editor,
        defaultTranslation,
        detail?.previousDefault,
      );
      const consumed = consumeTrailingTranslationAfterPills(editor);
      if (!updated && !consumed) return;

      try {
        const html = noteHtmlFromEditor(editor, true);
        if (hiddenInputRef.current) {
          hiddenInputRef.current.value = html;
        }
        // Default-translation change repaints existing pills — not a user edit.
        onContentChange?.(html, { programmatic: true });
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('defaultTranslationChanged', handler);
    return () => window.removeEventListener('defaultTranslationChanged', handler);
  }, [editor, onContentChange]);

  // Ensure editor is focused and editable
  useEffect(() => {
    if (editor) {
      // Focus the editor when it receives focus via tab
      const handleFocus = () => {
        editor.commands.focus();
      };
      
      const editorElement = document.querySelector(`#${id} .ProseMirror`);
      if (editorElement) {
        editorElement.addEventListener('focus', handleFocus);
        
        return () => {
          editorElement.removeEventListener('focus', handleFocus);
        };
      }
    }
  }, [editor, id]);

  // Helper function to detect if selection has formatting
  const hasFormatting = (editor: any): boolean => {
    if (!editor) return false;
    
    const { from, to } = editor.state.selection;
    if (from === to) return false;
    
    let hasMarks = false;
    let hasComplexNodes = false;
    
    editor.state.doc.nodesBetween(from, to, (node: any) => {
      // Check for marks (bold, italic, underline, etc.)
      if (node.marks && node.marks.length > 0) {
        hasMarks = true;
      }
      // Check for non-paragraph nodes (lists, headings, etc.)
      if (node.type.name !== 'paragraph' && node.type.name !== 'text') {
        hasComplexNodes = true;
      }
    });
    
    return hasMarks || hasComplexNodes;
  };

  // Selection detection for create note button + floating action bar positioning
  useEffect(() => {
    if (!editor || !enableCreateNoteFromSelection) {
      clearSelectionActionBar();
      return;
    }

    const updateSelection = () => {
      // Check if editor is still valid before accessing it
      if (!isEditorValid(editor)) {
        clearSelectionActionBar();
        return;
      }
      // A dock control rewriting the pill dispatches a transaction whose selectionUpdate
      // would otherwise pop the floating menu over the dock. Mirror the collapse handlers
      // (dismissIfSelectionLeftPill) and bail while a dock interaction is in flight — the
      // studyDockStack-keyed re-eval effect re-shows the bar once the dock closes.
      if (studyDockPointerDownRef.current || skipScriptureDockDismissRef.current) {
        return;
      }
      if (isSelectionActionBarEligible(editor)) {
        setShowCreateNoteButton(true);
        // Position floating action bar below the selection (prototype: 8px gap + clamp like native SelectionActionBar)
        try {
          const { view } = editor;
          const { from, to } = view.state.selection;
          const start = view.coordsAtPos(from);
          const end = view.coordsAtPos(to);
          const bottomEdge = Math.max(start.bottom, end.bottom);
          const gap = editorChromeMode === 'prototypeNative' ? 8 : 6;
          const top = bottomEdge + gap;
          const leftEdge = Math.min(start.left, end.left);
          const rightEdge = Math.max(start.right, end.right);
          let centerX = (leftEdge + rightEdge) / 2;
          if (editorChromeMode === 'prototypeNative') {
            // Measure the bar that is actually on screen; fall back to the historical
            // estimates only for the first pass, before it has ever been rendered. Hard-coded
            // widths went stale every time a button was added and clamped against a bar that
            // no longer existed at that size.
            const hasHl = selectionIntersectsHighlightMark(editor);
            const measured = createNoteBubbleRef.current?.getBoundingClientRect().width ?? 0;
            const barW = measured > 0 ? measured : hasHl ? 134 : 92;
            const inset = 8;
            // The visible band, not the layout viewport: on iOS `innerWidth`/`innerHeight` do
            // not shrink for the keyboard, and the visual viewport can be panned sideways
            // (offsetLeft) while zoomed. Same correction the scripture-draft checkmark applies.
            const box = getVisualViewportBox();
            const minCx = box.left + inset + barW / 2;
            const maxCx = box.left + box.width - inset - barW / 2;
            centerX = Math.min(Math.max(centerX, minCx), maxCx);
          }
          const snippet = noteClipboardPlainTextFromRange(editor.state.doc, from, to);
          const nextBar = { top, left: centerX, from, to, snippet };
          selectionBarRangeRef.current = { from, to, snippet };
          setSelectionActionBar(nextBar);
          if (sharedAnnotationOverlayMode && !hasSeenSharedHighlightTip()) {
            markSharedHighlightTipSeen();
            if (typeof window !== 'undefined' && window.toast) {
              window.toast.info('Highlight to respond');
            }
          }
        } catch (_) {
          clearSelectionActionBar();
        }
      } else {
        // Hide the bar once live selection collapses, but keep selectionBarRangeRef so
        // capture-phase bar handlers can still read the frozen range on the same click.
        setShowCreateNoteButton(false);
        setSelectionActionBar(null);
      }
    };

    runSelectionEvalRef.current = updateSelection;
    editor.on('selectionUpdate', updateSelection);
    updateSelection();

    // Also dismiss on blur/click outside (pointer + mouse for touch parity)
    const handlePointerDownOutside = (e: PointerEvent | MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.selection-action-bar')) return;
      /*
       * Chrome that takes over the pane, and the controls that raise it.
       *
       * These clear immediately rather than falling through to the eligibility re-check
       * below, because that check asks the wrong question here: it asks whether the
       * *selection* is still worth a bar, and the selection survives all of this. Clicking
       * into the Library panel does not collapse it, so the bar stayed up — floating over
       * the panel, still offering to act on text nobody could see. The question that
       * matters is whether the note is still the surface in front of you.
       */
      if (
        target?.closest?.(
          '.study-dock-card, .highlight-dock-web, .study-dock-carousel, .reference-dock-web, .proto-library-sheet, .proto-library-panel, .proto-library-chip, .proto-settings-modal-overlay',
        )
      ) {
        clearSelectionActionBar();
        return;
      }
      // Give a tick for the selection to update before dismissing
      setTimeout(() => {
        if (!isEditorValid(editor)) return;
        if (!isSelectionActionBarEligible(editor)) {
          clearSelectionActionBar();
        }
      }, 100);
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('pointerdown', handlePointerDownOutside);
    // Re-measure when the mobile shell frame resizes itself around the keyboard — no scroll or
    // resize event accompanies that, so the bar would otherwise sit at the pre-settle coords.
    const offSettle = onProtoViewportSettle(updateSelection);
    // The settle event covers the shell resizing itself, but not the keyboard opening or iOS
    // panning the visual viewport to reveal the caret. Both move the band this bar is clamped
    // to while firing nothing else, which is how it ended up drawn a line too high.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', updateSelection);
    vv?.addEventListener('scroll', updateSelection);

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', updateSelection);
      }
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      vv?.removeEventListener('resize', updateSelection);
      vv?.removeEventListener('scroll', updateSelection);
      offSettle();
    };
  }, [editor, enableCreateNoteFromSelection, editorChromeMode, clearSelectionActionBar]);

  // Re-evaluate the selection action bar when the study dock opens/closes (e.g. re-show it for a still
  // -active selection after a dock dismiss) without rewiring the listener-registration effect above.
  useEffect(() => {
    runSelectionEvalRef.current();
  }, [studyDockStack]);

  /*
   * Spotlight the expanded highlight: while a highlight/reference dock is expanded, dim every
   * other highlight underline to neutral so only the active one keeps its colour.
   *
   * Tag a container with `data-dim-highlights="<id>"` and inject a per-id restore rule. Driving
   * it by attribute plus an injected style survives ProseMirror re-rendering its own DOM, which
   * mutating each mark node would not.
   *
   * The dim rule itself is NOT here — it lives in `src/styles/mark-spotlight.css` and applies to
   * any container carrying the attribute, not to the note body alone. That file is the contract;
   * this effect is one of its drivers. The restore rule injected below is deliberately written
   * without a surface prefix for the same reason: the dock can now be spotlit by the same pair,
   * because its accents route through `--mark-accent` instead of being written straight onto
   * `text-decoration-color`.
   */
  const dimHighlightStyleRef = useRef<HTMLStyleElement | null>(null);
  useEffect(() => {
    if (!editor || !isEditorValid(editor)) return;
    const dom = editor.view.dom as HTMLElement;
    const active = studyDockStack.entries.find((e) => e.id === studyDockStack.activeId);
    const activeHighlightId =
      active &&
      active.expanded &&
      (active.kind === 'highlight' || active.kind === 'reference')
        ? active.session.studyThreadEntryId ?? null
        : null;

    if (activeHighlightId) {
      dom.setAttribute('data-dim-highlights', activeHighlightId);
      if (!dimHighlightStyleRef.current) {
        const el = document.createElement('style');
        el.dataset.dimHighlights = '';
        document.head.appendChild(el);
        dimHighlightStyleRef.current = el;
      }
      const esc =
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(activeHighlightId) : activeHighlightId;
      /* No surface prefix: any container with this id restores its own mark. `!important` to
         match the dim it is undoing — the two must be equally weighted or which one wins would
         depend on sheet order. */
      dimHighlightStyleRef.current.textContent =
        `[data-dim-highlights="${esc}"] [data-study-thread-id="${esc}"]` +
        `{text-decoration-color:var(--mark-accent)!important}`;
    } else {
      dom.removeAttribute('data-dim-highlights');
      if (dimHighlightStyleRef.current) dimHighlightStyleRef.current.textContent = '';
    }
  }, [editor, studyDockStack]);

  useEffect(
    () => () => {
      dimHighlightStyleRef.current?.remove();
      dimHighlightStyleRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!editor || !isEditorValid(editor) || editorChromeMode !== 'prototypeNative') return;
    const sync = () => syncStudyHighlightMarksOverlayCovered(editor, sharedOverlayPmRanges);
    sync();
    editor.on('update', sync);
    return () => {
      editor.off('update', sync);
    };
  }, [editor, editorChromeMode, sharedOverlayPmRanges]);

  /** When CardFullEditable opens the editor from read-only preview after a scripture pill tap (prototype), open the dock once TipTap has rendered the pill in the doc. */
  useEffect(() => {
    if (
      !editor ||
      !isEditorValid(editor) ||
      editorChromeMode !== 'prototypeNative' ||
      !prototypeScripturePillOpenRequest
    ) {
      return;
    }
    const req = prototypeScripturePillOpenRequest;
    const crossRefTargetRef = prototypeCrossRefTarget?.reference?.trim() || null;
    let cancelled = false;
    let rafId = 0;
    // Poll a few frames for the matching pill: when navigated from the sidebar Highlights list the
    // note content (and its pills) render a little after the editor mounts, so a single rAF can miss.
    const MAX_ATTEMPTS = 90; // ~1.5s at 60fps
    const openSourceDock = (session: ScripturePillDockSession) => {
      setTranslationPicker(null);
      suppressScriptureDockDismiss();
      setStudyDockStack((s) =>
        openSourceScriptureDockWithOptionalCrossRef(
          s,
          session,
          crossRefTargetRef,
          req.noteId ?? sourceNoteId ?? null,
          req.translation,
        ),
      );
      onPrototypeScripturePillOpenRequestConsumed?.();
    };
    const run = (attempt: number) => {
      if (cancelled || !isEditorValid(editor)) return;
      const root = editor.view.dom as HTMLElement;
      const pills = root.querySelectorAll('.scripture-pill');
      let pillEl: HTMLElement | null = null;
      pills.forEach((p) => {
        if (pillEl) return;
        const pillRef = p.getAttribute('data-scripture-reference') ?? '';
        if (
          pillRef === req.reference ||
          scriptureReferenceContainsReference(pillRef, req.reference)
        ) {
          pillEl = p as HTMLElement;
        }
      });
      if (!pillEl) {
        if (attempt < MAX_ATTEMPTS) {
          rafId = window.requestAnimationFrame(() => run(attempt + 1));
        } else if (crossRefTargetRef) {
          openSourceDock(
            buildReadOnlyScriptureSession(req.reference, req.translation, req.noteId ?? sourceNoteId ?? null),
          );
        } else {
          onPrototypeScripturePillOpenRequestConsumed?.();
          onPrototypeScripturePillOpenRequestUnresolved?.();
        }
        return;
      }
      const boundaries = resolveScripturePillDOMRange(editor, pillEl);
      if (!boundaries || cancelled) return;
      const pillReference = pillEl.getAttribute('data-scripture-reference') ?? req.reference;
      openSourceDock({
        boundaries,
        reference: pillReference,
        translation: req.translation,
        noteId: req.noteId,
        pillAccent: req.pillAccent,
      });
    };
    rafId = window.requestAnimationFrame(() => {
      rafId = window.requestAnimationFrame(() => run(0));
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [
    editor,
    editorChromeMode,
    prototypeScripturePillOpenRequest,
    prototypeCrossRefTarget,
    sourceNoteId,
    onPrototypeScripturePillOpenRequestConsumed,
    onPrototypeScripturePillOpenRequestUnresolved,
  ]);

  // Open the dock that corresponds to a highlight mark. Shared by the in-editor click handler
  // and the deep-link consumer below so a tap from elsewhere (e.g. the Home "revisit" card)
  // opens exactly what an in-note tap would: reference dock, connected-note popup, or highlight dock.
  const openStudyDockForHighlightMark = useCallback(
    (markInPm: HTMLElement) => {
      if (!editor || !isEditorValid(editor)) return;
      const markColor = markInPm.getAttribute('data-color');
      const markReference = markInPm.getAttribute('data-reference');
      // Reference highlights (looked-up words) open the reference dock with highlight controls.
      // - New format: data-reference="word" (created via "Look up")
      // - Legacy format: data-color="referenceHighlight" (pre-refactor, word inferred from text)
      const isReference = !!markReference || markColor === 'referenceHighlight';
      if (isReference) {
        const word = markReference || markInPm.textContent?.trim() || '';
        const markStudyId = markInPm.getAttribute('data-study-thread-id');
        const noteRange = (() => {
          try {
            const pos = editor.view.posAtDOM(markInPm, 0);
            const $p = editor.state.doc.resolve(pos);
            const markType = editor.state.schema.marks.highlight;
            if (!markType) return null;
            const r = getMarkRange($p, markType);
            if (r && typeof r.from === 'number' && typeof r.to === 'number') {
              return { from: r.from, to: r.to };
            }
          } catch {
            /* ignore */
          }
          return null;
        })();
        const accent = isStudyHighlightAccentKey(markColor) ? markColor : 'warmAmber';
        openReferenceDock({
          query: word,
          noteHighlightRange: noteRange,
          noteHighlightAccent: accent,
          studyThreadEntryId: markStudyId,
        });
        setTranslationPicker(null);
        return;
      }
      const linkedNoteId = markInPm.getAttribute('data-linked-note-id');
      if (linkedNoteId) {
        // Connected-note highlight: show floating popup instead of opening the dock.
        const studyThreadId = markInPm.getAttribute('data-study-thread-id') ?? '';
        const accent = isStudyHighlightAccentKey(markColor) ? markColor : 'violet';
        const domRect = markInPm.getBoundingClientRect();
        const markRange = (() => {
          try {
            const pos = editor.view.posAtDOM(markInPm, 0);
            const $p = editor.state.doc.resolve(pos);
            const mType = editor.state.schema.marks.highlight;
            if (!mType) return null;
            const r = getMarkRange($p, mType);
            return r && typeof r.from === 'number' ? { from: r.from, to: r.to } : null;
          } catch {
            return null;
          }
        })();
        setConnectedNoteHighlightPopup({
          studyThreadId,
          linkedNoteId,
          accent,
          anchorRect: {
            top: domRect.top,
            left: domRect.left,
            bottom: domRect.bottom,
            right: domRect.right,
            width: domRect.width,
            height: domRect.height,
          },
          from: markRange?.from ?? 0,
          to: markRange?.to ?? 0,
        });
        setTranslationPicker(null);
        return;
      }
      const highlightExcerpt = markInPm.textContent || '';
      const highlightSession: HighlightDockSession = {
        studyThreadEntryId: markInPm.getAttribute('data-study-thread-id'),
        accent: markColor || 'warmAmber',
        excerpt: highlightExcerpt,
        entryKind: 'miniNote',
        focusTitle: deriveHighlightFocusTitle(highlightExcerpt),
        miniNoteBody: '',
        range: (() => {
          try {
            const pos = editor.view.posAtDOM(markInPm, 0);
            const $p = editor.state.doc.resolve(pos);
            const markType = editor.state.schema.marks.highlight;
            if (!markType) return null;
            const r = getMarkRange($p, markType);
            if (r && typeof r.from === 'number' && typeof r.to === 'number') {
              return { from: r.from, to: r.to };
            }
          } catch {
            /* ignore */
          }
          return null;
        })(),
      };
      setStudyDockStack((s) => openOrFocusHighlight(s, highlightSession));
      setTranslationPicker(null);
    },
    [editor, openReferenceDock],
  );

  /** Deep-link open: when arriving with a highlight-dock request (e.g. tapping a highlight in the Home
   *  "revisit" card), find the matching highlight mark by study-thread id and open its dock once.
   *  Polls for the mark like the scripture consumer above, since the note content renders after mount. */
  useEffect(() => {
    if (
      !editor ||
      !isEditorValid(editor) ||
      editorChromeMode !== 'prototypeNative' ||
      !prototypeHighlightOpenRequest
    ) {
      return;
    }
    const req = prototypeHighlightOpenRequest;
    let cancelled = false;
    let rafId = 0;
    const MAX_ATTEMPTS = 120; // ~2s at 60fps — allow prototype body hydrate to finish
    const openFromDeepLink = (range: { from: number; to: number } | null, markEl: HTMLElement | null) => {
      /* Set on every path, including the mark path: whichever way the dock ends up open, an
         "Add a thought" card asked for the note field, not merely for the card. */
      if (req.focusMiniNote) setFocusMiniNoteThreadId(req.studyThreadEntryId);
      if (markEl && !sharedAnnotationOverlayMode) {
        openStudyDockForHighlightMark(markEl);
        return;
      }
      const session = buildHighlightDockSessionForDeepLink(req.studyThreadEntryId, req.metadata, range);
      setStudyDockStack((s) => openOrFocusHighlight(s, session));
    };
    const skipMarkPoll = shouldOpenHighlightRequestImmediately({
      range: req.range,
      metadata: req.metadata,
      sharedAnnotationOverlayMode,
    });
    if (skipMarkPoll) {
      openFromDeepLink(req.range ?? null, null);
      onPrototypeHighlightOpenRequestConsumed?.();
      return () => {
        cancelled = true;
      };
    }
    const run = (attempt: number) => {
      if (cancelled || !isEditorValid(editor)) return;
      const range = findHighlightRangeByStudyThreadId(editor, req.studyThreadEntryId);
      if (range) {
        const root = editor.view.dom as HTMLElement;
        const markEl = root.querySelector(
          `mark[data-study-thread-id="${CSS.escape(req.studyThreadEntryId)}"]`,
        ) as HTMLElement | null;
        openFromDeepLink(range, markEl);
        onPrototypeHighlightOpenRequestConsumed?.();
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        rafId = window.requestAnimationFrame(() => run(attempt + 1));
      } else {
        openFromDeepLink(null, null);
        onPrototypeHighlightOpenRequestConsumed?.();
      }
    };
    rafId = window.requestAnimationFrame(() => {
      rafId = window.requestAnimationFrame(() => run(0));
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [
    editor,
    editorChromeMode,
    prototypeHighlightOpenRequest,
    openStudyDockForHighlightMark,
    onPrototypeHighlightOpenRequestConsumed,
    sharedAnnotationOverlayMode,
  ]);

  // Handle ALL scripture pill clicks via DOM click handler (both edit and read-only).
  // We use the CAPTURE phase on the wrapper div so our handler fires BEFORE
  // ProseMirror's internal click processing. user-select:none on pill spans
  // causes ProseMirror to report positions outside the mark boundary, making its
  // handleClick unreliable for pills. This DOM handler bypasses that entirely.
  //   Edit mode → show translation picker
  //   Read-only → navigate to the scripture note
  useEffect(() => {
    if (!editor) return;
    const wrapperDiv = tiptapContentRef.current;
    if (!wrapperDiv) return;

    const handlePillPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;

      const mentionSpan = target.closest('.mention-pill') as HTMLElement | null;
      if (mentionSpan) {
        if (!pointerIsInsideElementRect(e, mentionSpan)) return;
        const kind = mentionSpan.getAttribute('data-mention-kind');
        const entityId = mentionSpan.getAttribute('data-mention-id');
        const mentionSpaceId = mentionSpan.getAttribute('data-mention-space-id');
        if (!kind || !entityId) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (onMentionPillClickRef.current) {
          onMentionPillClickRef.current({
            kind: kind as MentionPillClickPayload['kind'],
            entityId,
            spaceId: mentionSpaceId,
            label: mentionSpan.textContent || '',
          });
        } else if (kind === 'note') {
          // Classic-shell fallback: navigate directly to the note (mirrors TiptapNoteLink).
          const fullNoteId = entityId.startsWith('note_') ? entityId : `note_${entityId}`;
          safeNavigate(idToUrl(fullNoteId));
        }
        return;
      }

      const pillSpan = target.closest('.scripture-pill') as HTMLElement | null;
      if (pillSpan) {
        const reference = pillSpan.getAttribute('data-scripture-reference');
        const translation = pillSpan.getAttribute('data-scripture-translation');
        const noteId = pillSpan.getAttribute('data-note-id');
        const pillAccent = pillSpan.getAttribute('data-pill-accent');
        if (!reference) return;
        if (!pointerIsInsideElementRect(e, pillSpan)) {
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        if (editor.isEditable) {
          if (editorChromeMode === 'prototypeNative') {
            setTranslationPicker(null);
            const boundaries = resolveScripturePillDOMRange(editor, pillSpan);
            if (boundaries) {
              suppressScriptureDockDismiss();
              const session: ScripturePillDockSession = {
                boundaries,
                reference,
                translation,
                noteId,
                pillAccent,
              };
              setStudyDockStack((s) => openOrFocusScripture(s, session));
              // Tapping a pill should show only the dock — not the keyboard or the formatting
              // bar. Pills are `user-select: all`, so iOS selects the pill on tap (→ non-empty
              // selection → formatting bar) and keeps the editor focused (→ keyboard). Blur the
              // editor and clear the native selection, deferred so it runs AFTER iOS applies the
              // tap selection. Mirrors the highlight-creation path.
              requestAnimationFrame(() => {
                try {
                  window.getSelection()?.removeAllRanges();
                } catch {
                  /* ignore */
                }
                releaseEditorFocusForStudyDock();
              });
            }
          } else {
            setStudyDockStack(emptyStudyDockStack());
            const rect = pillSpan.getBoundingClientRect();
            setTranslationPicker({
              rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, width: rect.width },
              translation,
              noteId,
              reference,
            });
          }
        } else {
          // Read-only mode. In the prototype shell a pill still opens its passage —
          // as a read-only dock card, in place. There is no pill range to write back
          // to (and a reader must not restyle someone else's pill), so the session
          // carries `boundaries: null`. Needs only `reference`, matching the editable
          // branch: a pill authored through the dock flow never gets a `data-note-id`,
          // and the legacy bail below would silently swallow the tap.
          if (editorChromeMode === 'prototypeNative') {
            setTranslationPicker(null);
            suppressScriptureDockDismiss();
            setStudyDockStack((s) =>
              openOrFocusScripture(s, buildReadOnlyScriptureSession(reference, translation, noteId)),
            );
            return;
          }

          // Classic shell: navigate to the scripture note
          if (!noteId || noteId === 'pending' || noteId === 'null') return;

          // Determine thread context from URL/cache/DOM
          let threadContext: string | undefined;
          try {
            const fromQuery = new URLSearchParams(window.location.search).get('thread');
            if (fromQuery && fromQuery.startsWith('thread_')) {
              threadContext = fromQuery;
            }
          } catch {
            // ignore
          }
          const currentNoteId = extractIdFromPath(window.location.pathname);
          if (!threadContext && currentNoteId?.startsWith('note_')) {
            try {
              const cached = localStorage.getItem(`harvous-note-thread-${currentNoteId}`);
              if (cached && cached.startsWith('thread_')) {
                threadContext = cached;
              }
            } catch {
              // ignore
            }
          }
          const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
          if (!threadContext && noteElement?.dataset.parentThreadId) {
            threadContext = noteElement.dataset.parentThreadId;
          } else {
            const navElement = document.querySelector('[slot="navigation"]') as HTMLElement;
            if (!threadContext && navElement?.dataset.parentThreadId) {
              threadContext = navElement.dataset.parentThreadId;
            } else {
              const pathname = window.location.pathname;
              if (pathname && pathname !== '/' && !pathname.includes('/dashboard') &&
                  !pathname.includes('/sign-in') && !pathname.includes('/sign-up')) {
                const itemId = extractIdFromPath(pathname);
                if (itemId && itemId !== 'dashboard' &&
                    !itemId.startsWith('note_') && !itemId.startsWith('space_')) {
                  threadContext = itemId;
                }
              }
            }
          }

          // Push current note onto nav stack for breadcrumb-style back navigation
          if (currentNoteId?.startsWith('note_') && threadContext) {
            pushNavStack(currentNoteId, threadContext);
          }
          const fullNoteId = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
          if (threadContext && threadContext !== 'thread_unorganized') {
            fetch(`/api/notes/${fullNoteId}/add-thread`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ threadId: threadContext }),
              credentials: 'include',
            })
              .then((res) => {
                if (res.ok) {
                  window.dispatchEvent(
                    new CustomEvent('noteAddedToThread', {
                      detail: { noteId: fullNoteId, threadId: threadContext, source: 'inlineAddThread' },
                    }),
                  );
                }
              })
              .catch(() => {});
          }
          const url = noteUrlForCurrentSurface(fullNoteId, threadContext, currentNoteId || undefined);
          safeNavigate(url);
        }
        return;
      }

      // Typed reference suggestion (dotted underline) — not yet saved. Tapping opens the
      // reference dock in pending mode with a "Save reference" action. The decoration is
      // a plain span (not a mark), so derive the range from posAtDOM + text length.
      const suggestionSpan = target.closest('.reference-suggestion') as HTMLElement | null;
      if (suggestionSpan && editorChromeMode === 'prototypeNative' && editor.isEditable) {
        if (!pointerIsInsideElementRect(e, suggestionSpan)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const word =
          suggestionSpan.getAttribute('data-reference-word') ||
          suggestionSpan.textContent?.trim() ||
          '';
        if (!word) return;
        let range: { from: number; to: number } | null = null;
        try {
          const from = editor.view.posAtDOM(suggestionSpan, 0);
          const to = from + (suggestionSpan.textContent?.length ?? word.length);
          range = { from, to };
        } catch {
          range = null;
        }
        setTranslationPicker(null);
        openReferenceDock({ query: word, pendingSuggestion: range });
        // On touch, opening a dock should show the dock — not the dock and a keyboard fighting
        // for the same half of the screen. Mirrors the highlight-mark path below; deferred a
        // frame because iOS applies its own tap selection after this handler returns, and a
        // blur issued before that just gets undone.
        if (isTouchPointerEvent(e)) {
          requestAnimationFrame(() => {
            try {
              window.getSelection()?.removeAllRanges();
            } catch {
              /* ignore */
            }
            releaseEditorFocusForStudyDock();
          });
        }
        return;
      }

      const markInPm = target.closest('.ProseMirror mark') as HTMLElement | null;
      if (markInPm && editorChromeMode === 'prototypeNative' && editor.isEditable) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openStudyDockForHighlightMark(markInPm);
        // Tapping a highlight should show only the dock — not the keyboard. Mirror the
        // scripture-pill path: clear the native tap-selection and blur the editor,
        // deferred so it runs after iOS/the browser applies the tap selection.
        requestAnimationFrame(() => {
          try {
            window.getSelection()?.removeAllRanges();
          } catch {
            /* ignore */
          }
          releaseEditorFocusForStudyDock();
        });
      }
    };

    let touchHandledPill: HTMLElement | null = null;

    /**
     * Inline targets that own their own tap and must beat ProseMirror to it.
     *
     * A committed pill was the only one here, so a suggestion tap had no touchstart path at
     * all and fell through to the synthesized `click` — which arrives *after* ProseMirror has
     * already handled the touch, placed a caret inside the word, and raised the keyboard. The
     * dock then opened underneath a keyboard nobody asked for, which is what "tapping a
     * suggested reference is funky" looked like from the outside.
     */
    const TOUCH_OWNED_INLINE_TARGETS = '.scripture-pill, .reference-suggestion, .mention-pill';

    const handlePillTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const pillSpan = target.closest(TOUCH_OWNED_INLINE_TARGETS) as HTMLElement | null;
      if (!pillSpan) return;
      handlePillPointer(e);
      touchHandledPill = pillSpan;
      window.setTimeout(() => {
        touchHandledPill = null;
      }, 400);
    };

    // iOS refuses to refocus a contenteditable on the first tap after a programmatic blur
    // (we blur when a pill tap opens the dock). So a tap *next to* a pill places no caret and
    // shows no keyboard. If a plain editor tap didn't focus the editor, force focus + caret at
    // the tapped position. ProseMirror focuses on pointerdown (before click), so isFocused is
    // already true in the normal case and this no-ops.
    const focusEditorAtTapFallback = (clientX: number, clientY: number, target: HTMLElement) => {
      if (!editor || editor.isDestroyed || !editor.isEditable || editor.isFocused) return;
      if (
        target.closest('.scripture-pill') ||
        target.closest('.mention-pill') ||
        target.closest('.reference-suggestion') ||
        target.closest('.study-dock-card') ||
        target.closest('.study-dock-carousel') ||
        target.closest('.scripture-pill-chrome') ||
        target.closest('.reference-dock-web') ||
        target.closest('.highlight-dock-web') ||
        target.closest('.harvous-menu-pill__sheet-backdrop') ||
        target.closest('.ProseMirror mark')
      ) {
        return;
      }
      try {
        const posInfo = editor.view.posAtCoords({ left: clientX, top: clientY });
        editor.view.focus();
        if (posInfo) editor.commands.setTextSelection(posInfo.pos);
      } catch {
        try {
          editor.view.focus();
        } catch {
          /* ignore */
        }
      }
    };

    const handlePillClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Match the same set touchstart claims, so the dedupe below covers every target that
      // was already handled there — otherwise a suggestion opens its dock twice on one tap.
      const pillSpan = target.closest(TOUCH_OWNED_INLINE_TARGETS) as HTMLElement | null;
      if (pillSpan && touchHandledPill === pillSpan) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      handlePillPointer(e);
      if (!pillSpan) focusEditorAtTapFallback(e.clientX, e.clientY, target);
    };

    const handleDismiss = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.scripture-delete-confirm')) {
        return;
      }
      if (
        target.closest('.scripture-translation-picker') ||
        target.closest('.scripture-pill-chrome') ||
        target.closest('.study-dock-card') ||
        target.closest('.scripture-pill') ||
        target.closest('.highlight-dock-web') ||
        target.closest('.study-dock-carousel') ||
        target.closest('.reference-dock-web') ||
        target.closest('.harvous-menu-pill__sheet-backdrop') ||
        target.closest('.harvous-menu-pill__menu--portal')
      ) {
        // Keep open
      } else {
        setTranslationPicker(null);
      }
      if (!target.closest('.scripture-pill')) {
        setDeleteConfirmPill(null);
        deleteConfirmPillRef.current = null;
      }
    };

    // Use capture phase so we intercept pill taps before ProseMirror
    wrapperDiv.addEventListener('touchstart', handlePillTouchStart, { capture: true, passive: false });
    wrapperDiv.addEventListener('click', handlePillClick, true);
    document.addEventListener('mousedown', handleDismiss);
    return () => {
      wrapperDiv.removeEventListener('touchstart', handlePillTouchStart, { capture: true });
      wrapperDiv.removeEventListener('click', handlePillClick, true);
      document.removeEventListener('mousedown', handleDismiss);
    };
  }, [editor, editorChromeMode, openStudyDockForHighlightMark]);

  // @ mention typeahead: watch doc/selection changes for an `@query` ending at the caret.
  // Scan-on-update (not keydown interception) so native mobile keyboard behavior is untouched.
  useEffect(() => {
    if (!editor) return;

    const closeMentionPicker = () => {
      if (mentionFetchTimerRef.current != null) {
        clearTimeout(mentionFetchTimerRef.current);
        mentionFetchTimerRef.current = null;
      }
      mentionQueryTokenRef.current++;
      if (mentionPickerRef.current) {
        mentionPickerRef.current = null;
        setMentionPicker(null);
      }
    };

    const syncMentionPicker = () => {
      try {
        if (!isEditorValid(editor)) return;
        const source = mentionSourceRef.current;
        if (!source || !editor.isEditable) {
          closeMentionPicker();
          return;
        }
        // An inline scripture draft owns the caret — never stack the two flows.
        if (hasActiveScriptureDraft(editor.state)) {
          closeMentionPicker();
          return;
        }
        const trigger = findMentionTrigger(editor.state);
        if (!trigger) {
          mentionDismissedAtRef.current = null;
          closeMentionPicker();
          return;
        }
        if (mentionDismissedAtRef.current != null) {
          if (mentionDismissedAtRef.current === trigger.from) return;
          mentionDismissedAtRef.current = null;
        }
        let rect: MentionPickerState['rect'];
        try {
          const coords = editor.view.coordsAtPos(trigger.from);
          rect = { top: coords.top, left: coords.left, bottom: coords.bottom, right: coords.right, width: 0 };
        } catch {
          closeMentionPicker();
          return;
        }
        const prev = mentionPickerRef.current;
        const queryChanged = !prev || prev.query !== trigger.query;
        // A new @ position (not just a longer/shorter query at the same @) resets the kind tab —
        // switching tabs mid-query for one mention shouldn't carry over to the next one.
        const isNewTriggerPosition = !prev || prev.range.from !== trigger.from;
        const next: MentionPickerState = {
          range: { from: trigger.from, to: trigger.to },
          query: trigger.query,
          rect,
          items: prev ? prev.items : [],
          kindFilter: isNewTriggerPosition ? 'all' : prev.kindFilter,
          activeIndex: !prev || queryChanged ? 0 : prev.activeIndex,
        };
        mentionPickerRef.current = next;
        setMentionPicker(next);

        if (queryChanged) {
          if (mentionFetchTimerRef.current != null) clearTimeout(mentionFetchTimerRef.current);
          const token = ++mentionQueryTokenRef.current;
          const query = trigger.query;
          mentionFetchTimerRef.current = window.setTimeout(() => {
            mentionFetchTimerRef.current = null;
            Promise.resolve()
              .then(() => source(query))
              .then((items) => {
                if (token !== mentionQueryTokenRef.current) return;
                const cur = mentionPickerRef.current;
                if (!cur || cur.query !== query) return;
                const list = items || [];
                const updated: MentionPickerState = { ...cur, items: list };
                updated.activeIndex = Math.min(cur.activeIndex, Math.max(0, visibleMentionItems(updated).length - 1));
                mentionPickerRef.current = updated;
                setMentionPicker(updated);
              })
              .catch(() => {
                /* ignore — picker simply stays empty */
              });
          }, 120);
        }
      } catch {
        /* ignore */
      }
    };

    const closeOnBlur = () => closeMentionPicker();

    editor.on('update', syncMentionPicker);
    editor.on('selectionUpdate', syncMentionPicker);
    editor.on('blur', closeOnBlur);
    return () => {
      editor.off('update', syncMentionPicker);
      editor.off('selectionUpdate', syncMentionPicker);
      editor.off('blur', closeOnBlur);
      closeMentionPicker();
    };
  }, [editor]);

  /** Close scripture dock when the caret/selection leaves the tapped pill (prototype web). */
  useEffect(() => {
    if (!editor || editorChromeMode !== 'prototypeNative') return;

    const isPassageInteractionActive = (): boolean => {
      if (studyDockPointerDownRef.current) return true;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.scripture-pill-chrome__passage')) {
        return true;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
      const node = sel.getRangeAt(0).commonAncestorContainer;
      const el =
        node.nodeType === Node.TEXT_NODE
          ? (node as Text).parentElement
          : node instanceof HTMLElement
            ? node
            : null;
      return !!el?.closest('.scripture-pill-chrome__passage');
    };

    const dismissIfSelectionLeftPill = () => {
      if (!isEditorValid(editor)) return;
      // Non-consuming guard: the suppression window (suppressScriptureDockDismiss) owns the reset
      // on a RAF, so the whole cascade of selection updates from one programmatic edit is covered.
      if (skipScriptureDockDismissRef.current) return;
      if (isPassageInteractionActive()) return;
      const stack = studyDockStackRef.current;
      const active = stack.entries.find((e) => e.id === stack.activeId);
      if (active?.kind === 'scripture' && active.expanded && !editor.isFocused) {
        return;
      }
      if (active?.kind === 'scripture' && active.session.boundaries && !active.session.readOnly) {
        // Only collapse when the caret/selection has genuinely moved OFF the active pill. Spurious
        // selectionUpdates (focus re-sync from clicking dock chrome like the accent swatch, or the
        // snapCaretOutsidePill nudge to the pill edge) keep the caret at/adjacent to the pill.
        try {
          const range = resolveScripturePillMarkRangeFromBoundaries(editor, active.session.boundaries);
          const { from, to } = editor.state.selection;
          if (from >= range.from - 1 && to <= range.to + 1) {
            return;
          }
        } catch {
          /* fall through to the interaction check */
        }
        // The caret left the pill — but only collapse if a genuine user interaction in the editor
        // body caused it. A programmatic caret jump (e.g. a post-save setContent injection that
        // resets the caret to the doc end) fires asynchronously with no preceding pointer/key input
        // in .ProseMirror, so it must NOT collapse an open dock.
        if (Date.now() - editorBodyInteractedAtRef.current > 600) {
          return;
        }
      }
      setStudyDockStack((s) => collapseActiveScriptureIfActive(s));
    };

    const snapCaretOutsidePill = () => {
      if (!isEditorValid(editor)) return;
      // Honor the suppression window: snapping during a programmatic apply dispatches its own
      // transaction, which would emit a second selection update and collapse the dock.
      if (skipScriptureDockDismissRef.current) return;
      if (isPassageInteractionActive()) return;
      const stack = studyDockStackRef.current;
      const active = stack.entries.find((e) => e.id === stack.activeId);
      if (active?.kind === 'scripture' && active.expanded && !editor.isFocused) return;
      snapCursorOutsideScripturePill(editor);
    };

    // Record genuine user interaction inside the editor body so dismissIfSelectionLeftPill can tell a
    // user navigating off the pill from a programmatic caret jump (e.g. post-save setContent).
    const markEditorBodyInteraction = (e: Event) => {
      if (e.isTrusted) editorBodyInteractedAtRef.current = Date.now();
    };
    // Flag genuine, user-initiated CONTENT edits. `beforeinput` fires for typing, deletion, paste and
    // IME — but NOT for programmatic transactions — so onUpdate can treat any doc change without a
    // preceding trusted input as programmatic (hydrate normalization, etc.) and not mark the note dirty.
    const markUserContentInput = (e: Event) => {
      if (e.isTrusted) sawUserContentInputRef.current = true;
    };
    const editorDom = editor.view.dom as HTMLElement;
    editorDom.addEventListener('mousedown', markEditorBodyInteraction, true);
    editorDom.addEventListener('keydown', markEditorBodyInteraction, true);
    editorDom.addEventListener('touchstart', markEditorBodyInteraction, { capture: true, passive: true });
    editorDom.addEventListener('beforeinput', markUserContentInput, true);
    editorDom.addEventListener('paste', markUserContentInput, true);
    editorDom.addEventListener('drop', markUserContentInput, true);
    editorDom.addEventListener('cut', markUserContentInput, true);

    editor.on('selectionUpdate', dismissIfSelectionLeftPill);
    editor.on('selectionUpdate', snapCaretOutsidePill);
    return () => {
      editorDom.removeEventListener('mousedown', markEditorBodyInteraction, true);
      editorDom.removeEventListener('keydown', markEditorBodyInteraction, true);
      editorDom.removeEventListener('touchstart', markEditorBodyInteraction, true);
      editorDom.removeEventListener('beforeinput', markUserContentInput, true);
      editorDom.removeEventListener('paste', markUserContentInput, true);
      editorDom.removeEventListener('drop', markUserContentInput, true);
      editorDom.removeEventListener('cut', markUserContentInput, true);
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', dismissIfSelectionLeftPill);
        editor.off('selectionUpdate', snapCaretOutsidePill);
      }
    };
  }, [editor, editorChromeMode]);

  // Inline edit-mode (draft) lifecycle: confirm a draft when the caret leaves it or the
  // editor blurs, and run the translation-abbreviation follow-up after a draft commits.
  useEffect(() => {
    if (!editor || editorChromeMode !== 'prototypeNative') return;

    const resolveDetachedDraft = () => {
      if (!isEditorValid(editor)) return;
      const detached = findDetachedScriptureDraft(editor.state);
      if (!detached) return;
      // While the caret has only moved past the draft by reference-continuation chars in the
      // same block (e.g. typing the "-2" of a range as plain text), wait — don't commit a
      // partial pill. Confirm (✓ / a non-continuation key / leaving) absorbs the tail via
      // extendRangeOverTrailingContinuation into one clean pill.
      const state = editor.state;
      const caret = state.selection.from;
      if (caret > detached.to) {
        const gap = state.doc.textBetween(detached.to, caret);
        const $a = state.doc.resolve(detached.from);
        const $c = state.doc.resolve(caret);
        const sameBlock = $a.start($a.depth) === $c.start($c.depth);
        if (sameBlock && /^[\d:,\-–—]+$/.test(gap)) {
          return;
        }
      }
      // The caret left the draft. When it left by TYPING (the mobile space-commit route — space is
      // never intercepted on mobile, so it lands as plain text and detaches the draft), this is a
      // user confirm and must re-assert the native caret: iOS leaves the *painted* caret at the
      // line end after the commit mutation even though the PM selection is correct. Every other
      // commit route (Enter, the ✓) already passes `focus`; this one was the gap, and it is the
      // one users actually hit. Guard on `isFocused` so a caret that left because focus went to a
      // dock does NOT get stolen back (Round 9).
      confirmScriptureDraftView(editor.view, detached.to, {
        onInvalid: 'finalize',
        focus: editor.isFocused,
      });
    };

    let blurConfirmTimer: ReturnType<typeof setTimeout> | null = null;
    let blurDeferTimer: ReturnType<typeof setTimeout> | null = null;
    let blurRefocusTimer: ReturnType<typeof setTimeout> | null = null;

    const confirmDraftIfStillBlurred = () => {
      if (!isEditorValid(editor)) return;
      if (editor.isFocused) return;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const dom = editor.view?.dom as HTMLElement | undefined;
      if (dom && active && (dom === active || dom.contains(active))) return;
      const inside = getScriptureDraftRange(editor.state);
      const detached = findDetachedScriptureDraft(editor.state);
      const target = inside ?? detached;
      if (target) confirmScriptureDraftView(editor.view, target.to, { onInvalid: 'finalize' });
    };

    const resolveOnBlur = () => {
      if (!isEditorValid(editor)) return;
      if (blurConfirmTimer) clearTimeout(blurConfirmTimer);
      if (blurDeferTimer) clearTimeout(blurDeferTimer);
      if (blurRefocusTimer) clearTimeout(blurRefocusTimer);
      // Mobile: never auto-confirm on blur while a draft is open. iOS fires transient blurs when
      // switching keyboard layers to reach "-" — that was committing "Numbers 5:5" before the user
      // could type the range tail. Confirm via ✓, Enter, or selection leaving the draft instead.
      if (isMobileDevice() && hasActiveScriptureDraft(editor.state)) {
        const refocusAfterKeyboardBlur = () => {
          if (!isEditorValid(editor)) return;
          if (!hasActiveScriptureDraft(editor.state)) return;
          if (editor.isFocused) return;
          const active = typeof document !== 'undefined' ? document.activeElement : null;
          const dom = editor.view?.dom as HTMLElement | undefined;
          if (dom && active && (dom === active || dom.contains(active))) return;
          try {
            editor.view.focus();
            const range = getScriptureDraftRange(editor.state);
            if (range && hasDraftContinuationTailInDoc(editor.state, range.to)) {
              scheduleMobileDraftTailCaretSync(editor.view);
            }
          } catch {
            /* ignore */
          }
        };
        requestAnimationFrame(refocusAfterKeyboardBlur);
        blurRefocusTimer = setTimeout(refocusAfterKeyboardBlur, 100);
        return;
      }
      // Defer + re-check focus: iOS fires transient blurs (keyboard layout switch to reach "-",
      // predictive-bar taps) that would otherwise commit a half-typed range. If focus is back in
      // the editor a frame later it wasn't a real blur — leave the draft open. Only commit when
      // focus has genuinely left the editor surface (tap-away / ✓ already handles its own commit).
      blurConfirmTimer = setTimeout(() => {
        blurConfirmTimer = null;
        if (!isEditorValid(editor)) return;
        if (editor.isFocused) return;
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        const dom = editor.view?.dom as HTMLElement | undefined;
        if (dom && active && (dom === active || dom.contains(active))) return;

        const range = getScriptureDraftRange(editor.state);
        if (
          isMobileDevice() &&
          range &&
          !hasDraftContinuationTailInDoc(editor.state, range.to)
        ) {
          // No range tail typed yet — defer confirm so keyboard-switch blurs can refocus first.
          blurDeferTimer = setTimeout(() => {
            blurDeferTimer = null;
            confirmDraftIfStillBlurred();
          }, 350);
          return;
        }

        confirmDraftIfStillBlurred();
      }, 120);
    };
    const onConfirmed = (e: Event) => {
      const reference = (e as CustomEvent<{ reference: string }>).detail?.reference;
      if (reference) schedulePendingTranslationAfterPillCreation(editor, [{ reference }]);
    };

    editor.on('selectionUpdate', resolveDetachedDraft);
    editor.on('blur', resolveOnBlur);
    editor.view.dom.addEventListener(SCRIPTURE_DRAFT_CONFIRMED_EVENT, onConfirmed);
    return () => {
      if (blurConfirmTimer) clearTimeout(blurConfirmTimer);
      if (blurDeferTimer) clearTimeout(blurDeferTimer);
      if (blurRefocusTimer) clearTimeout(blurRefocusTimer);
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', resolveDetachedDraft);
        editor.off('blur', resolveOnBlur);
        editor.view?.dom?.removeEventListener(SCRIPTURE_DRAFT_CONFIRMED_EVENT, onConfirmed);
      }
    };
  }, [editor, editorChromeMode]);

  // Position the floating ✓ confirm just past the draft end (coordsAtPos), kept in sync with
  // edits, scroll, and the iOS keyboard (visualViewport). Rendered as a portal below.
  useEffect(() => {
    if (!editor || editorChromeMode !== 'prototypeNative') return;

    const updatePos = () => {
      if (!isEditorValid(editor)) {
        setScriptureDraftConfirm(null);
        return;
      }
      const to = getScriptureDraftAnchorPos(editor.state);
      if (to == null) {
        setScriptureDraftConfirm(null);
        return;
      }
      try {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
        // iOS: getBoundingClientRect()/coordsAtPos() are relative to the visual viewport, but the
        // portal button is position:fixed (layout viewport). While the keyboard is up,
        // visualViewport.offsetTop > 0, so without this correction the ✓ renders ~a line too high.
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        const ox = vv?.offsetLeft ?? 0;
        const oy = vv?.offsetTop ?? 0;
        // Anchor the ✓ to the draft pill's DOM rect so it sits inline beside the pill —
        // vertically centered on the pill, flush to its right edge. coordsAtPos returns a thin
        // caret box that on iOS renders the button above the taller inline-flex pill.
        // Ask the same helper `confirmScriptureDraftView` gates on, so the button can never
        // disagree with what the commit will actually do. Only 'invalid' is surfaced — 'pending'
        // is ordinary mid-typing and must not look like an error.
        const commitState = getScriptureDraftValidity(editor.state, to);
        const invalidReason = commitState.status === 'invalid' ? commitState.reason : null;
        const draftEl = getScriptureDraftAnchorElement(editor.view, to);
        if (draftEl) {
          // The draft is `display: inline`, so if the reference wraps across a line
          // getBoundingClientRect() returns the UNION of its fragments — anchoring to that would
          // put the ✓ at the end of the first line. The last client rect is the trailing fragment,
          // which is where the caret and the next typed character actually are.
          const rects = draftEl.getClientRects();
          const rect = rects.length > 0 ? rects[rects.length - 1] : draftEl.getBoundingClientRect();
          setScriptureDraftConfirm({
            to,
            invalidReason,
            top: rect.top + rect.height / 2 + oy,
            left: Math.min(rect.right + 6, vw - 30) + ox,
          });
          return;
        }
        // Fallback: the caret coordinate at the draft end.
        const coords = editor.view.coordsAtPos(to);
        setScriptureDraftConfirm({
          to,
          invalidReason,
          top: (coords.top + coords.bottom) / 2 + oy,
          left: Math.min(coords.right + 6, vw - 30) + ox,
        });
      } catch {
        setScriptureDraftConfirm(null);
      }
    };

    // Hide the ✓ while actively typing — it sits at the draft's right edge, exactly where the next
    // character lands, so leaving it up covers the char being typed. Re-show + reposition once the
    // user pauses (same idle cadence as the mobile draft grow), so it reappears at the grown pill.
    let lastTypeAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onDocUpdate = () => {
      lastTypeAt = Date.now();
      setScriptureDraftConfirm(null);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = null;
        updatePos();
        // Measure again on the next frame: showing the ✓ is the moment the draft's inline box has
        // just settled, and a sub-frame layout shift (fonts, the chrome row collapsing) would
        // otherwise strand it at the pre-shift rect until the next scroll.
        requestAnimationFrame(updatePos);
        if (canSafelyResyncMobileDraftIdleCaret(editor.state)) {
          const anchor = getScriptureDraftAnchorPos(editor.state);
          const draftRange = getScriptureDraftRange(editor.state);
          if (anchor != null && draftRange) {
            resyncMobileCaret(editor.view, {
              pos: anchor,
              draftIdle: true,
              markFrom: draftRange.from,
              markTo: draftRange.to,
            });
          }
        }
      }, 260);
    };
    const onSelectionChange = () => {
      // During active typing the idle timer owns re-showing the ✓; don't flash it at the caret.
      if (Date.now() - lastTypeAt < 260) return;
      updatePos();
    };

    updatePos();
    editor.on('update', onDocUpdate);
    editor.on('selectionUpdate', onSelectionChange);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', updatePos);
    vv?.addEventListener('scroll', updatePos);
    // The mobile shell frame is resized programmatically across the keyboard-settle window, which
    // moves every line of the editor without firing scroll/resize. That is what leaves the FIRST ✓
    // of a note misaligned — it is measured 260ms after the last keystroke, between two settle
    // passes, while later ones land after the frame has stopped moving.
    const offSettle = onProtoViewportSettle(updatePos);
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (editor && !editor.isDestroyed) {
        editor.off('update', onDocUpdate);
        editor.off('selectionUpdate', onSelectionChange);
      }
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
      vv?.removeEventListener('resize', updatePos);
      vv?.removeEventListener('scroll', updatePos);
      offSettle();
    };
  }, [editor, editorChromeMode]);

  // The pill delete/edit floater is anchored to a DOMRect captured when it opened. Re-capture it
  // when the mobile shell frame resizes around the keyboard — that moves the pill without firing
  // scroll or resize, so the floater would otherwise detach from it.
  useEffect(() => {
    if (!editor || !deleteConfirmPill) return;
    return onProtoViewportSettle(() => {
      if (!isEditorValid(editor)) return;
      const pillEl = editor.view.dom.querySelector(
        `.scripture-pill[data-scripture-reference="${CSS.escape(deleteConfirmPill.reference)}"]`,
      ) as HTMLElement | null;
      if (!pillEl) return;
      const next = { ...deleteConfirmPill, rect: pillEl.getBoundingClientRect() };
      setDeleteConfirmPill(next);
      deleteConfirmPillRef.current = next;
    });
  }, [editor, deleteConfirmPill]);

  // Handle create note from selection
  const handleCreateNoteFromSelection = async (
    rangeOverride?: { from: number; to: number },
  ) => {
    if (!editor) return;
    
    // Check if editor is still valid before accessing it
    if (!isEditorValid(editor)) return;
    
    const from = rangeOverride?.from ?? editor.state.selection.from;
    const to = rangeOverride?.to ?? editor.state.selection.to;
    if (from === to) return;
    
    // Determine if we should preserve formatting
    const preserveFormatting = hasFormatting(editor);
    
    // Extract content
    let extractedContent: string;
    
    if (preserveFormatting) {
      // Serialize from the ProseMirror doc so scripture pills (user-select:none in DOM) are not dropped
      // (range.cloneContents() omits non-selectable nodes).
      try {
        const slice = editor.state.doc.slice(from, to);
        const serializer = DOMSerializer.fromSchema(editor.schema);
        const fragment = serializer.serializeFragment(slice.content);
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(fragment);
        extractedContent = tempDiv.innerHTML;
      } catch (e) {
        extractedContent = editor.state.doc.textBetween(from, to);
      }
    } else {
      // Plain text - use textBetween
      extractedContent = editor.state.doc.textBetween(from, to);
    }
    
    const plainText = extractedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const MAX_SELECTION_LENGTH_FOR_TITLE = 20;
    const putSelectionInTitle = plainText.length > 0 && plainText.length < MAX_SELECTION_LENGTH_FOR_TITLE;

    // Detect if this is scripture
    try {
      if (plainText.length >= 5) {
        const detectResponse = await fetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: plainText }),
          credentials: 'include'
        });

        if (detectResponse.ok) {
          const detection = await detectResponse.json();
          
          // Only enter the scripture-specific flow when the selection is primarily a
          // reference (e.g. "Romans 8:28"), not a broader passage that happens to contain one
          // (e.g. "centered around Proverbs 25:2 to build a tool").
          const refPattern = new RegExp(detection.primaryReference?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '', 'i');
          const textBeyondRef = detection.primaryReference ? plainText.replace(refPattern, '').trim() : plainText;
          const isJustScriptureRef = textBeyondRef.length <= 15;

          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference && isJustScriptureRef) {
            try {
              // Normalize the reference before checking to ensure consistent format matching
              const normalizedReference = normalizeScriptureReference(detection.primaryReference);
              
              const checkExistingResponse = await fetch('/api/scripture/check-existing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: normalizedReference }),
                credentials: 'include'
              });

              if (checkExistingResponse.ok) {
                const existingCheck = await checkExistingResponse.json();
                
                if (existingCheck.exists && existingCheck.noteId) {
                  // Existing note found - automatically add to thread
                  const targetThreadId = parentThreadId || localStorage.getItem('newNoteThread') || 'thread_unorganized';
                  
                  try {
                    const addThreadResponse = await fetch(`/api/notes/${existingCheck.noteId}/add-thread`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ threadId: targetThreadId }),
                      credentials: 'include'
                    });

                    let result;
                    try {
                      result = await addThreadResponse.json();
                    } catch (jsonError) {
                      // If JSON parsing fails, log and continue - will fall through to new note creation
                      console.error('[TiptapEditor] Failed to parse add-thread response:', jsonError);
                      result = { error: 'Failed to parse response' };
                    }

                    if (addThreadResponse.ok) {
                      // Success case - note was added to thread
                      if (result.success) {
                        const toastMessage = `Added ${normalizedReference} to this thread`;
                        if (window.toast) {
                          window.toast.info(toastMessage);
                        }
                      }
                      
                      // Create hyperlink only if the selection isn't already a scripture pill
                      // (pills already link to the note — overlaying a noteLink would fail or corrupt markup)
                      const { from, to } = editor.state.selection;
                      const pillMark = editor.schema.marks.scripturePill;
                      const selectionIsPill = pillMark && editor.state.doc.rangeHasMark(from, to, pillMark);
                      if (!selectionIsPill) {
                        const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
                        window.dispatchEvent(new CustomEvent('createHyperlink', {
                            detail: {
                                sourceNoteId,
                                newNoteId: existingCheck.noteId,
                                from,
                                to,
                                plainText: plainTextForMatching || null,
                            }
                        }));
                      }
                    } else if (addThreadResponse.status === 400) {
                      // Handle 400 status - could be "already in thread" or other validation errors
                      const errorMessage = result.error || 'Unknown error';
                      
                      // Check if it's the "already in thread" case (flexible matching)
                      const isAlreadyInThread = errorMessage.includes('already in this thread') || 
                                                errorMessage.includes('already in thread') ||
                                                errorMessage === 'Note is already in this thread';
                      
                      if (isAlreadyInThread) {
                        // Note is already in thread - show toast using multiple methods
                        const toastMessage = `${normalizedReference} is already in this thread.`;
                        
                        // Dispatch a custom event for the layout to handle.
                        // This is more robust than calling window.toast directly.
                        window.dispatchEvent(new CustomEvent('showToast', {
                          detail: {
                            message: toastMessage,
                            type: 'info'
                          }
                        }));
                        
                        // Create hyperlink only if the selection isn't already a scripture pill
                        const { from, to } = editor.state.selection;
                        const pillMark2 = editor.schema.marks.scripturePill;
                        const selectionIsPill2 = pillMark2 && editor.state.doc.rangeHasMark(from, to, pillMark2);
                        if (!selectionIsPill2) {
                          const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
                          window.dispatchEvent(new CustomEvent('createHyperlink', {
                              detail: {
                                  sourceNoteId,
                                  newNoteId: existingCheck.noteId,
                                  from,
                                  to,
                                  plainText: plainTextForMatching || null,
                              }
                          }));
                        }
                      } else {
                        // Other 400 error - log but don't show toast (will fall through to new note creation)
                        console.warn('[TiptapEditor] Error adding note to thread (not "already in thread"):', errorMessage);
                      }
                    } else {
                      console.error('[TiptapEditor] Unexpected response status when adding note to thread:', addThreadResponse.status, result);
                    }
                  } catch (addError) {
                    // Error adding existing note to thread, falling back to new note creation
                    console.error('[TiptapEditor] Error in addThreadResponse:', addError);
                  }
                  
                  // Clear selection and close
                  editor.commands.blur();
                  setShowCreateNoteButton(false);
                  return; // Exit early - don't create new note
                }
              } else {
                // Non-OK response from check-existing API
                const errorText = await checkExistingResponse.text().catch(() => 'Unknown error');
                console.error('[TiptapEditor] Error checking for existing scripture note:', checkExistingResponse.status, errorText);
                // Continue to create new note since check failed
              }
            } catch (checkError) {
              // Error checking for existing scripture note
              console.error('[TiptapEditor] Exception while checking for existing scripture note:', checkError);
              // Continue to create new note since check failed
            }

            // No existing note found - proceed with creating new note
            // Fetch verse text
            try {
              const verseResponse = await fetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
                credentials: 'include'
              });

              if (verseResponse.ok) {
                const verseData = await verseResponse.json();
                
                // Store scripture detection metadata (keep original format, no divider)
                localStorage.setItem('newNoteType', 'scripture');
                localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
                localStorage.setItem('newNoteScriptureVersion', getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation());
                localStorage.setItem('newNoteScriptureText', verseData.text);
                localStorage.setItem('newNoteTitle', detection.primaryReference); // Reference becomes title
                localStorage.setItem('newNoteContent', verseData.text); // Verse text becomes content
              } else {
                // Detection succeeded but verse fetch failed - still mark as scripture
                localStorage.setItem('newNoteType', 'scripture');
                localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
                localStorage.setItem('newNoteScriptureVersion', getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation());
                localStorage.setItem('newNoteTitle', detection.primaryReference);
                localStorage.setItem('newNoteContent', extractedContent); // Fallback to original content
              }
            } catch (verseError) {
              // Still mark as scripture even if verse fetch fails
              localStorage.setItem('newNoteType', 'scripture');
              localStorage.setItem('newNoteScriptureReference', detection.primaryReference);
              localStorage.setItem('newNoteScriptureVersion', getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation());
              localStorage.setItem('newNoteTitle', detection.primaryReference);
              localStorage.setItem('newNoteContent', extractedContent);
            }
          } else {
            // Not scripture - clear any previous scripture metadata
            localStorage.removeItem('newNoteType');
            localStorage.removeItem('newNoteScriptureReference');
            localStorage.removeItem('newNoteScriptureVersion');
            localStorage.removeItem('newNoteScriptureText');
            if (putSelectionInTitle) {
              localStorage.setItem('newNoteTitle', plainText);
              localStorage.setItem('newNoteContent', '');
              localStorage.setItem('newNoteContentEmptyFromSelection', 'true');
            } else {
              localStorage.setItem('newNoteContent', extractedContent);
            }
          }
        }
      } else {
        // Too short to check - store in title if short, else content
        if (putSelectionInTitle) {
          localStorage.setItem('newNoteTitle', plainText);
          localStorage.setItem('newNoteContent', '');
          localStorage.setItem('newNoteContentEmptyFromSelection', 'true');
        } else {
          localStorage.setItem('newNoteContent', extractedContent);
        }
      }
    } catch (error) {
      // Continue anyway - don't block note creation
      if (putSelectionInTitle) {
        localStorage.setItem('newNoteTitle', plainText);
        localStorage.setItem('newNoteContent', '');
        localStorage.setItem('newNoteContentEmptyFromSelection', 'true');
      } else {
        localStorage.setItem('newNoteContent', extractedContent);
      }
    }
    
    // Store parent thread ID if provided
    if (parentThreadId) {
      localStorage.setItem('newNoteThread', parentThreadId);
    }
    
    // Store source note context for hyperlink creation
    if (sourceNoteId) {
      localStorage.setItem('newNoteSourceNoteId', sourceNoteId);
      localStorage.setItem('newNoteSourceSelectionFrom', from.toString());
      localStorage.setItem('newNoteSourceSelectionTo', to.toString());
      // Also store plain text version for matching in HTML
      const plainTextForMatching = editor.state.doc.textBetween(from, to, ' ');
      localStorage.setItem('newNoteSourceSelectionPlainText', plainTextForMatching);
    }
    
    // Set localStorage first (as backup in case event listener isn't ready yet)
    localStorage.setItem('showNewNotePanel', 'true');
    
    // Dispatch event to open NewNotePanel
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    
    // Clear selection
    editor.commands.blur();
    setShowCreateNoteButton(false);
  };

  // Note-link clicks are handled by TiptapNoteLink ProseMirror plugin (handleClick + .note-link span).

  // Track editor focus state
  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      // Check if editor is still valid
      if (!isEditorValid(editor)) return;

      try {
        if (isDocTextEmpty(editor.state.doc) && editor.state.selection.from !== preferredCaretPosForEmptyDoc(editor.state.doc)) {
          editor.commands.setTextSelection(preferredCaretPosForEmptyDoc(editor.state.doc));
        }
      } catch {
        /* ignore */
      }

      if (toolbarAtBottom) {
        scheduleScrollSelectionIntoViewAboveToolbar(editor);
      } else {
        // Prevent unwanted scroll jumps on mobile by maintaining scroll position
        const editorElement = editor.view.dom;
        const contentContainer = editorElement?.closest('.tiptap-content') as HTMLElement;
        if (contentContainer) {
          const scrollTop = contentContainer.scrollTop;
          requestAnimationFrame(() => {
            if (contentContainer && Math.abs(contentContainer.scrollTop - scrollTop) > 10) {
              contentContainer.scrollTop = scrollTop;
            }
          });
        }
      }

      if (!editorWasFocusedForToolbarRef.current) {
        setToolbarEnterEpoch((n) => n + 1);
      }
      editorWasFocusedForToolbarRef.current = true;
      setIsEditorFocused(true);

      if (editorChromeMode === 'prototypeNative') {
        suppressFormatBarUntilBodySignalRef.current = false;
        bumpFormatToolbarActivity();
      }
    };

    const handleBlur = (event: any) => {
      // Check if editor is still valid
      if (!isEditorValid(editor)) return;
      
      // Don't treat focus moving into editor chrome (toolbar, study dock, pickers) as "editor
      // blurred" — that would thrash `isEditorFocused`, which in turn collapses any passage text
      // selection and interrupts dock button clicks. The format toolbar is instead hidden while a
      // dock chrome is active via `studyDockChromeTakesOver` below.
      const relatedTarget = event.event?.relatedTarget as HTMLElement | null | undefined;
      if (relatedTarget?.closest?.('.tiptap-toolbar')) {
        return;
      }
      if (relatedTarget?.closest?.('[data-prototype-format-toolbar]')) {
        return;
      }
      if (relatedTarget?.closest?.('.proto-editor-bottom-bar')) {
        return;
      }
      if (relatedTarget?.closest?.('.scripture-pill-chrome')) {
        return;
      }
      if (relatedTarget?.closest?.('.study-dock-card')) {
        return;
      }
      if (relatedTarget?.closest?.('.study-dock-carousel')) {
        return;
      }
      if (relatedTarget?.closest?.('.highlight-dock-web')) {
        return;
      }
      if (relatedTarget?.closest?.('.reference-dock-web')) {
        return;
      }
      if (relatedTarget?.closest?.('.dock-accent-swatch')) {
        return;
      }
      if (relatedTarget?.closest?.('.dock-accent-swatch__popover-anchor')) {
        return;
      }
      if (relatedTarget?.closest?.('.scripture-translation-picker')) {
        return;
      }
      if (relatedTarget?.closest?.('.selection-action-bar')) {
        return;
      }
      if (
        !relatedTarget &&
        (studyDockPointerDownRef.current ||
          formatToolbarPointerDownRef.current ||
          document.activeElement?.closest?.(
            '.study-dock-card, .study-dock-carousel, .highlight-dock-web, .reference-dock-web, .scripture-pill-chrome, .scripture-delete-confirm, [data-prototype-format-toolbar], .proto-editor-bottom-bar, .tiptap-toolbar',
          ))
      ) {
        queueMicrotask(() => {
          if (isEditorValid(editor)) {
            setIsEditorFocused(editor.isFocused);
          }
        });
        return;
      }
      // Small delay to allow focus to return to editor if needed
      setTimeout(() => {
        if (!isEditorValid(editor) || editor.isFocused) return;
        if (formatToolbarPointerDownRef.current) return;
        if (Date.now() < formatToolbarInteractionUntilRef.current) return;
        editorWasFocusedForToolbarRef.current = false;
        setIsEditorFocused(false);
        /*
         * Focus has genuinely left the editor — not to the toolbar, a dock, the picker or
         * the bar itself, all of which returned above. The selection may still be there in
         * the document, but a floating bar for it has no business staying up over whatever
         * took focus: it was sitting on top of the Library panel, still offering to act on
         * text nobody was looking at. The selection itself is untouched; select again and
         * the bar comes back.
         */
        clearSelectionActionBar();
        if (editorChromeMode === 'prototypeNative') {
          setShowFormatBarForActivity(false);
          if (formatBarHideTimerRef.current) {
            clearTimeout(formatBarHideTimerRef.current);
            formatBarHideTimerRef.current = null;
          }
        }
      }, 100);
    };

    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);

    const handleSelectionUpdate = () => {
      if (toolbarAtBottom) scrollSelectionIntoViewAboveToolbar(editor);
    };
    editor.on('selectionUpdate', handleSelectionUpdate);

    // Set initial focus state (mount with cursor already in editor — still show toolbar + animation)
    if (isEditorValid(editor) && editor.isFocused) {
      editorWasFocusedForToolbarRef.current = true;
      setToolbarEnterEpoch((n) => n + 1);
      setIsEditorFocused(true);
    } else if (isEditorValid(editor)) {
      setIsEditorFocused(false);
    }

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('focus', handleFocus);
        editor.off('blur', handleBlur);
        editor.off('selectionUpdate', handleSelectionUpdate);
      }
    };
  }, [editor, toolbarAtBottom, editorChromeMode, bumpFormatToolbarActivity, clearSelectionActionBar]);

  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    // Includes the accent swatch popover, which portals to document.body (outside the dock card).
    const dockSelector =
      '.study-dock-card, .study-dock-carousel, .highlight-dock-web, .reference-dock-web, .scripture-pill-chrome, .scripture-delete-confirm, .dock-accent-swatch, .dock-accent-swatch__popover-anchor, .harvous-menu-pill__sheet-backdrop, .harvous-menu-pill__menu--portal';
    const onPointerDown = (e: Event) => {
      if ((e.target as HTMLElement)?.closest?.(dockSelector)) {
        studyDockPointerDownRef.current = true;
        // Arm the suppression window on any dock-chrome interaction. A click on dock chrome (e.g.
        // opening the accent swatch popover) emits a ProseMirror selectionUpdate *after* mouseup —
        // later than a one-frame pointer-ref window — which would otherwise collapse the dock before
        // the user can pick a color. Controls that edit the pill (translation/range) suppress via
        // onApply; the swatch trigger only opens a popover, so guard it here.
        suppressScriptureDockDismiss();
      }
    };
    const onPointerUp = (e: Event) => {
      const releasedInDock = (e.target as HTMLElement | null)?.closest?.(dockSelector);
      const clearPointerRef = () => {
        studyDockPointerDownRef.current = false;
      };
      if (releasedInDock) {
        // Defer the clear one frame so the trailing selectionUpdate stays guarded.
        requestAnimationFrame(clearPointerRef);
      } else {
        clearPointerRef();
      }
      queueMicrotask(() => {
        const ed = editorRef.current;
        if (ed && isEditorValid(ed)) {
          setIsEditorFocused(ed.isFocused);
        }
      });
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('mouseup', onPointerUp, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('mouseup', onPointerUp, true);
    };
  }, [editorChromeMode, suppressScriptureDockDismiss]);

  /** Clear format-bar suppress when the user clicks the note body (focus may not re-fire if TipTap stayed focused). */
  useEffect(() => {
    if (!editor || editorChromeMode !== 'prototypeNative' || !isEditorValid(editor)) return;
    let dom: HTMLElement;
    try {
      dom = editor.view.dom as HTMLElement;
    } catch {
      return;
    }
    const onBodyPointerDown = () => {
      if (!suppressFormatBarUntilBodySignalRef.current) return;
      suppressFormatBarUntilBodySignalRef.current = false;
      editorWasFocusedForToolbarRef.current = true;
      setIsEditorFocused(true);
      bumpFormatToolbarActivity();
    };
    dom.addEventListener('mousedown', onBodyPointerDown);
    return () => dom.removeEventListener('mousedown', onBodyPointerDown);
  }, [editor, editorChromeMode, bumpFormatToolbarActivity]);

  /** Pill delete when DOM focus moved to study-dock chrome but editor selection is still valid. */
  useEffect(() => {
    if (!editor || editorChromeMode !== 'prototypeNative') return;

    const isExternalTextField = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return true;
      if (target.isContentEditable && !target.closest('.ProseMirror')) return true;
      return false;
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (!(event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Escape')) return;
      if (isExternalTextField(event.target)) return;
      if (!isEditorValid(editor)) return;
      if (editor.isFocused) return;

      editor.commands.focus();
      if (!tryHandleScripturePillDeleteKey(editor, event, editor.view, deleteConfirmPillRef, setDeleteConfirmPill)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown, true);
  }, [editor, editorChromeMode]);

  useEffect(() => {
    if (!editor || !sourceNoteId) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || String(d.noteId) !== String(sourceNoteId)) return;
      const query = String(d.query ?? '').trim();
      if (!query || !isEditorValid(editor)) return;
      const all = findAllTextPositions(editor.state.doc, query, false);
      if (all.length === 0) {
        window.dispatchEvent(
          new CustomEvent('prototypeFindInNoteResult', {
            detail: { noteId: sourceNoteId, count: 0, index: 0 },
          }),
        );
        return;
      }
      const idx =
        typeof d.matchIndex === 'number' ? ((d.matchIndex % all.length) + all.length) % all.length : 0;
      const match = all[idx];
      editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).scrollIntoView().run();
      window.dispatchEvent(
        new CustomEvent('prototypeFindInNoteResult', {
          detail: { noteId: sourceNoteId, count: all.length, index: idx },
        }),
      );
    };
    window.addEventListener('prototypeFindInNote', handler as EventListener);
    return () => window.removeEventListener('prototypeFindInNote', handler as EventListener);
  }, [editor, sourceNoteId]);

  /** macOS-parity format bar: idle-hide + selection-visible + typing activity. */
  useEffect(() => {
    if (!editor || editorChromeMode !== 'prototypeNative') {
      setSelectionExpanded(false);
      return;
    }

    const syncSel = () => {
      try {
        if (!isEditorValid(editor)) return;
        const { from, to } = editor.state.selection;
        const expanded = from !== to;
        setSelectionExpanded(expanded);
        if (expanded) bumpFormatToolbarActivity();
      } catch {
        /* ignore */
      }
    };

    const syncFormatToolbarSelection = () => {
      try {
        if (formatToolbarPointerDownRef.current) return;
        if (!isEditorValid(editor)) return;
        const proseMirrorFocused =
          typeof document !== 'undefined' && !!document.activeElement?.closest('.ProseMirror');
        if (!editor.isFocused && !proseMirrorFocused) return;
        const { from, to } = editor.state.selection;
        formatToolbarSelectionRef.current = { from, to };
        const doc = editor.state.doc;
        if (isMeaningfulFormatBodySelection(doc, from, to)) {
          lastInBodySelectionRef.current = { from, to };
        }
      } catch {
        /* ignore */
      }
    };

    const onDocUpdate = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return;
      suppressFormatBarUntilBodySignalRef.current = false;
      bumpFormatToolbarActivity();
    };

    syncSel();
    syncFormatToolbarSelection();
    editor.on('selectionUpdate', syncSel);
    editor.on('selectionUpdate', syncFormatToolbarSelection);
    editor.on('focus', syncFormatToolbarSelection);
    editor.on('update', onDocUpdate);

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('selectionUpdate', syncSel);
        editor.off('selectionUpdate', syncFormatToolbarSelection);
        editor.off('focus', syncFormatToolbarSelection);
        editor.off('update', onDocUpdate);
      }
    };
  }, [editor, editorChromeMode, bumpFormatToolbarActivity]);

  useEffect(() => () => {
    if (formatBarHideTimerRef.current) {
      clearTimeout(formatBarHideTimerRef.current);
    }
  }, []);

  // Update active states when editor changes
  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateActiveStates = () => {
      // Check if editor is still valid before accessing it
      if (!isEditorValid(editor)) return;

      /*
       * A press in flight is not new information about the selection.
       *
       * Pressing a toolbar button collapses the live selection and moves focus into the
       * portalled bar, so the transaction that press produces would have every button read
       * its state from a caret sitting where the user is not working — the whole row drops to
       * inactive for a frame and comes back once the command lands. That blink is the flicker
       * you see when an option genuinely IS active. `resolveFormatToolbarRange` is the same
       * question `runPrototypeFormatCommand` asks; when it answers with the frozen range
       * rather than the live one, the live one is degenerate and worth ignoring.
       */
      const live = editor.state.selection;
      if (!editor.isFocused && live.empty) {
        const acting = resolveFormatToolbarRange();
        if (acting && acting.from !== acting.to) return;
      }

      // Detect current heading level (0 = paragraph, 2–3 = headings)
      let headingLevel = 0;
      if (editor.isActive('heading', { level: 2 })) {
        headingLevel = 2;
      } else if (editor.isActive('heading', { level: 3 })) {
        headingLevel = 3;
      }

      const newStates = {
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        orderedList: editor.isActive('orderedList'),
        bulletList: editor.isActive('bulletList'),
        urlLink: editor.isActive('urlLink'),
        hasSelection: !editor.state.selection.empty,
        headingLevel: headingLevel
      };
      // This fires on every keystroke and every caret move ('selectionUpdate' + 'update').
      // A fresh object literal every time defeats React's same-state bailout and forces a
      // full re-render of this component tree per character typed. Only commit the state
      // when a value actually changed so unrelated keystrokes (typing plain text with no
      // active marks, arrow-key moves within the same paragraph) don't re-render at all.
      setActiveStates((prev) => {
        const changed =
          prev.canUndo !== newStates.canUndo ||
          prev.canRedo !== newStates.canRedo ||
          prev.bold !== newStates.bold ||
          prev.italic !== newStates.italic ||
          prev.underline !== newStates.underline ||
          prev.strike !== newStates.strike ||
          prev.orderedList !== newStates.orderedList ||
          prev.bulletList !== newStates.bulletList ||
          prev.urlLink !== newStates.urlLink ||
          prev.hasSelection !== newStates.hasSelection ||
          prev.headingLevel !== newStates.headingLevel;
        return changed ? newStates : prev;
      });
    };

    /*
     * `transaction`, not `selectionUpdate` + `update`.
     *
     * TipTap gates `onUpdate` on `transactions.some(tr => tr.docChanged)`. Toggling a mark
     * with a collapsed caret changes neither the doc nor the selection — it sets *stored
     * marks*, the marks the next typed character will carry. So neither of the old two events
     * fired, and the button kept whatever state it had before the press: bold shown as on
     * after being switched off, and the reverse. That is the "shows an option as active when
     * it isn't". `transaction` fires for every transaction, including this one.
     *
     * This is not louder than before in any way that matters: the changed-value bailout below
     * already returns the previous state object when nothing moved, so the extra transactions
     * this now sees cost a comparison and no render.
     */
    editor.on('transaction', updateActiveStates);
    // The "press in flight" guard above holds state while the editor is blurred with a frozen
    // range. Focus coming back is the moment that guard stops applying, and it does not always
    // arrive as a transaction — so re-read here rather than wait for the next keystroke.
    editor.on('focus', updateActiveStates);

    // Initial update
    updateActiveStates();

    return () => {
      if (editor && !editor.isDestroyed) {
        editor.off('transaction', updateActiveStates);
        editor.off('focus', updateActiveStates);
      }
    };
    // `resolveFormatToolbarRange` is read from the closure and deliberately kept out of this
    // array. It is a `useCallback([editor])` declared further down the component body, so the
    // identity it would contribute is already covered by `editor` — and naming it here would
    // evaluate the binding during render, before its own `const` runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const studyDockChromeActive =
    editorChromeMode === 'prototypeNative' &&
    (studyDockStackHasEntries(studyDockStack) || deleteConfirmPill != null);

  /* An expanded study dock (or delete-confirm bar) takes over the bottom chrome — the
     format toolbar should hide while it's up (matches native: the dock replaces the format bar).
     This hides the toolbar WITHOUT flipping `isEditorFocused`, so passage text selection and dock
     button clicks aren't disrupted by focus thrash. */
  const studyDockChromeTakesOver =
    editorChromeMode === 'prototypeNative' &&
    (studyDockStack.entries.some((e) => e.expanded) ||
      deleteConfirmPill != null);

  if (editorChromeMode !== 'prototypeNative') {
    suppressFormatBarUntilBodySignalRef.current = false;
    prevStudyDockChromeTakesOverRef.current = false;
  } else {
    const wasTakingOver = prevStudyDockChromeTakesOverRef.current;
    if (wasTakingOver && !studyDockChromeTakesOver) {
      suppressFormatBarUntilBodySignalRef.current = true;
      if (formatBarHideTimerRef.current) {
        clearTimeout(formatBarHideTimerRef.current);
        formatBarHideTimerRef.current = null;
      }
    }
    prevStudyDockChromeTakesOverRef.current = studyDockChromeTakesOver;
  }

  const formatToolbarEngaged =
    !suppressFormatBarUntilBodySignalRef.current &&
    (isEditorFocused || showFormatBarForActivity || isPointerOverFormatToolbar);

  /* Prototype column bar: undefined = inline fallback; null = host pending; element = portal target. */
  const columnFormatToolbarPortal = formatToolbarPortalTarget !== undefined;

  /* Touch: the selection actions take over the chrome slot rather than floating into the iOS
     callout. Needs a real host to portal into.

     This used to also require `!studyDockChromeTakesOver`, which was too broad. An expanded
     dock owning the chrome is the right reason to hide the *format* bar — those tools act on
     a note body the dock is covering. It is the wrong reason to hide the selection row, whose
     tools act on the selection the user is looking at right now. With the dock open the row
     fell through to the floating capsule, which is precisely the thing this branch exists to
     avoid: ScripturePillChromeWeb refuses to draw one on touch for the same reason ("floating
     capsule competes with iOS callout"), and it landed over the dock's own text. */
  const selectionActionsInChromeBar =
    editorChromeMode === 'prototypeNative' &&
    isCoarsePointer &&
    enableCreateNoteFromSelection &&
    selectionActionBar != null &&
    !!formatToolbarPortalTarget;

  /* No chrome host on a touch device means no selection bar at all.

     The floating capsule is a mouse affordance: on iOS it lands on top of the system
     selection callout, and the two are indistinguishable to a finger. Showing nothing is the
     better failure — the selection is still live, the system callout still offers copy, and
     the actions come back the moment a host exists. Drawing a second capsule over the first
     is what made a dock-open selection unusable. */
  /*
   * Re-keying the track remounts every button and replays the enter animation. That reads as
   * a deliberate arrival with a mouse, where focus changes once and stays. On a phone focus
   * churns constantly — a pill tap, a dock, the picker sheet, the keyboard settling — so the
   * same key made the whole bar flash in and out several times per edit. On touch it keeps one
   * identity for the editor's lifetime; the toolbar is furniture there, not an event.
   */
  const toolbarTrackKey = isCoarsePointer ? 'touch' : toolbarEnterEpoch;

  const selectionBarSuppressedOnTouch =
    editorChromeMode === 'prototypeNative' && isCoarsePointer && !selectionActionsInChromeBar;

  // A read-only body (co-edit off, or a foreign shared note) still fires TipTap's
  // `focus` event on click — `contenteditable="false"` doesn't stop that — so
  // without this the format bar offered editing tools that would do nothing.
  const shouldShowPrototypeFormatToolbar =
    editorChromeMode === 'prototypeNative' &&
    formatToolbarEngaged &&
    !studyDockChromeTakesOver &&
    // Both portal into the same host; the selection actions win while a selection is live.
    !selectionActionsInChromeBar &&
    editor?.isEditable !== false;

  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative' || !onPrototypeChromeModeChange) return;
    // Same guard as shouldShowPrototypeFormatToolbar: a read-only body still fires
    // TipTap's focus event on click, so without this the parent's bottom bar would
    // switch to 'format' — editing tools with nothing to act on — for a note the
    // click can't actually edit.
    // The selection row keeps the slot open even when the format bar itself has disengaged —
    // on touch, tapping the bar's own buttons is not an editor-body signal — and it outranks
    // an expanded dock, which hides the format tools but has no claim on a live selection.
    if (selectionActionsInChromeBar) {
      onPrototypeChromeModeChange('selection');
      return;
    }
    if (studyDockChromeTakesOver) {
      onPrototypeChromeModeChange('hidden');
      return;
    }
    if (!formatToolbarEngaged || editor?.isEditable === false) {
      onPrototypeChromeModeChange(prototypeNoteActionsChrome ? 'noteActions' : 'hidden');
      return;
    }
    onPrototypeChromeModeChange('format');
  }, [
    editorChromeMode,
    onPrototypeChromeModeChange,
    prototypeNoteActionsChrome,
    formatToolbarEngaged,
    editor?.isEditable,
    studyDockChromeTakesOver,
    selectionActionsInChromeBar,
  ]);

  const syncTiptapContentScrollMask = useCallback(() => {
    const el = tiptapContentRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflowing = scrollHeight > clientHeight + 1;
    setContentOverflowing(overflowing);
    setContentHasScrolledDown(scrollTop > 0);
  }, []);

  /* Top fade mask when scrolled: keep overflow + scroll flags in sync (CardFullEditable flex layout often settles after first paint). */
  useEffect(() => {
    if (!editor) return;
    const el = tiptapContentRef.current;
    if (!el) return;
    syncTiptapContentScrollMask();
    const timer = setTimeout(syncTiptapContentScrollMask, 50);
    const raf = requestAnimationFrame(syncTiptapContentScrollMask);
    editor.on('update', syncTiptapContentScrollMask);
    el.addEventListener('scroll', syncTiptapContentScrollMask, { passive: true });
    const ro = new ResizeObserver(syncTiptapContentScrollMask);
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      if (editor && !editor.isDestroyed) {
        editor.off('update', syncTiptapContentScrollMask);
      }
      el.removeEventListener('scroll', syncTiptapContentScrollMask);
      ro.disconnect();
    };
  }, [editor, content, isEditorFocused, minimalToolbar, toolbarAtBottom, syncTiptapContentScrollMask]);

  // Create Note bubble menu: ensure its root has higher z-index than the sticky toolbar (z-index 10)
  useLayoutEffect(() => {
    const wrapper = createNoteBubbleRef.current;
    if (wrapper?.parentElement) {
      wrapper.parentElement.style.zIndex = '100';
    }
  }, []);

  // Set isLoaded immediately - SVG icons are imported directly
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Dismiss post-connect color picker on click-outside or Escape
  useEffect(() => {
    if (!postConnectHighlight) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if ((e.target as HTMLElement)?.closest?.('[data-post-connect-picker]')) return;
      setPostConnectHighlight(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPostConnectHighlight(null);
    };
    document.addEventListener('mousedown', onPointerDown, { capture: true });
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, { capture: true } as AddEventListenerOptions);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [postConnectHighlight]);

  // Show loading state if editor is not ready yet
  // Component is client-only, so we don't need isClient check
  if (!editor) {
    return (
      <div className="tiptap-editor-container">
        <input
          ref={hiddenInputRef}
          type="hidden"
          id={id}
          name={name}
          value={content}
        />
        <div className="min-h-[200px] p-4" style={{ color: 'var(--color-pebble-grey)' }}>
          Loading editor...
        </div>
      </div>
    );
  }

  // Handle heading cycle: H2 → H3 → Normal → H2 (single control on classic toolbar)
  const handleHeadingCycle = () => {
    if (!editor) return;

    const currentLevel = activeStates.headingLevel;

    if (currentLevel === 0) {
      editor.chain().focus().setHeading({ level: 2 }).run();
    } else if (currentLevel === 2) {
      editor.chain().focus().setHeading({ level: 3 }).run();
    } else {
      editor.chain().focus().setParagraph().run();
    }
  };

  const freezeFormatToolbarSelection = useCallback(() => {
    if (!editor || !isEditorValid(editor)) return;
    try {
      const { from, to } = editor.state.selection;
      const doc = editor.state.doc;
      const incoming = { from, to };
      const existing = formatToolbarSelectionRef.current;

      if (isEmptyTrailingDocEndSelection(doc, from, to)) {
        if (existing && !isEmptyTrailingDocEndSelection(doc, existing.from, existing.to)) {
          return;
        }
        if (lastInBodySelectionRef.current) {
          formatToolbarSelectionRef.current = { ...lastInBodySelectionRef.current };
          return;
        }
      }

      formatToolbarSelectionRef.current = incoming;
    } catch {
      /* ignore */
    }
  }, [editor]);

  /**
   * The range a format-toolbar press should act on.
   *
   * Never simply the live selection: pressing a toolbar button collapses it, so the toolbar
   * freezes a copy on pointer-down and this prefers that when the live one has gone degenerate.
   * Shared so the Link button asks the same question the format commands do — a button whose
   * enabled state and whose action disagreed about the range would be worse than either.
   */
  const resolveFormatToolbarRange = useCallback(() => {
    if (!editor || !isEditorValid(editor)) return null;
    const live = editor.state.selection;
    const doc = editor.state.doc;
    return pickFormatToolbarSelection({
      frozen: formatToolbarSelectionRef.current,
      liveFrom: live.from,
      liveTo: live.to,
      docSize: doc.content.size,
      lastInBody: lastInBodySelectionRef.current,
      isEmptyTrailingDocEnd: (from, to) => isEmptyTrailingDocEndSelection(doc, from, to),
    });
  }, [editor]);

  const openUrlLinkPromptFromToolbar = useCallback(() => {
    const range = resolveFormatToolbarRange();
    if (!range || range.from === range.to) return;
    openUrlLinkPrompt(range);
  }, [resolveFormatToolbarRange, openUrlLinkPrompt]);

  const runPrototypeFormatCommand = useCallback(
    (apply: (chain: ReturnType<typeof editor.chain>) => ReturnType<typeof editor.chain>) => {
      if (!editor || !isEditorValid(editor)) return;
      const doc = editor.state.doc;
      const range = resolveFormatToolbarRange();
      if (!range) return;
      const ran = runFormatCommandWithPreservedSelection(editor, range, apply);
      if (!ran && import.meta.env?.DEV) {
        console.warn('[TiptapEditor] prototype format command failed', { range });
      } else if (ran) {
        const htmlContent = noteHtmlFromEditor(editor, true);
        if (hiddenInputRef.current) {
          hiddenInputRef.current.value = htmlContent;
        }
        latestNoteHtmlRef.current = htmlContent;
        onContentChange?.(htmlContent);
      }
      formatToolbarSelectionRef.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
      if (
        isMeaningfulFormatBodySelection(
          doc,
          editor.state.selection.from,
          editor.state.selection.to,
        )
      ) {
        lastInBodySelectionRef.current = { ...formatToolbarSelectionRef.current };
      }
      try {
        editor.view.focus();
      } catch {
        /* ignore */
      }
    },
    [editor, onContentChange, resolveFormatToolbarRange],
  );

  /*
   * Held stable across renders, and that is the whole point.
   *
   * This was a plain `const` in the component body, so every render produced a new function
   * — a new element *type* as far as React is concerned — and the reconciler dutifully
   * unmounted and remounted all fourteen toolbar buttons. Each remount restarted the 200ms
   * transition and discarded the imperative filter/transform `setPressedVisual` had written,
   * which is what the flicker was: not an animation, a teardown. It fires on every keystroke,
   * because `activeStates` updates on every keystroke.
   *
   * `editor` is the only value here that can actually change identity; the refs are stable by
   * construction and the two selection helpers are module imports.
   */
  const ToolbarButton = useCallback(({
    onClick, 
    isActive, 
    children, 
    title,
    ariaLabel,
    disabled = false,
    skipPostFocusRestore = false,
  }: {
    onClick: () => void;
    isActive: boolean;
    children: React.ReactNode;
    title: string;
    ariaLabel?: string;
    disabled?: boolean;
    skipPostFocusRestore?: boolean;
  }) => {
    const runToolbarCommand = () => {
      if (disabled) return;
      onClick();
    };

    const setPressedVisual = (el: HTMLButtonElement, pressed: boolean) => {
      el.style.setProperty('filter', pressed ? 'brightness(0.97)' : 'none', 'important');
      el.style.setProperty('transform', pressed ? 'scale(0.98)' : 'none', 'important');
    };

    // Restore ProseMirror focus + selection after a command (portaled toolbar steals focus).
    const restorePostCommandFocus = () => {
      if (skipPostFocusRestore) return;
      setTimeout(() => {
        if (!editor || !isTiptapViewReady(editor) || editor.isFocused) return;
        const doc = editor.state.doc;
        const range = pickFormatToolbarSelection({
          frozen: formatToolbarSelectionRef.current,
          liveFrom: editor.state.selection.from,
          liveTo: editor.state.selection.to,
          docSize: doc.content.size,
          lastInBody: lastInBodySelectionRef.current,
          isEmptyTrailingDocEnd: (from, to) => isEmptyTrailingDocEndSelection(doc, from, to),
        });
        try {
          editor.chain().setTextSelection({ from: range.from, to: range.to }).run();
          editor.view.focus();
        } catch {
          /* ignore */
        }
      }, 0);
    };

    return (
      <button
        type="button"
        disabled={disabled}
        aria-pressed={isActive}
        data-active={isActive ? 'true' : undefined}
        onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
          if (disabled) return;
          // Don't preventDefault here: it would block a native horizontal pan that begins on a
          // button. The command runs on pointerup, only if the press didn't move (see onPointerUp).
          e.stopPropagation();
          toolbarBtnPointerStartRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          toolbarBtnPointerMovedRef.current = false;
          setPressedVisual(e.currentTarget, true);
        }}
        onPointerMove={(e: React.PointerEvent<HTMLButtonElement>) => {
          const start = toolbarBtnPointerStartRef.current;
          if (!start || start.id !== e.pointerId || toolbarBtnPointerMovedRef.current) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (dx * dx + dy * dy > TOOLBAR_TAP_MOVE_THRESHOLD * TOOLBAR_TAP_MOVE_THRESHOLD) {
            // The press turned into a scroll — cancel the pending tap.
            toolbarBtnPointerMovedRef.current = true;
            setPressedVisual(e.currentTarget, false);
          }
        }}
        onPointerUp={(e: React.PointerEvent<HTMLButtonElement>) => {
          const start = toolbarBtnPointerStartRef.current;
          const moved = toolbarBtnPointerMovedRef.current;
          toolbarBtnPointerStartRef.current = null;
          toolbarBtnPointerMovedRef.current = false;
          setPressedVisual(e.currentTarget, false);
          if (disabled) return;
          // Only fire on a clean tap; a moved press was a swipe to scroll the toolbar.
          if (start && start.id === e.pointerId && !moved) {
            e.preventDefault();
            e.stopPropagation();
            runToolbarCommand();
            restorePostCommandFocus();
          }
        }}
        onPointerCancel={(e: React.PointerEvent<HTMLButtonElement>) => {
          toolbarBtnPointerStartRef.current = null;
          toolbarBtnPointerMovedRef.current = false;
          setPressedVisual(e.currentTarget, false);
        }}
        onPointerLeave={(e: React.PointerEvent<HTMLButtonElement>) => {
          // Pointer left the button mid-press — treat as not-a-tap.
          if (toolbarBtnPointerStartRef.current?.id === e.pointerId) {
            toolbarBtnPointerMovedRef.current = true;
          }
          setPressedVisual(e.currentTarget, false);
        }}
        onMouseDown={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          if (disabled) return;
          // Keep focus in ProseMirror; the command itself runs from onPointerUp.
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          // Prevent default click behavior
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`flex items-center justify-center min-w-[2.5rem] min-h-[2.5rem] px-3 py-2 rounded-lg transition-all duration-200 relative ${isActive ? 'ql-active is-active' : ''}`}
        title={title}
        aria-label={ariaLabel || title}
        style={{
          fontFamily: 'var(--font-sans) !important',
          fontSize: '14px !important',
          fontWeight: '500 !important',
          border: 'none !important',
          borderRadius: '8px !important',
          padding: '8px 12px !important',
          margin: '0 !important',
          minWidth: '40px !important',
          minHeight: '40px !important',
          display: 'flex !important',
          alignItems: 'center !important',
          justifyContent: 'center !important',
          boxShadow: 'none !important',
          cursor: disabled ? 'not-allowed !important' : 'pointer !important',
          opacity: disabled ? 0.38 : 1,
          transition: '0.2s ease-in-out !important'
        }}
      >
        <div 
          style={{ 
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'currentColor',
            transition: 'color 0.2s ease-in-out',
          }}
        >
          {children}
        </div>
      </button>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const toggleHeadingLevel = (level: 2 | 3) => {
    if (!editor) return;
    runPrototypeFormatCommand((chain) => chain.toggleHeading({ level }));
  };

  /* Stable for the same reason as ToolbarButton above — a fresh wrapper each render would
     remount every button just as surely as a fresh inner component did. */
  const PrototypeToolbarButton = useCallback(
    (props: Omit<React.ComponentProps<typeof ToolbarButton>, 'skipPostFocusRestore'>) => (
      <ToolbarButton {...props} skipPostFocusRestore />
    ),
    [ToolbarButton],
  );

  const renderPrototypeNativeFormatToolbar = (placement: 'top' | 'bottom' | 'portal') => {
    if (!editor) return null;
    const isInListItem = editor.isActive('listItem');
    const canSink = isInListItem ? editor.can().sinkListItem('listItem') : true;
    const canLift = isInListItem
      ? editor.can().liftListItem('listItem')
      : editor.can().decreaseIndent();
    // Recomputed per render, which `activeStates.hasSelection` is what guarantees: it changes
    // whenever the selection opens or collapses, so this re-runs at the moments that matter.
    const linkRange = resolveFormatToolbarRange();
    const canLinkSelection = !!linkRange && linkRange.from !== linkRange.to;
    const isPortal = placement === 'portal';
    const positionalStyle: React.CSSProperties = isPortal
      ? {}
      : {
          position: 'sticky',
          ...(placement === 'bottom'
            ? { bottom: 0, marginBottom: `${toolbarBottomMargin}px` }
            : { top: 0, marginBottom: '12px' }),
          zIndex: 20,
        };

    return (
      <div
        data-prototype-format-toolbar=""
        className={`tiptap-toolbar tiptap-toolbar--prototype-native p-1 shrink-0 ${
          placement === 'bottom' ? 'tiptap-toolbar--bottom' : ''
        } ${isPortal ? 'tiptap-toolbar--portal' : ''}`}
        style={positionalStyle}
        onPointerDownCapture={() => {
          formatToolbarPointerDownRef.current = true;
          formatToolbarInteractionUntilRef.current = Date.now() + 500;
          freezeFormatToolbarSelection();
        }}
        onPointerUpCapture={() => {
          formatToolbarPointerDownRef.current = false;
        }}
        onPointerCancelCapture={() => {
          formatToolbarPointerDownRef.current = false;
        }}
        onMouseEnter={() => {
          setIsPointerOverFormatToolbar(true);
          if (editorChromeMode === 'prototypeNative') bumpFormatToolbarActivity();
        }}
        onMouseLeave={() => setIsPointerOverFormatToolbar(false)}
      >
        <div className="tiptap-toolbar__hscroll">
          <div className="tiptap-toolbar__scroll-region">
            <TiptapToolbarTrack
              key={toolbarTrackKey}
              compact
              skipEnterAnimation={isPortal}
              placement={placement === 'portal' ? 'bottom' : placement}
            >
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.toggleBold())}
                isActive={activeStates.bold}
                title="Bold"
                ariaLabel="Toggle bold"
              >
                <Icon name="bold" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.toggleItalic())}
                isActive={activeStates.italic}
                title="Italic"
                ariaLabel="Toggle italic"
              >
                <Icon name="italic" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.toggleStrike())}
                isActive={activeStates.strike}
                title="Strikethrough"
                ariaLabel="Toggle strikethrough"
              >
                <Icon name="strikethrough" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <PrototypeToolbarButton
                onClick={openUrlLinkPromptFromToolbar}
                isActive={activeStates.urlLink}
                /* A link needs words to attach to. Judged on the range the press would
                   actually use, not on the live selection, so the button is not greyed out by
                   the very collapse that pressing it causes. */
                disabled={!canLinkSelection}
                title={activeStates.urlLink ? 'Edit link' : 'Link'}
                ariaLabel={activeStates.urlLink ? 'Edit link' : 'Add link'}
              >
                <Icon name="link" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <FormatToolbarDivider />
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.toggleBulletList())}
                isActive={activeStates.bulletList}
                title="Bullet list"
                ariaLabel="Toggle bullet list"
              >
                <Icon name="list" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.toggleOrderedList())}
                isActive={activeStates.orderedList}
                title="Numbered list"
                ariaLabel="Toggle numbered list"
              >
                <Icon name="list-ol" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <FormatToolbarDivider />
              <PrototypeToolbarButton
                onClick={() => toggleHeadingLevel(2)}
                isActive={activeStates.headingLevel === 2}
                title="Heading 2"
                ariaLabel="Toggle heading 2"
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>H2</span>
              </PrototypeToolbarButton>
              <PrototypeToolbarButton
                onClick={() => toggleHeadingLevel(3)}
                isActive={activeStates.headingLevel === 3}
                title="Heading 3"
                ariaLabel="Toggle heading 3"
              >
                <span style={{ fontSize: '13px', fontWeight: 700 }}>H3</span>
              </PrototypeToolbarButton>
              <FormatToolbarDivider />
              <PrototypeToolbarButton
                onClick={() =>
                  runPrototypeFormatCommand((chain) =>
                    isInListItem ? chain.liftListItem('listItem') : chain.decreaseIndent(),
                  )
                }
                isActive={false}
                disabled={!canLift}
                title="Outdent"
                ariaLabel="Outdent"
              >
                <Icon name="outdent" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <PrototypeToolbarButton
                onClick={() =>
                  runPrototypeFormatCommand((chain) =>
                    isInListItem ? chain.sinkListItem('listItem') : chain.increaseIndent(),
                  )
                }
                isActive={false}
                disabled={!canSink}
                title="Indent"
                ariaLabel="Indent"
              >
                <Icon name="indent" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <FormatToolbarDivider />
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.setHorizontalRule())}
                isActive={false}
                title="Horizontal rule"
                ariaLabel="Insert horizontal rule"
              >
                <Icon name="horizontal-rule" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
            </TiptapToolbarTrack>
          </div>
          <div className="tiptap-toolbar__trailing">
            <FormatToolbarDivider />
            <div className="tiptap-toolbar__history">
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.undo())}
                isActive={false}
                disabled={!activeStates.canUndo}
                title="Undo"
                ariaLabel="Undo"
              >
                <Icon name="arrow-rotate-left" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
              <PrototypeToolbarButton
                onClick={() => runPrototypeFormatCommand((chain) => chain.redo())}
                isActive={false}
                disabled={!activeStates.canRedo}
                title="Redo"
                ariaLabel="Redo"
              >
                <Icon name="arrow-rotate-right" size={PROTO_FORMAT_ICON_SIZE} className="proto-toolbar-icon" />
              </PrototypeToolbarButton>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="tiptap-editor-container flex flex-col flex-1 min-h-0 w-full" style={{ minHeight: 0, height: '100%' }}>
      {/* Hidden input for form submission */}
      <input
        ref={hiddenInputRef}
        type="hidden"
        id={id}
        name={name}
        value={editor.getHTML()}
      />

      {/* Toolbar above or below scroll area; below keeps it visible above keyboard on mobile */}
      {!minimalToolbar && isEditorFocused && !toolbarAtBottom && editorChromeMode !== 'prototypeNative' && (
        <div
          className="tiptap-toolbar p-1 border border-[var(--color-fog-white)] rounded-xl bg-[var(--color-snow-white)] shrink-0"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            marginBottom: '12px',
            backgroundColor: 'var(--color-snow-white)',
          }}
        >
          <div className="tiptap-toolbar__hscroll">
          <TiptapToolbarTrack key={toolbarTrackKey} placement="top">
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().undo().run();
            }}
            isActive={false}
            disabled={!activeStates.canUndo}
            title="Undo"
            ariaLabel="Undo"
          >
            <Icon name="arrow-rotate-left" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().redo().run();
            }}
            isActive={false}
            disabled={!activeStates.canRedo}
            title="Redo"
            ariaLabel="Redo"
          >
            <Icon name="arrow-rotate-right" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleBold().run();
            }}
            isActive={activeStates.bold}
            title="bold"
            ariaLabel="Toggle bold"
          >
            <Icon name="bold" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleItalic().run();
            }}
            isActive={activeStates.italic}
            title="italic"
            ariaLabel="Toggle italic"
          >
            <Icon name="italic" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleUnderline().run();
            }}
            isActive={activeStates.underline}
            title="underline"
            ariaLabel="Toggle underline"
          >
            <Icon name="underline" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              handleHeadingCycle();
            }}
            isActive={activeStates.headingLevel > 0}
            title={`heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
            ariaLabel={`Toggle heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
          >
            <Icon name="heading" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleOrderedList().run();
            }}
            isActive={activeStates.orderedList}
            title="list: ordered"
            ariaLabel="Toggle ordered list"
          >
            <Icon name="list-ol" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().toggleBulletList().run();
            }}
            isActive={activeStates.bulletList}
            title="list: bullet"
            ariaLabel="Toggle bullet list"
          >
            <Icon name="list" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          
          <ToolbarButton
            onClick={() => {
              if (!editor) {
                return;
              }
              editor.chain().focus().clearNodes().unsetAllMarks().run();
            }}
            isActive={false}
            title="clean"
            ariaLabel="Clear formatting"
          >
            <Icon name="eraser" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          </TiptapToolbarTrack>
          </div>
        </div>
      )}
      {!minimalToolbar &&
        editorChromeMode === 'prototypeNative' &&
        !columnFormatToolbarPortal &&
        !formatToolbarPortalTarget &&
        shouldShowPrototypeFormatToolbar &&
        !toolbarAtBottom &&
        renderPrototypeNativeFormatToolbar('top')}
      {/* Scroll area with optional top fade when scrolled; toolbar is outside so not faded */}
      <div
        ref={tiptapContentRef}
        className={`tiptap-content flex-1 min-h-0 overflow-auto relative ${contentOverflowing && contentHasScrolledDown ? 'tiptap-content--top-fade' : ''}`}
        onClick={(e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
          // Portal children (study dock, translation picker, etc.) are in TipTap's React tree
          // so their clicks bubble here even though they live in a different DOM node.
          // Only re-focus the editor when the click physically came from inside this DOM node.
          if (!e.currentTarget.contains(e.target as Node)) return;
          if (editor) {
            editor.commands.focus();
          }
        }}
      >
        <EditorContent editor={editor} />
        {/* Hover preview card for scripture pills + note links + url-link. */}
        {hoverPreview ? (
          <LinkPreviewCard
            kind={hoverPreview.kind}
            anchorRect={hoverPreview.anchorRect}
            payload={hoverPreview.payload}
            onOpen={
              hoverPreview.kind === 'url'
                ? handleHoverPreviewOpen
                : (hoverPreview.payload.noteId || hoverPreview.payload.scriptureNoteId)
                  ? handleHoverPreviewOpen
                  : undefined
            }
            onEdit={hoverPreview.kind === 'url' ? editUrlLinkFromHoverCard : undefined}
            onRemove={hoverPreview.kind === 'url' ? removeUrlLinkFromHoverCard : undefined}
            onDismiss={dismissHoverPreview}
            onPointerEnter={cancelHoverPreviewHide}
            onPointerLeave={dismissHoverPreview}
          />
        ) : null}
        {/* URL link prompt — floating input for adding/editing the urlLink mark. */}
        {urlLinkPrompt && createPortal(
          <UrlLinkPromptUI
            rect={urlLinkPrompt.rect}
            initialHref={urlLinkPrompt.initialHref}
            mode={urlLinkPrompt.mode}
            onSubmit={applyUrlLink}
            onRemove={urlLinkPrompt.mode === 'edit' ? removeUrlLinkAtCurrentRange : undefined}
            onCancel={() => setUrlLinkPrompt(null)}
          />,
          document.body,
        )}
        {/* Floating ✓ confirm for an inline scripture draft (prototype). Rendered outside the
            editor so it never blocks iOS text entry the way an inline non-editable widget did. */}
        {scriptureDraftConfirm && editorChromeMode === 'prototypeNative' && createPortal(
          <button
            type="button"
            className={`scripture-draft-confirm-float${
              scriptureDraftConfirm.invalidReason ? ' scripture-draft-confirm-float--invalid' : ''
            }`}
            aria-label={
              scriptureDraftConfirm.invalidReason
                ? `Can't add this reference — ${scriptureDraftConfirm.invalidReason}`
                : 'Confirm scripture reference'
            }
            aria-disabled={scriptureDraftConfirm.invalidReason ? true : undefined}
            title={scriptureDraftConfirm.invalidReason ?? 'Confirm'}
            style={{
              position: 'fixed',
              top: scriptureDraftConfirm.top,
              left: scriptureDraftConfirm.left,
              zIndex: 99999,
              pointerEvents: 'auto',
            }}
            onPointerDown={(e) => {
              // preventDefault keeps the editor selection/focus alive and beats the blur handler.
              e.preventDefault();
              e.stopPropagation();
              if (!editor || !isEditorValid(editor)) return;
              // Out-of-canon reference: the commit would refuse anyway, and the
              // confirmAnyScriptureDraftView fallback below would just retry the same doomed
              // draft. Leave the draft open so the user can fix it in place.
              if (scriptureDraftConfirm.invalidReason) return;
              const view = editor.view;
              const to = scriptureDraftConfirm.to;
              if (confirmScriptureDraftView(view, to, { focus: true }) == null) {
                confirmAnyScriptureDraftView(view);
              }
            }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <path
                d="M13.5 4.5l-6.5 7-3.5-3.5"
                fill="none"
                stroke="#fff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>,
          document.body,
        )}
        {/* Custom floating selection action bar — positioned via selectionUpdate event */}
        {/* Uses createPortal like the translation picker for reliable positioning */}
        {selectionActionBar && enableCreateNoteFromSelection && !selectionBarSuppressedOnTouch && createPortal(
          <SelectionBarShell
            inChromeBar={selectionActionsInChromeBar}
            barRef={createNoteBubbleRef}
            top={selectionActionBar.top}
            left={selectionActionBar.left}
          >
            {editorChromeMode === 'prototypeNative' ? (
              <div
                className={`pds-native-selection-bar${
                  selectionActionsInChromeBar
                    ? ' pds-native-selection-bar--toolbar'
                    : ' floating-picker-enter'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => e.preventDefault()}
              >
                <button
                  type="button"
                  className="pds-native-selection-bar__btn"
                  title="Highlight selected text"
                  aria-label="Highlight selected text"
                  onPointerDownCapture={(e: React.PointerEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const range = resolveSelectionBarRange();
                    if (!range || !editor || !isEditorValid(editor)) return;
                    const { from, to, snippet } = range;
                    const defaultAccent = 'warmAmber';
                    const anchorLocation = sharedAnnotationOverlayMode
                      ? editor.state.doc.textBetween(0, from, '\n').length
                      : from;
                    const anchorLength = sharedAnnotationOverlayMode
                      ? snippet.length
                      : Math.max(0, to - from);

                    void (async () => {
                      let studyId: string | null = null;
                      if (editorChromeMode === 'prototypeNative' && sourceNoteId) {
                        try {
                          const res = await fetch(`/api/notes/${sourceNoteId}/study-threads`, {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(
                              withStudyThreadContext(
                                {
                                  entryKind: 'miniNote',
                                  sourceSnippet: snippet,
                                  highlightAccentRaw: defaultAccent,
                                  anchorTextSnapshot: snippet,
                                  anchorLocation,
                                  anchorLength,
                                },
                                contextSpaceId,
                              ),
                            ),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            studyId = data.studyThread?.id ?? null;
                            if (studyId) syncStudyThreadList(sourceNoteId);
                          } else if (sharedAnnotationOverlayMode && window.toast) {
                            window.toast.error('Could not create highlight. Try again.');
                          }
                        } catch {
                          if (sharedAnnotationOverlayMode && window.toast) {
                            window.toast.error('Could not create highlight. Try again.');
                          }
                        }
                      }

                      if (!editor || !isEditorValid(editor)) return;
                      if (sharedAnnotationOverlayMode) {
                        if (!studyId) return;
                        clearSelectionActionBar();
                        releaseEditorFocusForStudyDock();
                        if (editorChromeMode === 'prototypeNative') {
                          setStudyDockStack((s) =>
                            openOrFocusHighlight(s, {
                              studyThreadEntryId: studyId,
                              accent: defaultAccent,
                              excerpt: snippet,
                              range: { from, to },
                              entryKind: 'miniNote',
                              focusTitle: deriveHighlightFocusTitle(snippet),
                              miniNoteBody: '',
                              isOwnHighlight: true,
                            }),
                          );
                        }
                        onSharedAnnotationCreated?.();
                        return;
                      }
                      const applied = applyHighlightMark(
                        { from, to },
                        {
                          color: defaultAccent,
                          ...(studyId ? { studyThreadEntryId: studyId } : {}),
                        },
                        { focusEditor: false },
                      );
                      if (!applied) {
                        if (import.meta.env.DEV) {
                          console.warn('[TiptapEditor] setHighlight failed for range', { from, to });
                        }
                        return;
                      }
                      if (hiddenInputRef.current) {
                        hiddenInputRef.current.value = editor.getHTML();
                      }
                      onContentChange?.(editor.getHTML());
                      clearSelectionActionBar();
                      releaseEditorFocusForStudyDock();
                      if (editorChromeMode === 'prototypeNative') {
                        setStudyDockStack((s) =>
                          openOrFocusHighlight(s, {
                            studyThreadEntryId: studyId,
                            accent: defaultAccent,
                            excerpt: snippet,
                            range: { from, to },
                            entryKind: 'miniNote',
                            focusTitle: deriveHighlightFocusTitle(snippet),
                            miniNoteBody: '',
                          }),
                        );
                      }
                      if (!studyId && sourceNoteId && spaceId && editor && isEditorValid(editor)) {
                        void backfillOrphanHighlights({
                          editor,
                          sourceNoteId,
                          spaceId,
                          applyMark: (r, attrs) => applyHighlightMark(r, attrs, { focusEditor: false }),
                        }).then((count) => {
                          if (count <= 0 || !editor || !isEditorValid(editor)) return;
                          if (hiddenInputRef.current) {
                            hiddenInputRef.current.value = editor.getHTML();
                          }
                          onContentChange?.(editor.getHTML());
                        });
                      }
                    })();
                  }}
                >
                  <Icon name="highlighter" size={14} />
                  <span className="pds-native-selection-bar__label">Highlight</span>
                </button>
                {sourceNoteId && spaceId && !sharedAnnotationOverlayMode ? (
                  <>
                    <span className="pds-native-selection-bar__rule" aria-hidden />
                    <button
                      type="button"
                      className="pds-native-selection-bar__btn"
                      title="Connect existing note to selection"
                      aria-label="Connect existing note to selection"
                      onPointerDownCapture={(e: React.PointerEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const range = resolveSelectionBarRange();
                        if (range && editor && isEditorValid(editor)) {
                          const anchorLocation = editor.state.doc.textBetween(0, range.from, '\n').length;
                          setConnectFromSelectionRange({
                            from: range.from,
                            to: range.to,
                            text: range.snippet,
                            anchorLocation,
                            anchorLength: range.snippet.length,
                          });
                        } else {
                          setConnectFromSelectionRange(null);
                        }
                        setConnectFromSelectionAnchorRect(
                          createNoteBubbleRef.current?.getBoundingClientRect() ?? null,
                        );
                        setConnectFromSelectionOpen(true);
                        clearSelectionActionBar();
                      }}
                    >
                      <Icon name="arrow-right-arrow-left" size={14} />
                      <span className="pds-native-selection-bar__label">Connect</span>
                    </button>
                  </>
                ) : null}
                <span className="pds-native-selection-bar__rule" aria-hidden />
                <button
                  type="button"
                  className="pds-native-selection-bar__btn"
                  title="New Harvous note from selection"
                  aria-label="New Harvous note from selection"
                  onPointerDownCapture={(e: React.PointerEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const range = resolveSelectionBarRange();
                    void handleCreateNoteFromSelection(range ? { from: range.from, to: range.to } : undefined);
                    clearSelectionActionBar();
                  }}
                >
                  <Icon name="pen-to-square" size={14} />
                  <span className="pds-native-selection-bar__label">New note</span>
                </button>
                {selectionActionBar &&
                rangeHasHighlightMark(editor, selectionActionBar.from, selectionActionBar.to) ? (
                  <>
                    <span className="pds-native-selection-bar__rule" aria-hidden />
                    <button
                      type="button"
                      className="pds-native-selection-bar__btn"
                      title="Clear highlight from selection"
                      aria-label="Clear highlight from selection"
                      onPointerDownCapture={(e: React.PointerEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const range = resolveSelectionBarRange();
                        if (!range || !editor || !isEditorValid(editor)) return;
                        const { from, to } = range;
                        const markType = editor.state.schema.marks.highlight;
                        let studyId: string | null = null;
                        editor.state.doc.nodesBetween(from, to, (node: any) => {
                          if (!node.isText || studyId) return;
                          const m = node.marks.find((x: any) => x.type.name === 'highlight');
                          if (m?.attrs?.studyThreadEntryId) {
                            studyId = m.attrs.studyThreadEntryId;
                          }
                        });
                        void (async () => {
                          if (studyId) {
                            try {
                              await fetch(`/api/study-threads/${studyId}${studyThreadContextSuffix}`, {
                                method: 'DELETE',
                                credentials: 'include',
                              });
                              syncStudyThreadList(sourceNoteId);
                            } catch {
                              /* still strip mark */
                            }
                          }
                          if (editor && isEditorValid(editor)) {
                            editor
                              .chain()
                              .focus()
                              .setTextSelection({ from, to })
                              .unsetHighlight()
                              .run();
                            if (hiddenInputRef.current) {
                              hiddenInputRef.current.value = editor.getHTML();
                            }
                            onContentChange?.(editor.getHTML());
                          }
                          clearSelectionActionBar();
                          if (studyId) {
                            setStudyDockStack((s) => {
                              const entry = s.entries.find(
                                (e) =>
                                  e.kind === 'highlight' && e.session.studyThreadEntryId === studyId,
                              );
                              return entry ? closeDockEntry(s, entry.id) : s;
                            });
                          }
                        })();
                      }}
                    >
                      <Icon name="eraser" size={14} />
                      <span className="pds-native-selection-bar__label">Clear</span>
                    </button>
                  </>
                ) : null}
              </div>
            ) : (
              <div
                className="floating-picker-enter"
                style={{
                  display: 'flex',
                  gap: '4px',
                  padding: '4px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--color-snow-white)',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button
                  className="selection-action-btn"
                  onMouseDown={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const range = resolveSelectionBarRange();
                    void handleCreateNoteFromSelection(range ? { from: range.from, to: range.to } : undefined);
                    clearSelectionActionBar();
                  }}
                  type="button"
                  title="Create note from selection"
                >
                  <Icon name="note-sticky" size={12} />
                  Create Note
                </button>
                <button
                  className="selection-action-btn"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const range = resolveSelectionBarRange();
                    if (!range) return;
                    navigator.clipboard.writeText(range.snippet).then(() => {
                      if (window.toast) window.toast.info('Copied to clipboard');
                    }).catch(() => {});
                    clearSelectionActionBar();
                  }}
                  type="button"
                  title="Copy selection"
                >
                  <Icon name="copy" size={12} />
                  Copy
                </button>
              </div>
            )}
          </SelectionBarShell>,
          selectionActionsInChromeBar && formatToolbarPortalTarget
            ? formatToolbarPortalTarget
            : document.body,
        )}
        {/* Delete confirmation floater — appears on first Backspace/Delete near a pill */}
        {deleteConfirmPill ? (
          <ScripturePillDeleteConfirm
            anchorRect={deleteConfirmPill.rect}
            onEdit={
              editorChromeMode === 'prototypeNative'
                ? () => {
                    const confirm = deleteConfirmPillRef.current;
                    if (!confirm || !editor || !isEditorValid(editor)) return;
                    setDeleteConfirmPill(null);
                    deleteConfirmPillRef.current = null;
                    // Mobile can't edit the reference inline reliably, so "Edit" opens the scripture
                    // dock (with its book/chapter/verse/translation picker) for this pill instead of
                    // converting it back to an inline draft.
                    const { start, end } = confirm.boundaries;
                    let pillMark: any = null;
                    editor.state.doc.nodesBetween(start, end, (node: any) => {
                      if (!pillMark && node.isText) {
                        const m = node.marks.find((x: any) => x.type?.name === 'scripturePill');
                        if (m) pillMark = m;
                      }
                    });
                    setTranslationPicker(null);
                    suppressScriptureDockDismiss();
                    const session: ScripturePillDockSession = {
                      boundaries: { from: start, to: end },
                      reference: confirm.reference,
                      translation: pillMark?.attrs?.translation ?? null,
                      noteId: pillMark?.attrs?.noteId ?? null,
                      pillAccent: pillMark?.attrs?.pillAccent ?? null,
                    };
                    setStudyDockStack((s) => openOrFocusScripture(s, session));
                    requestAnimationFrame(() => {
                      try {
                        window.getSelection()?.removeAllRanges();
                      } catch {
                        /* ignore */
                      }
                      releaseEditorFocusForStudyDock();
                    });
                  }
                : undefined
            }
            onConfirm={() => {
              const confirm = deleteConfirmPillRef.current;
              if (!confirm || !editor) return;
              setDeleteConfirmPill(null);
              deleteConfirmPillRef.current = null;
              editor.chain().deleteRange({ from: confirm.boundaries.start, to: confirm.boundaries.end }).run();
            }}
            onDismiss={() => {
              setDeleteConfirmPill(null);
              deleteConfirmPillRef.current = null;
            }}
          />
        ) : null}
        {/* Custom floating translation picker — positioned via pill click event, not BubbleMenu */}
        {/* BubbleMenu can't detect non-inclusive marks at cursor boundary positions */}
        {translationPicker && editorChromeMode !== 'prototypeNative' && createPortal(
          <div
            data-harvous-bottom-sheet-floating=""
            className="scripture-translation-picker floating-picker-enter"
            style={{
              position: 'fixed',
              top: translationPicker.rect.bottom + 6,
              left: Math.max(8, translationPicker.rect.left + (translationPicker.rect.width / 2) - 160),
              zIndex: 99999,
              pointerEvents: 'auto',
              padding: '4px 0',
              borderRadius: '10px',
              backgroundColor: 'var(--color-snow-white)',
              boxShadow: '0 1px 6px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)',
              maxWidth: '216px',
              overflow: 'hidden',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div
              ref={(el) => {
                if (!el) return;
                const selected = el.querySelector('.translation-picker-badge--selected') as HTMLElement;
                if (selected) {
                  requestAnimationFrame(() => {
                    selected.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
                  });
                }
              }}
              style={{
                display: 'flex',
                gap: '4px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                padding: '0 4px',
              }}
            >
            {TRANSLATION_ORDER.map((tid) => {
              const currentTranslation =
                translationPicker.translation ||
                (getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation());
              const isSelected = currentTranslation === tid;
              return (
                <button
                  key={tid}
                  className={`translation-picker-badge${isSelected ? ' translation-picker-badge--selected' : ''}`}
                  style={translationPicker.updating && !isSelected ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!editor || isSelected || translationPicker.updating) return;

                    // Find the pill mark by matching reference and update its translation
                    try {
                      const doc = editor.state.doc;
                      const targetRef = translationPicker.reference;
                      let pillFrom = -1, pillTo = -1, existingMark: any = null;
                      doc.descendants((node: any, nodePos: number) => {
                        if (pillFrom !== -1) return false;
                        if (!node.isText) return;
                        const mark = node.marks.find((m: any) =>
                          m.type.name === 'scripturePill' &&
                          normalizeScriptureReference(m.attrs.reference) === normalizeScriptureReference(targetRef)
                        );
                        if (mark) {
                          pillFrom = nodePos;
                          pillTo = nodePos + node.nodeSize;
                          existingMark = mark;
                          return false;
                        }
                      });

                      if (pillFrom !== -1 && existingMark) {
                        const markType = editor.state.schema.marks.scripturePill;
                        const tr = editor.state.tr;
                        tr.removeMark(pillFrom, pillTo, markType);
                        tr.addMark(pillFrom, pillTo, markType.create({
                          ...existingMark.attrs,
                          translation: tid,
                        }));
                        editor.view.dispatch(tr);

                        // Update picker state: reflect new selection and mark as updating
                        setTranslationPicker(prev => prev ? { ...prev, translation: tid, updating: true } : null);

                        // Await the API call so the scripture note is ready before the user navigates to it
                        const noteId = existingMark.attrs.noteId;
                        if (noteId && noteId !== 'pending' && noteId !== 'null') {
                          fetch('/api/scripture/update-translation', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ noteId, newTranslation: tid }),
                            credentials: 'include',
                          })
                            .then(() => {
                              // Invalidate React Query cache for this scripture note
                              // so navigating to it shows the updated translation immediately
                              window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId } }));
                              setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                            })
                            .catch(() => {
                              setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                            });
                        } else {
                          // No API call needed — just clear the loading state
                          setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                        }
                      }
                    } catch (err) {
                      console.error('[TranslationPicker] Error updating pill:', err);
                      setTranslationPicker(prev => prev ? { ...prev, updating: false } : null);
                    }
                  }}
                  type="button"
                >
                  {TRANSLATIONS[tid]?.abbreviation || tid}
                </button>
              );
            })}
            </div>
          </div>,
          document.body
        )}
        {/* @ mention typeahead — caret-anchored floating picker. No chrome-mode gate:
            the prototype (prototypeNative) surface is the primary consumer. */}
        {mentionPicker && createPortal(
          <div
            data-harvous-bottom-sheet-floating=""
            className="mention-picker floating-picker-enter"
            style={mentionPickerPortalStyle(mentionPicker.rect)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <MentionPickerPanel
              items={visibleMentionItems(mentionPicker)}
              activeIndex={mentionPicker.activeIndex}
              kindFilter={mentionPicker.kindFilter}
              availableKinds={mentionKinds}
              query={mentionPicker.query}
              onKindFilterChange={(kind) => {
                const state = mentionPickerRef.current;
                if (!state || state.kindFilter === kind) return;
                const next = { ...state, kindFilter: kind, activeIndex: 0 };
                mentionPickerRef.current = next;
                setMentionPicker(next);
              }}
              onCommit={(item) => {
                const state = mentionPickerRef.current;
                if (!state || !editor) return;
                commitMentionPickerItem(editor, state, item, () => {
                  mentionPickerRef.current = null;
                  setMentionPicker(null);
                  mentionDismissedAtRef.current = null;
                });
              }}
              onActiveIndexChange={(index) => {
                const state = mentionPickerRef.current;
                if (!state || state.activeIndex === index) return;
                const next = { ...state, activeIndex: index };
                mentionPickerRef.current = next;
                setMentionPicker(next);
              }}
            />
          </div>,
          document.body
        )}
        {editorChromeMode === 'prototypeNative' &&
          studyDockStackHasEntries(studyDockStack) &&
          createPortal(
            <StudyDockCarouselWeb
              stack={studyDockStack}
              onSelectEntry={(id) => setStudyDockStack((s) => setActiveDockEntry(s, id))}
              onMoveEntry={(entryId, toIndex) =>
                setStudyDockStack((s) => moveDockEntryToIndex(s, entryId, toIndex))
              }
              renderEntry={(entry, isActive) => {
                const cardExpanded = isActive && entry.expanded;
                if (entry.kind === 'scripture' && entry.session.readOnly) {
                  // Read-only passage card (opened from a cross-reference): no pill write-back,
                  // no accent swatch, no quote-to-note (nothing to attribute it back to). It IS
                  // real Scripture though, so selecting text can still highlight it — that only
                  // needs the passage's own reference, not a pill. Cross-refs inside it can
                  // chain to more cards.
                  return (
                    <ScripturePillChromeWeb
                      key={entry.id}
                      reference={entry.session.reference}
                      translation={entry.session.translation}
                      sourceNoteId={sourceNoteId ?? null}
                      interactionActive={isActive}
                      animateEnter={false}
                      expanded={cardExpanded}
                      readOnly
                      onExpandedChange={(next) => {
                        setStudyDockStack((s) =>
                          updateDockEntry(s, entry.id, (e) => ({ ...e, expanded: next })),
                        );
                      }}
                      onDone={() => {
                        setStudyDockStack((s) => closeDockEntry(s, entry.id));
                      }}
                      onApply={() => {
                        /* read-only — no pill to write */
                      }}
                      onPassageHighlightCreated={(excerpt, threadId, accent) => {
                        syncStudyThreadList(sourceNoteId);
                        setStudyDockStack((s) =>
                          openOrFocusHighlight(
                            s,
                            {
                              studyThreadEntryId: threadId,
                              accent: accent ?? 'warmAmber',
                              excerpt,
                              range: null,
                              focusTitle: excerpt.slice(0, 80),
                              entryKind: 'scriptureLink',
                              scriptureReference: entry.session.reference,
                              scripturePassageTranslation: entry.session.translation || 'NET',
                            },
                            { openedFromDockId: entry.id },
                          ),
                        );
                      }}
                      onPassageQuoteToNote={(payload) => handlePassageQuoteToNote(payload, entry.session)}
                      editorChromeMode={editorChromeMode}
                      onOpenScripturePassage={(ref, translation) =>
                        openScripturePassage(ref, translation, entry.id)
                      }
                      onOpenPassageReference={(word, opts) => {
                        if (!sourceNoteId) return;
                        openReferenceDock(
                          {
                            query: word,
                            passageReference: {
                              reference: entry.session.reference,
                              translation: entry.session.translation || 'NET',
                              sourceNoteId,
                            },
                          },
                          entry.id,
                        );
                      }}
                      onNavigateNote={(noteId) => {
                        const fullId = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
                        safeNavigate(noteUrlForCurrentSurface(fullId, undefined, sourceNoteId || undefined));
                      }}
                    />
                  );
                }
                if (entry.kind === 'scripture') {
                  return (
                    <ScripturePillChromeWeb
                      key={entry.id}
                      /* The row a suggestion pointed at, marked in this card's related-passages
                         list — see `highlightCrossRef` on the session. */
                      highlightCrossRef={entry.session.highlightCrossRef ?? null}
                      reference={entry.session.reference}
                      translation={entry.session.translation}
                      sourceNoteId={sourceNoteId ?? null}
                      onExpandToReader={onExpandScriptureToReader}
                      onPassageShown={onScripturePassageShown}
                      initialPillAccent={entry.session.pillAccent}
                      interactionActive={isActive}
                      animateEnter={false}
                      expanded={cardExpanded}
                      onExpandedChange={(next) => {
                        setStudyDockStack((s) =>
                          updateDockEntry(s, entry.id, (e) => ({ ...e, expanded: next })),
                        );
                      }}
                      onPillAccentChange={(nextAccent) => {
                        if (!editor || !isEditorValid(editor) || entry.kind !== 'scripture') return;
                        suppressScriptureDockDismiss();
                        if (contentPropagateRafRef.current != null) {
                          cancelAnimationFrame(contentPropagateRafRef.current);
                          contentPropagateRafRef.current = null;
                        }
                        const resolved = resolveScripturePillMarkForAccentChange(
                          editor,
                          entry.session.boundaries!,
                          entry.session.reference,
                        );
                        if (!resolved) return;
                        const { mark: existingMark, from, to } = resolved;
                        const markType = editor.state.schema.marks.scripturePill;
                        if (!markType) return;
                        const persistedAccent = nextAccent === 'neutral' ? null : nextAccent;
                        const tr = editor.state.tr;
                        tr.removeMark(from, to, markType);
                        tr.addMark(
                          from,
                          to,
                          markType.create({
                            ...existingMark.attrs,
                            pillAccent: persistedAccent,
                          }),
                        );
                        tr.setMeta('addToHistory', false);
                        editor.view.dispatch(tr);
                        syncScripturePillAccentDom(editor, from, to, persistedAccent);
                        syncAdjacentScriptureQuoteAccents(editor, from, to, persistedAccent);
                        const html = noteHtmlFromEditor(editor, true);
                        if (hiddenInputRef.current) {
                          hiddenInputRef.current.value = html;
                        }
                        latestNoteHtmlRef.current = html;
                        onContentChange?.(html);
                        setStudyDockStack((s) =>
                          updateDockEntry(s, entry.id, (e) =>
                            e.kind === 'scripture'
                              ? {
                                  ...e,
                                  session: {
                                    ...e.session,
                                    pillAccent: persistedAccent,
                                    boundaries: { from, to },
                                  },
                                }
                              : e,
                          ),
                        );
                      }}
                      onDone={() => {
                        setStudyDockStack((s) => closeDockEntry(s, entry.id));
                        queueMicrotask(() => {
                          try {
                            if (editor && isEditorValid(editor)) {
                              editor.commands.focus();
                            }
                          } catch {
                            /* ignore */
                          }
                        });
                      }}
                      onApply={async (nextRef, nextTranslation) => {
                        if (!editor || entry.kind !== 'scripture') return;
                        const sess = entry.session;
                        try {
                          const markType = editor.state.schema.marks.scripturePill;
                          if (!markType) return;

                          const normRef = normalizeScriptureReference(nextRef);
                          const { from, to } = resolveScripturePillMarkRangeFromBoundaries(
                            editor,
                            sess.boundaries!,
                          );

                          let existingMark: any = null;
                          editor.state.doc.nodesBetween(from, to, (node: any) => {
                            if (!existingMark && node.isText) {
                              const m = node.marks.find((x: any) => x.type?.name === 'scripturePill');
                              if (m) existingMark = m;
                            }
                          });
                          if (!existingMark) return;

                          const pillAccent =
                            existingMark.attrs.pillAccent ?? sess.pillAccent ?? null;
                          const translationUnchanged =
                            (existingMark.attrs.translation ?? null) === (nextTranslation ?? null);
                          const refUnchanged =
                            normalizeScriptureReference(existingMark.attrs.reference) === normRef;
                          const accentUnchanged =
                            (existingMark.attrs.pillAccent ?? null) === (pillAccent ?? null);
                          if (refUnchanged && translationUnchanged && accentUnchanged) {
                            return;
                          }

                          const tr = editor.state.tr;
                          tr.replaceWith(from, to, editor.state.schema.text(normRef, [
                            markType.create({
                              ...existingMark.attrs,
                              reference: normRef,
                              translation: nextTranslation,
                              pillAccent,
                            }),
                          ]));
                          tr.setMeta('addToHistory', false);
                          // The rewrite moves the caret; suppress the selectionUpdate
                          // collapse handler for this one programmatic change so editing the
                          // reference from the dock doesn't collapse the card.
                          suppressScriptureDockDismiss();
                          editor.view.dispatch(tr);

                          const resolved = resolveScripturePillMarkRangeFromBoundaries(editor, { from, to });
                          await syncAdjacentScriptureQuotesForPillApply(
                            editor,
                            resolved.from,
                            resolved.to,
                            normRef,
                            nextTranslation,
                            pillAccent,
                          );

                          const html = noteHtmlFromEditor(editor, true);
                          if (hiddenInputRef.current) {
                            hiddenInputRef.current.value = html;
                          }
                          latestNoteHtmlRef.current = html;
                          onContentChange?.(html);

                          const noteIdForApi = existingMark.attrs.noteId;
                          const sessionRefUnchanged = normalizeScriptureReference(sess.reference) === normRef;
                          if (
                            sessionRefUnchanged &&
                            noteIdForApi &&
                            noteIdForApi !== 'pending' &&
                            noteIdForApi !== 'null' &&
                            sess.translation !== nextTranslation
                          ) {
                            await fetch('/api/scripture/update-translation', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ noteId: noteIdForApi, newTranslation: nextTranslation }),
                              credentials: 'include',
                            });
                            // Re-arm the suppression window: the fetch above can outlast the initial
                            // window, and the `noteUpdated` content re-sync emits its own selection
                            // updates that would otherwise collapse the still-open dock.
                            suppressScriptureDockDismiss();
                            window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: noteIdForApi } }));
                          }

                          setStudyDockStack((s) =>
                            updateDockEntry(s, entry.id, (e) =>
                              e.kind === 'scripture'
                                ? {
                                    ...e,
                                    // Keep stableKey in sync with the rewritten pill so re-clicking
                                    // the pill focuses this entry instead of spawning a duplicate.
                                    stableKey: scriptureDockStableKey(normRef, resolved),
                                    session: {
                                      ...e.session,
                                      reference: normRef,
                                      translation: nextTranslation,
                                      boundaries: resolved,
                                      pillAccent,
                                    },
                                  }
                                : e,
                            ),
                          );
                        } catch (err) {
                          console.error('[ScripturePillChrome] apply failed:', err);
                        }
                      }}
                      onPassageHighlightCreated={(excerpt, threadId, accent) => {
                        syncStudyThreadList(sourceNoteId);
                        setStudyDockStack((s) =>
                          openOrFocusHighlight(
                            s,
                            {
                              studyThreadEntryId: threadId,
                              accent: accent ?? 'warmAmber',
                              excerpt,
                              range: null,
                              focusTitle: excerpt.slice(0, 80),
                              entryKind: 'scriptureLink',
                              scriptureReference: entry.session.reference,
                              scripturePassageTranslation: entry.session.translation || 'NET',
                            },
                            { openedFromDockId: entry.id },
                          ),
                        );
                      }}
                      onPassageQuoteToNote={(payload) => handlePassageQuoteToNote(payload, entry.session)}
                      editorChromeMode={editorChromeMode}
                      onOpenPassageReference={(word, opts) => {
                        if (!sourceNoteId) return;
                        // Inline scriptureLink highlight tapped — open its highlight dock
                        // (native: tapping a painted excerpt opens ActiveHighlightDock).
                        if (opts?.saved && opts.threadId && opts.entryKind === 'scriptureLink') {
                          setStudyDockStack((s) =>
                            openOrFocusHighlight(
                              s,
                              {
                                studyThreadEntryId: opts.threadId ?? null,
                                accent: opts.accent ?? 'warmAmber',
                                excerpt: word,
                                range: null,
                                focusTitle: word.slice(0, 80),
                                entryKind: 'scriptureLink',
                                scriptureReference: entry.session.reference,
                                scripturePassageTranslation: entry.session.translation || 'NET',
                              },
                              { openedFromDockId: entry.id },
                            ),
                          );
                          return;
                        }
                        const passageCtx = {
                          reference: entry.session.reference,
                          translation: entry.session.translation || 'NET',
                          sourceNoteId,
                        };
                        if (opts?.saved && opts.threadId) {
                          openReferenceDock(
                            {
                              query: word,
                              passageReference: passageCtx,
                              passageReferenceSaved: true,
                              studyThreadEntryId: opts.threadId,
                              noteHighlightAccent: opts.accent ?? 'warmAmber',
                            },
                            entry.id,
                          );
                          return;
                        }
                        openReferenceDock(
                          {
                            query: word,
                            passageReference: passageCtx,
                          },
                          entry.id,
                        );
                      }}
                      onNavigateNote={(noteId) => {
                        const fullId = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
                        safeNavigate(noteUrlForCurrentSurface(fullId, undefined, sourceNoteId || undefined));
                      }}
                      onOpenScripturePassage={(ref, translation) =>
                        openScripturePassage(ref, translation, entry.id)
                      }
                    />
                  );
                }
                if (entry.kind === 'highlight') {
                  return (
                    <HighlightDockWeb
                      key={entry.id}
                      accent={entry.session.accent}
                      excerpt={entry.session.excerpt}
                      focusTitle={entry.session.focusTitle}
                      miniNoteBody={entry.session.miniNoteBody}
                      entryKind={entry.session.entryKind}
                      studyThreadEntryId={entry.session.studyThreadEntryId}
                      authorDisplayName={entry.session.authorDisplayName}
                      isOwnHighlight={entry.session.isOwnHighlight}
                      readOnly={isHighlightDockReadOnly(entry.session)}
                      contextSpaceId={contextSpaceId}
                      sourceNoteId={sourceNoteId ?? null}
                      interactionActive={isActive}
                      animateEnter={false}
                      autoFocusMiniNote={
                        focusMiniNoteThreadId != null &&
                        entry.session.studyThreadEntryId === focusMiniNoteThreadId
                      }
                      onMiniNoteFocused={() => setFocusMiniNoteThreadId(null)}
                      expanded={cardExpanded}
                      onExpandedChange={(next) => {
                        setStudyDockStack((s) =>
                          updateDockEntry(s, entry.id, (e) => ({ ...e, expanded: next })),
                        );
                      }}
                      onFocusTitleChange={(title) => {
                        if (isHighlightDockReadOnly(entry.session)) return;
                        setStudyDockStack((s) =>
                          updateDockEntry(s, entry.id, (e) =>
                            e.kind === 'highlight' ? { ...e, session: { ...e.session, focusTitle: title } } : e,
                          ),
                        );
                      }}
                      onMiniNoteChange={(body) => {
                        if (isHighlightDockReadOnly(entry.session)) return;
                        setStudyDockStack((s) =>
                          updateDockEntry(s, entry.id, (e) =>
                            e.kind === 'highlight' ? { ...e, session: { ...e.session, miniNoteBody: body } } : e,
                          ),
                        );
                      }}
                      onAccentChange={(nextAccent) => {
                        if (isHighlightDockReadOnly(entry.session)) return;
                        if (!isStudyHighlightAccentKey(nextAccent)) return;
                        if (entry.kind !== 'highlight') return;
                        const sid = entry.session.studyThreadEntryId;

                        if (entry.session.entryKind === 'scriptureLink') {
                          void (async () => {
                            if (sid) {
                              try {
                                await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                  method: 'PATCH',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ highlightAccentRaw: nextAccent }),
                                });
                                syncStudyThreadList(sourceNoteId);
                              } catch {
                                /* ignore */
                              }
                            }
                            const passage = resolveScriptureLinkPassageContext(
                              studyDockStackRef.current,
                              entry,
                              sourceNoteId ?? null,
                            );
                            if (passage && sid) {
                              window.dispatchEvent(
                                new CustomEvent('passageStudyPaintChanged', {
                                  detail: {
                                    sourceNoteId: passage.sourceNoteId,
                                    reference: passage.reference,
                                    translation: passage.translation,
                                    word: passage.word,
                                    threadId: sid,
                                    accent: nextAccent,
                                    entryKind: 'scriptureLink',
                                    action: 'patch',
                                  },
                                }),
                              );
                            }
                            setStudyDockStack((s) =>
                              updateDockEntry(s, entry.id, (e) =>
                                e.kind === 'highlight'
                                  ? { ...e, session: { ...e.session, accent: nextAccent } }
                                  : e,
                              ),
                            );
                          })();
                          return;
                        }

                        if (!editor || !isEditorValid(editor)) return;
                        const range =
                          entry.session.range ?? (sid ? findHighlightRangeByStudyThreadId(editor, sid) : null);
                        if (!range && !sharedAnnotationOverlayMode) return;
                        void (async () => {
                          if (sid) {
                            try {
                              await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                method: 'PATCH',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ highlightAccentRaw: nextAccent }),
                              });
                              syncStudyThreadList(sourceNoteId);
                              if (sharedAnnotationOverlayMode) {
                                onSharedAnnotationCreated?.();
                              }
                            } catch {
                              /* ignore */
                            }
                          }
                          if (sharedAnnotationOverlayMode) {
                            setStudyDockStack((s) =>
                              updateDockEntry(s, entry.id, (e) =>
                                e.kind === 'highlight'
                                  ? { ...e, session: { ...e.session, accent: nextAccent, range: e.session.range ?? range } }
                                  : e,
                              ),
                            );
                            return;
                          }
                          if (!editor || !isEditorValid(editor) || !range) return;
                          const markType = editor.state.schema.marks.highlight;
                          if (!markType) return;
                          const tr = editor.state.tr;
                          tr.removeMark(range.from, range.to, markType);
                          tr.addMark(
                            range.from,
                            range.to,
                            markType.create({
                              color: nextAccent,
                              studyThreadEntryId: sid || null,
                            }),
                          );
                          editor.view.dispatch(tr);
                          if (hiddenInputRef.current) {
                            hiddenInputRef.current.value = editor.getHTML();
                          }
                          onContentChange?.(editor.getHTML());
                          setStudyDockStack((s) =>
                            updateDockEntry(s, entry.id, (e) =>
                              e.kind === 'highlight' ? { ...e, session: { ...e.session, accent: nextAccent, range } } : e,
                            ),
                          );
                        })();
                      }}
                      onRemove={() => {
                        if (isHighlightDockReadOnly(entry.session)) return;
                        if (entry.kind !== 'highlight') return;
                        const sid = entry.session.studyThreadEntryId;

                        if (entry.session.entryKind === 'scriptureLink') {
                          void (async () => {
                            if (sid) {
                              try {
                                await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                  method: 'DELETE',
                                  credentials: 'include',
                                });
                                syncStudyThreadList(sourceNoteId);
                              } catch {
                                /* ignore */
                              }
                            }
                            const passage = resolveScriptureLinkPassageContext(
                              studyDockStackRef.current,
                              entry,
                              sourceNoteId ?? null,
                            );
                            if (passage && sid) {
                              window.dispatchEvent(
                                new CustomEvent('passageStudyPaintChanged', {
                                  detail: {
                                    sourceNoteId: passage.sourceNoteId,
                                    reference: passage.reference,
                                    translation: passage.translation,
                                    word: passage.word,
                                    threadId: sid,
                                    accent: entry.session.accent,
                                    entryKind: 'scriptureLink',
                                    action: 'delete',
                                  },
                                }),
                              );
                            }
                            setStudyDockStack((s) => closeDockEntry(s, entry.id));
                          })();
                          return;
                        }

                        if (sharedAnnotationOverlayMode) {
                          void (async () => {
                            if (sid) {
                              try {
                                const res = await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                  method: 'DELETE',
                                  credentials: 'include',
                                });
                                if (!res.ok) {
                                  if (window.toast) {
                                    window.toast.error('Could not delete highlight. Try again.');
                                  }
                                  return;
                                }
                                syncStudyThreadList(sourceNoteId);
                                onSharedAnnotationCreated?.();
                              } catch {
                                if (window.toast) {
                                  window.toast.error('Could not delete highlight. Try again.');
                                }
                                return;
                              }
                            }
                            setStudyDockStack((s) => closeDockEntry(s, entry.id));
                          })();
                          return;
                        }

                        if (!editor || !isEditorValid(editor)) return;
                        const range =
                          entry.session.range ?? (sid ? findHighlightRangeByStudyThreadId(editor, sid) : null);
                        void (async () => {
                          if (sid) {
                            try {
                              const res = await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                method: 'DELETE',
                                credentials: 'include',
                              });
                              if (!res.ok) {
                                if (window.toast) {
                                  window.toast.error('Could not delete highlight. Try again.');
                                }
                                return;
                              }
                              syncStudyThreadList(sourceNoteId);
                              onSharedAnnotationCreated?.();
                            } catch {
                              if (window.toast) {
                                window.toast.error('Could not delete highlight. Try again.');
                              }
                              return;
                            }
                          }
                          if (editor && isEditorValid(editor)) {
                            const resolvedRange =
                              range ?? (sid ? findHighlightRangeByStudyThreadId(editor, sid) : null);
                            if (resolvedRange) {
                              editor
                                .chain()
                                .focus()
                                .setTextSelection({ from: resolvedRange.from, to: resolvedRange.to })
                                .unsetHighlight()
                                .run();
                              if (hiddenInputRef.current) {
                                hiddenInputRef.current.value = editor.getHTML();
                              }
                              onContentChange?.(editor.getHTML());
                            }
                          }
                          setStudyDockStack((s) => closeDockEntry(s, entry.id));
                        })();
                      }}
                      onDone={() => {
                        setStudyDockStack((s) => closeDockEntry(s, entry.id));
                      }}
                    />
                  );
                }
                if (entry.kind === 'reference') {
                  const session = entry.session;
                  return (
                    <ReferenceDockWeb
                      key={entry.id}
                      initialQuery={session.query}
                      expanded={cardExpanded}
                      onExpandedChange={(next) => {
                        setStudyDockStack((s) =>
                          updateDockEntry(s, entry.id, (e) => ({ ...e, expanded: next })),
                        );
                      }}
                      animateEnter={false}
                      noteHighlightRange={session.noteHighlightRange}
                      noteHighlightAccent={
                        session.noteHighlightAccent as StudyHighlightAccentKey | null | undefined
                      }
                      pendingSuggestion={!!session.pendingSuggestion && !session.noteHighlightRange}
                      passageReference={
                        !!session.passageReference && !session.passageReferenceSaved && !session.noteHighlightRange
                      }
                      passageReferenceSaved={!!session.passageReferenceSaved && !session.noteHighlightRange}
                      onSaveReference={() => {
                        if (session.passageReference && !session.passageReferenceSaved) {
                          void (async () => {
                            const passage = session.passageReference!;
                            const defaultAccent: StudyHighlightAccentKey = 'warmAmber';
                            const studyId = await savePassageReference(session.query, passage);
                            if (studyId) {
                              window.dispatchEvent(
                                new CustomEvent('passageStudyPaintChanged', {
                                  detail: {
                                    sourceNoteId: passage.sourceNoteId,
                                    reference: passage.reference,
                                    translation: passage.translation,
                                    word: session.query,
                                    threadId: studyId,
                                    accent: defaultAccent,
                                    action: 'save',
                                  },
                                }),
                              );
                              setStudyDockStack((s) =>
                                updateDockEntry(s, entry.id, (e) =>
                                  e.kind === 'reference'
                                    ? {
                                        ...e,
                                        session: {
                                          ...e.session,
                                          studyThreadEntryId: studyId,
                                          passageReferenceSaved: true,
                                          noteHighlightAccent: defaultAccent,
                                        },
                                      }
                                    : e,
                                ),
                              );
                            }
                          })();
                          return;
                        }
                        const range = session.pendingSuggestion;
                        if (!range) return;
                        void saveReferenceHighlight(range, session.query);
                      }}
                      onChangeNoteHighlight={(accent) => {
                        const sid = session.studyThreadEntryId;
                        if (session.passageReferenceSaved && session.passageReference) {
                          const passage = session.passageReference;
                          void (async () => {
                            if (sid) {
                              try {
                                await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                  method: 'PATCH',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ highlightAccentRaw: accent }),
                                });
                                syncStudyThreadList(passage.sourceNoteId);
                              } catch {
                                /* ignore */
                              }
                            }
                            window.dispatchEvent(
                              new CustomEvent('passageStudyPaintChanged', {
                                detail: {
                                  sourceNoteId: passage.sourceNoteId,
                                  reference: passage.reference,
                                  translation: passage.translation,
                                  word: session.query,
                                  threadId: sid ?? '',
                                  accent,
                                  action: 'patch',
                                },
                              }),
                            );
                            setStudyDockStack((s) =>
                              updateDockEntry(s, entry.id, (e) =>
                                e.kind === 'reference'
                                  ? { ...e, session: { ...e.session, noteHighlightAccent: accent } }
                                  : e,
                              ),
                            );
                          })();
                          return;
                        }
                        if (!editor || !isEditorValid(editor) || !session.noteHighlightRange) return;
                        const { from, to } = session.noteHighlightRange;
                        void (async () => {
                          if (sid) {
                            try {
                              await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                method: 'PATCH',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ highlightAccentRaw: accent }),
                              });
                              syncStudyThreadList(sourceNoteId);
                            } catch {
                              /* ignore */
                            }
                          }
                          if (!editor || !isEditorValid(editor)) return;
                          const markType = editor.state.schema.marks.highlight;
                          if (!markType) return;
                          const tr = editor.state.tr;
                          tr.removeMark(from, to, markType);
                          tr.addMark(
                            from,
                            to,
                            markType.create({
                              color: accent,
                              reference: session.query,
                              studyThreadEntryId: sid || undefined,
                            }),
                          );
                          editor.view.dispatch(tr);
                          onContentChange?.(editor.getHTML());
                          setStudyDockStack((s) =>
                            updateDockEntry(s, entry.id, (e) =>
                              e.kind === 'reference'
                                ? { ...e, session: { ...e.session, noteHighlightAccent: accent } }
                                : e,
                            ),
                          );
                        })();
                      }}
                      onRemoveNoteHighlight={() => {
                        const sid = session.studyThreadEntryId;
                        if (session.passageReferenceSaved && session.passageReference) {
                          const passage = session.passageReference;
                          void (async () => {
                            if (sid) {
                              try {
                                await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                  method: 'DELETE',
                                  credentials: 'include',
                                });
                                syncStudyThreadList(passage.sourceNoteId);
                              } catch {
                                /* ignore */
                              }
                            }
                            window.dispatchEvent(
                              new CustomEvent('passageStudyPaintChanged', {
                                detail: {
                                  sourceNoteId: passage.sourceNoteId,
                                  reference: passage.reference,
                                  translation: passage.translation,
                                  word: session.query,
                                  threadId: sid ?? '',
                                  accent: session.noteHighlightAccent ?? 'warmAmber',
                                  action: 'delete',
                                },
                              }),
                            );
                            setStudyDockStack((s) => closeDockEntry(s, entry.id));
                          })();
                          return;
                        }
                        if (!editor || !isEditorValid(editor) || !session.noteHighlightRange) return;
                        const { from, to } = session.noteHighlightRange;
                        void (async () => {
                          if (sid) {
                            try {
                              await fetch(`/api/study-threads/${sid}${studyThreadContextSuffix}`, {
                                method: 'DELETE',
                                credentials: 'include',
                              });
                              syncStudyThreadList(sourceNoteId);
                            } catch {
                              /* ignore */
                            }
                          }
                          if (!editor || !isEditorValid(editor)) return;
                          editor.chain().focus().setTextSelection({ from, to }).unsetHighlight().run();
                          onContentChange?.(editor.getHTML());
                          setStudyDockStack((s) => closeDockEntry(s, entry.id));
                        })();
                      }}
                      onDone={() => {
                        setStudyDockStack((s) => closeDockEntry(s, entry.id));
                      }}
                      onOpenScripturePassage={(ref) => {
                        const translation =
                          session.passageReference?.translation ||
                          getCachedProfileData()?.defaultTranslation ||
                          getEffectiveDefaultTranslation();
                        openScripturePassage(ref, translation, entry.id);
                      }}
                    />
                  );
                }
                if (entry.kind === 'resource') {
                  return (
                    <ResourceDockChipWeb
                      key={entry.id}
                      session={entry.session}
                      onDismiss={() => setStudyDockStack((s) => closeDockEntry(s, entry.id))}
                      onOpenFile={onOpenResourceFile}
                    />
                  );
                }
                return null;
              }}
            />,
            studyDockPortalTarget || document.body,
          )}
      </div>
      {!minimalToolbar && isEditorFocused && toolbarAtBottom && editorChromeMode !== 'prototypeNative' && (
        <div
          className="tiptap-toolbar tiptap-toolbar--bottom p-1 border border-[var(--color-fog-white)] rounded-xl bg-[var(--color-snow-white)] shrink-0"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 20,
            marginBottom: `${toolbarBottomMargin}px`,
            backgroundColor: 'var(--color-snow-white)',
          }}
        >
          <div className="tiptap-toolbar__hscroll">
          <TiptapToolbarTrack key={toolbarTrackKey} placement="bottom">
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().undo().run();
            }}
            isActive={false}
            disabled={!activeStates.canUndo}
            title="Undo"
            ariaLabel="Undo"
          >
            <Icon name="arrow-rotate-left" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().redo().run();
            }}
            isActive={false}
            disabled={!activeStates.canRedo}
            title="Redo"
            ariaLabel="Redo"
          >
            <Icon name="arrow-rotate-right" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().toggleBold().run();
            }}
            isActive={activeStates.bold}
            title="bold"
            ariaLabel="Toggle bold"
          >
            <Icon name="bold" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().toggleItalic().run();
            }}
            isActive={activeStates.italic}
            title="italic"
            ariaLabel="Toggle italic"
          >
            <Icon name="italic" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().toggleUnderline().run();
            }}
            isActive={activeStates.underline}
            title="underline"
            ariaLabel="Toggle underline"
          >
            <Icon name="underline" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              handleHeadingCycle();
            }}
            isActive={activeStates.headingLevel > 0}
            title={`heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
            ariaLabel={`Toggle heading (${activeStates.headingLevel > 0 ? `H${activeStates.headingLevel}` : 'Normal'})`}
          >
            <Icon name="heading" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().toggleOrderedList().run();
            }}
            isActive={activeStates.orderedList}
            title="list: ordered"
            ariaLabel="Toggle ordered list"
          >
            <Icon name="list-ol" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().toggleBulletList().run();
            }}
            isActive={activeStates.bulletList}
            title="list: bullet"
            ariaLabel="Toggle bullet list"
          >
            <Icon name="list" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              if (!editor) return;
              editor.chain().focus().clearNodes().unsetAllMarks().run();
            }}
            isActive={false}
            title="clean"
            ariaLabel="Clear formatting"
          >
            <Icon name="eraser" size={20} style={{ fill: 'currentColor' }} />
          </ToolbarButton>
          </TiptapToolbarTrack>
          </div>
        </div>
      )}
      {!minimalToolbar &&
        editorChromeMode === 'prototypeNative' &&
        !columnFormatToolbarPortal &&
        !formatToolbarPortalTarget &&
        shouldShowPrototypeFormatToolbar &&
        toolbarAtBottom &&
        renderPrototypeNativeFormatToolbar('bottom')}
      {!minimalToolbar &&
        editorChromeMode === 'prototypeNative' &&
        columnFormatToolbarPortal &&
        formatToolbarPortalTarget &&
        shouldShowPrototypeFormatToolbar &&
        createPortal(renderPrototypeNativeFormatToolbar('portal'), formatToolbarPortalTarget)}
      {connectFromSelectionOpen && sourceNoteId && spaceId ? (
        <PrototypeConnectNoteSheet
          open={connectFromSelectionOpen}
          onOpenChange={(open) => {
            setConnectFromSelectionOpen(open);
            if (!open) setConnectFromSelectionRange(null);
          }}
          spaceId={spaceId}
          parentNoteId={sourceNoteId}
          anchorRect={connectFromSelectionAnchorRect}
          anchorInfo={connectFromSelectionRange ? {
            sourceSnippet: connectFromSelectionRange.text,
            anchorLocation: connectFromSelectionRange.anchorLocation,
            anchorLength: connectFromSelectionRange.anchorLength,
            anchorTextSnapshot: connectFromSelectionRange.text,
          } : undefined}
          onConnectedWithThread={(studyThreadId, linkedNoteId) => {
            const range = connectFromSelectionRange;
            if (!range || !editor || !isEditorValid(editor)) return;
            const markType = editor.state.schema.marks.highlight;
            if (!markType) return;
            const tr = editor.state.tr;
            tr.removeMark(range.from, range.to, markType);
            tr.addMark(range.from, range.to, markType.create({ color: 'violet', studyThreadEntryId: studyThreadId, linkedNoteId }));
            editor.view.dispatch(tr);
            if (hiddenInputRef.current) {
              hiddenInputRef.current.value = editor.getHTML();
            }
            onContentChange?.(editor.getHTML());
            // Compute screen position for the floating color picker
            try {
              const startCoords = editor.view.coordsAtPos(range.from);
              const endCoords = editor.view.coordsAtPos(range.to);
              const top = Math.min(startCoords.top, endCoords.top) - 52;
              const centerX = (startCoords.left + endCoords.right) / 2;
              setPostConnectHighlight({ studyThreadId, linkedNoteId, from: range.from, to: range.to, accent: 'violet', top, centerX });
            } catch {
              /* ignore positioning errors */
            }
            setConnectFromSelectionRange(null);
          }}
        />
      ) : null}
      {postConnectHighlight && editor && createPortal(
        <div
          data-post-connect-picker=""
          className="pds-native-selection-bar floating-picker-enter"
          style={{
            position: 'fixed',
            top: postConnectHighlight.top,
            left: postConnectHighlight.centerX,
            transform: 'translateX(-50%)',
            zIndex: 99999,
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL.map((accentKey) => (
            <button
              key={accentKey}
              type="button"
              className="pds-native-selection-bar__btn"
              title={STUDY_HIGHLIGHT_ACCENT_LABELS[accentKey]}
              aria-label={`Set highlight color: ${STUDY_HIGHLIGHT_ACCENT_LABELS[accentKey]}`}
              aria-pressed={postConnectHighlight.accent === accentKey}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!editor || !isEditorValid(editor)) return;
                const { studyThreadId, linkedNoteId, from, to } = postConnectHighlight;
                const markType = editor.state.schema.marks.highlight;
                if (!markType) return;
                const tr = editor.state.tr;
                tr.removeMark(from, to, markType);
                tr.addMark(from, to, markType.create({ color: accentKey, studyThreadEntryId: studyThreadId, linkedNoteId }));
                editor.view.dispatch(tr);
                if (hiddenInputRef.current) {
                  hiddenInputRef.current.value = editor.getHTML();
                }
                onContentChange?.(editor.getHTML());
                void fetch(`/api/study-threads/${studyThreadId}${studyThreadContextSuffix}`, {
                  method: 'PATCH',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ highlightAccentRaw: accentKey }),
                })
                  .then(() => syncStudyThreadList(sourceNoteId))
                  .catch(() => {/* ignore */});
                setPostConnectHighlight(null);
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: studyDockAccentCssVar(accentKey),
                  outline: postConnectHighlight.accent === accentKey ? `2px solid ${studyDockAccentCssVar(accentKey)}` : 'none',
                  outlineOffset: 2,
                }}
                aria-hidden
              />
            </button>
          ))}
        </div>,
        document.body,
      )}
      {connectedNoteHighlightPopup && editor ? (
        <ConnectedNoteHighlightPopup
          linkedNoteId={connectedNoteHighlightPopup.linkedNoteId}
          studyThreadId={connectedNoteHighlightPopup.studyThreadId}
          accent={connectedNoteHighlightPopup.accent}
          anchorRect={connectedNoteHighlightPopup.anchorRect}
          onNavigate={() => {
            const { linkedNoteId } = connectedNoteHighlightPopup;
            setConnectedNoteHighlightPopup(null);
            const fullId = linkedNoteId.startsWith('note_') ? linkedNoteId : `note_${linkedNoteId}`;
            safeNavigate(noteUrlForCurrentSurface(fullId, undefined, sourceNoteId || undefined));
          }}
          onAccentChange={(newAccent) => {
            const { studyThreadId, linkedNoteId, from, to } = connectedNoteHighlightPopup;
            if (!editor || !isEditorValid(editor)) return;
            const markType = editor.state.schema.marks.highlight;
            if (!markType) return;
            const tr = editor.state.tr;
            tr.removeMark(from, to, markType);
            tr.addMark(from, to, markType.create({ color: newAccent, studyThreadEntryId: studyThreadId, linkedNoteId }));
            editor.view.dispatch(tr);
            if (hiddenInputRef.current) hiddenInputRef.current.value = editor.getHTML();
            onContentChange?.(editor.getHTML());
            void fetch(`/api/study-threads/${studyThreadId}${studyThreadContextSuffix}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ highlightAccentRaw: newAccent }),
            })
              .then(() => syncStudyThreadList(sourceNoteId))
              .catch(() => {/* ignore */});
            setConnectedNoteHighlightPopup((prev) => prev ? { ...prev, accent: newAccent } : null);
          }}
          onDisconnect={() => {
            const { studyThreadId, from, to } = connectedNoteHighlightPopup;
            setConnectedNoteHighlightPopup(null);
            void (async () => {
              try {
                await fetch(`/api/study-threads/${studyThreadId}${studyThreadContextSuffix}`, {
                  method: 'DELETE',
                  credentials: 'include',
                });
                syncStudyThreadList(sourceNoteId);
              } catch { /* ignore */ }
              if (!editor || !isEditorValid(editor)) return;
              const markType = editor.state.schema.marks.highlight;
              if (!markType) return;
              const tr = editor.state.tr;
              tr.removeMark(from, to, markType);
              editor.view.dispatch(tr);
              if (hiddenInputRef.current) hiddenInputRef.current.value = editor.getHTML();
              onContentChange?.(editor.getHTML());
            })();
          }}
          onDismiss={() => setConnectedNoteHighlightPopup(null)}
        />
      ) : null}
    </div>
  );
};

export default TiptapEditor;

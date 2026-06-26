import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { TextSelection } from '@tiptap/pm/state';
import ButtonSmall from './ButtonSmall';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';
import { pushNavStack } from '@/utils/nav-stack';
import { findFirstUnmarkedTextPosition, wrapTextWithNoteLink, stripNoteLinksToNoteId } from '@/utils/tiptap-helpers';
import { debug } from '@/utils/logger';
import { safeRenderHtml } from '@/utils/content-renderer';
import { getOrCreateScriptureNote } from '@/utils/scripture-note-utils';
import { getTranslation, getTranslationAbbreviationDisplay } from '@/data/translations';
import { withScripturePillDisplayLabels, repairScripturePillTranslationsInHtml, sanitizeScripturePillHtml } from '@/utils/scripture-pill-display';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { getCachedProfileData } from '@/utils/profile-cache';
import { isNoteUnlocked, lockNote } from '@/utils/note-unlock-state';
import { useIsOffline } from '@/hooks/useIsOffline';
import '@/styles/card-full-editable.css';
import Icon from './Icon';
import SharedNoteCTAFooter from './SharedNoteCTAFooter';
import LockNoteButton from './LockNoteButton';
import InlinePinUnlock from './InlinePinUnlock';
/** Collection-only inline bar (`prototypeNative`); tags are edited in Note Details — same on mobile new-note sheet and Mac web. */
import NoteProductionActionBar from './NoteProductionActionBar';
import {
  collectionChromeStatesEqual,
  collectionContextBannerText,
  type CollectionChromeState,
  type WebCollectionNavSource,
  suggestPrimaryCollectionFromNote,
  suggestSecondaryCollectionsFromNote,
} from '@/utils/bible-study-collection-web';
import { noteFolderChipDisplayState } from '@/utils/note-folder-display';
import { isPrototypeNoteEditorFocused } from '@/utils/prototype-editor-focused';
import { isPrototypeDraftPersistNoteIdSwap } from '@/utils/prototype-compose-url';
import {
  applyIdleFolderAutoAssign,
  clearAutoFolderChrome,
  plainBodyForFolderSnapshot,
} from '@/utils/prototype-folder-auto-assign';
import { shouldAllowPrimaryFolderUpdate } from '@/utils/should-allow-primary-folder-update';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import type { HighlightDockOpenMetadata } from '@/utils/study-dock-stack';

// Prototype notes use alwaysEditing — load TipTap synchronously so the body is typeable on first paint.
import TiptapEditorEager from './TiptapEditor';
// Classic SPA / bottom sheet: lazy load until the user enters edit mode.
const TiptapEditorLazy = lazy(() => import('./TiptapEditor'));

/**
 * Stable references for default values of array/object props.
 *
 * Without these, a default like `initialSecondaryCollections = [] as string[]`
 * in the destructure creates a fresh `[]` on every render whenever the caller
 * doesn't pass the prop. That fresh array then lands in the dep list of the
 * `setCollectionChrome` effect (~line 279), and `Object.is(prevArr, nextArr)`
 * is `false` → effect fires → setState → re-render → new `[]` → loop, which
 * is the "Maximum update depth exceeded" error every shared-note viewer hits.
 *
 * Module-level constants are referentially stable across renders, so callers
 * that omit the prop will land on the same array each render.
 */
const EMPTY_SECONDARY_COLLECTIONS: ReadonlyArray<string> = Object.freeze([]);
const DEFAULT_COLLECTION_NAV_CONTEXT: WebCollectionNavSource = Object.freeze({ type: 'home' }) as WebCollectionNavSource;

/** Heuristic: avoid ever rendering encrypted blob as HTML (e.g. race where content branch would show it). */
function looksLikeEncryptedBlob(s: string): boolean {
  if (!s || typeof s !== 'string' || s.length < 40) return false;
  const t = s.trim();
  return t.length >= 40 && /^[A-Za-z0-9+/]+=*$/.test(t);
}

/** Server-locked note that is not unlocked in this session — show PIN gate, never ciphertext in the editor. */
function noteBodyRequiresPinUnlock(
  noteId: string | undefined,
  serverEncrypted: boolean,
  lockStateOverride: boolean | null,
  body: string
): boolean {
  if (lockStateOverride === false) return false;
  const serverLocked = lockStateOverride === true || serverEncrypted;
  if (!serverLocked) {
    return !!noteId && looksLikeEncryptedBlob(body) && !isNoteUnlocked(noteId);
  }
  if (!noteId) return true;
  return !isNoteUnlocked(noteId);
}

import {
  isEffectivelyEmptyPrototypeNote,
  isTiptapBodyEmpty,
  normalizeEmptyBodyHtmlForEditor,
} from '@/utils/prototype-note-empty';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import { stripStudyHighlightMarkInlineBackground } from '@/utils/note-html-highlight-marks';
import { shouldInjectProcessedNoteContent } from '@/utils/prototype-editor-save';
import { contentSyncWouldClobberScripturePillAccent } from '@/utils/scripture-pill-accent-sync';
import { saveNoteDraft, getNoteDraft, clearNoteDraft } from '@/utils/note-draft-store';
import { shouldSkipPrototypeUnloadSave } from '@/utils/prototype-note-save-guard';

/** TipTap body HTML for editing — empty notes use `<p></p>` so the caret stays on line 1. */
function repairHtmlForEditor(html: string): string {
  return normalizeEmptyBodyHtmlForEditor(
    sanitizeScripturePillHtml(
      repairScripturePillTranslationsInHtml(html ?? '', getEffectiveDefaultTranslation()),
    ),
  );
}

/** Read-only note body HTML — canonicalize blank lines before pill labels / highlight strip. */
function prepareReadOnlyNoteBodyHtml(html: string): string {
  return stripStudyHighlightMarkInlineBackground(
    withScripturePillDisplayLabels(canonicalizeNoteHtmlLineBreaks(html)),
  );
}

/** HTML from TipTap for persistence — blank lines use `<p><br></p>` so they survive save/load. */
function noteHtmlForSave(editor: { getHTML: () => string; isDestroyed?: boolean } | null, fallback: string): string {
  if (editor && !editor.isDestroyed) {
    try {
      return canonicalizeNoteHtmlLineBreaks(editor.getHTML());
    } catch {
      /* fall through */
    }
  }
  return canonicalizeNoteHtmlLineBreaks(fallback);
}
const TITLE_SOFT_LIMIT = 30;  // Show counter when >= 30
const TITLE_WARNING_LIMIT = 45;  // Red text when >= 45 (within 5 of limit)
const TITLE_HARD_LIMIT = 50;  // Maximum allowed
const TITLE_SINGLE_ROW_MIN_HEIGHT_PX = 36;

interface CardFullEditableProps {
  title: string;
  content: string;
  date: string;
  noteId?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  version?: string;
  resourceTitle?: string;
  resourceDescription?: string;
  resourceImage?: string;
  resourceUrl?: string;
  contentEncrypted?: boolean;
  className?: string;
  isEditable?: boolean;
  onSave?: (
    title: string,
    content: string,
    collectionExtras?: {
      primaryCollection?: string | null;
      secondaryCollections?: string[];
      collectionPinned?: boolean;
      collectionUserOverride?: boolean;
    },
    saveOptions?: { bumpUpdatedAt?: boolean },
  ) => Promise<any>;
  footer?: React.ReactNode;
  // Props for shared note CTA footer
  shareToken?: string;
  isAuthenticated?: boolean;
  /** When true, runs iOS focus scroll fix (window.scrollTo(0,0) on focusin) so toolbar stays visible. Also run on touch devices when false. */
  inBottomSheet?: boolean;
  /** Welcome-thread pack notes (system): same as scripture — no title/body editing in the card. */
  readOnlyLikeScripture?: boolean;
  /** Prototype-only: native-like editor chrome (format vs scripture vs note action bar). */
  editorChromeMode?: 'default' | 'prototypeNative';
  /** Shown when prototype bottom mode is `noteActions` (below editor, above save/cancel).
   *  Ignored when `formatToolbarPortalTarget` is set — parent renders the bar at column level.
   */
  prototypeNoteActionBar?: React.ReactNode;
  /** Prototype-only: when set, the format toolbar is portaled into this element so the
   *  parent can render bars (format / note actions) as siblings of the scroll container,
   *  pinned to the bottom of the editor column. */
  formatToolbarPortalTarget?: HTMLElement | null;
  /** Prototype-only: bubbles up the current bottom chrome mode (format / scripture / highlight / search / noteActions / hidden). */
  onPrototypeChromeModeChange?: (mode: 'format' | 'scripture' | 'highlight' | 'reference' | 'noteActions' | 'hidden') => void;
  /**
   * Prototype-only: when set, overrides whether the editor switches to note-actions chrome on blur /
   * when the format toolbar is inactive. Omit to derive from `noteActionsPortalTarget` or `prototypeNoteActionBar`.
   */
  prototypeNoteActionsChrome?: boolean;
  /** Prototype-only: folder chip derived from local collection chrome (keeps toolbar in sync while editing). */
  onPrototypeFolderDisplayChange?: (chip: ReturnType<typeof noteFolderChipDisplayState>) => void;
  /**
   * Prototype-only: when set, the highlight dock is portaled into this element (column-level bottom bar).
   */
  highlightChromePortalTarget?: HTMLElement | null;
  /** Prototype-only: when set, auto-opens the reference dock for this word once the editor is ready. */
  initialReferenceWord?: string | null;
  /** Distinct per request (e.g. dockReq nonce) so re-opens fire each time. */
  initialReferenceRequestKey?: string | null;
  /**
   * Prototype-only: when set, auto-opens the scripture dock for this reference/translation once
   * the editor has rendered the matching pill (e.g. navigated from the sidebar Highlights list).
   */
  initialScriptureDock?: {
    reference: string;
    translation: string | null;
    /** Distinct per request (e.g. the clicked highlight's id) so re-opens fire each time. */
    requestKey?: string;
  } | null;
  /**
   * Prototype-only: when set, auto-opens the highlight dock for this study-thread entry once the editor
   * has rendered the matching highlight mark (e.g. navigated from the Home "revisit" card).
   */
  initialHighlightDock?: {
    studyThreadEntryId: string;
    /** Distinct per request (e.g. the clicked highlight's id) so re-opens fire each time. */
    requestKey?: string;
    /** Study-thread snapshot for opening the dock when the note mark is not ready yet. */
    metadata?: HighlightDockOpenMetadata;
  } | null;
  /** Prototype-only: called after a highlight deep-link dock handoff completes (strip URL search keys). */
  onHighlightDeepLinkHandoff?: () => void;
  /** Prototype-only: called after a scripture deep-link dock handoff completes (strip URL search keys). */
  onScriptureDeepLinkHandoff?: () => void;
  /** Prototype-only: called after a reference deep-link dock handoff completes (strip URL search keys). */
  onReferenceDeepLinkHandoff?: () => void;
  /** Prototype-only: the scripture-dock open request couldn't find a matching pill — host may fall back. */
  onScriptureDockUnresolved?: () => void;
  /** When set with prototype chrome + column shell, portals the native-like note actions bar here. */
  noteActionsPortalTarget?: HTMLElement | null;
  /** Server-stored Bible study collection (native parity). */
  initialPrimaryCollection?: string | null;
  initialSecondaryCollections?: string[];
  initialCollectionPinned?: boolean;
  initialCollectionUserOverride?: boolean;
  initialCollectionLastAutoUpdatedAtIso?: string | null;
  scriptureChromePortalTarget?: HTMLElement | null;
  /** Per-note scripture + highlight dock carousel host (prototype / production note). */
  studyDockCarouselPortalTarget?: HTMLElement | null;
  /** Optional: URL/search-driven collection context for the multi-collection banner. */
  collectionNavContext?: WebCollectionNavSource;
  /**
   * With `editorChromeMode="prototypeNative"`, keep title + body in edit mode (prototype route only).
   * Production note pages omit this so users still get view-then-edit.
   */
  alwaysEditing?: boolean;
  /** Prototype-only: fired on editor unmount with live title/body so the parent can discard empty notes. */
  onPrototypeEditorUnmount?: (snapshot: { noteId: string; title: string; content: string }) => void;
  /**
   * Prototype-only: stable identity for the body editor across the /n/new → /n/<id>
   * draft→persist swap. The parent keeps this constant for one compose session so the
   * TipTap instance survives the swap (no remount mid-typing); falls back to `noteId`.
   */
  prototypeBodyMountId?: string | null;
  /** Prototype-only: parent signals draft→persist navigation so TipTap remounts with live body HTML. */
  prototypeDraftPersistRemount?: { content: string } | null;
  /** Bumped with `prototypeDraftPersistRemount` so remount runs even when CardFullEditable remounts. */
  prototypeDraftPersistRemountTick?: number;
  /** Space the note belongs to — passed to TiptapEditor for connect-from-selection. */
  spaceId?: string;
}

export default function CardFullEditable({ 
  title, 
  content, 
  date, 
  noteId,
  noteType = 'default',
  version,
  resourceTitle,
  resourceDescription,
  resourceImage,
  resourceUrl,
  contentEncrypted = false,
  className = '',
  isEditable = true,
  onSave,
  footer,
  shareToken,
  isAuthenticated,
  inBottomSheet = false,
  readOnlyLikeScripture = false,
  editorChromeMode = 'default',
  prototypeNoteActionBar,
  formatToolbarPortalTarget,
  onPrototypeChromeModeChange,
  onPrototypeFolderDisplayChange,
  prototypeNoteActionsChrome,
  noteActionsPortalTarget = null,
  initialPrimaryCollection = null,
  initialSecondaryCollections = EMPTY_SECONDARY_COLLECTIONS as unknown as string[],
  initialCollectionPinned = false,
  initialCollectionUserOverride = false,
  initialCollectionLastAutoUpdatedAtIso = null,
  scriptureChromePortalTarget = null,
  highlightChromePortalTarget = null,
  studyDockCarouselPortalTarget = null,
  initialReferenceWord = null,
  initialReferenceRequestKey = null,
  initialScriptureDock = null,
  initialHighlightDock = null,
  onHighlightDeepLinkHandoff,
  onScriptureDeepLinkHandoff,
  onReferenceDeepLinkHandoff,
  onScriptureDockUnresolved,
  collectionNavContext = DEFAULT_COLLECTION_NAV_CONTEXT,
  alwaysEditing = false,
  onPrototypeEditorUnmount,
  prototypeBodyMountId = null,
  prototypeDraftPersistRemount = null,
  prototypeDraftPersistRemountTick = 0,
  spaceId,
}: CardFullEditableProps) {
  const effectivePrototypeNoteActionsChrome =
    editorChromeMode === 'prototypeNative'
      ? (prototypeNoteActionsChrome ?? !!(noteActionsPortalTarget || prototypeNoteActionBar))
      : false;
  const eagerTiptap = editorChromeMode === 'prototypeNative' && alwaysEditing;
  const TiptapEditorComponent = eagerTiptap ? TiptapEditorEager : TiptapEditorLazy;
  const prototypeAlwaysEditing =
    editorChromeMode === 'prototypeNative' &&
    alwaysEditing &&
    noteType !== 'scripture' &&
    !readOnlyLikeScripture;
  // Stable identity for the body TipTap so the same instance survives the draft→persist
  // id swap (parent holds `prototypeBodyMountId` constant for one compose session).
  // Distinct settled notes still get distinct ids and remount normally.
  const bodyEditorMountId = prototypeBodyMountId ?? noteId ?? 'none';
  const wrapTiptapSuspense = useCallback(
    (node: React.ReactNode, fallbackClassName: string) =>
      eagerTiptap ? node : <Suspense fallback={<div className={fallbackClassName} />}>{node}</Suspense>,
    [eagerTiptap],
  );

  // Override isEditable for scripture notes, onboarding pack notes, and offline (create-only mode)
  const isCurrentlyOffline = useIsOffline();
  const effectiveIsEditable =
    noteType === 'scripture' || readOnlyLikeScripture || isCurrentlyOffline ? false : isEditable;
  const effectiveIsEditableRef = useRef(effectiveIsEditable);
  effectiveIsEditableRef.current = effectiveIsEditable;
  const resolvedScriptureVersion = noteType === 'scripture'
    ? (version || getCachedProfileData()?.defaultTranslation || 'NET')
    : undefined;
  
  const [isTitleEditing, setIsTitleEditing] = useState(() => prototypeAlwaysEditing);
  const [isContentEditing, setIsContentEditing] = useState(() => prototypeAlwaysEditing);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [displayContent, setDisplayContent] = useState(() => repairHtmlForEditor(content ?? ''));
  const [displayScriptureVersion, setDisplayScriptureVersion] = useState(resolvedScriptureVersion);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  /** Remount TipTap after prototype draft→persist id swap (stale paragraph nodeViews). */
  const [tiptapBodyMountKey, setTiptapBodyMountKey] = useState(0);
  
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const contentDisplayRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<any>(null);
  const shouldFocusEditorRef = useRef(false);
  const contentClickCoordsRef = useRef<{ contentX: number; contentY: number } | null>(null);
  const saveChangesRef = useRef<() => void>(() => {});
  const flushEditsRef = useRef<(closeAfter: boolean) => Promise<void>>(async () => {});
  const editTitleRef = useRef(editTitle);
  const editContentRef = useRef(editContent);
  /** Latest body HTML from TipTap onUpdate — survives RAF cancel + editor destroy on fast nav. */
  const liveBodyHtmlRef = useRef(editContent);
  editTitleRef.current = editTitle;
  editContentRef.current = editContent;
  // Mirror hasChanges in a ref so the unmount cleanup can read the live value
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  // True once the user has actually typed into this note (title or body) since it
  // opened. Unlike hasLocalContentUpdate (also set by load-time HTML repair and
  // post-save pill injection), this is a clean "real user edit" signal — used to
  // guard against refetch-clobber re-seeds and to gate the local draft backstop.
  const userEditedSinceOpenRef = useRef(false);
  // Mirror editorChromeMode so unmount cleanup isn't a stale closure
  const editorChromeModeRef = useRef(editorChromeMode);
  editorChromeModeRef.current = editorChromeMode;
  const readOnlyLikeScriptureRef = useRef(readOnlyLikeScripture);
  readOnlyLikeScriptureRef.current = readOnlyLikeScripture;

  // Prototype-specific save state — entirely ref-based, bypasses hasChanges state machine
  const protoLastSavedRef = useRef<{ title: string; content: string; collectionKey: string } | null>(null);
  const protoIsSavingRef = useRef(false);
  // Set when a save attempt is dropped because another save is in flight. The
  // in-flight save's `finally` block checks this and re-fires protoSaveAsync so
  // trailing edits (typed during a save, or captured by unmount cleanup) aren't lost.
  const protoPendingFlushRef = useRef(false);
  const folderSuggestSnapshotRef = useRef<{ title: string; body: string }>({ title: '', body: '' });
  const protoSaveAsyncRef = useRef<(opts?: { fromUnmount?: boolean }) => Promise<void>>(async () => {});
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;
  const serverContentPropRef = useRef(content);
  serverContentPropRef.current = content;

  const prevNoteIdForEditGuardRef = useRef(noteId);
  const prevNoteIdForProtoResetRef = useRef(noteId);
  const seededEditorForNoteRef = useRef<string | null>(null);
  const handledPersistRemountTickRef = useRef(-1);
  /** User clicked/tapped the body editor — skip any title auto-focus intent for this note. */
  const bodyInteractionRef = useRef(false);
  const onPrototypeEditorUnmountRef = useRef(onPrototypeEditorUnmount);
  onPrototypeEditorUnmountRef.current = onPrototypeEditorUnmount;
  const isMountedRef = useRef(true);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [parentThreadId, setParentThreadId] = useState<string | undefined>(undefined);
  const [prototypeBottomChromeMode, setPrototypeBottomChromeModeInternal] = useState<
    'format' | 'scripture' | 'highlight' | 'reference' | 'noteActions' | 'hidden'
  >('noteActions');
  const [prototypeScripturePillOpenRequest, setPrototypeScripturePillOpenRequest] = useState<{
    reference: string;
    translation: string | null;
    noteId: string | null;
    pillAccent: string | null;
  } | null>(null);
  const [prototypeHighlightOpenRequest, setPrototypeHighlightOpenRequest] = useState<{
    studyThreadEntryId: string;
    requestKey?: string;
    metadata?: HighlightDockOpenMetadata;
  } | null>(null);
  const onPrototypeChromeModeChangeRef = useRef(onPrototypeChromeModeChange);
  useEffect(() => {
    onPrototypeChromeModeChangeRef.current = onPrototypeChromeModeChange;
  }, [onPrototypeChromeModeChange]);
  const setPrototypeBottomChromeMode = useCallback(
    (mode: 'format' | 'scripture' | 'highlight' | 'reference' | 'noteActions' | 'hidden') => {
      setPrototypeBottomChromeModeInternal(mode);
      onPrototypeChromeModeChangeRef.current?.(mode);
    },
    [],
  );

  useEffect(() => {
    if (prototypeAlwaysEditing) return;
    if (!isContentEditing) {
      setPrototypeBottomChromeMode(
        effectivePrototypeNoteActionsChrome ? 'noteActions' : 'hidden',
      );
    }
  }, [isContentEditing, effectivePrototypeNoteActionsChrome, setPrototypeBottomChromeMode, prototypeAlwaysEditing]);

  const [collectionChrome, setCollectionChrome] = useState<CollectionChromeState>({
    primaryCollection: initialPrimaryCollection ?? null,
    secondaryCollections: initialSecondaryCollections?.length ? [...initialSecondaryCollections] : [],
    collectionPinned: !!initialCollectionPinned,
    collectionUserOverride: !!initialCollectionUserOverride,
    collectionLastAutoUpdatedAtIso: initialCollectionLastAutoUpdatedAtIso ?? null,
  });
  const [addSecondaryDraft, setAddSecondaryDraft] = useState('');
  const lastPrototypeFolderChipRef = useRef<string>('');

  // Mirror collection state in a ref so the ref-based prototype saver (protoSaveAsync)
  // can read the live value without being recreated on every change.
  const collectionChromeRef = useRef(collectionChrome);
  useEffect(() => {
    collectionChromeRef.current = collectionChrome;
  }, [collectionChrome]);

  const buildCollectionChromeFromInitialProps = useCallback(
    (): CollectionChromeState => ({
      primaryCollection: initialPrimaryCollection ?? null,
      secondaryCollections: initialSecondaryCollections?.length
        ? [...initialSecondaryCollections]
        : [...EMPTY_SECONDARY_COLLECTIONS],
      collectionPinned: !!initialCollectionPinned,
      collectionUserOverride: !!initialCollectionUserOverride,
      collectionLastAutoUpdatedAtIso: initialCollectionLastAutoUpdatedAtIso ?? null,
    }),
    [
      initialPrimaryCollection,
      initialSecondaryCollections,
      initialCollectionPinned,
      initialCollectionUserOverride,
      initialCollectionLastAutoUpdatedAtIso,
    ],
  );

  useEffect(() => {
    if (editorChromeMode === 'prototypeNative' && alwaysEditing) {
      // Manual folder edits (popover / server) stay authoritative even while typing.
      if (isPrototypeNoteEditorFocused() && !initialCollectionUserOverride) return;
      if (protoPendingFlushRef.current || protoIsSavingRef.current) return;
    }
    setCollectionChrome((prev) => {
      const next = buildCollectionChromeFromInitialProps();
      return collectionChromeStatesEqual(prev, next) ? prev : next;
    });
  }, [
    noteId,
    buildCollectionChromeFromInitialProps,
    editorChromeMode,
    alwaysEditing,
    initialCollectionUserOverride,
  ]);

  // Note: we intentionally do NOT auto-assign a folder when a note simply opens.
  // Opening (viewing) a note must be read-only for folders — re-ranking only happens
  // after a genuine edit, via the debounce effect below (gated on userEditedSinceOpenRef).
  // The note's existing saved folder is shown via buildCollectionChromeFromInitialProps.

  // Open-on-load fired keys — reset on note switch so a prior note's deep link cannot block the next.
  const initialScriptureDockFiredRef = useRef<string | null>(null);
  const initialHighlightDockFiredRef = useRef<string | null>(null);

  useEffect(() => {
    initialScriptureDockFiredRef.current = null;
    initialHighlightDockFiredRef.current = null;
    setPrototypeScripturePillOpenRequest(null);
    setPrototypeHighlightOpenRequest(null);
    lastPrototypeFolderChipRef.current = '';
  }, [noteId]);

  // Open-on-load: when arriving with a scripture-dock request (e.g. tapping a scripture highlight
  // in the sidebar list), open the dock for that reference once. TiptapEditor's open-request
  // consumer polls for the matching pill, so this is safe before the note content has rendered.
  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    if (!initialScriptureDock) {
      initialScriptureDockFiredRef.current = null;
      return;
    }
    const key =
      initialScriptureDock.requestKey ??
      `${noteId}|${initialScriptureDock.reference}|${initialScriptureDock.translation ?? ''}`;
    if (initialScriptureDockFiredRef.current === key) return;
    initialScriptureDockFiredRef.current = key;
    setPrototypeScripturePillOpenRequest({
      reference: initialScriptureDock.reference,
      translation: initialScriptureDock.translation,
      noteId: noteId ?? null,
      pillAccent: null,
    });
  }, [editorChromeMode, initialScriptureDock, noteId]);

  // Open-on-load: when arriving with a highlight-dock request (e.g. tapping a highlight in the Home
  // "revisit" card), open the dock for that study-thread entry once. TiptapEditor's consumer polls
  // for the matching highlight mark, so this is safe before the note content has rendered.
  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    if (!initialHighlightDock) {
      initialHighlightDockFiredRef.current = null;
      return;
    }
    const key = initialHighlightDock.requestKey ?? `${noteId}|${initialHighlightDock.studyThreadEntryId}`;
    if (initialHighlightDockFiredRef.current === key) return;
    initialHighlightDockFiredRef.current = key;
    setPrototypeHighlightOpenRequest({
      studyThreadEntryId: initialHighlightDock.studyThreadEntryId,
      requestKey: key,
      metadata: initialHighlightDock.metadata,
    });
  }, [editorChromeMode, initialHighlightDock, noteId]);

  // Reset proto save tracking on note switch so first edit always triggers a save
  useEffect(() => {
    const prev = prevNoteIdForProtoResetRef.current;
    prevNoteIdForProtoResetRef.current = noteId;
    const isDraftPersistSwap =
      editorChromeMode === 'prototypeNative' &&
      alwaysEditing &&
      isPrototypeDraftPersistNoteIdSwap(prev, noteId);
    if (!isDraftPersistSwap) {
      protoLastSavedRef.current = null;
      protoIsSavingRef.current = false;
      protoPendingFlushRef.current = false;
      const initialTitle =
        noteType === 'default'
          ? stripServerAutoUntitledNoteTitleForDisplay(title)
          : (title ?? '');
      folderSuggestSnapshotRef.current = {
        title: initialTitle,
        body: plainBodyForFolderSnapshot(content ?? ''),
      };
    }
  }, [noteId, noteType, title, content, editorChromeMode, alwaysEditing]);

  const onPrototypeScripturePillOpenRequestConsumed = useCallback(() => {
    setPrototypeScripturePillOpenRequest(null);
    onScriptureDeepLinkHandoff?.();
  }, [onScriptureDeepLinkHandoff]);

  const onPrototypeHighlightOpenRequestConsumed = useCallback(() => {
    setPrototypeHighlightOpenRequest(null);
    onHighlightDeepLinkHandoff?.();
  }, [onHighlightDeepLinkHandoff]);

  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    const timer = window.setTimeout(() => {
      // Only re-rank folders after a genuine user edit — never on note open. This effect's
      // deps populate on mount too, so without this guard merely opening a note would
      // recompute/clear the folder. Mirrors the autosave guards (userEditedSinceOpenRef).
      if (!userEditedSinceOpenRef.current) return;
      const prev = collectionChromeRef.current;
      if (prev.collectionUserOverride && !prev.collectionPinned) return;
      const editing = isTitleEditing || isContentEditing;
      const titleForSuggest = editing ? editTitle : displayTitle;
      let bodyForSuggest: string;
      if (isContentEditing && editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
        try {
          bodyForSuggest = editorInstanceRef.current.getHTML();
        } catch {
          bodyForSuggest = editing ? editContent : displayContent;
        }
      } else {
        bodyForSuggest = editing ? editContent : displayContent;
      }
      // Re-rank the primary only at natural content boundaries (sentence end / newline / title
      // change / large growth) so it tracks the best candidate without flipping mid-word.
      const snap = folderSuggestSnapshotRef.current;
      const plainBody = plainBodyForFolderSnapshot(bodyForSuggest);
      const allowPrimary = shouldAllowPrimaryFolderUpdate(snap.title, titleForSuggest, snap.body, plainBody);
      const next = applyIdleFolderAutoAssign(prev, titleForSuggest, bodyForSuggest, new Date(), allowPrimary);
      if (allowPrimary) {
        folderSuggestSnapshotRef.current = { title: titleForSuggest, body: plainBody };
      }
      setCollectionChrome(next);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    editTitle,
    editContent,
    displayTitle,
    displayContent,
    editorChromeMode,
    isTitleEditing,
    isContentEditing,
  ]);

  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative' || !onPrototypeFolderDisplayChange) return;
    const chip = noteFolderChipDisplayState({
      primaryCollection: collectionChrome.primaryCollection,
      secondaryCollections: collectionChrome.secondaryCollections,
    });
    const chipKey = JSON.stringify(chip);
    if (chipKey === lastPrototypeFolderChipRef.current) return;
    lastPrototypeFolderChipRef.current = chipKey;
    onPrototypeFolderDisplayChange(chip);
  }, [
    editorChromeMode,
    onPrototypeFolderDisplayChange,
    collectionChrome.primaryCollection,
    collectionChrome.secondaryCollections,
  ]);

  // Flush any unsaved changes when the component unmounts (e.g. user navigates to a different note
  // before the 700ms debounce fires). React state updates are silently dropped after unmount,
  // but the network request still goes through.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const currentTitle = editTitleRef.current;
      const currentContent = noteHtmlForSave(
        editorInstanceRef.current,
        liveBodyHtmlRef.current || editContentRef.current,
      );
      const departingNoteId = noteIdRef.current;
      if (
        editorChromeModeRef.current === 'prototypeNative' &&
        departingNoteId &&
        !readOnlyLikeScriptureRef.current &&
        effectiveIsEditableRef.current
      ) {
        onPrototypeEditorUnmountRef.current?.({
          noteId: departingNoteId,
          title: currentTitle,
          content: currentContent,
        });
        if (isEffectivelyEmptyPrototypeNote(currentTitle, currentContent)) {
          return;
        }
        // Only persist on unmount when the user actually edited THIS note. Leaving a note remounts the
        // editor (keyed by noteId), so without this guard a pure view bumps updatedAt: the editor's
        // hydrate-time pill/translation normalization makes the live HTML differ cosmetically from the
        // stored copy, and that diff would PUT on leave and re-stamp updatedAt (reordering the lists).
        // A genuine edit sets userEditedSinceOpenRef, so trailing edits made just before navigating
        // away are still flushed here.
        if (!userEditedSinceOpenRef.current) {
          return;
        }
        const draft = departingNoteId ? getNoteDraft(departingNoteId) : null;
        if (
          shouldSkipPrototypeUnloadSave({
            contentToSave: currentContent,
            lastSavedContent: protoLastSavedRef.current?.content ?? null,
            serverContent: serverContentPropRef.current ?? null,
            draftContent: draft?.content ?? null,
          })
        ) {
          return;
        }
        void protoSaveAsyncRef.current({ fromUnmount: true });
      } else if (hasChangesRef.current) {
        void flushEditsRef.current(false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — cleanup only, refs hold live values

  // Track if we've updated content locally (e.g., with a highlight)
  const hasLocalContentUpdate = useRef(false);
  // Skip next init-effect overwrite when we just set decrypted content from pinEntryComplete (avoids race where effect runs with stale lockStateOverride and overwrites with encrypted content)
  const skipNextContentSyncRef = useRef(false);
  // Local lock state override when user locks/unlocks via dialog (avoids full page refresh)
  const [lockStateOverride, setLockStateOverride] = useState<boolean | null>(null);
  const [serverEncryptedOverride, setServerEncryptedOverride] = useState<boolean | null>(null);
  /** Bumped on lock/unlock so effects re-read `isNoteUnlocked` (in-memory, not reactive). */
  const [unlockRevision, setUnlockRevision] = useState(0);
  const effectiveEncrypted = lockStateOverride ?? contentEncrypted;
  const effectiveServerEncrypted = serverEncryptedOverride ?? contentEncrypted;
  const needsPinUnlock = useMemo(
    () =>
      noteBodyRequiresPinUnlock(
        noteId,
        effectiveServerEncrypted,
        lockStateOverride,
        displayContent ?? content ?? ''
      ),
    [
      noteId,
      effectiveServerEncrypted,
      lockStateOverride,
      displayContent,
      content,
      unlockRevision,
    ]
  );
  // Prototype alwaysEditing: TipTap + title field on first paint (no click-to-edit gate).
  const showTitleEditor =
    (prototypeAlwaysEditing && !needsPinUnlock && effectiveIsEditable) || isTitleEditing;
  const showBodyEditor =
    (prototypeAlwaysEditing && !needsPinUnlock && effectiveIsEditable) || isContentEditing;
  const cardRootRef = useRef<HTMLDivElement>(null);
  /** iOS: focus synchronously on tap so keyboard opens; Tiptap focus in onEditorReady is too late for user-gesture chain */
  const keyboardProxyRef = useRef<HTMLTextAreaElement>(null);

  // Mobile keyboard: when keyboard opens (visualViewport shrinks), set CSS vars on card root so toolbar floats 12px above keyboard and editor scrolls (same as NewNotePanel in sheet)
  const RESERVE_EDITOR_PX = 130;
  useEffect(() => {
    // Prototype shell portaled toolbar — SimplifiedPrototypeLayout owns keyboard layout.
    if (editorChromeMode === 'prototypeNative') return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

    const clearOverrides = (element: HTMLDivElement | null) => {
      if (!element) return;
      element.style.removeProperty('--toolbar-bottom');
      element.style.removeProperty('--editor-scroll-max-height');
      element.removeAttribute('data-keyboard-open');
    };

    const apply = (estimatedViewportHeight?: number) => {
      const el = cardRootRef.current;
      const viewport = window.visualViewport;
      if (!el || !viewport) return;
      const innerH = window.innerHeight;
      let effectiveHeight: number;
      if (estimatedViewportHeight != null && viewport.height > innerH * 0.85) {
        effectiveHeight = estimatedViewportHeight;
      } else {
        effectiveHeight = viewport.height;
      }
      const keyboardOpen = effectiveHeight < innerH * 0.75;

      if (keyboardOpen) {
        const toolbarBottom = innerH - effectiveHeight + 12;
        const editorH = Math.max(120, effectiveHeight - RESERVE_EDITOR_PX);
        el.style.setProperty('--toolbar-bottom', `${toolbarBottom}px`);
        el.style.setProperty('--editor-scroll-max-height', `${editorH}px`);
        el.setAttribute('data-keyboard-open', '');
      } else {
        clearOverrides(el);
      }
    };

    apply();
    const raf = requestAnimationFrame(() => apply());
    const onViewportChange = () => apply();
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);

    const onFocusIn = () => {
      setTimeout(apply, 100);
      setTimeout(apply, 300);
      if (isIOS) {
        setTimeout(apply, 400);
        setTimeout(apply, 600);
        const estimatedHeight = Math.round(window.innerHeight * 0.55);
        if (estimatedHeight < window.innerHeight * 0.75) {
          setTimeout(() => apply(estimatedHeight), 50);
        }
      }
    };
    let focusEl: HTMLDivElement | null = null;
    const rafFocus = requestAnimationFrame(() => {
      focusEl = cardRootRef.current;
      if (focusEl) focusEl.addEventListener('focusin', onFocusIn);
    });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rafFocus);
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
      if (focusEl) focusEl.removeEventListener('focusin', onFocusIn);
      clearOverrides(cardRootRef.current);
    };
  }, [editorChromeMode]);

  // iOS focus scroll fix: when in bottom sheet or on touch device, reset window scroll on focusin so Safari doesn't push toolbar off
  useEffect(() => {
    const el = cardRootRef.current;
    if (!el) return;
    const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (editorChromeMode === 'prototypeNative') return;
    if (!inBottomSheet && !isTouchDevice) return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const handler = () => {
      const t = setTimeout(() => {
        window.scrollTo(0, 0);
      }, 100);
      timeouts.push(t);
    };
    el.addEventListener('focusin', handler);
    return () => {
      el.removeEventListener('focusin', handler);
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [inBottomSheet, editorChromeMode]);

  // Reset local-content flag when note changes so we accept new content from props.
  // Prototype draft→persisted-id swap keeps the same editor mounted (stable mount key);
  // clearing these mid-session drops typing guards and lets server props clobber live edits.
  useLayoutEffect(() => {
    const prev = prevNoteIdForEditGuardRef.current;
    prevNoteIdForEditGuardRef.current = noteId;
    const isPrototypeDraftPersistSwap =
      editorChromeMode === 'prototypeNative' &&
      alwaysEditing &&
      prev === 'note_draft' &&
      noteId != null &&
      noteId !== 'note_draft';
    if (isPrototypeDraftPersistSwap) return;
    hasLocalContentUpdate.current = false;
    userEditedSinceOpenRef.current = false;
    seededEditorForNoteRef.current = null;
    bodyInteractionRef.current = false;
  }, [noteId, editorChromeMode, alwaysEditing]);

  // Parent signals first draft persist (/n/new → /n/<id>). With a stable
  // `prototypeBodyMountId`, the TipTap instance survives the swap, so keep its live
  // content and focus in place — do NOT force a remount (that's what dropped typing
  // and desynced ProseMirror before). Only remount as a fallback if the editor is gone.
  useLayoutEffect(() => {
    if (!prototypeDraftPersistRemount || editorChromeMode !== 'prototypeNative' || !alwaysEditing) {
      return;
    }
    if (prototypeDraftPersistRemountTick <= handledPersistRemountTickRef.current) {
      return;
    }
    handledPersistRemountTickRef.current = prototypeDraftPersistRemountTick;
    bodyInteractionRef.current = true;
    const editor = editorInstanceRef.current;
    const editorAlive = !!editor && !editor.isDestroyed;
    if (editorAlive) {
      // Same instance lives on: trust its live content, keep the caret, no remount.
      let live = prototypeDraftPersistRemount.content;
      try {
        live = editor.getHTML();
      } catch {
        /* ignore */
      }
      editContentRef.current = live;
      if (!editor.isFocused) {
        requestAnimationFrame(() => {
          try {
            if (!editor.isDestroyed) editor.commands.focus();
          } catch {
            /* ignore */
          }
        });
      }
      return;
    }
    // Fallback (no surviving editor): reseed + controlled remount, preserving content.
    const live = prototypeDraftPersistRemount.content;
    setEditContent(live);
    editContentRef.current = live;
    setDisplayContent(live);
    shouldFocusEditorRef.current = true;
    setTiptapBodyMountKey((k) => k + 1);
  }, [
    prototypeDraftPersistRemount,
    prototypeDraftPersistRemountTick,
    editorChromeMode,
    alwaysEditing,
  ]);

  useEffect(() => {
    setDisplayScriptureVersion(resolvedScriptureVersion);
  }, [resolvedScriptureVersion]);

  const SOURCE_NOTE_CONTENT_KEY = 'harvous-source-note-content';
  const SOURCE_NOTE_CONTENT_AT_KEY = 'harvous-source-note-content-at';
  const SOURCE_NOTE_CONTENT_TTL_MS = 30000;

  // Initialize display content (and apply any pending sessionStorage update from createHyperlink when card wasn't mounted)
  useEffect(() => {
    const nextDisplayTitle =
      editorChromeMode === 'prototypeNative' && noteType === 'default'
        ? stripServerAutoUntitledNoteTitleForDisplay(title)
        : title;
    setDisplayTitle(nextDisplayTitle ?? '');
    if (skipNextContentSyncRef.current) {
      skipNextContentSyncRef.current = false;
      return;
    }
    // Don't overwrite displayContent with encrypted prop when note is unlocked in session
    if (contentEncrypted && lockStateOverride === false) return;

    if (noteId != null && typeof window !== 'undefined') {
      try {
        const pendingContent = sessionStorage.getItem(`${SOURCE_NOTE_CONTENT_KEY}-${noteId}`);
        const pendingAt = sessionStorage.getItem(`${SOURCE_NOTE_CONTENT_AT_KEY}-${noteId}`);
        if (pendingContent != null && pendingAt != null) {
          const at = parseInt(pendingAt, 10);
          if (!isNaN(at) && Date.now() - at < SOURCE_NOTE_CONTENT_TTL_MS) {
            hasLocalContentUpdate.current = true;
            setDisplayContent(pendingContent);
            setEditContent(pendingContent);
            sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_KEY}-${noteId}`);
            sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_AT_KEY}-${noteId}`);
            return;
          }
          sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_KEY}-${noteId}`);
          sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_AT_KEY}-${noteId}`);
        }
      } catch {
        // ignore
      }
    }

    // User has edited this session — don't let server prop refreshes clobber live typing.
    if (userEditedSinceOpenRef.current) return;

    // Only reset displayContent if we haven't updated it locally
    // This prevents the highlight from disappearing when content prop updates
    if (!hasLocalContentUpdate.current) {
      const repaired = repairHtmlForEditor(content ?? '');
      setDisplayContent(repaired);
      if (
        editorChromeMode === 'prototypeNative' &&
        alwaysEditing &&
        repaired !== (content ?? '')
      ) {
        setEditContent(repaired);
        hasLocalContentUpdate.current = true;
        setHasChanges(true);
      }
    }
  }, [title, content, contentEncrypted, lockStateOverride, noteId, editorChromeMode, noteType, alwaysEditing]);

  // Leave edit mode when locked so ciphertext never appears in TipTap (prototype alwaysEditing).
  useEffect(() => {
    if (!needsPinUnlock) return;
    setIsTitleEditing(false);
    setIsContentEditing(false);
  }, [needsPinUnlock]);

  // Prototype route: start in title+body edit (native parity) on note open / unlock — do not depend on title/content
  // props after mount or edits reset on every server refresh. useLayoutEffect seeds before TipTap's first paint.
  useLayoutEffect(() => {
    if (editorChromeMode !== 'prototypeNative' || !alwaysEditing || !effectiveIsEditable) return;
    if (readOnlyLikeScripture || noteType === 'scripture') return;
    if (needsPinUnlock) return;
    if (seededEditorForNoteRef.current === noteId) return;
    // Never clobber in-progress body edits. This effect re-runs when inputs like
    // effectiveIsEditable (depends on isCurrentlyOffline), lockStateOverride, or
    // resourceTitle/Description change — at which point it would re-seed editContent
    // from the (possibly stale) `content` prop and silently drop unsaved typing.
    if (userEditedSinceOpenRef.current) return;
    if (editorInstanceRef.current && !editorInstanceRef.current.isDestroyed && editorInstanceRef.current.isFocused) return;

    const initialTitle =
      noteType === 'resource'
        ? (title || resourceTitle || '')
        : editorChromeMode === 'prototypeNative'
          ? stripServerAutoUntitledNoteTitleForDisplay(title)
          : title;
    const c = content ?? '';
    const initialContent =
      noteType === 'resource' && !c.trim() && resourceDescription
        ? resourceDescription
        : repairHtmlForEditor(c);

    // Crash/close/nav backstop: if a local draft for this note holds unsaved edits
    // that differ from what the server returned, restore it instead of the server
    // copy. Marking userEditedSinceOpenRef keeps the autosave debounce + draft
    // writer alive so the restored content is persisted (and the draft cleared) on
    // the next save. Degrades to last-write-wins in the rare multi-device case.
    const draft = noteId ? getNoteDraft(noteId) : null;
    if (
      draft &&
      !isEffectivelyEmptyPrototypeNote(draft.title, draft.content) &&
      (repairHtmlForEditor(draft.content) !== initialContent || draft.title !== initialTitle)
    ) {
      hasLocalContentUpdate.current = true;
      userEditedSinceOpenRef.current = true;
      setEditTitle(draft.title);
      setEditContent(repairHtmlForEditor(draft.content));
      setIsTitleEditing(true);
      setIsContentEditing(true);
      setHasChanges(true);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'Restored unsaved changes', type: 'info' },
      }));
      seededEditorForNoteRef.current = noteId ?? null;
      return;
    }

    setEditTitle(initialTitle);
    setEditContent(initialContent);
    setIsTitleEditing(true);
    setIsContentEditing(true);
    setHasChanges(false);
    seededEditorForNoteRef.current = noteId ?? null;
  }, [
    noteId,
    lockStateOverride,
    editorChromeMode,
    alwaysEditing,
    effectiveIsEditable,
    noteType,
    readOnlyLikeScripture,
    needsPinUnlock,
    resourceTitle,
    resourceDescription,
  ]);

  // Reset lock state overrides when contentEncrypted prop changes (e.g. from server)
  useEffect(() => {
    setLockStateOverride(null);
    setServerEncryptedOverride(null);
  }, [contentEncrypted]);

  // Update content and lock state when PIN panel completes (lock/unlock from panel or bottom sheet)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.noteId != null && detail?.newContent !== undefined && String(detail.noteId) === String(noteId)) {
        skipNextContentSyncRef.current = true;
        setDisplayContent(detail.newContent);
        setLockStateOverride(detail.encrypted === true);
        setServerEncryptedOverride(detail.contentEncryptedServer ?? (detail.encrypted === true));
        setUnlockRevision((v) => v + 1);
        if (detail.encrypted === true && noteId != null) {
          lockNote(String(noteId));
          setIsTitleEditing(false);
          setIsContentEditing(false);
        } else {
          setEditContent(detail.newContent);
          if (editorChromeMode === 'prototypeNative' && alwaysEditing && effectiveIsEditable) {
            setIsTitleEditing(true);
            setIsContentEditing(true);
          }
        }
        window.dispatchEvent(new CustomEvent('noteLockStateChanged', {
          detail: {
            noteId: String(noteId),
            contentEncrypted: detail.encrypted === true,
            contentEncryptedServer: detail.contentEncryptedServer ?? (detail.encrypted === true)
          }
        }));
      }
    };
    window.addEventListener('pinEntryComplete', handler);
    return () => window.removeEventListener('pinEntryComplete', handler);
  }, [noteId, editorChromeMode, alwaysEditing, effectiveIsEditable]);

  // Notify layout (e.g. ActionStrip dock) to hide when in edit mode (content or title)
  useEffect(() => {
    const editing = isContentEditing || isTitleEditing;
    window.dispatchEvent(new CustomEvent('contentEditModeChange', { detail: { editing } }));
    return () => {
      window.dispatchEvent(new CustomEvent('contentEditModeChange', { detail: { editing: false } }));
    };
  }, [isContentEditing, isTitleEditing]);

  const [contentViewTopFade, setContentViewTopFade] = useState(false);

  const viewScrollMaskClasses = [
    contentViewTopFade ? 'card-full-editable__content-scroll--top-fade' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /** Injected before dangerouslySetInnerHTML so labels survive re-renders (DOM-only hydration flickers). */
  const viewContentHtml = useMemo(() => {
    const raw = displayContent ?? '';
    if (looksLikeEncryptedBlob(raw)) return '';
    return safeRenderHtml(prepareReadOnlyNoteBodyHtml(raw));
  }, [displayContent]);

  useEffect(() => {
    if (isContentEditing) {
      setContentViewTopFade(false);
      return;
    }
    const el = contentDisplayRef.current;
    if (!el) return;

    const syncViewScrollMask = () => {
      const t = contentDisplayRef.current;
      if (!t) {
        setContentViewTopFade(false);
        return;
      }
      const { overflowY, overflow } = window.getComputedStyle(t);
      const scrollable =
        overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflow === 'auto' ||
        overflow === 'scroll';
      if (!scrollable) {
        setContentViewTopFade(false);
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = t;
      const overflowing = scrollHeight > clientHeight + 1;
      setContentViewTopFade(overflowing && scrollTop > 0);
    };

    syncViewScrollMask();
    const timer = setTimeout(syncViewScrollMask, 50);
    const raf = requestAnimationFrame(syncViewScrollMask);
    el.addEventListener('scroll', syncViewScrollMask, { passive: true });
    const ro = new ResizeObserver(syncViewScrollMask);
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', syncViewScrollMask);
      ro.disconnect();
    };
  }, [
    isContentEditing,
    displayContent,
    resourceDescription,
    noteType,
    noteId,
    lockStateOverride,
    effectiveEncrypted,
    imageRemoved,
  ]);

  // Focus handling is now done directly in startEditing
  // This useEffect is kept for backward compatibility but focusTarget is no longer used

  // Listen for keyboard shortcut to start editing
  useEffect(() => {
    const handleEditNote = () => {
      if (needsPinUnlock) return;
      if (!isContentEditing && !isTitleEditing && effectiveIsEditable) {
        // Save current scroll position
        if (contentDisplayRef.current) {
          const currentScroll = contentDisplayRef.current.scrollTop;
          setScrollPosition(currentScroll);
        }
        
        setEditTitle(displayTitle);
        setEditContent(displayContent);
        setIsContentEditing(true);
        setHasChanges(false);
        
        // Focus editor when it's ready
        shouldFocusEditorRef.current = true;
      }
    };
    
    window.addEventListener('editNote', handleEditNote);
    return () => {
      window.removeEventListener('editNote', handleEditNote);
    };
  }, [isContentEditing, isTitleEditing, effectiveIsEditable, displayTitle, displayContent, needsPinUnlock]);

  // Listen for hyperlink creation event
  useEffect(() => {
    const handleCreateHyperlink = async (event: CustomEvent) => {
        const { sourceNoteId, newNoteId, from, to, plainText } = event.detail;

        // Only process if this is the source note
        if (sourceNoteId !== noteId) return;

        // Try editor-based approach first (if editor is available)
        if (editorInstanceRef.current) {
            const editor = editorInstanceRef.current;
            
            // Check if editor is still valid (not destroyed)
            if (editor && !editor.isDestroyed && editor.view && editor.view.docView) {
              // Helper function to apply noteLink mark at a specific position
              const applyNoteLink = (positionFrom: number, positionTo: number): boolean => {
              try {
                // Validate positions are within document bounds
                const docSize = editor.state.doc.content.size;
                if (positionFrom < 0 || positionTo < 0 || positionFrom >= docSize || positionTo > docSize || positionFrom >= positionTo) {
                  console.warn('[CardFullEditable] Invalid position range:', { positionFrom, positionTo, docSize });
                  return false;
                }

                const pillType = editor.schema.marks.scripturePill;
                if (pillType && editor.state.doc.rangeHasMark(positionFrom, positionTo, pillType)) {
                  return false;
                }

                // Use Tiptap API to apply the mark
                editor.chain()
                    .focus()
                    .setTextSelection({ from: positionFrom, to: positionTo })
                    .unsetAllMarks()
                    .setMark('noteLink', { noteId: newNoteId })
                    .setTextSelection(positionTo)  // Move cursor to end of link
                    .unsetAllMarks()        // Clear marks so new text isn't linked
                    .run();

                return true;
              } catch (e) {
                console.error('[CardFullEditable] Error applying noteLink mark:', e);
                return false;
              }
              };

            // Helper function to save the updated content
            const saveUpdatedContent = () => {
              setTimeout(async () => {
                  // Check again if editor is still valid
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.docView) return;
                  
                  try {
                    const updatedContent = editor.getHTML();
                    // Mark that we've updated content locally to prevent useEffect from resetting it
                    hasLocalContentUpdate.current = true;
                    // Update both editContent and displayContent so highlight is visible in both edit and view modes
                    setEditContent(updatedContent);
                    setDisplayContent(updatedContent);
                    
                    // Trigger save
                    if (onSave) {
                        await onSave(editTitle, updatedContent);
                    } else {
                        const globalCallback = (window as any).noteSaveCallback;
                        if (globalCallback) {
                            await globalCallback(editTitle, updatedContent);
                        }
                    }

                    // Notify that highlight has been saved (so navigation can proceed)
                    window.dispatchEvent(new CustomEvent('highlightSaved'));
                    // Drive immediate UI update and persist for sessionStorage fallback if card remounts
                    try {
                      sessionStorage.setItem('harvous-source-note-content-' + noteId, updatedContent);
                      sessionStorage.setItem('harvous-source-note-content-at-' + noteId, String(Date.now()));
                    } catch { /* ignore */ }
                    window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId, content: updatedContent } }));

                    // Show a temporary confirmation
                    window.dispatchEvent(new CustomEvent('toast', {
                        detail: {
                            message: 'Link created in source note.',
                            type: 'success'
                        }
                    }));
                  } catch (e) {
                    console.error('[CardFullEditable] Error saving updated content:', e);
                    // Still notify even on error so navigation doesn't hang
                    window.dispatchEvent(new CustomEvent('highlightSaved'));
                  }
              }, 50);
              };

              // Try to apply mark using stored positions first
              let success = false;
              if (from !== undefined && to !== undefined) {
                success = applyNoteLink(from, to);
              }

              // If direct position application failed, try text matching fallback
              if (!success) {
                // Try to get plainText from event detail first, fallback to localStorage
                const sourceSelectionPlainText = plainText || localStorage.getItem('newNoteSourceSelectionPlainText');
                
                if (sourceSelectionPlainText && sourceSelectionPlainText.trim().length > 0) {
                  debug('[CardFullEditable] Trying text matching fallback');
                  
                  try {
                    const textPosition = findFirstUnmarkedTextPosition(editor, sourceSelectionPlainText);
                    
                    if (textPosition) {
                      success = applyNoteLink(textPosition.from, textPosition.to);
                      if (success) {
                        debug('[CardFullEditable] Successfully applied noteLink using text matching');
                      } else {
                        console.warn('[CardFullEditable] Found text position but failed to apply mark:', textPosition);
                      }
                    } else {
                      console.warn('[CardFullEditable] Could not find matching text in editor:', sourceSelectionPlainText);
                    }
                  } catch (e) {
                    console.error('[CardFullEditable] Error during text matching fallback:', e);
                  }
                } else {
                  console.warn('[CardFullEditable] No sourceSelectionPlainText available for fallback');
                }
              }

              // If we successfully applied the mark, save the updated content
              if (success) {
                saveUpdatedContent();
                return; // Successfully handled with editor
              }
              // Editor-based approach failed, fall through to HTML manipulation
            }
        }

        // HTML manipulation approach (for when editor is not available or editor approach failed)
        // This handles the case when the note is in view mode (not editing)
        debug('[CardFullEditable] Using HTML manipulation approach');
        
        const sourceSelectionPlainText = plainText || localStorage.getItem('newNoteSourceSelectionPlainText');
        
        if (sourceSelectionPlainText && sourceSelectionPlainText.trim().length > 0 && noteId) {
          try {
            // Get current content: when editor is available (edit mode) use its HTML so we wrap the latest content
            let currentContent = displayContent || content;
            if (editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
              try {
                const editorHtml = editorInstanceRef.current.getHTML();
                if (editorHtml) currentContent = editorHtml;
              } catch {
                // Keep displayContent/content
              }
            }
            
            // Try to wrap the text with noteLink in HTML
            const updatedContent = wrapTextWithNoteLink(currentContent, sourceSelectionPlainText, newNoteId);
            
            if (updatedContent) {
              // Save via API directly
              const response = await fetch(`/api/notes/${noteId}/update-content`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                  content: updatedContent
                })
              });

              if (response.ok) {
                debug('[CardFullEditable] Highlight saved successfully via API');
                // Mark that we've updated content locally to prevent useEffect from resetting it
                hasLocalContentUpdate.current = true;
                // Update local state to reflect the change immediately
                // This makes the highlight visible without page reload
                // Use functional updates to ensure we're working with latest state
                setDisplayContent(updatedContent);
                setEditContent(updatedContent);
                
                // Notify that highlight has been saved (so navigation can proceed)
                debug('[CardFullEditable] Dispatching highlightSaved event');
                window.dispatchEvent(new CustomEvent('highlightSaved'));
                // Drive immediate UI update and persist for sessionStorage fallback if card remounts
                try {
                  sessionStorage.setItem('harvous-source-note-content-' + noteId, updatedContent);
                  sessionStorage.setItem('harvous-source-note-content-at-' + noteId, String(Date.now()));
                } catch { /* ignore */ }
                window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId, content: updatedContent } }));

                // Show success message
                window.dispatchEvent(new CustomEvent('toast', {
                  detail: {
                    message: 'Link created in source note.',
                    type: 'success'
                  }
                }));
              } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('[CardFullEditable] Failed to save updated content:', errorData);
                window.dispatchEvent(new CustomEvent('toast', {
                  detail: {
                    message: 'Could not create link in source note.',
                    type: 'warning'
                  }
                }));
              }
            } else {
              console.warn('[CardFullEditable] Could not find text to wrap in HTML:', sourceSelectionPlainText);
              window.dispatchEvent(new CustomEvent('toast', {
                detail: {
                  message: 'Could not find selected text to create link.',
                  type: 'warning'
                }
              }));
              window.dispatchEvent(new CustomEvent('highlightSaved'));
            }
          } catch (e) {
            console.error('[CardFullEditable] Error during HTML manipulation fallback:', e);
            window.dispatchEvent(new CustomEvent('toast', {
              detail: {
                message: 'Could not create link in source note.',
                type: 'warning'
              }
            }));
            window.dispatchEvent(new CustomEvent('highlightSaved'));
          }
        } else {
          console.error('[CardFullEditable] Failed to create hyperlink - no plainText available');
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Could not create link in source note.',
              type: 'warning'
            }
          }));
          window.dispatchEvent(new CustomEvent('highlightSaved'));
        }
    };

    window.addEventListener('createHyperlink', handleCreateHyperlink as unknown as EventListener);

    return () => {
        window.removeEventListener('createHyperlink', handleCreateHyperlink as unknown as EventListener);
    };
}, [noteId, onSave, editTitle]); // Dependencies

  // Listen for content-updated events so UI updates immediately (highlight added or link stripped) without refresh
  useEffect(() => {
    const handleSourceNoteContentUpdated = (event: Event) => {
      const { noteId: updatedNoteId, content: updatedContent } = (event as CustomEvent).detail || {};
      if (updatedNoteId != null && String(updatedNoteId) === String(noteId) && typeof updatedContent === 'string') {
        hasLocalContentUpdate.current = true;
        setDisplayContent(updatedContent);
        setEditContent(updatedContent);
      }
    };
    window.addEventListener('sourceNoteContentUpdated', handleSourceNoteContentUpdated as EventListener);
    return () => window.removeEventListener('sourceNoteContentUpdated', handleSourceNoteContentUpdated as EventListener);
  }, [noteId]);

  // When new-note panel closes, apply any pending source-note content from sessionStorage (handles case where card stayed mounted but missed the event)
  useEffect(() => {
    const applyPendingSourceContent = () => {
      if (noteId == null || typeof window === 'undefined') return;
      try {
        const pendingContent = sessionStorage.getItem('harvous-source-note-content-' + noteId);
        const pendingAt = sessionStorage.getItem('harvous-source-note-content-at-' + noteId);
        if (pendingContent != null && pendingAt != null) {
          const at = parseInt(pendingAt, 10);
          if (!isNaN(at) && Date.now() - at < SOURCE_NOTE_CONTENT_TTL_MS) {
            hasLocalContentUpdate.current = true;
            setDisplayContent(pendingContent);
            setEditContent(pendingContent);
          }
          sessionStorage.removeItem('harvous-source-note-content-' + noteId);
          sessionStorage.removeItem('harvous-source-note-content-at-' + noteId);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('closeNewNotePanel', applyPendingSourceContent);
    return () => window.removeEventListener('closeNewNotePanel', applyPendingSourceContent);
  }, [noteId]);

  const DELETED_NOTE_IDS_KEY = 'harvous-deleted-note-ids';
  const MAX_DELETED_IDS = 50;

  // When a note is deleted, record it so we can strip links when the source note is opened later
  useEffect(() => {
    const handleNoteDeleted = (event: CustomEvent) => {
      const deletedNoteId = event.detail?.noteId;
      if (!deletedNoteId) return;
      try {
        const raw = sessionStorage.getItem(DELETED_NOTE_IDS_KEY);
        const list: string[] = raw ? JSON.parse(raw) : [];
        if (!list.includes(deletedNoteId)) {
          list.push(deletedNoteId);
          sessionStorage.setItem(DELETED_NOTE_IDS_KEY, JSON.stringify(list.slice(-MAX_DELETED_IDS)));
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    return () => window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
  }, []);

  // When a note is deleted, strip any link/highlight to that note from this note's content (if this note is currently mounted)
  useEffect(() => {
    const handleNoteDeleted = (event: CustomEvent) => {
      const deletedNoteId = event.detail?.noteId;
      if (!deletedNoteId || !noteId || deletedNoteId === noteId) return;
      const currentContent = editorInstanceRef.current && !editorInstanceRef.current.isDestroyed
        ? (() => { try { return editorInstanceRef.current!.getHTML(); } catch { return null; } })()
        : (displayContent || content);
      if (!currentContent || !currentContent.includes('data-note-id')) return;
      const stripped = stripNoteLinksToNoteId(currentContent, deletedNoteId);
      if (stripped === currentContent) return;
      hasLocalContentUpdate.current = true;
      setDisplayContent(stripped);
      setEditContent(stripped);
      // Persist the content change but don't reorder lists — this is an automated cleanup (link to a
      // deleted note), not a user edit.
      if (onSave) {
        onSave(editTitle, stripped, undefined, { bumpUpdatedAt: false }).catch(() => {});
      } else {
        const globalCallback = (window as any).noteSaveCallback;
        if (globalCallback) globalCallback(editTitle, stripped, undefined, { bumpUpdatedAt: false });
      }
      // Drive immediate UI update and persist for sessionStorage fallback if card remounts
      try {
        sessionStorage.setItem('harvous-source-note-content-' + noteId, stripped);
        sessionStorage.setItem('harvous-source-note-content-at-' + noteId, String(Date.now()));
      } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId, content: stripped } }));
    };
    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    return () => window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
  }, [noteId, displayContent, content, editTitle, onSave]);

  // When this note loads, strip links to any recently deleted notes (handles case where source note wasn't mounted when target was deleted)
  useEffect(() => {
    if (typeof window === 'undefined' || !noteId) return;
    const currentContent = displayContent || content;
    if (!currentContent || !currentContent.includes('data-note-id')) return;
    try {
      const raw = sessionStorage.getItem(DELETED_NOTE_IDS_KEY);
      const deletedIds: string[] = raw ? JSON.parse(raw) : [];
      if (deletedIds.length === 0) return;
      let result = currentContent;
      const strippedIds: string[] = [];
      for (const id of deletedIds) {
        const next = stripNoteLinksToNoteId(result, id);
        if (next !== result) {
          result = next;
          strippedIds.push(id);
        }
      }
      if (strippedIds.length === 0) return;
      hasLocalContentUpdate.current = true;
      setDisplayContent(result);
      setEditContent(result);
      // Persist the stripped links but don't reorder lists — automated cleanup, not a user edit.
      if (onSave) {
        onSave(editTitle, result, undefined, { bumpUpdatedAt: false }).catch(() => {});
      } else {
        const globalCallback = (window as any).noteSaveCallback;
        if (globalCallback) globalCallback(editTitle, result, undefined, { bumpUpdatedAt: false });
      }
      const remaining = deletedIds.filter(id => !strippedIds.includes(id));
      sessionStorage.setItem(DELETED_NOTE_IDS_KEY, JSON.stringify(remaining));
    } catch {
      // ignore
    }
  }, [noteId, content, displayContent, editTitle, onSave]);

  // Detect parent thread ID from DOM when editing starts
  useEffect(() => {
    if (isContentEditing || isTitleEditing) {
      // Try to find parent thread ID from data attributes
      // First, check if current element or parent has data-parent-thread-id
      const cardElement = document.querySelector('[data-card-full-editable]');
      let detectedThreadId: string | undefined;
      
      // Check parent elements for data-parent-thread-id
      if (cardElement) {
        const parentWithThreadId = cardElement.closest('[data-parent-thread-id]');
        if (parentWithThreadId) {
          detectedThreadId = (parentWithThreadId as HTMLElement).dataset.parentThreadId;
        } else {
          // Fallback: check for data-note-id element
          const noteElement = document.querySelector('[data-note-id]');
          if (noteElement && (noteElement as HTMLElement).dataset.parentThreadId) {
            detectedThreadId = (noteElement as HTMLElement).dataset.parentThreadId;
          }
        }
      }
      
      // Default to unorganized if not found
      setParentThreadId(detectedThreadId || 'thread_unorganized');
    }
  }, [isContentEditing, isTitleEditing]);


  const startEditing = (focus: 'title' | 'content' = 'title') => {
    // Prevent editing if not editable (scripture, onboarding pack, offline, or shared/member view)
    if (!effectiveIsEditable) {
      return;
    }
    // Don't open editor when note is locked (would show encrypted content)
    if (needsPinUnlock) {
      return;
    }

    // Save current scroll position
    if (contentDisplayRef.current) {
      const currentScroll = contentDisplayRef.current.scrollTop;
      setScrollPosition(currentScroll);
    }
    
    // For resource notes, use resourceTitle as fallback for initial title
    const initialTitle = (noteType === 'resource') 
      ? (displayTitle || resourceTitle || '') 
      : displayTitle;
    setEditTitle(initialTitle);
    // For resource notes, use resourceDescription as initial content if displayContent is empty
    const initialContent = (noteType === 'resource' && !displayContent && resourceDescription) 
      ? resourceDescription 
      : displayContent;
    setEditContent(initialContent);
    
    // Set the appropriate editing state based on focus
    if (focus === 'title') {
      setIsTitleEditing(true);
      // Focus immediately after state update
      requestAnimationFrame(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
        }
      });
    } else {
      const touchPrimary =
        typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
      if (touchPrimary && keyboardProxyRef.current) {
        try {
          keyboardProxyRef.current.focus({ preventScroll: true });
        } catch {
          keyboardProxyRef.current.focus();
        }
      }
      setIsContentEditing(true);
      // Set flag to focus editor when it's ready
      shouldFocusEditorRef.current = true;
    }
    
    setHasChanges(false);
  };

  // Handle editor ready callback
  const handleEditorReady = (editor: any) => {
    if (!editor) return;
    
    editorInstanceRef.current = editor;
    // Focus and set cursor at click position when switching from view to edit
    if (shouldFocusEditorRef.current) {
      shouldFocusEditorRef.current = false;
      const coords = contentClickCoordsRef.current;
      contentClickCoordsRef.current = null;
      const savedScroll = scrollPosition;

      // Restore scroll first so posAtCoords matches the view the user clicked in
      const scrollEl = editor.view?.dom?.closest?.('.tiptap-content') as HTMLElement | null;
      if (scrollEl && savedScroll > 0) {
        scrollEl.scrollTop = savedScroll;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          if (!editor || editor.isDestroyed || !editor.view?.docView) return;
          try {
            editor.commands.focus();
            keyboardProxyRef.current?.blur();
            const doc = editor.state.doc;
            const maxPos = doc.content.size;
            try {
              if (coords && scrollEl && editor.view.posAtCoords) {
                const rect = scrollEl.getBoundingClientRect();
                const viewportX = rect.left + coords.contentX - scrollEl.scrollLeft;
                const viewportY = rect.top + coords.contentY - scrollEl.scrollTop;
                const result = editor.view.posAtCoords({ left: viewportX, top: viewportY });
                const pos = result?.pos;
                if (typeof pos === 'number' && pos >= 1 && pos <= maxPos) {
                  editor.commands.setTextSelection(pos);
                } else {
                  const isEmpty = doc.textContent.trim().length === 0;
                  editor.commands.setTextSelection(isEmpty ? 1 : maxPos);
                }
              } else {
                const isEmpty = doc.textContent.trim().length === 0;
                editor.commands.setTextSelection(isEmpty ? 1 : maxPos);
              }
            } catch {
              const isEmpty = doc.textContent.trim().length === 0;
              editor.commands.setTextSelection(isEmpty ? 1 : maxPos);
            }
            // If cursor landed at the trailing edge of a scripture pill
            // (visually inside the pill's styled box because there's no content after it),
            // insert an empty paragraph after the pill's block and move the cursor there.
            try {
              const sel = editor.state.selection;
              const $pos = sel.$from;
              const parent = $pos.parent;
              const atEndOfParent = $pos.parentOffset === parent.content.size;
              if (atEndOfParent && parent.lastChild?.marks.some((m: any) => m.type.name === 'scripturePill')) {
                const endOfBlock = $pos.after($pos.depth);
                const tr = editor.state.tr;
                tr.insert(endOfBlock, editor.state.schema.nodes.paragraph.create());
                tr.setSelection(TextSelection.create(tr.doc, endOfBlock + 1));
                tr.setMeta('addToHistory', false);
                editor.view.dispatch(tr);
                // Don't mark this structural fix as a user change
                setTimeout(() => setHasChanges(false), 0);
              }
            } catch { /* ignore */ }
          } catch {
            /* ignore */
          }
        });
      });
    }
    // Note: Scripture detection is handled by TiptapEditor's useEffect
    // when content is loaded, so we don't need to trigger it here
  };

  const cancelEdit = () => {
    keyboardProxyRef.current?.blur();
    if (!alwaysEditing) {
      setIsTitleEditing(false);
      setIsContentEditing(false);
    }
    setEditTitle(displayTitle);
    setEditContent(displayContent);
    setHasChanges(false);
  };

  // Helper function to render save/cancel buttons
  const renderSaveCancelButtons = (paddingClass: string = 'px-3') => (
    <div className={`flex items-center gap-2 mt-3 mb-3 shrink-0 ${paddingClass}`}>
      {/* Character counter - only show when editing title */}
      {isTitleEditing && isTitleFocused && editTitle.length >= TITLE_SOFT_LIMIT && (
        <div 
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            color: editTitle.length >= TITLE_WARNING_LIMIT 
              ? 'var(--color-red)' 
              : 'var(--color-deep-grey)',
          }}
        >
          {editTitle.length}/{TITLE_HARD_LIMIT}
        </div>
      )}
      <div className="flex gap-2 ml-auto">
        <ButtonSmall
          state="Secondary"
          onClick={cancelEdit}
          disabled={isSaving}
        >
          Cancel
        </ButtonSmall>
        <ButtonSmall
          state="Default"
          onClick={saveChanges}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </ButtonSmall>
      </div>
    </div>
  );

  const saveChanges = async () => {
    await flushEditsRef.current(true);
  };

  useEffect(() => {
    flushEditsRef.current = async (closeAfter: boolean) => {
      const shouldCloseEditMode = closeAfter && !alwaysEditing;
      if (!hasChanges) {
        if (shouldCloseEditMode) {
          setIsTitleEditing(false);
          setIsContentEditing(false);
        }
        return;
      }

      setIsSaving(true);

      try {
        let editorContent = editContent;

        editorContent = noteHtmlForSave(editorInstanceRef.current, editorContent);
        if (!editorInstanceRef.current) {
          const hiddenInput = document.querySelector('#edit-note-content') as HTMLInputElement;
          if (hiddenInput?.value) {
            editorContent = canonicalizeNoteHtmlLineBreaks(hiddenInput.value);
          }
        }

        const chromeForSave =
          editorChromeMode === 'prototypeNative' && effectiveIsEditable
            ? applyIdleFolderAutoAssign(collectionChrome, editTitle, editorContent, new Date())
            : collectionChrome;

        const collectionExtras =
          editorChromeMode === 'prototypeNative' && effectiveIsEditable
            ? {
                primaryCollection: chromeForSave.primaryCollection,
                secondaryCollections: chromeForSave.secondaryCollections,
                collectionPinned: chromeForSave.collectionPinned,
                collectionUserOverride: chromeForSave.collectionUserOverride,
              }
            : undefined;

        let saveResult: any = null;
        if (onSave) {
          saveResult = await onSave(editTitle, editorContent, collectionExtras);
        } else {
          const globalCallback = (window as any).noteSaveCallback;
          if (globalCallback) {
            saveResult = await globalCallback(editTitle, editorContent, collectionExtras);
          }
        }

        const didCallSave = Boolean(onSave || (typeof window !== 'undefined' && (window as any).noteSaveCallback));
        if (collectionExtras && didCallSave) {
          setCollectionChrome(chromeForSave);
        }

        const applyAfterPersist = (finalTitle: string, finalHtml: string) => {
          setDisplayTitle(finalTitle);
          setDisplayContent(finalHtml);
          if (shouldCloseEditMode) {
            setIsTitleEditing(false);
            setIsContentEditing(false);
            setHasChanges(false);
          } else {
            const curTitle = editTitleRef.current;
            let curHtml = editContentRef.current;
            if (editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
              try {
                curHtml = editorInstanceRef.current.getHTML();
              } catch {
                /* keep ref */
              }
            }
            setHasChanges(curTitle !== finalTitle || curHtml !== finalHtml);
          }
        };

        if (saveResult && window.toast) {
          if (closeAfter && saveResult.scriptureDeferred) {
            window.toast.info('Note saved.');
          } else if (saveResult.scriptureProcessingError) {
            window.toast.warning('Note saved. Some scripture links couldn\'t be created.');
          } else if (saveResult.scriptureResults && saveResult.scriptureResults.length > 0) {
            const createdScriptures = saveResult.scriptureResults.filter(
              (r: any) => r.action === 'created'
            );
            const linkedScriptures = saveResult.scriptureResults.filter(
              (r: any) => r.action === 'added'
            );
            if (createdScriptures.length > 0) {
              const message = createdScriptures.length === 1
                ? `Created scripture note: ${createdScriptures[0].reference}`
                : `Created ${createdScriptures.length} scripture notes`;
              window.toast.info(message);
            } else if (linkedScriptures.length > 0) {
              const message = linkedScriptures.length === 1
                ? `Linked to scripture: ${linkedScriptures[0].reference}`
                : `Linked to ${linkedScriptures.length} scripture notes`;
              window.toast.info(message);
            }
            const hasCreatedOrAdded = createdScriptures.length > 0 || linkedScriptures.length > 0;
            if (hasCreatedOrAdded && typeof window !== 'undefined') {
              const wrapper = document.querySelector(`[data-note-id="${noteId}"]`);
              const parentThreadId = wrapper?.getAttribute('data-parent-thread-id') ?? undefined;
              window.dispatchEvent(new CustomEvent('scriptureNotesUpdated', {
                detail: { noteId, threadId: parentThreadId || undefined, results: saveResult.scriptureResults }
              }));
            }
          }
        }

        if (saveResult.processedContent && editorInstanceRef.current) {
          const editor = editorInstanceRef.current;
          let liveHtml: string | null = null;
          if (!editor.isDestroyed) {
            try {
              liveHtml = editor.getHTML();
            } catch {
              liveHtml = null;
            }
          }
          const userTypedDuringSave = !shouldInjectProcessedNoteContent(liveHtml, editorContent);

          if (userTypedDuringSave) {
            // Skip the pill-injection override; the next debounced save will reprocess the newer content.
            // Pass editorContent (what was actually saved) as finalHtml so applyAfterPersist computes
            // hasChanges = (liveHtml !== editorContent) = true — keeping the follow-up save alive.
            applyAfterPersist(editTitle, editorContent);
          } else if (
            !contentSyncWouldClobberScripturePillAccent(liveHtml, saveResult.processedContent)
          ) {
            hasLocalContentUpdate.current = true;
            skipNextContentSyncRef.current = true;
            // Preserve the caret across the processed-content injection IN ONE transaction. A bare
            // setContent resets the selection to the doc end; that intermediate selectionUpdate
            // fires a "caret left the pill" dismiss that collapses an open scripture dock. Restoring
            // the selection in the same chain means the caret never visits the doc end.
            const prevFrom = editor.state.selection.from;
            const prevTo = editor.state.selection.to;
            editor
              .chain()
              .setContent(canonicalizeNoteHtmlLineBreaks(saveResult.processedContent), {
                emitUpdate: false,
              })
              .command(({ tr, dispatch }: { tr: typeof editor.state.tr; dispatch?: (tr: typeof editor.state.tr) => void }) => {
                if (dispatch) {
                  const maxPos = tr.doc.content.size;
                  const from = Math.min(prevFrom, maxPos);
                  const to = Math.min(prevTo, maxPos);
                  try {
                    tr.setSelection(TextSelection.create(tr.doc, from, to));
                  } catch {
                    /* positions invalid against the new doc — leave default */
                  }
                }
                return true;
              })
              .run();
            requestAnimationFrame(async () => {
              if (editorInstanceRef.current) {
                const { convertNoteLinksToScripturePills, consumeTrailingTranslationAfterPills } = await import('./TiptapEditor');
                await convertNoteLinksToScripturePills(editorInstanceRef.current);
                consumeTrailingTranslationAfterPills(editorInstanceRef.current);
                const finalContent = editorInstanceRef.current.getHTML();
                applyAfterPersist(editTitle, finalContent);
              }
            });
          } else {
            applyAfterPersist(editTitle, editorContent);
          }
        } else {
          if (editorInstanceRef.current) {
            editorContent = editorInstanceRef.current.getHTML();
          }
          applyAfterPersist(editTitle, editorContent);
        }
      } catch {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Error saving note. Please try again.',
            type: 'error'
          }
        }));
      } finally {
        setIsSaving(false);
      }
    };

    saveChangesRef.current = saveChanges;
  });

  // Prototype auto-save: purely ref-based, never depends on hasChanges state so it can't be
  // silently wiped by init-effect re-fires or applyAfterPersist. Fires 700ms after the last
  // editTitle / editContent change, reads live content from the editor ref, and calls
  // onSave (note-scoped) or noteSaveCallback as fallback.
  const protoSaveAsync = useCallback(async (opts?: { fromUnmount?: boolean }) => {
    if (protoIsSavingRef.current) {
      // A save is in flight. Remember that a flush was requested so we re-fire
      // when it returns — otherwise trailing edits typed during the in-flight
      // save (or content captured by unmount cleanup) are silently dropped.
      protoPendingFlushRef.current = true;
      if (!opts?.fromUnmount) return;
      // Unmount flush: wait for the in-flight save (it already captured note-scoped saveFn).
      let spins = 0;
      while (protoIsSavingRef.current && spins < 200) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 25);
        });
        spins++;
      }
    }

    const currentTitle = editTitleRef.current;
    const currentContent = noteHtmlForSave(
      editorInstanceRef.current,
      liveBodyHtmlRef.current || editContentRef.current,
    );
    const saveNoteId = noteIdRef.current;

    // Recompute the auto collection from the live text so the suggested folder is
    // persisted alongside the autosave (otherwise it shows transiently then gets
    // wiped by the post-save refetch). Prototype-only; mirrors flushEdits.
    const isProto = editorChromeModeRef.current === 'prototypeNative';
    let chromeForSave = collectionChromeRef.current;
    if (isProto) {
      if (isEffectivelyEmptyPrototypeNote(currentTitle, currentContent)) {
        chromeForSave = clearAutoFolderChrome(collectionChromeRef.current);
        folderSuggestSnapshotRef.current = { title: currentTitle, body: '' };
        if (isMountedRef.current) setCollectionChrome(chromeForSave);
        return;
      }
      const snap = folderSuggestSnapshotRef.current;
      const plainBody = plainBodyForFolderSnapshot(currentContent);
      const allowPrimary = shouldAllowPrimaryFolderUpdate(snap.title, currentTitle, snap.body, plainBody);
      chromeForSave = applyIdleFolderAutoAssign(
        collectionChromeRef.current,
        currentTitle,
        currentContent,
        new Date(),
        allowPrimary,
      );
      if (allowPrimary) {
        folderSuggestSnapshotRef.current = { title: currentTitle, body: plainBody };
      }
      if (isMountedRef.current) setCollectionChrome(chromeForSave);
    }
    const collectionExtras = isProto
      ? {
          primaryCollection: chromeForSave.primaryCollection,
          secondaryCollections: chromeForSave.secondaryCollections,
          collectionPinned: chromeForSave.collectionPinned,
          collectionUserOverride: chromeForSave.collectionUserOverride,
        }
      : undefined;
    const collectionKey = collectionExtras
      ? `${collectionExtras.primaryCollection ?? ''}|${collectionExtras.secondaryCollections.join(',')}|${collectionExtras.collectionPinned ? 1 : 0}|${collectionExtras.collectionUserOverride ? 1 : 0}`
      : '';

    const last = protoLastSavedRef.current;
    if (last && last.title === currentTitle && last.content === currentContent && last.collectionKey === collectionKey) {
      // Natural termination of the recursion chain — nothing new to save.
      return;
    }

    // Capture note-scoped save fn synchronously — never read window.noteSaveCallback after await.
    const saveFn =
      onSaveRef.current ??
      (typeof window !== 'undefined' ? (window as { noteSaveCallback?: typeof onSaveRef.current }).noteSaveCallback : undefined);
    if (!saveFn) return;

    protoIsSavingRef.current = true;
    const prevLast = protoLastSavedRef.current;
    protoLastSavedRef.current = { title: currentTitle, content: currentContent, collectionKey };

    try {
      const saveResult: unknown = await saveFn(currentTitle, currentContent, collectionExtras);
      const result = saveResult as { processedContent?: string } | null;
      if (collectionExtras && isMountedRef.current) setCollectionChrome(chromeForSave);

      if (result?.processedContent && editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
        const editor = editorInstanceRef.current;
        let liveHtml: string | null = null;
        try { liveHtml = editor.getHTML(); } catch { /* */ }
        if (
          shouldInjectProcessedNoteContent(liveHtml, currentContent) &&
          !editor.isFocused &&
          !contentSyncWouldClobberScripturePillAccent(liveHtml, result.processedContent)
        ) {
          // Safe to inject pills — user hasn't typed since save started and isn't actively editing
          hasLocalContentUpdate.current = true;
          skipNextContentSyncRef.current = true;
          // Preserve the caret across the processed-content injection IN ONE transaction. A bare
          // setContent resets the selection to the doc end; that intermediate selectionUpdate fires
          // a "caret left the pill" dismiss that collapses an open scripture dock (e.g. right after
          // an accent change). Restoring the selection in the same chain means the caret never
          // visits the doc end.
          const protoPrevFrom = editor.state.selection.from;
          const protoPrevTo = editor.state.selection.to;
          editor
            .chain()
            .setContent(canonicalizeNoteHtmlLineBreaks(result.processedContent), {
              emitUpdate: false,
            })
            .command(({ tr, dispatch }: { tr: typeof editor.state.tr; dispatch?: (tr: typeof editor.state.tr) => void }) => {
              if (dispatch) {
                const maxPos = tr.doc.content.size;
                const from = Math.min(protoPrevFrom, maxPos);
                const to = Math.min(protoPrevTo, maxPos);
                try {
                  tr.setSelection(TextSelection.create(tr.doc, from, to));
                } catch {
                  /* positions invalid against the new doc — leave default */
                }
              }
              return true;
            })
            .run();
          requestAnimationFrame(async () => {
            if (!editorInstanceRef.current || editorInstanceRef.current.isDestroyed) return;
            if (!isMountedRef.current) return;
            const { convertNoteLinksToScripturePills, consumeTrailingTranslationAfterPills } = await import('./TiptapEditor');
            await convertNoteLinksToScripturePills(editorInstanceRef.current);
            consumeTrailingTranslationAfterPills(editorInstanceRef.current);
            const finalContent = editorInstanceRef.current.getHTML();
            protoLastSavedRef.current = { title: currentTitle, content: finalContent, collectionKey };
            setDisplayTitle(currentTitle);
            setDisplayContent(finalContent);
            setHasChanges(false);
          });
        } else if (shouldInjectProcessedNoteContent(liveHtml, currentContent) && editor.isFocused) {
          // Save matched but editor still focused — defer pill injection so setContent
          // doesn't reset the caret mid-typing. Re-flush after the user pauses or blurs.
          protoPendingFlushRef.current = true;
        } else {
          // User typed during save — we did NOT update protoLastSavedRef to the
          // live content, so the chained re-fire below will see a mismatch and
          // save the trailing characters.
          protoPendingFlushRef.current = true;
        }
      } else if (isMountedRef.current) {
        const editorFocused =
          !!editorInstanceRef.current &&
          !editorInstanceRef.current.isDestroyed &&
          editorInstanceRef.current.isFocused;
        if (!editorFocused) {
          setDisplayTitle(currentTitle);
          setDisplayContent(currentContent);
          setHasChanges(false);
        } else {
          protoPendingFlushRef.current = true;
        }
      }

      // The server now holds the content we just persisted, so the local draft
      // backstop is redundant — clear it, unless the user has typed newer edits
      // during the save (those stay drafted and the re-fire below will save them).
      try {
        const liveTitle = editTitleRef.current;
        const liveContent = noteHtmlForSave(
          editorInstanceRef.current,
          liveBodyHtmlRef.current || editContentRef.current,
        );
        if (saveNoteId && liveTitle === currentTitle && liveContent === currentContent) {
          clearNoteDraft(saveNoteId);
        }
      } catch {
        /* ignore */
      }
    } catch {
      // Restore last-saved so the next attempt retries the full content
      protoLastSavedRef.current = prevLast;
      protoPendingFlushRef.current = isMountedRef.current;
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error saving note. Please try again.',
          type: 'error',
        },
      }));
    } finally {
      protoIsSavingRef.current = false;
      if (protoPendingFlushRef.current && isMountedRef.current) {
        protoPendingFlushRef.current = false;
        // Re-fire after releasing the lock. The equality-check guard above
        // prevents infinite loops when content is unchanged.
        void protoSaveAsyncRef.current();
      } else {
        protoPendingFlushRef.current = false;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — reads everything from refs

  protoSaveAsyncRef.current = protoSaveAsync;

  // Prototype mode is alwaysEditing — the editor is conceptually always in edit
  // mode, so we don't gate on isTitleEditing/isContentEditing here. Gating on those
  // states created a window during note transitions (init effect hasn't flipped them
  // to true yet) where keystrokes wouldn't schedule a save.
  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    if (!effectiveIsEditable) return;
    if (!userEditedSinceOpenRef.current) return;

    const timerId = window.setTimeout(() => { void protoSaveAsync(); }, 700);
    return () => window.clearTimeout(timerId);
  }, [
    editorChromeMode,
    effectiveIsEditable,
    editTitle,
    editContent,
    protoSaveAsync,
  ]);

  // Durable draft backstop: persist unsaved edits locally on a tight debounce
  // (well under the 700ms network autosave) so a close / crash / nav inside the
  // autosave window is recoverable on next open. Gated on a real user edit so a
  // pure note-open seed never writes a draft. Cleared on confirmed save.
  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    if (!effectiveIsEditable) return;
    if (!userEditedSinceOpenRef.current) return;
    const id = noteIdRef.current;
    if (!id || readOnlyLikeScriptureRef.current) return;

    const timerId = window.setTimeout(() => {
      const titleNow = editTitleRef.current;
      const contentNow = noteHtmlForSave(
        editorInstanceRef.current,
        liveBodyHtmlRef.current || editContentRef.current,
      );
      if (isEffectivelyEmptyPrototypeNote(titleNow, contentNow)) {
        clearNoteDraft(id);
        return;
      }
      saveNoteDraft(id, { title: titleNow, content: contentNow });
    }, 250);
    return () => window.clearTimeout(timerId);
  }, [editorChromeMode, effectiveIsEditable, editTitle, editContent]);

  // Unload-safe flush. The 700ms debounce + unmount cleanup both rely on async
  // fetches that the browser aborts mid-navigation, so a hard refresh / tab close
  // within the debounce window loses the edit. On pagehide / tab-hidden we send a
  // `keepalive` PUT (survives unload) with the live editor content, mirroring the
  // body shape useUpdateNote posts. Prototype-only, editable notes only.
  useEffect(() => {
    if (editorChromeMode !== 'prototypeNative') return;
    if (!effectiveIsEditable) return;

    const flush = () => {
      const departingNoteId = noteIdRef.current;
      if (!departingNoteId || readOnlyLikeScriptureRef.current) return;

      const currentTitle = editTitleRef.current;
      const currentContent = noteHtmlForSave(
        editorInstanceRef.current,
        liveBodyHtmlRef.current || editContentRef.current,
      );
      if (isEffectivelyEmptyPrototypeNote(currentTitle, currentContent)) {
        const cleared = clearAutoFolderChrome(collectionChromeRef.current);
        if (isMountedRef.current) setCollectionChrome(cleared);
        return;
      }

      const draft = getNoteDraft(departingNoteId);
      if (
        shouldSkipPrototypeUnloadSave({
          contentToSave: currentContent,
          lastSavedContent: protoLastSavedRef.current?.content ?? null,
          serverContent: serverContentPropRef.current ?? null,
          draftContent: draft?.content ?? null,
        })
      ) {
        return;
      }

      // A pure view (no genuine edit) must never write on tab close/hide — mirror the unmount guard so
      // closing the tab while only reading a note can't bump updatedAt via normalization drift.
      if (!userEditedSinceOpenRef.current) return;

      // Synchronous local backstop first — localStorage survives unload even when
      // the keepalive PUT below is dropped, and it's the *only* recovery path for
      // a brand-new (note_draft) note, which has no server id to PUT against.
      saveNoteDraft(departingNoteId, { title: currentTitle, content: currentContent });

      const chromeForSave = applyIdleFolderAutoAssign(
        collectionChromeRef.current,
        currentTitle,
        currentContent,
        new Date(),
      );
      const collectionKey = `${chromeForSave.primaryCollection ?? ''}|${chromeForSave.secondaryCollections.join(',')}|${chromeForSave.collectionPinned ? 1 : 0}|${chromeForSave.collectionUserOverride ? 1 : 0}`;

      const last = protoLastSavedRef.current;
      if (last && last.title === currentTitle && last.content === currentContent && last.collectionKey === collectionKey) {
        return;
      }

      // Drafts have no server note id yet — nothing to PUT against. The 700ms
      // debounce normally creates them; if the user bails before that, the draft
      // is intentionally discarded (matches isEffectivelyEmpty handling).
      if (departingNoteId === 'note_draft') return;

      try {
        const body = JSON.stringify({
          noteId: departingNoteId,
          title: currentTitle,
          content: currentContent,
          scriptureVersion: getEffectiveDefaultTranslation(),
          primaryCollection: chromeForSave.primaryCollection,
          secondaryCollections: chromeForSave.secondaryCollections,
          collectionPinned: chromeForSave.collectionPinned,
          collectionUserOverride: chromeForSave.collectionUserOverride,
        });
        const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
        void fetch(`${baseUrl}/api/notes/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: true,
          body,
        }).catch(() => { /* best-effort on unload */ });
        protoLastSavedRef.current = { title: currentTitle, content: currentContent, collectionKey };
      } catch {
        /* ignore — best-effort */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [editorChromeMode, effectiveIsEditable]);

  // Listen for keyboard shortcut to save when editing (Cmd+S)
  useEffect(() => {
    const handleSaveContent = () => {
      // Only save if we're in edit mode, have changes, and not already saving
      if ((isTitleEditing || isContentEditing) && hasChanges && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('saveContent', handleSaveContent);
    return () => {
      window.removeEventListener('saveContent', handleSaveContent);
    };
  }, [isTitleEditing, isContentEditing, hasChanges, isSaving]);

  // Listen for Cmd+Enter to save (dispatched from TiptapEditor)
  useEffect(() => {
    const handleSubmitPanelForm = () => {
      // Only save if we're in edit mode and not already saving
      // Use saveChangesRef to always call the latest version with current state
      if ((isTitleEditing || isContentEditing) && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('submitPanelForm', handleSubmitPanelForm);
    return () => {
      window.removeEventListener('submitPanelForm', handleSubmitPanelForm);
    };
  }, [isTitleEditing, isContentEditing, isSaving]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      saveChanges();
    } else {
      // Handle Select All for title textarea (Cmd+A on Mac, Ctrl+A on Windows/Linux)
      const target = e.target as HTMLTextAreaElement;
      if (target === titleInputRef.current) {
        // Tab or Enter from title → focus content editor (Apple Notes / native parity)
        if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
          e.preventDefault();
          if (editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
            editorInstanceRef.current.commands.focus('end');
          } else {
            setIsContentEditing(true);
            shouldFocusEditorRef.current = true;
          }
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault();
          target.select();
          return;
        }
        
        // Auto-capitalize first letter for title textarea
        // Check if cursor is at the start of the title textarea
        if (target.selectionStart === 0 && target.selectionEnd === 0) {
          // Cursor is at the start
          if (e.key.length === 1 && /^[a-z]$/.test(e.key)) {
            e.preventDefault();
            const capitalized = e.key.toUpperCase();
            // If title is empty, set it to the capitalized letter
            // Otherwise, insert the capitalized letter at the start
            if (editTitle.length === 0) {
              setEditTitle(capitalized);
            } else {
              setEditTitle(capitalized + editTitle);
            }
            // Set cursor position after the capitalized letter
            setTimeout(() => {
              if (titleInputRef.current) {
                titleInputRef.current.setSelectionRange(1, 1);
              }
            }, 0);
          }
        }
      }
    }
  };

  const handleLiveBodyHtmlChange = useCallback((newContent: string) => {
    liveBodyHtmlRef.current = canonicalizeNoteHtmlLineBreaks(newContent);
  }, []);

  const handleContentChange = (newContent: string, meta?: { programmatic?: boolean }) => {
    const isProto = editorChromeMode === 'prototypeNative';
    if (isProto) {
      hasLocalContentUpdate.current = true;
    }
    const canonical = canonicalizeNoteHtmlLineBreaks(newContent);
    editContentRef.current = canonical;
    liveBodyHtmlRef.current = canonical;
    setEditContent(canonical);
    // Prototype: programmatic emissions (open-time pill/translation normalization, orphan-highlight
    // backfill) are NOT user edits. Marking them dirty would fire the autosave on mere open, which
    // re-stamps `updatedAt` and reorders the Notes/Home lists to the top. Keep the synced content
    // (above) but skip the dirty flag + save so opening a note never changes its sort position.
    if (isProto && meta?.programmatic) return;
    userEditedSinceOpenRef.current = true;
    setHasChanges(editTitle !== displayTitle || canonical !== displayContent);
  };

  const resolveThreadContext = (): string => {
    const currentNoteId = extractIdFromPath(window.location.pathname);
    if (parentThreadId && parentThreadId.startsWith('thread_')) return parentThreadId;
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('thread');
      if (fromQuery && fromQuery.startsWith('thread_')) return fromQuery;
    } catch {
      // ignore
    }
    if (currentNoteId?.startsWith('note_')) {
      try {
        const cached = localStorage.getItem(`harvous-note-thread-${currentNoteId}`);
        if (cached && cached.startsWith('thread_')) return cached;
      } catch {
        // ignore
      }
    }
    const noteEl = document.querySelector('[data-note-id]') as HTMLElement | null;
    if (noteEl?.dataset.parentThreadId?.startsWith('thread_')) {
      return noteEl.dataset.parentThreadId;
    }
    const navEl = document.querySelector('[data-navigation-active="true"]') as HTMLElement | null;
    if (navEl?.dataset.parentThreadId?.startsWith('thread_')) {
      return navEl.dataset.parentThreadId;
    }
    const pathId = extractIdFromPath(window.location.pathname);
    if (pathId?.startsWith('thread_')) return pathId;
    return 'thread_unorganized';
  };

  const focusPrototypeBodyEditor = useCallback((event?: React.PointerEvent) => {
    if (editorChromeMode !== 'prototypeNative' || !effectiveIsEditable) return;
    bodyInteractionRef.current = true;
    const editor = editorInstanceRef.current;
    if (editor && !editor.isDestroyed) {
      // Click landed inside the editable text: let ProseMirror's own mousedown place the
      // caret at the click point. Forcing focus('end') here clobbered it, jumping the caret
      // to the document end on every click (user had to arrow / triple-click to recover).
      const target = event?.target as HTMLElement | null;
      if (target && target.closest('.ProseMirror')) {
        return;
      }
      // Study-dock chrome is React-portaled out of this subtree, but React portal events still
      // bubble through THIS handler. Refocusing the editor here yanks DOM focus mid-gesture and
      // kills drag-select in the dock passage — never steal focus from dock interactions.
      if (
        target &&
        target.closest(
          '.study-dock-card, .study-dock-carousel, .scripture-pill-chrome, .highlight-dock-web, .reference-dock-web, .scripture-delete-confirm',
        )
      ) {
        return;
      }
      // Click landed in the surrounding padding (outside .ProseMirror): focus at the end so
      // tapping below the text still starts editing.
      try {
        editor.commands.focus('end');
      } catch {
        /* ignore */
      }
      return;
    }
    shouldFocusEditorRef.current = true;
    setIsContentEditing(true);
  }, [editorChromeMode, effectiveIsEditable]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, TITLE_HARD_LIMIT); // Enforce hard limit
    e.target.style.height = '0px';
    e.target.style.height = `${Math.max(TITLE_SINGLE_ROW_MIN_HEIGHT_PX, e.target.scrollHeight)}px`;
    userEditedSinceOpenRef.current = true;
    if (editorChromeMode === 'prototypeNative') {
      hasLocalContentUpdate.current = true;
    }
    setEditTitle(newValue);
    setHasChanges(newValue !== displayTitle || editContent !== displayContent);
  };

  useEffect(() => {
    if (!isTitleEditing || !titleInputRef.current) return;
    const el = titleInputRef.current;
    el.style.height = '0px';
    el.style.height = `${Math.max(TITLE_SINGLE_ROW_MIN_HEIGHT_PX, el.scrollHeight)}px`;
  }, [isTitleEditing, editTitle]);

  // Prefetch scripture note page on hover for faster navigation
  const prefetchedUrls = useRef(new Set<string>());
  const handleContentMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const pillElement = target.closest('.scripture-pill');
    if (!pillElement) return;
    const pillNoteId = pillElement.getAttribute('data-note-id');
    if (!pillNoteId || pillNoteId === 'pending' || pillNoteId === 'null') return;
    const url = idToUrl(pillNoteId, parentThreadId);
    if (prefetchedUrls.current.has(url)) return;
    prefetchedUrls.current.add(url);
    // Inject a prefetch link to warm the browser/SSR cache
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  };

  const handleContentClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    // Check if click is on a note-link (highlighted text linking to another note)
    const target = e.target as HTMLElement;
    const noteLinkElement = target.closest('.note-link');
    
    if (noteLinkElement) {
      const noteId = noteLinkElement.getAttribute('data-note-id');
      
      if (noteId) {
        // Navigate to the linked note
        e.preventDefault();
        e.stopPropagation();
        const currentNoteId = extractIdFromPath(window.location.pathname);
        const threadCtx = resolveThreadContext();
        if (currentNoteId?.startsWith('note_') && threadCtx) {
          pushNavStack(currentNoteId, threadCtx);
        }
        safeNavigate(idToUrl(noteId, threadCtx, currentNoteId || undefined), { history: 'push' });
        return;
      }
    }

    // Check if click is on a scripture pill
    const pillElement = target.closest('.scripture-pill');
    
    if (pillElement) {
      const noteId = pillElement.getAttribute('data-note-id');
      const reference = pillElement.getAttribute('data-scripture-reference');
      const pillTranslation = pillElement.getAttribute('data-scripture-translation') || getCachedProfileData()?.defaultTranslation || 'NET';

      // Prototype web shell: from read-only HTML preview, open TipTap + scripture dock — do not navigate away.
      if (editorChromeMode === 'prototypeNative' && effectiveIsEditable && reference) {
        e.preventDefault();
        e.stopPropagation();
        setPrototypeScripturePillOpenRequest({
          reference,
          translation: pillElement.getAttribute('data-scripture-translation'),
          noteId,
          pillAccent: pillElement.getAttribute('data-pill-accent'),
        });
        if (!isContentEditing) {
          startEditing('content');
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const threadId = resolveThreadContext();

      // Fast path: If pill already has a valid noteId, navigate immediately.
      // Also fire a non-blocking add-thread so the scripture note is added to
      // whichever thread the user is currently in (handles multi-thread membership).
      if (noteId && noteId !== 'pending' && noteId !== 'null') {
        const currentNoteId = extractIdFromPath(window.location.pathname);
        if (currentNoteId?.startsWith('note_')) {
          pushNavStack(currentNoteId, threadId);
        }
        if (threadId && threadId !== 'thread_unorganized') {
          const targetId = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
          fetch(`/api/notes/${targetId}/add-thread`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId }),
            credentials: 'include',
          })
            .then((res) => {
              if (res.ok) {
                window.dispatchEvent(
                  new CustomEvent('noteAddedToThread', {
                    detail: { noteId: targetId, threadId, source: 'inlineAddThread' },
                  })
                );
              }
            })
            .catch(() => {});
        }
        safeNavigate(idToUrl(noteId, threadId, currentNoteId || undefined), { history: 'push' });
        return;
      }

      // Slow path: noteId is pending/missing — need to check/create the scripture note
      if (reference) {
        try {
          const result = await getOrCreateScriptureNote(reference, threadId, pillTranslation);

          if (result.noteId) {
            // Update the pill's noteId in the DOM so next click is instant
            pillElement.setAttribute('data-note-id', result.noteId);
            const currentNoteId = extractIdFromPath(window.location.pathname);
            if (currentNoteId?.startsWith('note_')) {
              pushNavStack(currentNoteId, threadId);
            }
            safeNavigate(idToUrl(result.noteId, threadId, currentNoteId || undefined), { history: 'push' });
          } else {
            window.dispatchEvent(new CustomEvent('toast', {
              detail: {
                message: 'Could not create scripture note. Please try again.',
                type: 'error'
              }
            }));
          }
        } catch (error) {
          console.error('Error handling scripture note:', error);
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Could not create scripture note. Please try again.',
              type: 'error'
            }
          }));
        }
        return;
      }

      // No reference or noteId available
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Scripture note is pending creation. Please save the note first.',
          type: 'warning'
        }
      }));
      return;
    }
    
    // If not a note-link or scripture pill, enter edit mode (if editable)
    if (effectiveIsEditable) {
      const displayEl = contentDisplayRef.current;
      if (displayEl) {
        const rect = displayEl.getBoundingClientRect();
        contentClickCoordsRef.current = {
          contentX: e.clientX - rect.left + displayEl.scrollLeft,
          contentY: e.clientY - rect.top + displayEl.scrollTop,
        };
      } else {
        contentClickCoordsRef.current = { contentX: e.clientX, contentY: e.clientY };
      }
      startEditing('content');
    }
  };

  // Resource note - special display with card-image-link design + editable content
  if (noteType === 'resource') {
    const effectiveTitle = resourceTitle || displayTitle || 'Untitled Resource';
    
    // Detect if URL is a PDF
    const isPDF = resourceUrl ? (
      resourceUrl.toLowerCase().endsWith('.pdf') ||
      resourceUrl.toLowerCase().includes('.pdf?') ||
      resourceUrl.toLowerCase().includes('.pdf#')
    ) : false;
    
    const hostname = resourceUrl ? (() => {
      try {
        const url = new URL(resourceUrl);
        return url.hostname.replace('www.', '');
      } catch {
        return resourceUrl;
      }
    })() : '';

    // For resource notes, use resourceDescription as initial content if content is empty
    const effectiveContent = displayContent || resourceDescription || '';

    return (
      <>
      <div
        ref={cardRootRef}
        className={`card-full-editable ${className}`}
        style={{ maxHeight: '100%' }}
        data-card-full-editable
        {...((showBodyEditor || showTitleEditor) && { 'data-editing': 'true' })}
      >
        <textarea
          ref={keyboardProxyRef}
          aria-hidden
          tabIndex={-1}
          defaultValue=""
          onInput={(e) => {
            e.currentTarget.value = '';
          }}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className="card-full-editable__keyboard-proxy"
        />
        <div className="card-image-link" style={{ gap: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Full-width image at top */}
          {resourceImage && !imageRemoved && (
            <div 
              className="card-image-link__image"
              style={{ 
                backgroundImage: `url('${resourceImage}')`,
                minHeight: '180px',
                flexShrink: 0,
                position: 'relative'
              }}
            >
              {/* Remove image button - only show on hover - TEMPORARILY DISABLED */}
              {/* <div className="card-image-link__remove-button">
                <ActionButton
                  variant="Close"
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    // Update resource metadata to remove image (don't hide immediately to avoid flicker)
                    if (noteId) {
                      try {
                        // Use the notes update endpoint which supports resourceImage updates
                        const response = await fetch(`/api/notes/update`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            noteId: noteId,
                            title: displayTitle,
                            content: displayContent,
                            resourceImage: ''
                          }),
                          credentials: 'include'
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          if (result.success) {
                            // Only hide and reload after successful update
                            setImageRemoved(true);
                            // Reload the page to reflect the change
                            window.location.reload();
                          } else {
                            // If update fails, show error
                            const errorMessage = result.error || 'Error removing image. Please try again.';
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: errorMessage,
                                type: 'error'
                              }
                            }));
                          }
                        } else {
                          // If response not ok, try to parse error
                          try {
                            const errorResult = await response.json();
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: errorResult.error || 'Error removing image. Please try again.',
                                type: 'error'
                              }
                            }));
                          } catch {
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: 'Error removing image. Please try again.',
                                type: 'error'
                              }
                            }));
                          }
                        }
                      } catch (error: any) {
                        console.error('Error removing image:', error);
                        window.dispatchEvent(new CustomEvent('toast', {
                          detail: {
                            message: 'Error removing image. Please try again.',
                            type: 'error'
                          }
                        }));
                      }
                    } else {
                      // No noteId, just hide it locally
                      setImageRemoved(true);
                    }
                  }}
                  aria-label="Remove image"
                  className=""
                  style={{
                    width: '32px',
                    height: '32px'
                  }}
                />
              </div> */}
            </div>
          )}
          
          {/* Header with title and newspaper icon */}
          <div className="card-image-link__header" style={{ flexShrink: 0 }}>
            <div className="card-image-link__title" style={{ flex: 1, minWidth: 0 }}>
              {!showTitleEditor ? (
                <p
                  className="cursor-pointer rounded"
                  style={{
                    margin: 0,
                    padding: '4px 8px',
                    marginLeft: '-8px',
                    marginRight: '-8px',
                  }}
                  onClick={effectiveIsEditable ? () => startEditing('title') : undefined}
                >
                  {effectiveTitle}
                </p>
              ) : (
                <div>
                  <textarea 
                    ref={titleInputRef}
                    value={editTitle}
                    onChange={handleTitleChange}
                    maxLength={TITLE_HARD_LIMIT}
                    rows={1}
                    className="w-full bg-transparent border-0 rounded focus:outline-none font-bold"
                    style={{
                      lineHeight: '1.2',
                      margin: 0,
                      padding: '4px 8px',
                      marginLeft: '-8px',
                      marginRight: '-8px',
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      fontFamily: 'inherit',
                      color: 'inherit',
                      boxSizing: 'border-box',
                      width: 'calc(100% + 16px)',
                      resize: 'none',
                    }}
                    placeholder={alwaysEditing ? 'Title' : 'Resource title'}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsTitleFocused(true)}
                    onBlur={() => setIsTitleFocused(false)}
                  />
                </div>
              )}
            </div>
            <div className="card-image-link__bookmark" style={{ marginTop: '4px' }}>
              <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
            </div>
          </div>
          
          {/* Editable content area with TiptapEditor */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%', marginTop: '12px' }}>
            {!showBodyEditor ? (
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  ref={contentDisplayRef}
                  className={`flex-1 overflow-auto rounded px-3${viewScrollMaskClasses ? ` ${viewScrollMaskClasses}` : ''}`}
                  style={{ lineHeight: '1.6', minHeight: 0, width: '100%', cursor: effectiveIsEditable ? 'text' : 'default' }}
                  onClick={handleContentClick}
                  onMouseOver={handleContentMouseOver}
                >
                  {effectiveContent && effectiveContent.trim() ? (
                    <div
                      className="card-full-editable__content-html card-image-link__content-text"
                      dangerouslySetInnerHTML={{
                        __html: safeRenderHtml(prepareReadOnlyNoteBodyHtml(effectiveContent)),
                      }}
                    />
                  ) : (
                    <p style={{ color: 'var(--color-pebble-grey)', fontStyle: 'italic' }}>Click to add notes...</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-fill flex-stack" style={{ gap: 0, width: '100%' }}>
                <div
                  className="flex-1 min-h-0 px-3"
                  style={{ width: '100%', maxHeight: '100%' }}
                  onPointerDown={
                    editorChromeMode === 'prototypeNative' ? focusPrototypeBodyEditor : undefined
                  }
                >
                  {wrapTiptapSuspense(
                    <TiptapEditorComponent
                      key={`proto-body-${bodyEditorMountId}-${tiptapBodyMountKey}`}
                      content={editContent}
                      id="edit-note-content"
                      name="editContent"
                      placeholder="Add your notes about this resource..."
                      tabindex={3}
                      minimalToolbar={false}
                      toolbarAtBottom={true}
                      toolbarBottomMargin={0}
                      onContentChange={handleContentChange}
                      onLiveBodyHtmlChange={
                        editorChromeMode === 'prototypeNative' ? handleLiveBodyHtmlChange : undefined
                      }
                      scrollPosition={scrollPosition}
                      enableCreateNoteFromSelection={isContentEditing}
                      parentThreadId={parentThreadId}
                      sourceNoteId={noteId}
                      spaceId={spaceId}
                      onEditorReady={handleEditorReady}
                      editorChromeMode={editorChromeMode}
                      onPrototypeChromeModeChange={
                        editorChromeMode === 'prototypeNative' ? setPrototypeBottomChromeMode : undefined
                      }
                      formatToolbarPortalTarget={
                        editorChromeMode === 'prototypeNative' ? formatToolbarPortalTarget : undefined
                      }
                      studyDockCarouselPortalTarget={
                        editorChromeMode === 'prototypeNative' ? studyDockCarouselPortalTarget : null
                      }
                      scriptureChromePortalTarget={
                        editorChromeMode === 'prototypeNative' ? scriptureChromePortalTarget : null
                      }
                      highlightChromePortalTarget={
                        editorChromeMode === 'prototypeNative' ? highlightChromePortalTarget : null
                      }
                      initialReferenceWord={editorChromeMode === 'prototypeNative' ? initialReferenceWord : null}
                      initialReferenceRequestKey={
                        editorChromeMode === 'prototypeNative' ? initialReferenceRequestKey : null
                      }
                      onReferenceDeepLinkHandoff={
                        editorChromeMode === 'prototypeNative' ? onReferenceDeepLinkHandoff : undefined
                      }
                      prototypeScripturePillOpenRequest={
                        editorChromeMode === 'prototypeNative' ? prototypeScripturePillOpenRequest : null
                      }
                      onPrototypeScripturePillOpenRequestConsumed={onPrototypeScripturePillOpenRequestConsumed}
                      onPrototypeScripturePillOpenRequestUnresolved={onScriptureDockUnresolved}
                      prototypeHighlightOpenRequest={
                        editorChromeMode === 'prototypeNative' ? prototypeHighlightOpenRequest : null
                      }
                      onPrototypeHighlightOpenRequestConsumed={onPrototypeHighlightOpenRequestConsumed}
                      prototypeNoteActionsChrome={effectivePrototypeNoteActionsChrome}
                    />,
                    'min-h-[100px]',
                  )}
                </div>
                
                {/* Save/Cancel buttons */}
                {editorChromeMode !== 'prototypeNative' && isContentEditing && renderSaveCancelButtons('px-3')}
              </div>
            )}
          </div>
          
          {/* Source bar with hostname and external link icon */}
          {resourceUrl && (
            <button
              type="button"
              className="card-image-link__source"
              style={{ textDecoration: 'none', border: 'none', textAlign: 'left', flexShrink: 0 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(resourceUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <div className="card-image-link__source-content" style={{ justifyContent: 'space-between' }}>
                <div className="card-image-link__source-text">
                  <p>{isPDF ? 'View PDF' : hostname}</p>
                </div>
                <div className="card-image-link__source-icon">
                  <Icon name={isPDF ? 'file-pdf' : 'arrow-up-right-from-square'} size={20} />
                </div>
              </div>
            </button>
          )}

          {/* Save/Cancel buttons when only title is being edited - shown at bottom */}
          {editorChromeMode !== 'prototypeNative' &&
            isTitleEditing &&
            !isContentEditing &&
            renderSaveCancelButtons('px-3')}

          {editorChromeMode === 'prototypeNative' &&
            !formatToolbarPortalTarget &&
            !noteActionsPortalTarget &&
            prototypeBottomChromeMode === 'noteActions' &&
            prototypeNoteActionBar ? (
            <div className="w-full shrink-0 px-3">{prototypeNoteActionBar}</div>
          ) : null}
        </div>
      </div>
      {editorChromeMode === 'prototypeNative' &&
        noteActionsPortalTarget &&
        createPortal(
          <NoteProductionActionBar
            collectionDraft={collectionChrome.primaryCollection ?? ''}
            onDraftChange={(v) => {
              const t = v.trim();
              const nextPrimary = t.length ? t : null;
              const pLow = nextPrimary?.toLowerCase() ?? '';
              setCollectionChrome(c => ({
                ...c,
                primaryCollection: nextPrimary,
                secondaryCollections: c.secondaryCollections.filter(
                  (s) => s.trim().length > 0 && s.trim().toLowerCase() !== pLow,
                ),
                collectionUserOverride: true,
              }));
            }}
            secondaryCollections={collectionChrome.secondaryCollections}
            onRemoveSecondary={(name) => {
              const low = name.toLowerCase();
              setCollectionChrome(c => ({
                ...c,
                secondaryCollections: c.secondaryCollections.filter((s) => s.toLowerCase() !== low),
                collectionUserOverride: true,
              }));
            }}
            addSecondaryDraft={addSecondaryDraft}
            onAddSecondaryDraftChange={setAddSecondaryDraft}
            onCommitAddSecondary={() => {
              const t = addSecondaryDraft.trim();
              if (!t.length) return;
              const pLow = (collectionChrome.primaryCollection ?? '').trim().toLowerCase();
              if (pLow && t.toLowerCase() === pLow) {
                setAddSecondaryDraft('');
                return;
              }
              setCollectionChrome(c => {
                if (c.secondaryCollections.some((s) => s.toLowerCase() === t.toLowerCase())) {
                  return c;
                }
                return {
                  ...c,
                  secondaryCollections: [...c.secondaryCollections, t],
                  collectionUserOverride: true,
                };
              });
              setAddSecondaryDraft('');
            }}
            collectionPinned={collectionChrome.collectionPinned}
            collectionUserOverride={collectionChrome.collectionUserOverride}
            onTogglePinned={() =>
              setCollectionChrome(c => ({ ...c, collectionPinned: !c.collectionPinned }))
            }
            onRestoreAuto={() => {
              let body = editContent;
              if (editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
                try {
                  body = editorInstanceRef.current.getHTML();
                } catch {
                  /* keep editContent */
                }
              }
              const sug = suggestPrimaryCollectionFromNote(editTitle, body);
              const secs = suggestSecondaryCollectionsFromNote(editTitle, body, sug);
              setCollectionChrome(c => ({
                ...c,
                primaryCollection: sug,
                secondaryCollections: secs,
                collectionUserOverride: false,
                collectionPinned: false,
                collectionLastAutoUpdatedAtIso: new Date().toISOString(),
              }));
            }}
            disabled={!effectiveIsEditable}
          />,
          noteActionsPortalTarget,
        )}
      </>
    );
  }

  const noteTitleFontFamily =
    editorChromeMode === 'prototypeNative' ? 'var(--pds-font-display)' : 'var(--font-sans)';
  const noteTitleFontVariationSettings =
    editorChromeMode === 'prototypeNative' ? 'var(--pds-font-display-variation)' : undefined;

  // Default and Scripture notes - original editable layout
  return (
    <>
      {noteType === 'default' && noteId && (
        <LockNoteButton
          noteId={noteId}
          noteContent={displayContent}
          isEncrypted={effectiveEncrypted}
          serverContentEncrypted={effectiveServerEncrypted}
          serverNoteContent={effectiveServerEncrypted ? content : undefined}
          onContentChange={(newContent) => setDisplayContent(newContent)}
          onLockStateChange={(isLocked) => {
            setLockStateOverride(isLocked);
            if (isLocked) {
              setUnlockRevision((v) => v + 1);
              setIsTitleEditing(false);
              setIsContentEditing(false);
            }
          }}
          hideButton={true}
        />
      )}
      <div
        ref={cardRootRef}
        className={`card-full-editable ${className}`}
        style={{ maxHeight: '100%', gap: 0, display: 'flex', flexDirection: 'column' }}
        data-card-full-editable
        {...((showBodyEditor || showTitleEditor) && { 'data-editing': 'true' })}
      >
      <textarea
        ref={keyboardProxyRef}
        aria-hidden
        tabIndex={-1}
        defaultValue=""
        onInput={(e) => {
          e.currentTarget.value = '';
        }}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className="card-full-editable__keyboard-proxy"
      />
      {/* Header with title, version (scripture only), and bookmark icon */}
      <div className="flex gap-3 items-center justify-center relative shrink-0 w-full px-3">
        <div
          className={
            editorChromeMode === 'prototypeNative'
              ? 'basis-0 grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[24px] text-[var(--pds-text-primary)]'
              : 'basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]'
          }
        >
          {/* Display mode — title stays read-only while body awaits PIN */}
          {needsPinUnlock ? (
            <p
              className="rounded"
              style={{
                lineHeight: '1.2',
                margin: '-4px -8px',
                padding: '4px 8px',
                display: 'block',
                width: '100%',
                fontSize: '24px',
                fontWeight: '700',
                fontFamily: noteTitleFontFamily,
                fontVariationSettings: noteTitleFontVariationSettings,
                color:
                  editorChromeMode === 'prototypeNative'
                    ? 'var(--pds-text-primary)'
                    : 'var(--color-deep-grey)',
                boxSizing: 'border-box',
                minHeight: '28.8px',
              }}
            >
              {displayTitle?.trim() ? displayTitle : 'Locked note'}
            </p>
          ) : !showTitleEditor ? (
            <p 
              className="rounded"
              style={{
                lineHeight: '1.2',
                margin: '-4px -8px',
                padding: '4px 8px',
                display: 'block',
                width: '100%',
                fontSize: '24px',
                fontWeight: '700',
                fontFamily: noteTitleFontFamily,
                fontVariationSettings: noteTitleFontVariationSettings,
                color:
                  editorChromeMode === 'prototypeNative'
                    ? 'var(--pds-text-primary)'
                    : 'var(--color-deep-grey)',
                boxSizing: 'border-box',
                minHeight: '28.8px',
                height: 'auto',
                verticalAlign: 'middle',
                cursor: effectiveIsEditable ? 'pointer' : 'default'
              }}
              onClick={effectiveIsEditable ? () => startEditing('title') : undefined}
            >
              {displayTitle}
            </p>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea 
                ref={titleInputRef}
                value={editTitle}
                onChange={handleTitleChange}
                maxLength={TITLE_HARD_LIMIT}
                rows={1}
                className="w-full bg-transparent border-0 rounded focus:outline-none font-bold"
                style={{
                  lineHeight: '1.2',
                  margin: '-4px -8px',
                  padding: '4px 8px',
                  fontSize: '24px',
                  fontWeight: '700',
                  fontFamily: noteTitleFontFamily,
                  fontVariationSettings: noteTitleFontVariationSettings,
                  color:
                    editorChromeMode === 'prototypeNative'
                      ? 'var(--pds-text-primary)'
                      : 'var(--color-deep-grey)',
                  boxSizing: 'border-box',
                  resize: 'none',
                }}
                placeholder={alwaysEditing ? 'Title' : 'Note title'}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsTitleFocused(true)}
                onBlur={() => setIsTitleFocused(false)}
              />
            </div>
          )}
        </div>
        {noteType === 'scripture' && displayScriptureVersion ? (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 'normal',
              color: 'var(--color-stone-grey)',
              flexShrink: 0,
            }}
          >
            {getTranslationAbbreviationDisplay(displayScriptureVersion)}
          </span>
        ) : null}
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 w-full" style={{ maxHeight: '100%', overflow: 'hidden', marginTop: '12px' }}>
        <div className="flex-1 flex flex-col font-sans font-medium min-h-0 not-italic text-[var(--color-deep-grey)] text-[16px]">
          {/* Display mode — PIN gate takes precedence over alwaysEditing editor */}
          {needsPinUnlock ? (
            <div className="flex-fill flex-stack" style={{ gap: 0, maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3 relative" style={{ minHeight: 0, overflow: 'hidden' }}>
                <div ref={contentDisplayRef} className="flex flex-col shrink-0">
                  {noteId != null ? (
                    <InlinePinUnlock
                      noteId={String(noteId)}
                      encryptedContent={
                        looksLikeEncryptedBlob(displayContent ?? '')
                          ? (displayContent ?? '')
                          : (content ?? displayContent ?? '')
                      }
                    />
                  ) : (
                    <p>This note is locked. Tap Unlock to view.</p>
                  )}
                </div>
              </div>
            </div>
          ) : !showBodyEditor ? (
              <div className="flex-fill flex-stack" style={{ gap: 0, maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3 relative" style={{ minHeight: 0, overflow: 'hidden' }}>
                {displayContent && displayContent.trim() ? (
                  <div 
                    ref={contentDisplayRef}
                    className={`card-full-editable__content-html flex-1 overflow-auto rounded${viewScrollMaskClasses ? ` ${viewScrollMaskClasses}` : ''}`}
                    style={{ lineHeight: '1.6', minHeight: 0, paddingBottom: '96px', cursor: effectiveIsEditable ? 'text' : 'default' }}
                    onClick={handleContentClick}
                    onMouseOver={handleContentMouseOver}
                    dangerouslySetInnerHTML={{ __html: viewContentHtml }}
                  />
                ) : (
                  <div 
                    ref={contentDisplayRef}
                    className={`flex-1 overflow-auto rounded${viewScrollMaskClasses ? ` ${viewScrollMaskClasses}` : ''}`}
                    style={{ lineHeight: '1.6', minHeight: 0, paddingBottom: '96px', cursor: effectiveIsEditable ? 'text' : 'default' }}
                    onClick={handleContentClick}
                  >
                    <p style={{ color: 'var(--color-pebble-grey)', fontStyle: 'italic' }}>Click to add notes...</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-fill flex-stack" style={{ gap: 0, maxHeight: '100%' }}>
              <div
                className="flex-1 flex flex-col min-h-0 px-3"
                style={{ maxHeight: '100%' }}
                onPointerDown={
                  editorChromeMode === 'prototypeNative' ? focusPrototypeBodyEditor : undefined
                }
              >
                {wrapTiptapSuspense(
                  <TiptapEditorComponent
                    key={`proto-body-${noteId ?? 'none'}-${tiptapBodyMountKey}`}
                    content={editContent}
                    id="edit-note-content"
                    name="editContent"
                    placeholder={
                      editorChromeMode === 'prototypeNative'
                        ? 'Start writing...'
                        : 'Start writing your note...'
                    }
                    tabindex={3}
                    minimalToolbar={false}
                    toolbarAtBottom={true}
                    toolbarBottomMargin={0}
                    onContentChange={handleContentChange}
                    onLiveBodyHtmlChange={
                      editorChromeMode === 'prototypeNative' ? handleLiveBodyHtmlChange : undefined
                    }
                    scrollPosition={scrollPosition}
                    enableCreateNoteFromSelection={isContentEditing}
                    parentThreadId={parentThreadId}
                    sourceNoteId={noteId}
                    spaceId={spaceId}
                    onEditorReady={handleEditorReady}
                    editorChromeMode={editorChromeMode}
                    onPrototypeChromeModeChange={
                      editorChromeMode === 'prototypeNative' ? setPrototypeBottomChromeMode : undefined
                    }
                    formatToolbarPortalTarget={
                      editorChromeMode === 'prototypeNative' ? formatToolbarPortalTarget : undefined
                    }
                    studyDockCarouselPortalTarget={
                      editorChromeMode === 'prototypeNative' ? studyDockCarouselPortalTarget : null
                    }
                    scriptureChromePortalTarget={
                      editorChromeMode === 'prototypeNative' ? scriptureChromePortalTarget : null
                    }
                    highlightChromePortalTarget={
                      editorChromeMode === 'prototypeNative' ? highlightChromePortalTarget : null
                    }
                    initialReferenceWord={editorChromeMode === 'prototypeNative' ? initialReferenceWord : null}
                    initialReferenceRequestKey={
                      editorChromeMode === 'prototypeNative' ? initialReferenceRequestKey : null
                    }
                    onReferenceDeepLinkHandoff={
                      editorChromeMode === 'prototypeNative' ? onReferenceDeepLinkHandoff : undefined
                    }
                    prototypeScripturePillOpenRequest={
                      editorChromeMode === 'prototypeNative' ? prototypeScripturePillOpenRequest : null
                    }
                    onPrototypeScripturePillOpenRequestConsumed={onPrototypeScripturePillOpenRequestConsumed}
                    onPrototypeScripturePillOpenRequestUnresolved={onScriptureDockUnresolved}
                    prototypeHighlightOpenRequest={
                      editorChromeMode === 'prototypeNative' ? prototypeHighlightOpenRequest : null
                    }
                    onPrototypeHighlightOpenRequestConsumed={onPrototypeHighlightOpenRequestConsumed}
                    prototypeNoteActionsChrome={effectivePrototypeNoteActionsChrome}
                  />,
                  'min-h-[200px]',
                )}
              </div>
              
              {/* Save/Cancel buttons */}
              {editorChromeMode !== 'prototypeNative' && isContentEditing && renderSaveCancelButtons('px-3')}
            </div>
          )}
        </div>

        {/* Save/Cancel buttons when only title is being edited - shown at bottom like content editing */}
        {editorChromeMode !== 'prototypeNative' &&
          isTitleEditing &&
          !isContentEditing &&
          renderSaveCancelButtons('px-3')}

        {/* Bible Translation Attribution — same footer structure as ScriptureComparePanel (border + top padding); px-3 matches main column shell; p keeps right inset for FAB */}
        {noteType === 'scripture' && displayScriptureVersion && (() => {
          const translationInfo = getTranslation(displayScriptureVersion);
          if (!translationInfo) return null;
          return (
            <div
              className="px-3 w-full"
              style={{ marginTop: 'auto', flexShrink: 0, paddingBottom: '12px' }}
            >
              <div
                className="panel__attribution"
                style={{
                  padding: '0.75rem 0 0',
                  borderTop: '1px solid oklch(0.96 0 0)',
                  marginTop: '0.75rem',
                  flexShrink: 0,
                }}
              >
                <p
                  style={{
                    fontSize: '10px',
                    lineHeight: '1.4',
                    color: 'var(--color-pebble-grey)',
                    margin: 0,
                    textAlign: 'left',
                    paddingRight: '80px',
                  }}
                >
                  {translationInfo.copyright}{' '}
                  <a
                    href={translationInfo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--color-pebble-grey)',
                      textDecoration: 'underline',
                      textDecorationColor: 'var(--color-pebble-grey)',
                    }}
                  >
                    {translationInfo.abbreviation}
                  </a>
                </p>
              </div>
            </div>
          );
        })()}
        
        {/* Footer - rendered at bottom of card */}
        {footer ? (
          <div 
            style={{
              marginTop: 'auto',
              flexShrink: 0,
              paddingBottom: '12px'
            }}
          >
            {footer}
          </div>
        ) : shareToken ? (
          <div 
            style={{
              marginTop: 'auto',
              flexShrink: 0,
              paddingBottom: '12px'
            }}
          >
            <SharedNoteCTAFooter
              shareToken={shareToken}
              isAuthenticated={isAuthenticated || false}
            />
          </div>
        ) : null}

        {editorChromeMode === 'prototypeNative' &&
          !formatToolbarPortalTarget &&
          !noteActionsPortalTarget &&
          prototypeBottomChromeMode === 'noteActions' &&
          prototypeNoteActionBar ? (
          <div className="w-full shrink-0 px-3">{prototypeNoteActionBar}</div>
        ) : null}
      </div>
      </div>
      {editorChromeMode === 'prototypeNative' &&
        noteActionsPortalTarget &&
        createPortal(
          <NoteProductionActionBar
            collectionDraft={collectionChrome.primaryCollection ?? ''}
            onDraftChange={(v) => {
              const t = v.trim();
              const nextPrimary = t.length ? t : null;
              const pLow = nextPrimary?.toLowerCase() ?? '';
              setCollectionChrome(c => ({
                ...c,
                primaryCollection: nextPrimary,
                secondaryCollections: c.secondaryCollections.filter(
                  (s) => s.trim().length > 0 && s.trim().toLowerCase() !== pLow,
                ),
                collectionUserOverride: true,
              }));
            }}
            secondaryCollections={collectionChrome.secondaryCollections}
            onRemoveSecondary={(name) => {
              const low = name.toLowerCase();
              setCollectionChrome(c => ({
                ...c,
                secondaryCollections: c.secondaryCollections.filter((s) => s.toLowerCase() !== low),
                collectionUserOverride: true,
              }));
            }}
            addSecondaryDraft={addSecondaryDraft}
            onAddSecondaryDraftChange={setAddSecondaryDraft}
            onCommitAddSecondary={() => {
              const t = addSecondaryDraft.trim();
              if (!t.length) return;
              const pLow = (collectionChrome.primaryCollection ?? '').trim().toLowerCase();
              if (pLow && t.toLowerCase() === pLow) {
                setAddSecondaryDraft('');
                return;
              }
              setCollectionChrome(c => {
                if (c.secondaryCollections.some((s) => s.toLowerCase() === t.toLowerCase())) {
                  return c;
                }
                return {
                  ...c,
                  secondaryCollections: [...c.secondaryCollections, t],
                  collectionUserOverride: true,
                };
              });
              setAddSecondaryDraft('');
            }}
            collectionPinned={collectionChrome.collectionPinned}
            collectionUserOverride={collectionChrome.collectionUserOverride}
            onTogglePinned={() =>
              setCollectionChrome(c => ({ ...c, collectionPinned: !c.collectionPinned }))
            }
            onRestoreAuto={() => {
              let body = editContent;
              if (editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
                try {
                  body = editorInstanceRef.current.getHTML();
                } catch {
                  /* keep editContent */
                }
              }
              const sug = suggestPrimaryCollectionFromNote(editTitle, body);
              const secs = suggestSecondaryCollectionsFromNote(editTitle, body, sug);
              setCollectionChrome(c => ({
                ...c,
                primaryCollection: sug,
                secondaryCollections: secs,
                collectionUserOverride: false,
                collectionPinned: false,
                collectionLastAutoUpdatedAtIso: new Date().toISOString(),
              }));
            }}
            disabled={!effectiveIsEditable}
          />,
          noteActionsPortalTarget,
        )}
    </>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isGuestModeActive } from '../../../spa/src/lib/guest-session';
import { updateGuestHighlight } from '../../../spa/src/lib/guest-store';
import { markOnboardingStep } from '../../../spa/src/lib/proto-onboarding-sync';
import Icon from '@/components/react/Icon';
import DockAccentSwatchButton, { SCRIPTURE_DOCK_ACCENT_COLORS } from '@/components/react/DockAccentSwatchButton';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { isStudyHighlightAccentKey, STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL } from '@/utils/study-highlight-accents';
import { studyPromptQuestionsForSnippet } from '@/utils/study-prompt-suggester';
import { deriveHighlightFocusTitle } from '@/utils/study-thread-focus-title';
import { studyThreadContextQuery, withStudyThreadContext } from '@/utils/study-dock-stack';
import '@/styles/study-dock-card.css';
import '@/styles/highlight-dock-web.css';

/** Temporary — set true when Respond prompt chips are ready to ship. */
const HIGHLIGHT_DOCK_RESPOND_ENABLED = false;

export type HighlightDockEntryKind = 'miniNote' | 'scriptureLink' | 'reference' | 'linkedNote' | 'workspace';

export interface HighlightDockWebProps {
  accent: string;
  excerpt: string;
  focusTitle?: string;
  miniNoteBody?: string;
  entryKind?: HighlightDockEntryKind;
  studyThreadEntryId?: string | null;
  /** When false, only non-neutral swatches (highlight toolbar parity). */
  includeNeutral?: boolean;
  onAccentChange: (accent: StudyHighlightAccentKey) => void;
  onRemove: () => void;
  onDone: () => void;
  /** When set with `onExpandedChange`, controls collapse/expand from the dock carousel. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onFocusTitleChange?: (title: string) => void;
  onMiniNoteChange?: (body: string) => void;
  /** Loads focusTitle / miniNoteBody when opening an existing thread. */
  sourceNoteId?: string | null;
  /** Shared-space unioned highlight — annotator display name when not the viewer. */
  authorDisplayName?: string | null;
  isOwnHighlight?: boolean;
  /** Explicit read-only policy for another member's Activity entry. */
  readOnly?: boolean;
  contextSpaceId?: string | null;
  /** When false, skips remote thread hydration (inactive carousel card). Default true. */
  interactionActive?: boolean;
  /** Card enter animation — off in carousel (item handles enter). */
  animateEnter?: boolean;
}

function patchStudyThread(
  id: string,
  body: Record<string, string>,
  contextSpaceId?: string | null,
) {
  /*
   * Every edit this dock makes funnels through here, which is why the guest branch belongs at
   * this line rather than in `useUpdateHighlight` — the dock never calls that hook, it has its
   * own fetch, so a branch there was reached by nothing.
   *
   * This is also the only way a guest can write. The full editor needs a space and a server; a
   * thought attached to a verse needs neither, and it is the same `miniNoteBody` field the
   * account version writes, so adoption carries it up with the highlight.
   */
  if (isGuestModeActive()) {
    updateGuestHighlight(id, {
      ...(body.miniNoteBody === undefined ? {} : { miniNoteBody: body.miniNoteBody }),
      ...(body.focusTitle === undefined ? {} : { focusTitle: body.focusTitle }),
    });
    if (body.miniNoteBody?.trim()) markOnboardingStep('note');
    return;
  }
  void fetch(`/api/study-threads/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withStudyThreadContext(body, contextSpaceId)),
  }).catch(() => {
    /* ignore */
  });
}

export default function HighlightDockWeb({
  accent,
  excerpt,
  focusTitle: focusTitleProp = '',
  miniNoteBody: miniNoteBodyProp = '',
  entryKind = 'miniNote',
  studyThreadEntryId = null,
  onAccentChange,
  onRemove,
  onDone,
  expanded: expandedControlled,
  onExpandedChange,
  onFocusTitleChange,
  onMiniNoteChange,
  sourceNoteId = null,
  authorDisplayName = null,
  isOwnHighlight,
  readOnly = false,
  contextSpaceId = null,
  interactionActive = true,
  animateEnter = true,
}: HighlightDockWebProps) {
  const resolvedInitialTitle = focusTitleProp.trim() || deriveHighlightFocusTitle(excerpt);
  const [focusTitle, setFocusTitle] = useState(resolvedInitialTitle);
  const [miniNoteBody, setMiniNoteBody] = useState(miniNoteBodyProp);
  const [respondMenuOpen, setRespondMenuOpen] = useState(false);
  const respondRef = useRef<HTMLDivElement>(null);
  const userTouchedMiniNoteRef = useRef(false);
  const userTouchedTitleRef = useRef(false);
  const pendingMiniNoteRef = useRef<string | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const hadStudyThreadIdRef = useRef(false);
  const miniNoteBodyRef = useRef(miniNoteBody);
  miniNoteBodyRef.current = miniNoteBody;
  const focusTitleRef = useRef(focusTitle);
  focusTitleRef.current = focusTitle;
  const studyThreadEntryIdRef = useRef(studyThreadEntryId);
  studyThreadEntryIdRef.current = studyThreadEntryId;
  const [isExpandedInternal, setIsExpandedInternal] = useState(true);
  const isControlledExpanded = expandedControlled !== undefined && onExpandedChange !== undefined;
  const isExpanded = isControlledExpanded ? expandedControlled! : isExpandedInternal;

  const setIsExpanded = (next: boolean) => {
    if (isControlledExpanded) onExpandedChange!(next);
    else setIsExpandedInternal(next);
  };

  useEffect(() => {
    const next = focusTitleProp.trim() || deriveHighlightFocusTitle(excerpt);
    setFocusTitle(next);
  }, [focusTitleProp, excerpt]);

  useEffect(() => {
    setMiniNoteBody(miniNoteBodyProp);
  }, [miniNoteBodyProp]);

  useEffect(() => {
    userTouchedMiniNoteRef.current = false;
    userTouchedTitleRef.current = false;
    pendingMiniNoteRef.current = null;
    pendingTitleRef.current = null;
    hadStudyThreadIdRef.current = false;
  }, [excerpt]);

  useEffect(() => {
    if (!interactionActive || !studyThreadEntryId || !sourceNoteId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/notes/${sourceNoteId}/study-threads${studyThreadContextQuery(contextSpaceId)}`,
          { credentials: 'include' },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          studyThreads?: {
            id: string;
            focusTitle?: string;
            miniNoteBody?: string;
            entryKind?: string;
          }[];
        };
        const row = data.studyThreads?.find((t) => t.id === studyThreadEntryId);
        if (!row || cancelled) return;
        const hydratedTitle =
          (row.focusTitle != null && row.focusTitle.trim()) || deriveHighlightFocusTitle(excerpt);
        if (hydratedTitle && !userTouchedTitleRef.current) setFocusTitle(hydratedTitle);
        if (row.miniNoteBody != null && !userTouchedMiniNoteRef.current) setMiniNoteBody(row.miniNoteBody);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextSpaceId, studyThreadEntryId, sourceNoteId, interactionActive]);

  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingAnnotation = useCallback((threadId: string, note: string, title: string) => {
    if (readOnly) return;
    const patch: Record<string, string> = {};
    const noteToSave = pendingMiniNoteRef.current ?? note;
    const titleToSave = pendingTitleRef.current ?? title;
    if (userTouchedMiniNoteRef.current || pendingMiniNoteRef.current != null) {
      patch.miniNoteBody = noteToSave;
    }
    if (userTouchedTitleRef.current || pendingTitleRef.current != null) {
      patch.focusTitle = titleToSave;
    }
    if (Object.keys(patch).length > 0) {
      patchStudyThread(threadId, patch, contextSpaceId);
    }
    pendingMiniNoteRef.current = null;
    pendingTitleRef.current = null;
  }, [contextSpaceId, readOnly]);

  const persistTitle = useCallback(
    (value: string) => {
      if (readOnly) return;
      onFocusTitleChange?.(value);
      if (studyThreadEntryId) {
        patchStudyThread(studyThreadEntryId, { focusTitle: value }, contextSpaceId);
        pendingTitleRef.current = null;
      } else {
        pendingTitleRef.current = value;
      }
    },
    [contextSpaceId, readOnly, studyThreadEntryId, onFocusTitleChange],
  );

  const persistMiniNote = useCallback(
    (value: string) => {
      if (readOnly) return;
      onMiniNoteChange?.(value);
      if (studyThreadEntryId) {
        patchStudyThread(studyThreadEntryId, { miniNoteBody: value }, contextSpaceId);
        pendingMiniNoteRef.current = null;
      } else {
        pendingMiniNoteRef.current = value;
      }
    },
    [contextSpaceId, readOnly, studyThreadEntryId, onMiniNoteChange],
  );

  useEffect(() => {
    if (readOnly || !studyThreadEntryId) {
      hadStudyThreadIdRef.current = false;
      return;
    }
    const isFirstAssignment = !hadStudyThreadIdRef.current;
    hadStudyThreadIdRef.current = true;
    if (!isFirstAssignment) return;
    if (
      !userTouchedMiniNoteRef.current &&
      !userTouchedTitleRef.current &&
      pendingMiniNoteRef.current == null &&
      pendingTitleRef.current == null
    ) {
      return;
    }
    flushPendingAnnotation(
      studyThreadEntryId,
      miniNoteBodyRef.current,
      focusTitleRef.current,
    );
  }, [readOnly, studyThreadEntryId, flushPendingAnnotation]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const value = e.target.value;
    userTouchedTitleRef.current = true;
    setFocusTitle(value);
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => persistTitle(value), 400);
  };

  const handleMiniNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    const value = e.target.value;
    userTouchedMiniNoteRef.current = true;
    setMiniNoteBody(value);
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    noteDebounceRef.current = setTimeout(() => persistMiniNote(value), 400);
  };

  useEffect(() => {
    return () => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
      const threadId = studyThreadEntryIdRef.current;
      if (readOnly || !threadId) return;
      if (
        !userTouchedMiniNoteRef.current &&
        !userTouchedTitleRef.current &&
        pendingMiniNoteRef.current == null &&
        pendingTitleRef.current == null
      ) {
        return;
      }
      flushPendingAnnotation(threadId, miniNoteBodyRef.current, focusTitleRef.current);
    };
  }, [flushPendingAnnotation, readOnly]);

  const accentKey: StudyHighlightAccentKey = isStudyHighlightAccentKey(accent) ? accent : 'warmAmber';
  const accentColor = SCRIPTURE_DOCK_ACCENT_COLORS[accentKey];

  const prompts = useMemo(() => studyPromptQuestionsForSnippet(excerpt), [excerpt]);

  const appendPrompt = (prompt: string) => {
    const trimmed = miniNoteBody.trim();
    const prefix = trimmed ? '\n\n' : '';
    const next = `${miniNoteBody}${prefix}${prompt}\n`;
    userTouchedMiniNoteRef.current = true;
    setMiniNoteBody(next);
    if (!readOnly) persistMiniNote(next);
    setRespondMenuOpen(false);
  };

  useEffect(() => {
    if (!respondMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (respondRef.current?.contains(e.target as Node)) return;
      setRespondMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRespondMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [respondMenuOpen]);

  const toggleExpanded = useCallback(() => {
    if (isControlledExpanded) onExpandedChange!(!isExpanded);
    else setIsExpandedInternal((prev) => !prev);
  }, [isControlledExpanded, isExpanded, onExpandedChange]);

  const titlePlaceholder = 'Highlight';
  const headerTitleText = focusTitle.trim() || deriveHighlightFocusTitle(excerpt);
  const showAuthorAttribution = Boolean(authorDisplayName && isOwnHighlight === false);

  return (
    <StudyDockCardShell
      rootClassName="highlight-dock-web"
      ariaLabel={readOnly ? 'Highlight details' : 'Highlight editor'}
      accentColor={accentColor}
      expanded={isExpanded}
      onToggleExpanded={toggleExpanded}
      onDismiss={onDone}
      animateEnter={animateEnter}
      headerIcon={<Icon name="highlighter" size={13} />}
      headerTitle={
        <input
          type="text"
          className="highlight-dock-web__title-input study-dock-card__header-primary-text"
          value={headerTitleText}
          readOnly={readOnly || !isExpanded}
          disabled={readOnly}
          tabIndex={isExpanded && !readOnly ? 0 : -1}
          placeholder={titlePlaceholder}
          aria-label="Highlight title"
          onChange={isExpanded && !readOnly ? handleTitleChange : undefined}
          onMouseDown={(e) => {
            if (isExpanded && !readOnly) e.stopPropagation();
          }}
          onClick={(e) => {
            if (isExpanded && !readOnly) e.stopPropagation();
          }}
        />
      }
      headerActions={
        readOnly ? null : (
          <>
            <DockAccentSwatchButton
              selection={accentKey}
              paletteTokens={STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL}
              onSelectionChange={onAccentChange}
            />
            <button
              type="button"
              className="study-dock-card__header-btn study-dock-card__header-btn--plain"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRemove}
              aria-label="Remove highlight"
            >
              <Icon name="trash-can" size={12} />
            </button>
          </>
        )
      }
    >
      <div className="highlight-dock-web__body">
        {showAuthorAttribution ? (
          <p className="highlight-dock-web__author pds-caption">{authorDisplayName}</p>
        ) : null}
        {entryKind === 'miniNote' || entryKind === 'scriptureLink' ? (
          <textarea
            className="highlight-dock-web__mini-note"
            value={miniNoteBody}
            placeholder="Note (optional)…"
            aria-label="Highlight note"
            rows={2}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={readOnly ? undefined : handleMiniNoteChange}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : excerpt.trim() ? (
          <p className="highlight-dock-web__excerpt-text">{excerpt}</p>
        ) : null}
      </div>

      {!readOnly && HIGHLIGHT_DOCK_RESPOND_ENABLED && prompts.length > 0 ? (
        <div className="highlight-dock-web__respond" ref={respondRef}>
          <button
            type="button"
            className="highlight-dock-web__respond-trigger"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setRespondMenuOpen((prev) => !prev)}
            aria-expanded={respondMenuOpen}
            aria-haspopup="menu"
          >
            <Icon name="reply" size={10} aria-hidden />
            <span className="highlight-dock-web__respond-label">Respond</span>
            <Icon
              name="caret-down"
              size={9}
              aria-hidden
              className={`highlight-dock-web__respond-chevron${
                respondMenuOpen ? '' : ' highlight-dock-web__respond-chevron--closed'
              }`}
            />
          </button>
          <div
            className="highlight-dock-web__respond-menu-wrap"
            data-open={respondMenuOpen ? 'true' : 'false'}
            aria-hidden={respondMenuOpen ? undefined : true}
          >
            <div className="highlight-dock-web__respond-menu" role="menu" aria-label="Suggested responses">
              <div className="highlight-dock-web__respond-menu-scroll">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    role="menuitem"
                    className="highlight-dock-web__prompt-chip"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => appendPrompt(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </StudyDockCardShell>
  );
}

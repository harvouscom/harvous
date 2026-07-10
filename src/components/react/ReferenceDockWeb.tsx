'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import DockAccentSwatchButton, { SCRIPTURE_DOCK_ACCENT_COLORS } from '@/components/react/DockAccentSwatchButton';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import { api } from '../../../spa/src/lib/api';
import { slugCandidates, type EastonCategory } from '../../../spa/src/hooks/useEastonsSlugIndex';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { isStudyHighlightAccentKey, STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL } from '@/utils/study-highlight-accents';
import { detectEastonsScriptureRefs } from '@/utils/eastons-scripture-refs';
import '@/styles/study-dock-card.css';
import '@/styles/reference-dock-web.css';

interface EastonsEntry {
  slug: string;
  headword: string;
  category: EastonCategory;
  body: string;
}

interface EntryResponse extends EastonsEntry {
  success: boolean;
}

export interface ReferenceDockWebProps {
  initialQuery: string;
  onDone: () => void;
  /** Controlled expand state (carousel-managed). Defaults to open when omitted. */
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  /** Play the native-style enter animation on mount (false inside the carousel). */
  animateEnter?: boolean;
  /** Range of the reference highlight in the note — when set, the dock shows accent swatches + remove. */
  noteHighlightRange?: { from: number; to: number } | null;
  noteHighlightAccent?: StudyHighlightAccentKey | null;
  onChangeNoteHighlight?: (accent: StudyHighlightAccentKey) => void;
  onRemoveNoteHighlight?: () => void;
  /**
   * When true the dock was opened from a typed suggestion that is not yet saved — show a
   * prominent "Save reference" action instead of the accent/remove controls.
   */
  pendingSuggestion?: boolean;
  /**
   * When true the dock was opened from a passage suggestion in the scripture pill dock —
   * show "Save reference" to persist a study-thread entry (no note highlight mark).
   */
  passageReference?: boolean;
  /** When true the passage reference was saved — show accent/remove chrome (no note mark). */
  passageReferenceSaved?: boolean;
  /** Persist the pending suggestion as a real reference. */
  onSaveReference?: () => void;
  /** Scripture reference tapped in the body — open it as a read-only passage card. */
  onOpenScripturePassage?: (reference: string) => void;
}

function categoryIcon(cat: EastonCategory) {
  switch (cat) {
    case 'person':
      return 'person';
    case 'place':
      return 'location-dot';
    default:
      return 'tag';
  }
}

function categoryLabel(cat: EastonCategory) {
  switch (cat) {
    case 'person':
      return 'Person';
    case 'place':
      return 'Place';
    default:
      return 'Thing';
  }
}

function fetchEntry(slug: string): Promise<EastonsEntry | null> {
  return api
    .get<EntryResponse>(`/api/dictionary/eastons/${encodeURIComponent(slug)}`)
    .then((r) => (r.success ? r : null))
    .catch(() => null);
}

function useEastonsEntry(word: string) {
  const candidates = slugCandidates(word);
  const primarySlug = candidates[0];
  return useQuery({
    queryKey: ['dictionary', 'eastons', 'entry', primarySlug],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      for (const slug of candidates) {
        const entry = await fetchEntry(slug);
        if (entry) return entry;
      }
      return null;
    },
    enabled: candidates.length > 0,
  });
}

/** Mouse: run on mousedown (preventDefault suppresses the follow-up click). Keyboard: click with detail 0. */
function runPointerAction(e: MouseEvent, action: () => void) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  action();
}

export default function ReferenceDockWeb({
  initialQuery,
  onDone,
  expanded,
  onExpandedChange,
  animateEnter = true,
  noteHighlightRange,
  noteHighlightAccent,
  onChangeNoteHighlight,
  onRemoveNoteHighlight,
  pendingSuggestion = false,
  passageReference = false,
  passageReferenceSaved = false,
  onSaveReference,
  onOpenScripturePassage,
}: ReferenceDockWebProps) {
  const [query, setQuery] = useState(initialQuery);
  const trimmed = query.trim();
  const { data: entry, isLoading } = useEastonsEntry(trimmed);
  // Controlled expand when the carousel supplies it; otherwise self-managed (standalone use).
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isExpanded = expanded ?? internalExpanded;
  const setIsExpanded = (next: boolean) => {
    if (onExpandedChange) onExpandedChange(next);
    else setInternalExpanded(next);
  };
  const [showScriptureRefs, setShowScriptureRefs] = useState(false);
  const scriptureRefsRef = useRef<HTMLDivElement>(null);
  const prevShowScriptureRefs = useRef(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (showScriptureRefs && !prevShowScriptureRefs.current) {
      requestAnimationFrame(() => {
        scriptureRefsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    prevShowScriptureRefs.current = showScriptureRefs;
  }, [showScriptureRefs]);

  const scriptureRefs = useMemo(
    () => (entry ? detectEastonsScriptureRefs(entry.body, entry.headword) : []),
    [entry],
  );

  const headword = entry?.headword ?? trimmed;
  const noteAccent: StudyHighlightAccentKey =
    noteHighlightAccent && isStudyHighlightAccentKey(noteHighlightAccent) ? noteHighlightAccent : 'warmAmber';
  const savedReferenceHighlight = !!(noteHighlightRange || passageReferenceSaved);
  const showPendingSave = (pendingSuggestion || passageReference) && !!onSaveReference;
  const accentColor = showPendingSave
    ? SCRIPTURE_DOCK_ACCENT_COLORS.warmAmber
    : SCRIPTURE_DOCK_ACCENT_COLORS[savedReferenceHighlight ? noteAccent : 'neutral'];

  const scriptureRefToggle =
    scriptureRefs.length > 0 && onOpenScripturePassage ? (
      <button
        type="button"
        className={`study-dock-card__header-btn${showScriptureRefs ? ' study-dock-card__header-btn--active' : ''}`}
        onClick={() => setShowScriptureRefs((v) => !v)}
        title={showScriptureRefs ? 'Hide referenced passages' : 'Show referenced passages'}
        aria-pressed={showScriptureRefs}
        aria-label={showScriptureRefs ? 'Hide referenced passages' : 'Show referenced passages'}
      >
        <Icon name="shuffle" size={12} />
      </button>
    ) : null;

  const headerActions =
    savedReferenceHighlight && (onChangeNoteHighlight || onRemoveNoteHighlight) ? (
      <>
        {scriptureRefToggle}
        {onChangeNoteHighlight ? (
          <DockAccentSwatchButton
            selection={noteAccent}
            paletteTokens={STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL}
            onSelectionChange={onChangeNoteHighlight}
          />
        ) : null}
        {onRemoveNoteHighlight ? (
          <button
            type="button"
            className="study-dock-card__header-btn study-dock-card__header-btn--plain"
            onMouseDown={(e) => runPointerAction(e, onRemoveNoteHighlight)}
            onClick={(e) => {
              e.stopPropagation();
              if (e.detail === 0) onRemoveNoteHighlight();
            }}
            aria-label="Remove highlight"
          >
            <Icon name="trash-can" size={12} />
          </button>
        ) : null}
      </>
    ) : scriptureRefToggle ? (
      scriptureRefToggle
    ) : null;

  return (
    <StudyDockCardShell
      rootClassName="reference-dock-web"
      ariaLabel="Reference"
      accentColor={accentColor}
      animateEnter={animateEnter}
      expanded={isExpanded}
      onToggleExpanded={() => setIsExpanded(!isExpanded)}
      onDismiss={onDone}
      accentPrimaryAction={
        showPendingSave
          ? {
              label: 'Save',
              ariaLabel: 'Save reference',
              onClick: () => onSaveReference?.(),
              icon: <Icon name="check" size={14} />,
            }
          : undefined
      }
      headerIcon={<Icon name="lines-leaning" size={13} />}
      headerTitle={
        <span className="reference-dock-web__header-label">
          <span className="reference-dock-web__headword study-dock-card__header-primary-text">
            {headword}
          </span>
          {entry ? (
            <span className="reference-dock-web__category-chip" data-category={entry.category}>
              <Icon name={categoryIcon(entry.category)} size={11} aria-hidden />
              {categoryLabel(entry.category)}
            </span>
          ) : null}
        </span>
      }
      headerActions={headerActions}
    >
      <div className="reference-dock-web__passage">
        {!trimmed ? (
          <p className="reference-dock-web__status">Type a word to look up.</p>
        ) : isLoading ? (
          <p className="reference-dock-web__status">Loading…</p>
        ) : !entry ? (
          <p className="reference-dock-web__status">No entry found for "{trimmed}".</p>
        ) : (
          <>
            <div className="reference-dock-web__passage-html">{entry.body}</div>

            {showScriptureRefs && scriptureRefs.length > 0 && onOpenScripturePassage ? (
              <div ref={scriptureRefsRef} className="reference-dock-web__scripture-refs">
                <p className="reference-dock-web__scripture-refs-label">Referenced passages</p>
                <div className="reference-dock-web__scripture-refs-rows">
                  {scriptureRefs.map((ref) => (
                    <button
                      key={ref.canonical}
                      type="button"
                      className="reference-dock-web__scripture-ref-row"
                      onClick={() => onOpenScripturePassage(ref.canonical)}
                    >
                      <Icon name="book-open" size={13} className="reference-dock-web__scripture-ref-icon" aria-hidden />
                      <span className="reference-dock-web__scripture-ref-label">{ref.canonical}</span>
                      <Icon name="caret-right" size={11} className="reference-dock-web__scripture-ref-chevron" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="reference-dock-web__footer">
              Easton's Bible Dictionary, 1897 · Public domain
            </div>
          </>
        )}
      </div>
    </StudyDockCardShell>
  );
}

'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import DockAccentSwatchButton, { SCRIPTURE_DOCK_ACCENT_COLORS } from '@/components/react/DockAccentSwatchButton';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import { api } from '../../../spa/src/lib/api';
import { slugCandidates, type EastonCategory } from '../../../spa/src/hooks/useEastonsSlugIndex';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { isStudyHighlightAccentKey, STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL } from '@/utils/study-highlight-accents';
import '@/styles/study-dock-card.css';
import '@/styles/reference-dock-web.css';

interface EastonsEntry {
  slug: string;
  headword: string;
  category: EastonCategory;
  body: string;
  seeAlso: string[];
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

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const headword = entry?.headword ?? trimmed;
  const noteAccent: StudyHighlightAccentKey =
    noteHighlightAccent && isStudyHighlightAccentKey(noteHighlightAccent) ? noteHighlightAccent : 'warmAmber';
  const savedReferenceHighlight = !!(noteHighlightRange || passageReferenceSaved);
  const accentColor = SCRIPTURE_DOCK_ACCENT_COLORS[savedReferenceHighlight ? noteAccent : 'neutral'];

  const headerActions =
    (pendingSuggestion || passageReference) && onSaveReference ? (
      <button
        type="button"
        className="study-dock-card__header-btn reference-dock-web__save-orb"
        onMouseDown={(e) => runPointerAction(e, onSaveReference)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.detail === 0) onSaveReference();
        }}
        aria-label="Save reference"
        title="Save reference"
      >
        <Icon name="check" size={14} />
      </button>
    ) : savedReferenceHighlight && (onChangeNoteHighlight || onRemoveNoteHighlight) ? (
      <>
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

            {entry.seeAlso.length > 0 ? (
              <div className="reference-dock-web__see-also">
                <span className="reference-dock-web__see-also-label">See also</span>
                {entry.seeAlso.slice(0, 8).map((ref) => (
                  <button
                    key={ref}
                    type="button"
                    className="reference-dock-web__see-also-chip"
                    onClick={() => setQuery(ref)}
                  >
                    {ref}
                  </button>
                ))}
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

'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import DockAccentSwatchButton, { SCRIPTURE_DOCK_ACCENT_COLORS } from '@/components/react/DockAccentSwatchButton';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import { api } from '../../../spa/src/lib/api';
import { slugCandidates, type EastonCategory } from '../../../spa/src/hooks/useEastonsSlugIndex';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import {
  isStudyHighlightAccentKey,
  STUDY_HIGHLIGHT_ACCENT_LABELS,
  STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL,
} from '@/utils/study-highlight-accents';
import '@/styles/study-dock-card.css';
import '@/styles/reference-dock-web.css';
import '@/styles/highlight-dock-web.css';

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

interface SavedHighlight {
  id: string;
  excerpt: string;
  accentKey: StudyHighlightAccentKey;
  createdAt: string;
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

function storageKey(source: string, slug: string) {
  return `harvous-ref-hl-${source}-${slug}`;
}

function loadHighlights(source: string, slug: string): SavedHighlight[] {
  try {
    const raw = localStorage.getItem(storageKey(source, slug));
    return raw ? (JSON.parse(raw) as SavedHighlight[]) : [];
  } catch {
    return [];
  }
}

function persistHighlights(source: string, slug: string, items: SavedHighlight[]) {
  try {
    localStorage.setItem(storageKey(source, slug), JSON.stringify(items));
  } catch {
    /* ignore */
  }
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

  const [highlights, setHighlights] = useState<SavedHighlight[]>([]);
  const [pendingExcerpt, setPendingExcerpt] = useState<string | null>(null);
  const [selectedAccent, setSelectedAccent] = useState<StudyHighlightAccentKey>('warmAmber');
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (entry?.slug) {
      setHighlights(loadHighlights('eastons', entry.slug));
    }
  }, [entry?.slug]);

  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !bodyRef.current) {
      setPendingExcerpt(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length < 3) {
      setPendingExcerpt(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!bodyRef.current.contains(range.commonAncestorContainer)) {
      setPendingExcerpt(null);
      return;
    }
    setPendingExcerpt(text);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.addEventListener('mouseup', checkSelection);
    el.addEventListener('touchend', checkSelection);
    return () => {
      el.removeEventListener('mouseup', checkSelection);
      el.removeEventListener('touchend', checkSelection);
    };
  }, [checkSelection, entry]);

  const saveHighlight = useCallback(() => {
    if (!pendingExcerpt || !entry) return;
    const next: SavedHighlight = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      excerpt: pendingExcerpt,
      accentKey: selectedAccent,
      createdAt: new Date().toISOString(),
    };
    const updated = [...highlights, next];
    setHighlights(updated);
    persistHighlights('eastons', entry.slug, updated);
    setPendingExcerpt(null);
    window.getSelection()?.removeAllRanges();
  }, [pendingExcerpt, entry, selectedAccent, highlights]);

  const removeHighlight = useCallback(
    (id: string) => {
      if (!entry) return;
      const updated = highlights.filter((h) => h.id !== id);
      setHighlights(updated);
      persistHighlights('eastons', entry.slug, updated);
    },
    [entry, highlights],
  );

  const dismissPending = useCallback(() => {
    setPendingExcerpt(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const headword = entry?.headword ?? trimmed;
  const noteAccent: StudyHighlightAccentKey =
    noteHighlightAccent && isStudyHighlightAccentKey(noteHighlightAccent) ? noteHighlightAccent : 'warmAmber';
  const accentColor = SCRIPTURE_DOCK_ACCENT_COLORS[noteHighlightRange ? noteAccent : 'neutral'];

  const headerActions =
    pendingSuggestion && onSaveReference ? (
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
    ) : noteHighlightRange && (onChangeNoteHighlight || onRemoveNoteHighlight) ? (
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
            <div ref={bodyRef} className="reference-dock-web__passage-html">
              {entry.body}
            </div>

            {pendingExcerpt ? (
              <div className="reference-dock-web__highlight-bar">
                <div className="reference-dock-web__highlight-swatches">
                  {STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`highlight-dock-web__swatch highlight-dock-web__swatch--${key}${
                        selectedAccent === key ? ' highlight-dock-web__swatch--selected' : ''
                      }`}
                      title={STUDY_HIGHLIGHT_ACCENT_LABELS[key]}
                      aria-label={STUDY_HIGHLIGHT_ACCENT_LABELS[key]}
                      aria-pressed={selectedAccent === key}
                      onMouseDown={(e) => runPointerAction(e, () => setSelectedAccent(key))}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.detail === 0) setSelectedAccent(key);
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="highlight-dock-web__btn"
                  onMouseDown={(e) => runPointerAction(e, saveHighlight)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.detail === 0) saveHighlight();
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="highlight-dock-web__btn highlight-dock-web__btn--plain"
                  onMouseDown={(e) => runPointerAction(e, dismissPending)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.detail === 0) dismissPending();
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : null}

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

            {highlights.length > 0 ? (
              <ul className="reference-dock-web__highlight-list">
                {highlights.map((h) => (
                  <li key={h.id} className="reference-dock-web__highlight-item">
                    <span
                      className={`reference-dock-web__highlight-swatch reference-dock-web__highlight-swatch--${h.accentKey}`}
                      aria-hidden
                    />
                    <span className="reference-dock-web__highlight-excerpt">{h.excerpt}</span>
                    <button
                      type="button"
                      className="highlight-dock-web__btn highlight-dock-web__btn--plain"
                      onMouseDown={(e) => runPointerAction(e, () => removeHighlight(h.id))}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.detail === 0) removeHighlight(h.id);
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
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

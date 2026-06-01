'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Range of the reference highlight in the note — when set, the dock shows accent swatches + remove. */
  noteHighlightRange?: { from: number; to: number } | null;
  noteHighlightAccent?: StudyHighlightAccentKey | null;
  onChangeNoteHighlight?: (accent: StudyHighlightAccentKey) => void;
  onRemoveNoteHighlight?: () => void;
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

export default function ReferenceDockWeb({
  initialQuery,
  onDone,
  noteHighlightRange,
  noteHighlightAccent,
  onChangeNoteHighlight,
  onRemoveNoteHighlight,
}: ReferenceDockWebProps) {
  const [query, setQuery] = useState(initialQuery);
  const trimmed = query.trim();
  const { data: entry, isLoading } = useEastonsEntry(trimmed);
  const [isExpanded, setIsExpanded] = useState(true);

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
    noteHighlightRange && (onChangeNoteHighlight || onRemoveNoteHighlight) ? (
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
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemoveNoteHighlight}
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
      expanded={isExpanded}
      onToggleExpanded={() => setIsExpanded((prev) => !prev)}
      onDismiss={onDone}
      headerIcon={<Icon name={entry ? categoryIcon(entry.category) : 'book-open'} size={13} />}
      headerTitle={<span className="reference-dock-web__headword">{headword}</span>}
      headerTrailing={
        entry ? (
          <span className="reference-dock-web__category-chip" data-category={entry.category}>
            <Icon name={categoryIcon(entry.category)} size={11} aria-hidden />
            {categoryLabel(entry.category)}
          </span>
        ) : null
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
                      title={key}
                      aria-label={key}
                      aria-pressed={selectedAccent === key}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setSelectedAccent(key)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="highlight-dock-web__btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={saveHighlight}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="highlight-dock-web__btn highlight-dock-web__btn--plain"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={dismissPending}
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
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeHighlight(h.id)}
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

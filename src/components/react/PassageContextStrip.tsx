'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import '@/styles/passage-context-strip.css';
import '@/styles/scripture-pill-chrome.css';

interface ThemeRef {
  topicId: string;
  slug: string;
  label: string;
  relevance: number;
}
interface CrossReference {
  book: string;
  chapterStart: number;
  chapterEnd: number;
  verseStart: number;
  verseEnd: number;
  votes: number;
}
interface EntityRef {
  id: string;
  slug: string;
  name: string;
}
interface RelatedNote {
  noteId: string;
  title: string;
  reason: 'Same passage' | 'Cross-reference' | 'Shared theme';
}
interface PassageContext {
  themes: ThemeRef[];
  crossReferences: CrossReference[];
  people: EntityRef[];
  places: EntityRef[];
  relatedNotes: RelatedNote[];
}

export interface PassageContextStripProps {
  reference: string;
  translation: string;
  sourceNoteId?: string | null;
  active: boolean;
  /** Whether the cross-references section is visible (toggled from the dock chrome). */
  showCrossRefs: boolean;
  /** A related passage to point out — the one a suggestion named. Matched loosely, because
      the suggestion's wording ("Romans 8:28") need not match the list's formatting. */
  highlightCrossRef?: string | null;
  /** Whether the "Your notes" section is visible (toggled from the dock chrome). Defaults on. */
  showRelatedNotes?: boolean;
  /** Cross-reference tapped — open it as a read-only passage card. */
  onOpenScripturePassage: (reference: string) => void;
  /** Person/place tapped — open the reference dock for the entity. */
  onOpenEntity: (name: string, slug?: string) => void;
  /** Related note tapped — navigate to it. Absent → notes render non-interactive. */
  onNavigateNote?: (noteId: string) => void;
  /** Fires once when the strip first renders displayable content (scroll-into-view hook). */
  onContentReady?: () => void;
}

const contextCache = new Map<string, PassageContext>();
const cacheKey = (ref: string, trans: string, noteId?: string | null) =>
  `${ref}|${trans}|${noteId ?? ''}`;

/**
 * Seed the context cache so a caller can render this strip without a network round trip.
 *
 * Exists for the design gallery, which has no session and must not hand-copy this
 * component's markup into a fixture — a gallery that restates production markup drifts
 * from it silently. Priming the cache means the scene renders the real component.
 */
export function primePassageContextCache(
  reference: string,
  translation: string,
  context: PassageContext,
  sourceNoteId?: string | null,
): void {
  contextCache.set(cacheKey(reference, translation, sourceNoteId), context);
}

function formatCrossRef(cr: CrossReference): string {
  if (cr.chapterEnd !== cr.chapterStart) {
    return `${cr.book} ${cr.chapterStart}:${cr.verseStart}–${cr.chapterEnd}:${cr.verseEnd}`;
  }
  if (cr.verseEnd !== cr.verseStart) {
    return `${cr.book} ${cr.chapterStart}:${cr.verseStart}–${cr.verseEnd}`;
  }
  return `${cr.book} ${cr.chapterStart}:${cr.verseStart}`;
}

/**
 * Whether a listed cross-reference is the one a suggestion pointed at.
 *
 * Loose on purpose. The suggestion's wording comes from a different code path than this
 * list's formatting, so "Romans 5:8" has to match a row rendered as "Romans 5:8" — and also
 * one rendered as a range that opens on that verse, because "Romans 5:8–10" is still the
 * passage that was meant. Dashes differ between the two (hyphen vs en dash) for the same
 * reason, so they are flattened before comparing.
 */
export function isMarkedCrossRef(label: string, target: string | null | undefined): boolean {
  const wanted = target?.trim();
  if (!wanted) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const a = norm(label);
  const b = norm(wanted);
  if (a === b) return true;
  // A range row answers a single-verse target when the range begins there.
  return a.split('-')[0] === b;
}

type IconName = React.ComponentProps<typeof Icon>['name'];

/** A single navigable row — leading destination icon + label, trailing chevron. */
function NavRow({
  icon,
  label,
  secondary,
  disabled,
  marked,
  onClick,
}: {
  icon: IconName;
  label: string;
  secondary?: string;
  disabled?: boolean;
  /** The row a suggestion pointed at — see `highlightCrossRef`. */
  marked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`passage-context-strip__row${marked ? ' passage-context-strip__row--marked' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={13} className="passage-context-strip__row-icon" aria-hidden />
      <span className="passage-context-strip__row-text">
        <span className="passage-context-strip__row-label">{label}</span>
        {secondary ? (
          <span className="scripture-pill-chrome__trans-chip">{secondary}</span>
        ) : null}
      </span>
      <Icon name="caret-right" size={11} className="passage-context-strip__row-chevron" aria-hidden />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="passage-context-strip__section">
      <p className="passage-context-strip__section-label">{title}</p>
      <div className="passage-context-strip__rows">{children}</div>
    </div>
  );
}

export default function PassageContextStrip({
  reference,
  translation,
  sourceNoteId = null,
  active,
  showCrossRefs,
  highlightCrossRef = null,
  showRelatedNotes = true,
  onOpenScripturePassage,
  onOpenEntity,
  onNavigateNote,
  onContentReady,
}: PassageContextStripProps) {
  const [ctx, setCtx] = useState<PassageContext | null>(null);
  const [loading, setLoading] = useState(false);
  const prevCrossRefsVisibleRef = useRef(false);

  useEffect(() => {
    if (!active || !reference) {
      setCtx(null);
      return;
    }
    const key = cacheKey(reference, translation, sourceNoteId);
    const cached = contextCache.get(key);
    if (cached) {
      setCtx(cached);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const params = new URLSearchParams({ reference, translation });
        if (sourceNoteId) params.set('noteId', sourceNoteId);
        const res = await fetch(`/api/scripture/passage-context?${params.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data?.success) return;
        const next: PassageContext = {
          themes: data.themes ?? [],
          crossReferences: data.crossReferences ?? [],
          people: data.people ?? [],
          places: data.places ?? [],
          relatedNotes: data.relatedNotes ?? [],
        };
        contextCache.set(key, next);
        setCtx(next);
      } catch {
        /* leave strip empty on fetch failure */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, reference, translation, sourceNoteId]);

  // Computed with null guards so these (and the effect below) stay above the early
  // returns — hooks must run unconditionally on every render (Rules of Hooks).
  const hasCrossRefs = !!ctx && showCrossRefs && ctx.crossReferences.length > 0;
  const hasNotes = !!ctx && showRelatedNotes && ctx.relatedNotes.length > 0;

  // Fire on every false→true transition of cross-refs visibility, not just once:
  // the strip stays mounted across toggles (only the section inside shows/hides), so a
  // fire-once flag would only scroll the first time. Async first load (ctx arrives after
  // the toggle) and cached repeats both surface as this transition.
  useEffect(() => {
    if (hasCrossRefs && !prevCrossRefsVisibleRef.current) {
      onContentReady?.();
    }
    prevCrossRefsVisibleRef.current = hasCrossRefs;
  }, [hasCrossRefs, onContentReady]);

  if (!active) return null;
  if (loading && !ctx) return null;
  if (!ctx) return null;

  if (!hasCrossRefs && !hasNotes) return null;

  return (
    <div className="passage-context-strip" aria-label="Passage connections">
      {hasCrossRefs ? (
        <Section title="Related passages">
          {ctx.crossReferences.map((cr) => {
            const label = formatCrossRef(cr);
            return (
              <NavRow
                key={label}
                icon="book-open"
                label={label}
                marked={isMarkedCrossRef(label, highlightCrossRef)}
                onClick={() => onOpenScripturePassage(label)}
              />
            );
          })}
        </Section>
      ) : null}

      {/* No People / Places / Themes sections here, deliberately. The endpoint returns them and
          they are worth surfacing — but as the dotted `reference-suggestion` underlines on the
          passage text itself, where a name is answered in the place you met it. Listing them
          again underneath restated the same words as a menu and pushed the passage up the card. */}
      {hasNotes ? (
        <Section title="Your notes">
          {ctx.relatedNotes.map((n) => (
            <NavRow
              key={n.noteId}
              icon="note-sticky"
              label={n.title}
              secondary={n.reason}
              disabled={!onNavigateNote}
              onClick={() => onNavigateNote?.(n.noteId)}
            />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

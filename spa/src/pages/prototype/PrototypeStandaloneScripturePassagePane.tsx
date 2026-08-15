import { useEffect, useMemo, useRef, useState } from 'react';
import { safeRenderHtml } from '@/utils/content-renderer';
import { fetchVerseHtml } from '@/utils/fetch-verse-html';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { toast } from '@/utils/toast';
import {
  isStudyHighlightAccentKey,
  studyDockAccentCssVar,
  STUDY_HIGHLIGHT_ACCENT_LABELS,
  STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL,
  type StudyHighlightAccentKey,
} from '@/utils/study-highlight-accents';
import type { StandaloneScripturePassageState } from '../../layouts/proto-shell-context';
import { useReaderChapter, type ReaderVerseStudy } from '../../hooks/queries/useReaderChapter';
import { useCreateReaderHighlight } from '../../hooks/mutations/useCreateReaderHighlight';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';

/**
 * Swatch fill for a highlight's row in the study list. The verse text itself is painted by
 * the existing `mark[data-color]` underline rules rather than an inline colour.
 */
function accentSwatch(accent: string): string {
  return isStudyHighlightAccentKey(accent) ? studyDockAccentCssVar(accent) : 'var(--pds-accent)';
}

export default function PrototypeStandaloneScripturePassagePane({
  state,
  onDone,
}: {
  state: StandaloneScripturePassageState;
  onDone: () => void;
}) {
  // The pane is handed a canonical reference, which may be a verse, a range, or a whole
  // chapter. Read the chapter around it so the passage is shown in context with every
  // highlight and note the chapter carries — not just the ones filed under this exact
  // reference string.
  const parsed = useMemo(() => parseScriptureReference(state.canonicalReference), [state.canonicalReference]);
  const focusStart = parsed ? (Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse) : null;
  const focusEnd = parsed ? (Array.isArray(parsed.verse) ? parsed.verse[1] : focusStart) : null;

  const {
    data: chapterData,
    isLoading: chapterLoading,
    isError: chapterError,
  } = useReaderChapter(parsed?.book, parsed?.chapter, state.translationCode, Boolean(parsed));

  // A reference the parser cannot break into book and chapter can still be rendered the
  // old way, as a block of passage HTML — it just gains no verse-level study.
  const [fallbackHtml, setFallbackHtml] = useState('');
  const [fallbackLoading, setFallbackLoading] = useState(false);
  useEffect(() => {
    if (parsed) return;
    let cancelled = false;
    void (async () => {
      setFallbackLoading(true);
      const h = await fetchVerseHtml(state.canonicalReference, state.translationCode);
      if (cancelled) return;
      setFallbackHtml(h || '');
      setFallbackLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, state.canonicalReference, state.translationCode]);

  const study = chapterData?.study ?? {};
  const verses = chapterData?.verses ?? [];

  const focusedVerseRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    focusedVerseRef.current?.scrollIntoView({ block: 'center' });
  }, [chapterData?.book, chapterData?.chapter]);

  /** Every highlight and note in the chapter, de-duplicated across the verses they span. */
  const chapterStudy = useMemo(() => {
    const highlights = new Map<string, ReaderVerseStudy['highlights'][number]>();
    const notes = new Map<string, ReaderVerseStudy['notes'][number]>();
    for (const slot of Object.values(study)) {
      slot.highlights.forEach((h) => highlights.set(h.id, h));
      slot.notes.forEach((n) => notes.set(n.noteId, n));
    }
    return { highlights: [...highlights.values()], notes: [...notes.values()] };
  }, [study]);

  const heading = chapterData ? `${chapterData.book} ${chapterData.chapter}` : state.canonicalReference;

  // Highlighting: pick a pen, then tap a verse. The highlight attaches to the chapter's
  // passage note, which the server creates on the first highlight here.
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const [pen, setPen] = useState<StudyHighlightAccentKey>('warmAmber');
  const createHighlight = useCreateReaderHighlight();

  const highlightVerse = (verse: number) => {
    if (!chapterData || createHighlight.isPending) return;
    if (study[String(verse)]?.highlights.length) return;
    createHighlight.mutate(
      {
        book: chapterData.book,
        chapter: chapterData.chapter,
        verseStart: verse,
        translation: chapterData.translation,
        accent: pen,
        homeSpaceId,
      },
      {
        // The optimistic mark is rolled back by the hook; say why it vanished.
        onError: () => toast.error('Could not save that highlight'),
      },
    );
  };

  return (
    <div className="proto-standalone-passage proto-theme" style={{ padding: '20px 24px', maxWidth: 720, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 className="proto-title-md" style={{ margin: 0, lineHeight: 1.25 }}>
            {heading}
          </h1>
          <p className="proto-caption" style={{ margin: '6px 0 0' }}>
            {state.translationCode}
            {parsed && focusStart != null ? ` · from ${state.canonicalReference}` : ''}
          </p>
        </div>
        <button type="button" className="proto-toolbar-icon-btn" style={{ flexShrink: 0 }} onClick={onDone}>
          Done
        </button>
      </div>

      {parsed && verses.length > 0 ? (
        <div
          role="radiogroup"
          aria-label="Highlight colour"
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}
        >
          {STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL.map((accent) => (
            <button
              key={accent}
              type="button"
              role="radio"
              aria-checked={pen === accent}
              aria-label={STUDY_HIGHLIGHT_ACCENT_LABELS[accent]}
              title={STUDY_HIGHLIGHT_ACCENT_LABELS[accent]}
              onClick={() => setPen(accent)}
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                padding: 0,
                cursor: 'pointer',
                background: studyDockAccentCssVar(accent),
                border:
                  pen === accent ? '2px solid var(--pds-text-primary)' : '0.5px solid var(--pds-border)',
              }}
            />
          ))}
          <span className="proto-caption" style={{ marginLeft: 4 }}>
            {createHighlight.isPending ? 'Saving…' : 'Tap a verse to highlight'}
          </span>
        </div>
      ) : null}

      <div
        className="proto-standalone-passage__body"
        style={{
          borderRadius: 12,
          border: '0.5px solid var(--pds-border)',
          padding: 16,
          marginBottom: 20,
          background: 'var(--pds-bg-glass-light)',
          minHeight: 120,
        }}
      >
        {!parsed ? (
          fallbackLoading ? (
            <p className="proto-caption">Loading passage…</p>
          ) : fallbackHtml ? (
            <div
              className="proto-standalone-passage__html scripture-pill-chrome__passage-html"
              dangerouslySetInnerHTML={{ __html: safeRenderHtml(fallbackHtml) }}
            />
          ) : (
            <p className="proto-caption">Could not load this passage.</p>
          )
        ) : chapterLoading ? (
          <p className="proto-caption">Loading passage…</p>
        ) : chapterError ? (
          <p className="proto-caption">Could not load this passage.</p>
        ) : verses.length === 0 ? (
          <p className="proto-caption">
            This chapter is not available in {state.translationCode}.
          </p>
        ) : (
          <div className="proto-standalone-passage__verses scripture-pill-chrome__passage-html">
            {/* The passage-HTML class is borrowed so the existing mark[data-color] underline
                rules and passage typography apply — same painting as the scripture dock. */}
            {verses.map((v) => {
              const slot = study[String(v.verse)];
              const topHighlight = slot?.highlights[0];
              const isFocused =
                focusStart != null && focusEnd != null && v.verse >= focusStart && v.verse <= focusEnd;
              const alreadyHighlighted = Boolean(slot?.highlights.length);
              // The verse text has to stay inline for the passage to read as prose, so it
              // carries the button role rather than being wrapped in one.
              const interactive = !alreadyHighlighted && !createHighlight.isPending;
              return (
                <p
                  key={v.verse}
                  ref={isFocused && v.verse === focusStart ? focusedVerseRef : undefined}
                  className="proto-standalone-passage__verse"
                  data-verse={v.verse}
                  data-focused={isFocused ? 'true' : 'false'}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? `Highlight verse ${v.verse}` : undefined}
                  onClick={interactive ? () => highlightVerse(v.verse) : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          highlightVerse(v.verse);
                        }
                      : undefined
                  }
                  style={{
                    margin: '0 0 8px',
                    lineHeight: 1.6,
                    cursor: interactive ? 'pointer' : 'default',
                    // The verses this pane was opened for stay legible against the rest.
                    opacity: focusStart == null || isFocused ? 1 : 0.72,
                  }}
                >
                  <sup className="verse-num" style={{ marginRight: 4, color: 'var(--pds-text-tertiary)' }}>
                    {v.verse}
                  </sup>
                  {topHighlight ? (
                    <mark
                      data-study-thread-id={topHighlight.id}
                      data-color={topHighlight.accent}
                      data-entry-kind={topHighlight.entryKind}
                    >
                      {v.text}
                    </mark>
                  ) : (
                    v.text
                  )}
                  {slot && slot.notes.length > 0 ? (
                    <span
                      className="proto-caption"
                      title={`${slot.notes.length} note${slot.notes.length === 1 ? '' : 's'} on this verse`}
                      style={{ marginLeft: 6, color: 'var(--pds-text-tertiary)' }}
                    >
                      ◦ {slot.notes.length}
                    </span>
                  ) : null}
                </p>
              );
            })}
          </div>
        )}
      </div>

      <h2 className="pds-list-title" style={{ fontSize: 15, marginBottom: 8 }}>
        Your study in {heading}
      </h2>
      {chapterLoading && parsed ? (
        <p className="proto-caption">Loading your study…</p>
      ) : chapterStudy.highlights.length === 0 && chapterStudy.notes.length === 0 ? (
        <p className="proto-caption">Nothing saved against this chapter yet.</p>
      ) : (
        <ul className="proto-note-list">
          {chapterStudy.highlights.map((h) => (
            <li
              key={h.id}
              className="proto-note-row-item"
              data-active={h.id === state.focusedHighlightThreadId ? 'true' : 'false'}
            >
              <div className="proto-note-row__main" style={{ cursor: 'default', textAlign: 'left' }}>
                <div className="pds-list-title proto-note-row__title-text">
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      marginRight: 6,
                      background: accentSwatch(h.accent),
                    }}
                  />
                  {h.excerpt?.trim() || h.reference}
                </div>
                <div className="pds-list-preview proto-note-row__preview">
                  {h.reference}
                  {h.parentNoteTitle ? ` · ${h.parentNoteTitle}` : ''}
                </div>
              </div>
            </li>
          ))}
          {chapterStudy.notes.map((n) => (
            <li key={n.noteId} className="proto-note-row-item">
              <div className="proto-note-row__main" style={{ cursor: 'default', textAlign: 'left' }}>
                <div className="pds-list-title proto-note-row__title-text">{n.title?.trim() || 'Untitled'}</div>
                <div className="pds-list-preview proto-note-row__preview">{n.reference}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

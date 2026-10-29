import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/react/Icon';
import type { NoteHistorySessionWire } from '../../hooks/queries/useNoteHistory';
import { useNoteHistoryVersion } from '../../hooks/queries/useNoteHistoryVersion';
import { NOTE_HISTORY_COPY as COPY } from './proto-note-history-copy';
import {
  noteHistoryDayLabel,
  noteHistorySessionSpan,
  noteHistorySessionTimeLabel,
  summarizeNoteVersionChange,
  type NoteHistoryDayGroup,
} from './note-history-presentation';

/*
 * Three phone layouts for History, to try side by side before keeping one (Oct 2026).
 *
 * - `strip`: the layout as it shipped — a chip strip over a full page.
 * - `list`: a compact day-grouped list; a tapped row opens a short preview in place, with
 *   Restore right under it. Nothing is shown until you ask.
 * - `slider`: one slim slider from the first kept version to now, over the full page; the
 *   time sits above the thumb, Restore in one footer line.
 * - `story`: cards that say what each session did ("Added Exodus 33:1-6", the paragraphs
 *   that arrived) instead of when, with the whole page one tap away.
 *
 * The choice is admin-only and kept per device. Once one is picked, the others and the
 * switch go.
 */
export type NoteHistoryLayout = 'strip' | 'list' | 'slider' | 'story';

export const NOTE_HISTORY_LAYOUTS: { id: NoteHistoryLayout; label: string }[] = [
  { id: 'strip', label: 'Strip' },
  { id: 'list', label: 'List' },
  { id: 'slider', label: 'Slider' },
  { id: 'story', label: 'Story' },
];

const LAYOUT_KEY = 'harvous-note-history-layout';

export function readNoteHistoryLayout(): NoteHistoryLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw === 'list' || raw === 'slider' || raw === 'story' || raw === 'strip') return raw;
  } catch {
    /* private mode */
  }
  return 'strip';
}

export function writeNoteHistoryLayout(layout: NoteHistoryLayout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    /* private mode */
  }
}

export function NoteHistoryLayoutSwitch({
  value,
  onChange,
}: {
  value: NoteHistoryLayout;
  onChange: (layout: NoteHistoryLayout) => void;
}) {
  return (
    <div className="proto-history-v__switch" role="radiogroup" aria-label="History layout">
      {NOTE_HISTORY_LAYOUTS.map((layout) => (
        <button
          key={layout.id}
          type="button"
          role="radio"
          aria-checked={value === layout.id}
          className={value === layout.id ? 'proto-history-v__switch-opt proto-ink-on-accent' : 'proto-history-v__switch-opt'}
          onClick={() => onChange(layout.id)}
        >
          {layout.label}
        </button>
      ))}
    </div>
  );
}

export type NoteHistoryVariantProps = {
  layout: Exclude<NoteHistoryLayout, 'strip'>;
  noteId: string;
  sessions: NoteHistorySessionWire[];
  days: NoteHistoryDayGroup[];
  selected: NoteHistorySessionWire | null;
  onSelect: (id: string) => void;
  detailFor: (session: NoteHistorySessionWire) => string | null;
  /** The chosen version on paper (or its loading/error state). */
  preview: ReactNode;
  /** The chosen version's HTML once loaded, for the story diff. */
  selectedHtml: string | null;
  restoreButton: ReactNode;
  /** Show older / Plus upsell / empty state, already built by the sheet. */
  tail: ReactNode;
  pending: boolean;
  errorNotice: ReactNode | null;
};

function timeOf(session: NoteHistorySessionWire): string {
  return session.isCurrent
    ? COPY.currentTag
    : new Date(session.endedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function Skeleton() {
  return (
    <div className="proto-note-history__skeleton" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="proto-note-history__skeleton-row" />
      ))}
    </div>
  );
}

export default function PrototypeNoteHistoryVariant(props: NoteHistoryVariantProps) {
  if (props.pending) return <Skeleton />;
  if (props.errorNotice) return <>{props.errorNotice}</>;
  if (props.layout === 'list') return <HistoryList {...props} />;
  if (props.layout === 'slider') return <HistorySlider {...props} />;
  return <HistoryStory {...props} />;
}

/* ─── List ──────────────────────────────────────────────────────────────── */

function HistoryList({ days, selected, onSelect, detailFor, preview, restoreButton, tail }: NoteHistoryVariantProps) {
  // Nothing opens until asked: the list is for finding a version, and the note as it is now
  // is the one you just left.
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="proto-history-v proto-history-v--list">
      <div className="proto-history-v__scroll">
        {days.map((day) => (
          <section key={day.key} className="proto-history-v__day" aria-label={day.label}>
            <h3 className="proto-history-v__day-label">{day.label}</h3>
            <div className="proto-history-v__group">
              {day.sessions.map((session) => {
                const open = openId === session.id && selected?.id === session.id;
                const detail = detailFor(session);
                return (
                  <div key={session.id} className="proto-history-v__item" data-open={open ? 'true' : undefined}>
                    <button
                      type="button"
                      className="proto-history-v__row"
                      aria-expanded={open}
                      onClick={() => {
                        if (open) {
                          setOpenId(null);
                          return;
                        }
                        setOpenId(session.id);
                        onSelect(session.id);
                      }}
                    >
                      <span className="proto-history-v__row-main">
                        <span className="proto-history-v__time">{noteHistorySessionTimeLabel(session)}</span>
                        <span className="proto-history-v__meta">{detail ?? noteHistorySessionSpan(session)}</span>
                      </span>
                      {session.isCurrent ? <span className="proto-history-v__tag">{COPY.currentTag}</span> : null}
                      <Icon name="chevron-down" size={11} className="proto-history-v__chevron" />
                    </button>
                    {open ? (
                      <div className="proto-history-v__expand">
                        <div className="proto-history-v__mini-paper">{preview}</div>
                        {restoreButton ? (
                          <div className="proto-history-v__expand-foot">
                            <span className="proto-history-v__hint">What’s there now stays in history.</span>
                            {restoreButton}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <div className="proto-history-v__tail">{tail}</div>
      </div>
    </div>
  );
}

/* ─── Slider ────────────────────────────────────────────────────────────── */

function HistorySlider({ sessions, selected, onSelect, preview, restoreButton, tail }: NoteHistoryVariantProps) {
  const oldestFirst = useMemo(() => [...sessions].reverse(), [sessions]);
  const selectedIndex = selected ? oldestFirst.findIndex((s) => s.id === selected.id) : oldestFirst.length - 1;
  // The thumb moves at once; the page follows when the finger rests, so a drag across
  // forty versions does not fetch forty of them.
  const [thumb, setThumb] = useState(selectedIndex);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setThumb(selectedIndex), [selectedIndex]);
  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);
  const shown = oldestFirst[thumb] ?? selected;
  if (!shown) return null;
  const day = noteHistoryDayLabel(new Date(shown.endedAt));
  return (
    <div className="proto-history-v proto-history-v--slider">
      <div className="proto-history-v__slider-head">
        <div className="proto-history-v__when">
          <span className="proto-history-v__when-day">{shown.isCurrent ? COPY.current : day}</span>
          {shown.isCurrent ? null : (
            <span className="proto-history-v__when-time">{noteHistorySessionTimeLabel(shown)}</span>
          )}
        </div>
        {oldestFirst.length > 1 ? (
          <>
            <input
              type="range"
              className="proto-history-v__range"
              min={0}
              max={oldestFirst.length - 1}
              step={1}
              value={thumb}
              aria-label="Version"
              aria-valuetext={shown.isCurrent ? COPY.current : `${day}, ${noteHistorySessionTimeLabel(shown)}`}
              style={{ ['--proto-range-fill' as string]: `${(thumb / Math.max(1, oldestFirst.length - 1)) * 100}%` }}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                setThumb(next);
                if (commitTimer.current) clearTimeout(commitTimer.current);
                commitTimer.current = setTimeout(() => {
                  const target = oldestFirst[next];
                  if (target) onSelect(target.id);
                }, 160);
              }}
            />
            <div className="proto-history-v__range-ends">
              <span>{noteHistoryDayLabel(new Date(oldestFirst[0]!.endedAt))}</span>
              <span>{COPY.currentTag}</span>
            </div>
          </>
        ) : null}
        <div className="proto-history-v__slider-tail">{tail}</div>
      </div>
      <div className="proto-history-v__page">{preview}</div>
      {restoreButton ? (
        <div className="proto-note-history__footer">
          <span className="proto-history-v__hint">Restore this version?</span>
          {restoreButton}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Story ─────────────────────────────────────────────────────────────── */

function StoryChange({
  noteId,
  older,
  selectedHtml,
}: {
  noteId: string;
  older: NoteHistorySessionWire | null;
  selectedHtml: string | null;
}) {
  const olderVersion = useNoteHistoryVersion(noteId, older && !older.contentEncrypted ? older.id : null);
  const olderHtml = older ? (olderVersion.data?.version.content ?? null) : null;
  const waiting = !selectedHtml || (older != null && !older.contentEncrypted && olderVersion.isPending);
  const change = useMemo(
    () => (selectedHtml && !waiting ? summarizeNoteVersionChange(olderHtml, selectedHtml) : null),
    [selectedHtml, olderHtml, waiting],
  );
  if (waiting) return <span className="proto-history-v__skeleton-line" aria-busy="true" />;
  if (!change) return null;
  const refs = change.referencesAdded;
  const added = change.added.filter((block) => !refs.includes(block)).slice(0, 3);
  const removed = change.removed.slice(0, 2);
  const nothing = refs.length === 0 && added.length === 0 && removed.length === 0;
  return (
    <div className="proto-history-v__change">
      {older == null ? <p className="proto-history-v__change-kicker">The first version kept</p> : null}
      {refs.length > 0 ? (
        <p className="proto-history-v__change-refs">
          <span className="proto-history-v__change-label">Added</span>
          {refs.slice(0, 3).map((ref) => (
            <span key={ref} className="proto-history-v__ref">
              {ref}
            </span>
          ))}
        </p>
      ) : null}
      {added.map((block, index) => (
        <p key={`a${index}`} className="proto-history-v__change-line" data-kind="added">
          {block}
        </p>
      ))}
      {removed.map((block, index) => (
        <p key={`r${index}`} className="proto-history-v__change-line" data-kind="removed">
          {block}
        </p>
      ))}
      {nothing ? <p className="proto-history-v__change-kicker">Small edits within paragraphs</p> : null}
      {change.wordDelta !== 0 ? (
        <p className="proto-history-v__change-words">
          {change.wordDelta > 0 ? `+${change.wordDelta}` : `−${Math.abs(change.wordDelta)}`} words
        </p>
      ) : null}
    </div>
  );
}

function HistoryStory({
  noteId,
  sessions,
  days,
  selected,
  onSelect,
  detailFor,
  preview,
  selectedHtml,
  restoreButton,
  tail,
}: NoteHistoryVariantProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showPage, setShowPage] = useState(false);
  return (
    <div className="proto-history-v proto-history-v--story">
      <div className="proto-history-v__scroll">
        {days.map((day) => (
          <section key={day.key} className="proto-history-v__day" aria-label={day.label}>
            <h3 className="proto-history-v__day-label">{day.label}</h3>
            {day.sessions.map((session) => {
              const open = openId === session.id && selected?.id === session.id;
              const index = sessions.indexOf(session);
              const older = sessions[index + 1] ?? null;
              const detail = detailFor(session);
              return (
                <article key={session.id} className="proto-history-v__card" data-open={open ? 'true' : undefined}>
                  <button
                    type="button"
                    className="proto-history-v__card-head"
                    aria-expanded={open}
                    onClick={() => {
                      setShowPage(false);
                      if (open) {
                        setOpenId(null);
                        return;
                      }
                      setOpenId(session.id);
                      onSelect(session.id);
                    }}
                  >
                    <span className="proto-history-v__row-main">
                      <span className="proto-history-v__time">{timeOf(session)}</span>
                      <span className="proto-history-v__meta">
                        {detail ?? noteHistorySessionSpan(session)}
                      </span>
                    </span>
                    <Icon name="chevron-down" size={11} className="proto-history-v__chevron" />
                  </button>
                  {open ? (
                    <div className="proto-history-v__card-body">
                      {session.contentEncrypted ? (
                        <p className="proto-history-v__change-kicker">{COPY.encryptedPreview}</p>
                      ) : (
                        <StoryChange noteId={noteId} older={older} selectedHtml={selectedHtml} />
                      )}
                      {showPage ? <div className="proto-history-v__mini-paper">{preview}</div> : null}
                      <div className="proto-history-v__expand-foot">
                        {session.contentEncrypted ? (
                          <span />
                        ) : (
                          <button
                            type="button"
                            className="proto-note-history__text-btn"
                            onClick={() => setShowPage((value) => !value)}
                          >
                            {showPage ? 'Hide the page' : 'See the whole page'}
                          </button>
                        )}
                        {restoreButton}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}
        <div className="proto-history-v__tail">{tail}</div>
      </div>
    </div>
  );
}

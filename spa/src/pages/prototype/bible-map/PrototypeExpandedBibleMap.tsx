/**
 * "Your Bible" with room to look — where you have been, a section at a time.
 *
 * Ten lines, one per canon section: Law, History, Wisdom, the prophets, the Gospels and on.
 * Each line carries a dot per book, shaded by the deepest study anywhere in it, and a quiet
 * "3 of 5 books". Opening a section lists its books with their chapters as a strip.
 *
 * Sections first because sixty-six rows of chapter strips, most of them empty, read as a
 * spreadsheet of what you have not done. The section line answers the birds-eye question —
 * where have I been — and the chapters are one tap away for the book you care about.
 *
 * An expanded tool rather than a route, grown out of whatever opened it. Opened at a book
 * when the opener asks (`pending-bible-map-book.ts`): the reader's "14 of John's 21 chapters"
 * lands with the Gospels open and John's row marked.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import '../../../styles/prototype-bible-map.css';
import Icon from '@/components/react/Icon';
import ProtoSidebarExpandedPanel from '../ProtoSidebarExpandedPanel';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import type { ExpandedSidebarToolProps } from '../PrototypeExpandedSidebarHost';
import { useBibleCoverage } from '../../../hooks/queries/useBibleCoverage';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { bookSlug, orderedCanonBooks } from '@/utils/bible-book-chapters';
import { CANON_BOOK_GROUPS, canonGroupForBook } from '@/utils/admin-pulse-canon-groups';
import { chaptersBeenIn, deepestLevel, levelsForBook } from '@/utils/bible-coverage';
import { prototypeReadRouteTo } from '@/lib/prototype-path';
import { consumePendingBibleMapBook } from '../../../lib/pending-bible-map-book';
import ProtoChapterStrip from './ProtoChapterStrip';
import ProtoCanonShelf from './ProtoCanonShelf';
import { COVERAGE_LEGEND, bookCountLabel, sectionCountLabel, shelfSummary } from './bible-map-copy';

/**
 * "3/5", with the total quieter than the count. Spelled out only for a screen reader: the
 * section's dots already say how many books there are, and "3 of 5 books" on every line was
 * the same three words ten times down the page. Nothing at zero.
 */
function ProtoCountFraction({
  value,
  total,
  label,
  className,
}: {
  value: number;
  total: number;
  label: string;
  className: string;
}) {
  if (value === 0) return <span className={className} />;
  return (
    <span className={className} role="img" aria-label={label}>
      {value}
      <span className="proto-bible-map__count-total">/{total}</span>
    </span>
  );
}

export default function PrototypeExpandedBibleMap({ exiting, origin, onClose }: ExpandedSidebarToolProps) {
  const coverageQuery = useBibleCoverage();
  const coverage = coverageQuery.data;
  const navigate = useNavigate();
  const { isMobileSidebar, closeDrawer, closeExpandedSidebar } = useProtoShell();
  const books = useMemo(() => orderedCanonBooks(), []);
  // Read once, at mount, the way Discover reads its pending kind.
  const [initialBook] = useState(() => consumePendingBibleMapBook());
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const group = initialBook ? canonGroupForBook(initialBook) : null;
    return new Set(group ? [group.id] : []);
  });
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Once, when the rows exist: bring the asked-for book into view.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current || !initialBook || !coverage) return;
    scrolledRef.current = true;
    const row = bodyRef.current?.querySelector<HTMLElement>(`[data-book="${CSS.escape(initialBook)}"]`);
    row?.scrollIntoView({ block: 'center' });
  }, [coverage, initialBook]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /*
   * The chapter takes the map's own history entry. A plain close steps Back out of that entry,
   * and a navigation issued while that Back is in flight is undone by it — the panel closed and
   * nothing opened. Keeping the entry and replacing it leaves one Back from the chapter landing
   * where the map was opened from.
   */
  const openChapter = (book: string, chapter: number) => {
    closeExpandedSidebar({ preserveHistory: true });
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    void navigate({
      to: prototypeReadRouteTo(),
      params: { book: bookSlug(book), chapter: String(chapter) },
      replace: true,
    });
  };

  const summary = coverage ? shelfSummary(coverage.books) : null;

  return (
    <ProtoSidebarExpandedPanel
      label="Your Bible"
      title="Your Bible"
      exiting={exiting}
      origin={origin}
      centered
      maxWidth={720}
      fitContent
      onClose={onClose}
    >
      <div className="proto-planner">
        <div className="proto-planner__main proto-bible-map" ref={bodyRef}>
          {!coverage ? (
            <ProtoSpaceLoading label="Loading your Bible" />
          ) : (
            <>
              {/* The Home card's shelf, grown: the same picture, so the map reads as that card
                  opened rather than as a new screen. */}
              <header className="proto-bible-map__header">
                <p className="proto-bible-map__headline">
                  {summary?.headline ?? 'Read a chapter, write a note or highlight a verse, and it shows here.'}
                  {summary?.detail ? <span className="proto-bible-map__detail"> {summary.detail}</span> : null}
                </p>
                <ProtoCanonShelf coverage={coverage} />
                <div className="proto-bible-map__ends" aria-hidden="true">
                  <span>Genesis</span>
                  <span>Revelation</span>
                </div>
              </header>

              <ul className="proto-bible-map__sections">
                {CANON_BOOK_GROUPS.map((group) => {
                  const groupBooks = books.slice(group.orderStart - 1, group.orderEnd).map((book) => {
                    const levels = levelsForBook(coverage, book);
                    return { book, levels, deepest: deepestLevel(levels) };
                  });
                  const beenIn = groupBooks.filter((b) => b.deepest > 0).length;
                  const isOpen = open.has(group.id);
                  const panelId = `proto-bible-map-${group.id}`;
                  return (
                    <li key={group.id} className="proto-bible-map__section" data-open={isOpen ? 'true' : undefined}>
                      <button
                        type="button"
                        className="proto-bible-map__section-head"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => toggle(group.id)}
                      >
                        <span className="proto-bible-map__chevron" aria-hidden="true">
                          <Icon name="chevron-down" size={10} />
                        </span>
                        <span className="proto-bible-map__section-name">{group.label}</span>
                        <span className="proto-bible-map__dots" aria-hidden="true">
                          {groupBooks.map((b) => (
                            <span key={b.book} className="proto-bible-map__dot" data-level={b.deepest} />
                          ))}
                        </span>
                        <ProtoCountFraction
                          className="proto-bible-map__section-count"
                          value={beenIn}
                          total={groupBooks.length}
                          label={sectionCountLabel(beenIn, groupBooks.length)}
                        />
                      </button>

                      {isOpen ? (
                        <div id={panelId} className="proto-bible-map__books">
                          {groupBooks.map(({ book, levels, deepest }) => (
                            <div
                              key={book}
                              className="proto-bible-map__row"
                              data-book={book}
                              data-been-in={deepest > 0 ? 'true' : undefined}
                              data-focus={book === initialBook ? 'true' : undefined}
                            >
                              <span className="proto-bible-map__book">{book}</span>
                              <ProtoChapterStrip
                                book={book}
                                levels={levels}
                                onSelectChapter={(chapter) => openChapter(book, chapter)}
                              />
                              {/* In the section counts' column, so every number on the page
                                  lines up down one edge. */}
                              <ProtoCountFraction
                                className="proto-bible-map__count"
                                value={chaptersBeenIn(levels)}
                                total={levels.length}
                                label={bookCountLabel(levels)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <ul className="proto-bible-map__legend" aria-label="Key">
                {COVERAGE_LEGEND.map((item) => (
                  <li key={item.level}>
                    <span className="proto-bible-map__dot" data-level={item.level} aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </ProtoSidebarExpandedPanel>
  );
}

/**
 * Where your church has been dwelling — the books it has actually taught from.
 *
 * A staff instrument, and a celebratory one rather than an analytic one: the
 * question it answers is "have we been anywhere near the Old Testament this
 * year", which a pastor already half-knows and has never been able to see.
 *
 * Built only from what staff planned. It does not read what the congregation
 * wrote — see the server util's docblock for why that is a different decision.
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import {
  heatLevel,
  useChurchScriptureHeatmap,
  type HeatmapBook,
} from '../../hooks/queries/useChurchScriptureHeatmap';

function weeksLabel(count: number): string {
  return count === 1 ? '1 week' : `${count} weeks`;
}

function ChapterStrip({ book }: { book: HeatmapBook }) {
  const chapters = Object.entries(book.chapters)
    .map(([chapter, count]) => ({ chapter: Number(chapter), count }))
    .sort((a, b) => a.chapter - b.chapter);
  if (chapters.length === 0) return null;
  const max = Math.max(...chapters.map((c) => c.count));

  return (
    <div className="proto-scripture-map__chapters">
      {chapters.map(({ chapter, count }) => (
        <span
          key={chapter}
          className="proto-scripture-map__chapter"
          data-heat={heatLevel(count, max)}
          title={`${book.book} ${chapter} · ${weeksLabel(count)}`}
        >
          {chapter}
        </span>
      ))}
    </div>
  );
}

export default function PrototypeChurchScriptureMapSection({
  orgId,
  canView,
}: {
  orgId: string | null;
  canView: boolean;
}) {
  const { data, isPending, isError } = useChurchScriptureHeatmap(orgId, { enabled: canView });
  const [openBook, setOpenBook] = useState<string | null>(null);

  if (!canView) return null;
  if (isPending) return <ProtoSpaceLoading label="Reading your plan" />;
  if (isError) {
    return (
      <div className="proto-shared-thread-state" role="alert">
        <p>Could not read your teaching plan.</p>
      </div>
    );
  }

  const books = data?.books ?? [];
  if (books.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="scroll"
        title="Nothing taught yet"
        description="Passages you plan will show up here, book by book."
      />
    );
  }

  const max = books[0]?.count ?? 0;

  return (
    <div className="proto-home-section proto-scripture-map">
      <p className="proto-caption proto-home-section__eyebrow">
        {weeksLabel(data?.totalPlanned ?? 0)} planned with a passage
        {/* Said plainly rather than quietly dropped — a pastor should know the
            map is missing weeks, and roughly how many. */}
        {data?.unparsed ? ` · ${data.unparsed} unreadable` : ''}
      </p>

      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        {books.map((book) => {
          const open = openBook === book.book;
          return (
            <div key={book.book}>
              <button
                type="button"
                className="proto-church-tools__row"
                aria-expanded={open}
                onClick={() => setOpenBook(open ? null : book.book)}
              >
                <span
                  className="proto-scripture-map__swatch"
                  data-heat={heatLevel(book.count, max)}
                  aria-hidden
                />
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title">{book.book}</span>
                  <span className="proto-caption proto-church-tools__row-meta">
                    {weeksLabel(book.count)}
                  </span>
                </span>
                <span className="proto-church-tools__row-chevron" aria-hidden>
                  <Icon name={open ? 'caret-down' : 'caret-right'} size={11} />
                </span>
              </button>
              {open ? <ChapterStrip book={book} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

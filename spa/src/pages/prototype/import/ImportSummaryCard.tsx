/**
 * What happened, once the run finishes. Counts first, then a card per thing that
 * needs the user — a failed file with its retry, a note that was already here. Undo
 * is offered because an import is the one action people most often want to take back.
 */
import Icon, { type IconName } from '@/components/react/Icon';
import ImportSourceFan from './ImportSourceFan';
import type { ImportEngineState, ImportRowState } from './import-engine-state';

export interface ImportSummaryCardProps {
  summary: NonNullable<ImportEngineState['summary']>;
  rows: ImportRowState[];
  undoing: boolean;
  onUndo: () => void;
  onDone: () => void;
  onImportMore: () => void;
}

/** Give the number a size the reader can feel, without inventing precision. */
function perspectiveLine(notes: number, highlights: number): string | null {
  if (notes <= 0) return null;
  if (notes === 1) return 'One note, ready to study.';
  if (highlights > 0 && highlights >= notes) {
    return 'Your highlights came with them — nothing left behind in the old app.';
  }
  if (notes < 10) return 'A small stack, already searchable.';
  if (notes < 60) return "That's a study folder's worth, in one go.";
  if (notes < 250) return "Years of notes, now in one place.";
  return 'A whole library moved in.';
}

export default function ImportSummaryCard({
  summary,
  rows,
  undoing,
  onUndo,
  onDone,
  onImportMore,
}: ImportSummaryCardProps) {
  const problemRows = rows.filter((row) => row.phase === 'failed' || row.phase === 'parse-failed');
  const duplicateRows = rows.filter((row) => row.phase === 'duplicate');
  const perspective = perspectiveLine(summary.notesImported, summary.highlightsImported);

  /**
   * Icons are the ones the sidebar's list-mode switcher already uses for these
   * same things (ListViewMenu's ListModeTriggerIcon) — a note is a note-sticky
   * everywhere in the app, so the tally reads as the user's own library rather
   * than as import-only jargon.
   */
  // Annotate before filtering: .filter() on a bare literal widens `icon` to string
  // and the annotation then has nothing left to narrow.
  const allStats: Array<{ icon: IconName; label: string; value: number }> = [
    { icon: 'note-sticky', label: summary.notesImported === 1 ? 'note' : 'notes', value: summary.notesImported },
    { icon: 'highlighter', label: summary.highlightsImported === 1 ? 'highlight' : 'highlights', value: summary.highlightsImported },
    { icon: 'scroll', label: summary.scriptureProcessed === 1 ? 'scripture link' : 'scripture links', value: summary.scriptureProcessed },
    { icon: 'tag', label: summary.autoTagsApplied === 1 ? 'tag' : 'tags', value: summary.autoTagsApplied },
    { icon: 'arrow-right-arrow-left', label: summary.connectionsImported === 1 ? 'connection' : 'connections', value: summary.connectionsImported },
    { icon: 'copy', label: 'already here', value: summary.duplicatesSkipped },
  ];
  const stats = allStats.filter((stat) => stat.value > 0);

  return (
    <section className="proto-import-summary" aria-live="polite">
      {/* The pile, put away. The drop zone opens on a scatter and gathers it as you
          drag; this is the last frame of that same motion, so the surface closes
          the sentence it started instead of switching to a green tick and confetti
          that could belong to any app. */}
      <ImportSourceFan gathered />

      {/* Don't say "everything" when something didn't — the failures are listed
          right below, and the mismatch is what makes a summary untrustworthy. */}
      <h2 className="proto-import-summary__title">
        {summary.notesImported === 0
          ? 'Nothing new to bring in.'
          : problemRows.length > 0
            ? `${summary.notesImported} note${summary.notesImported === 1 ? '' : 's'} came over.`
            : "Everything's here."}
      </h2>
      {perspective ? <p className="proto-import-summary__perspective">{perspective}</p> : null}

      {stats.length > 0 ? (
        <ul className="proto-import-summary__stats">
          {stats.map((stat) => (
            <li key={stat.label} className="proto-import-summary__stat">
              <span className="proto-import-summary__stat-icon" aria-hidden>
                <Icon name={stat.icon} size={13} />
              </span>
              <span className="proto-import-summary__stat-label">{stat.label}</span>
              <span className="proto-import-summary__stat-value">{stat.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {problemRows.length > 0 ? (
        <div className="proto-import-summary__issues">
          <h3 className="pds-inspector-label">Needs a look</h3>
          {problemRows.map((row) => (
            <div key={row.id} className="proto-import-summary__issue">
              <span className="proto-import-summary__issue-icon proto-import-summary__issue-icon--critical">
                <Icon name="circle-exclamation" size={14} aria-hidden />
              </span>
              <span className="proto-import-summary__issue-body">
                <span className="proto-import-summary__issue-title">{row.name}</span>
                <span className="proto-import-summary__issue-reason">{row.error || 'Import failed'}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {duplicateRows.length > 0 ? (
        <p className="proto-import-summary__note">
          {duplicateRows.length} file{duplicateRows.length === 1 ? ' was' : 's were'} already in your
          library, so nothing was duplicated.
        </p>
      ) : null}

      <div className="proto-import-summary__actions">
        <button type="button" className="proto-settings-btn" onClick={onDone}>
          Go to my notes
        </button>
        <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={onImportMore}>
          Import more
        </button>
        {summary.notesImported > 0 ? (
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            onClick={onUndo}
            disabled={undoing}
          >
            {/* "Undo import" not "Undo this import" — the card is the import, and the
                longer label wraps to two lines once it shares a row. */}
            {undoing ? 'Undoing…' : 'Undo import'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

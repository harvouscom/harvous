/**
 * The import experience itself: drop files on it, each becomes a row showing what
 * it will create and then how far along it is, and one button starts the run.
 *
 * It has no page chrome of its own because it doesn't own a screen — it lives in
 * Settings → My Notes → Import. Import is a thing you do *to* your library, not a
 * place in it, so it shouldn't take over the surface where notes are read.
 *
 * `onExit` is what "Go to my notes" does; the host decides (settings closes itself).
 */
import { useEffect, useMemo, useState } from 'react';
import { showPrototypeFeedbackToast } from '@/utils/prototype-feedback-toast';
import ImportDropZone from './ImportDropZone';
import ImportFileRow from './ImportFileRow';
import ImportSummaryCard from './ImportSummaryCard';
import ProtoProgressBar from './ProtoProgressBar';
import { useImportEngine } from './useImportEngine';

/** Rotating status lines, so a long run doesn't feel like a frozen one. */
const RUNNING_LINES = [
  'Reading your notes…',
  'Keeping your folders as you had them…',
  'Finding scripture references…',
  'Linking passages to notes you already have…',
  'Almost there…',
];

export interface ImportWorkspaceProps {
  /** Where "Go to my notes" goes. */
  onExit: () => void;
  /**
   * Told whether a run is in flight, so the host can refuse to close under it.
   * An import survives neither an unmount nor a dismissed modal.
   */
  onBusyChange?: (busy: boolean) => void;
}

export default function ImportWorkspace({ onExit, onBusyChange }: ImportWorkspaceProps) {
  const engine = useImportEngine();
  const { state, phase, counts, readyItemCount } = engine;
  const [undoing, setUndoing] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  /** Ticks only while a rate-limit pause is counting down. */
  const [, setClockTick] = useState(0);

  const busy = phase === 'importing' || phase === 'adding';
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (state.rateLimitedUntil == null) return;
    const timer = window.setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state.rateLimitedUntil]);

  useEffect(() => {
    if (phase !== 'importing') return;
    const timer = window.setInterval(() => setLineIndex((i) => (i + 1) % RUNNING_LINES.length), 4200);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Leaving mid-run would abandon uploads the user can't see from anywhere else.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [busy]);

  const itemsByRow = useMemo(() => {
    const grouped = new Map<string, typeof state.items[string][]>();
    for (const item of Object.values(state.items)) {
      const list = grouped.get(item.rowId) ?? [];
      list.push(item);
      grouped.set(item.rowId, list);
    }
    return grouped;
  }, [state.items]);

  const notices = useMemo(() => Array.from(new Set(state.notices)), [state.notices]);
  const rateLimitWait =
    state.rateLimitedUntil != null
      ? Math.max(0, Math.ceil((state.rateLimitedUntil - Date.now()) / 1000))
      : 0;

  // Successful rows collapse into a receipt so only what still needs attention stays.
  const doneRows = state.rows.filter((row) => row.phase === 'done' || row.phase === 'duplicate');
  const visibleRows =
    phase === 'importing' || phase === 'paused'
      ? state.rows
      : state.rows.filter((row) => row.phase !== 'done' && row.phase !== 'duplicate');

  const allIncluded =
    state.rows.filter((row) => row.phase === 'parsed').every((row) => row.included) &&
    state.rows.some((row) => row.phase === 'parsed');

  const handleUndo = async () => {
    setUndoing(true);
    try {
      const result = await engine.undoImport();
      const kept = result?.keptEditedNotes ?? 0;
      showPrototypeFeedbackToast(
        kept > 0
          ? `Import undone. ${kept} note${kept === 1 ? '' : 's'} you had already edited were kept.`
          : 'Import undone.',
        'success',
      );
    } catch {
      showPrototypeFeedbackToast("Couldn't undo that import.", 'error');
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="proto-import-workspace">
      {state.finalized && state.summary ? (
        <ImportSummaryCard
          summary={state.summary}
          rows={state.rows}
          undoing={undoing}
          onUndo={handleUndo}
          onDone={onExit}
          onImportMore={engine.reset}
        />
      ) : (
        <>
          <ImportDropZone
            variant={state.rows.length === 0 ? 'full' : 'compact'}
            onFiles={engine.addFromFileList}
            onDataTransfer={engine.addFromDataTransfer}
          />

          {notices.length > 0 ? (
            <ul className="proto-import-notices">
              {notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          ) : null}

          {engine.fatalError ? (
            <p className="proto-settings-status proto-settings-status--error">{engine.fatalError}</p>
          ) : null}

          {state.rows.length > 0 ? (
            <section className="proto-import-list">
              <div className="proto-import-list__toolbar">
                <span className="pds-caption">
                  {phase === 'importing' || phase === 'paused'
                    ? `${counts.settledItems} of ${counts.totalItems} notes`
                    : `${state.rows.length} file${state.rows.length === 1 ? '' : 's'} · ${readyItemCount} note${
                        readyItemCount === 1 ? '' : 's'
                      } ready`}
                </span>
                {phase === 'review' || phase === 'adding' ? (
                  <button
                    type="button"
                    className="proto-settings-btn proto-settings-btn--secondary"
                    onClick={() => engine.setAllIncluded(!allIncluded)}
                  >
                    {allIncluded ? 'Select none' : 'Select all'}
                  </button>
                ) : null}
              </div>

              {doneRows.length > 0 && phase !== 'importing' && phase !== 'paused' ? (
                <p className="proto-import-list__receipt">
                  {doneRows.length} file{doneRows.length === 1 ? '' : 's'} already imported.
                </p>
              ) : null}

              {rateLimitWait > 0 ? (
                <p className="proto-import-list__wait" role="status">
                  Catching our breath — picking back up in {rateLimitWait}s.
                </p>
              ) : null}

              <ul className="proto-import-list__rows">
                {visibleRows.map((row) => (
                  <ImportFileRow
                    key={row.id}
                    row={row}
                    items={itemsByRow.get(row.id) ?? []}
                    onToggleInclude={engine.toggleInclude}
                    onRemove={engine.removeRow}
                    onRetry={engine.retryRow}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {!state.finalized && state.rows.length > 0 ? (
        <footer className="proto-import-footer">
          {phase === 'importing' ? (
            <>
              <div className="proto-import-footer__progress">
                <ProtoProgressBar
                  value={counts.totalItems > 0 ? counts.settledItems / counts.totalItems : 0}
                />
                <span className="pds-caption">{RUNNING_LINES[lineIndex]}</span>
              </div>
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={engine.pause}>
                Stop
              </button>
            </>
          ) : phase === 'paused' ? (
            <>
              <span className="pds-caption">
                Paused — {counts.settledItems} of {counts.totalItems} notes done.
              </span>
              <button type="button" className="proto-settings-btn" onClick={engine.resume}>
                Continue
              </button>
            </>
          ) : (
            <>
              <span className="pds-caption">
                {counts.filesPending > 0
                  ? `Reading ${counts.filesPending} file${counts.filesPending === 1 ? '' : 's'}…`
                  : `${readyItemCount} note${readyItemCount === 1 ? '' : 's'} ready to import`}
              </span>
              <div className="proto-import-footer__actions">
                <button
                  type="button"
                  className="proto-settings-btn proto-settings-btn--secondary"
                  onClick={engine.reset}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="proto-settings-btn"
                  disabled={readyItemCount === 0}
                  onClick={engine.startImport}
                >
                  Import {readyItemCount > 0 ? `${readyItemCount} note${readyItemCount === 1 ? '' : 's'}` : ''}
                </button>
              </div>
            </>
          )}
        </footer>
      ) : null}
    </div>
  );
}

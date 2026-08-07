/**
 * Fixture previews for the import design gallery.
 *
 * These render the real components with hand-built engine state, so what you see is
 * what the surface does — edit ImportFileRow, ImportDropZone, ImportSummaryCard, or
 * the CSS and the preview reloads.
 */
import ImportDropZone from '../../prototype/import/ImportDropZone';
import ImportFileRow from '../../prototype/import/ImportFileRow';
import ImportSummaryCard from '../../prototype/import/ImportSummaryCard';
import ProtoProgressBar from '../../prototype/import/ProtoProgressBar';
import type {
  ImportEngineState,
  ImportItemState,
  ImportRowState,
  RowPhase,
} from '../../prototype/import/import-engine-state';
import type { ImportDesignScene } from './sceneRegistry';

const noop = () => {};

let rowSeq = 0;
function row(overrides: Partial<ImportRowState> & { name: string }): ImportRowState {
  rowSeq += 1;
  return {
    id: `row_${rowSeq}`,
    size: 4_200,
    extension: overrides.name.split('.').pop() ?? 'md',
    folderPath: null,
    path: overrides.name,
    fromArchive: null,
    phase: 'parsed',
    progress: 0,
    subLabel: null,
    included: true,
    itemIds: [],
    error: null,
    attempts: 0,
    ...overrides,
  };
}

let itemSeq = 0;
function item(rowId: string, overrides: Partial<ImportItemState> = {}): ImportItemState {
  itemSeq += 1;
  return {
    itemId: `item_${itemSeq}`,
    rowId,
    title: 'Untitled note',
    primaryCollection: null,
    highlightCount: 0,
    tagCount: 0,
    duplicateHint: null,
    status: 'parsed',
    noteId: null,
    error: null,
    ...overrides,
  };
}

/** The page frame, so scenes sit in the same column the real surface uses. */
function ImportChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="proto-theme">
      {/* Mirrors the settings pane import actually lives in — SettingsShell's `wide`
          column — so scenes are measured at the width they'll really have.
          Padding-bottom keeps the sticky footer clear of the last row. */}
      <div
        className="proto-import-workspace"
        style={{ maxWidth: 640, width: '100%', margin: '0 auto', padding: '24px 20px 72px' }}
      >
        {children}
      </div>
    </div>
  );
}

function RowList({ rows, items }: { rows: ImportRowState[]; items: ImportItemState[] }) {
  return (
    <ul className="proto-import-list__rows">
      {rows.map((r) => (
        <ImportFileRow
          key={r.id}
          row={r}
          items={items.filter((i) => i.rowId === r.id)}
          onToggleInclude={noop}
          onRemove={noop}
          onRetry={noop}
        />
      ))}
    </ul>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <footer className="proto-import-footer">{children}</footer>;
}

function reviewScene(rows: ImportRowState[], items: ImportItemState[], readyCount: number) {
  return (
    <ImportChrome>
      <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
      <section className="proto-import-list">
        <div className="proto-import-list__toolbar">
          <span className="pds-caption">
            {rows.length} files · {readyCount} notes ready
          </span>
          <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
            Select none
          </button>
        </div>
        <RowList rows={rows} items={items} />
      </section>
      <Footer>
        <span className="pds-caption">{readyCount} notes ready to import</span>
        <div className="proto-import-footer__actions">
          <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
            Clear
          </button>
          <button type="button" className="proto-settings-btn">
            Import {readyCount} notes
          </button>
        </div>
      </Footer>
    </ImportChrome>
  );
}

const SUMMARY_BASE: NonNullable<ImportEngineState['summary']> = {
  notesImported: 0,
  duplicatesSkipped: 0,
  highlightsImported: 0,
  connectionsImported: 0,
  scriptureProcessed: 0,
  autoTagsApplied: 0,
};

export default function ImportDesignScenePreview({ scene }: { scene: ImportDesignScene }) {
  switch (scene.id) {
    case '01-empty':
      return (
        <ImportChrome>
          <ImportDropZone variant="full" onFiles={noop} onDataTransfer={noop} />
        </ImportChrome>
      );

    case '02-drag-over':
      return (
        <ImportChrome>
          <ImportDropZone variant="full" onFiles={noop} onDataTransfer={noop} previewActive />
        </ImportChrome>
      );

    case '03-compact-strip':
      return (
        <ImportChrome>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
          <ul className="proto-import-notices">
            <li>Skipped 4 files in a format we can&rsquo;t read yet.</li>
            <li>Evernote export.zip: skipped 2 files we can&rsquo;t read.</li>
          </ul>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} previewActive />
        </ImportChrome>
      );

    case '04-uploading': {
      const rows = [
        row({ name: 'romans-8-study.md', phase: 'uploading', progress: 0.34, size: 12_400 }),
        row({ name: 'sermon-archive.docx', phase: 'uploading', progress: 0.82, size: 2_900_000 }),
        row({ name: 'evernote-export.enex', phase: 'parsing', progress: 1, subLabel: 'Reading…', size: 8_400_000 }),
        row({ name: 'psalms-notes.md', phase: 'queued', size: 3_100 }),
        row({ name: 'colossians.md', phase: 'queued', size: 5_600 }),
      ];
      return (
        <ImportChrome>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
          <section className="proto-import-list">
            <div className="proto-import-list__toolbar">
              <span className="pds-caption">5 files · 0 notes ready</span>
            </div>
            <RowList rows={rows} items={[]} />
          </section>
          <Footer>
            <span className="pds-caption">Reading 3 files…</span>
            <div className="proto-import-footer__actions">
              <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
                Clear
              </button>
              <button type="button" className="proto-settings-btn" disabled>
                Import
              </button>
            </div>
          </Footer>
        </ImportChrome>
      );
    }

    case '05-review': {
      const single = row({ name: 'romans-8-study.md', itemIds: ['a'] });
      const notebook = row({ name: 'evernote-notebook.enex', size: 6_100_000, itemIds: ['b'] });
      const zipped = row({
        name: 'philippians.md',
        fromArchive: 'harvous-backup.zip',
        path: 'harvous-backup.zip/Pauline Epistles/philippians.md',
        folderPath: 'Pauline Epistles',
        itemIds: ['c'],
      });
      const csv = row({ name: 'study-log.csv', size: 41_000, itemIds: ['d'] });

      const items = [
        item(single.id, { title: 'Romans 8 study', primaryCollection: 'Romans', highlightCount: 4 }),
        ...Array.from({ length: 34 }, () =>
          item(notebook.id, { title: 'Evernote note', primaryCollection: 'Unsorted' }),
        ),
        ...Array.from({ length: 3 }, () =>
          item(zipped.id, { title: 'Philippians', primaryCollection: 'Pauline Epistles', highlightCount: 2 }),
        ),
        ...Array.from({ length: 12 }, (_, i) =>
          item(csv.id, {
            title: 'Study log row',
            primaryCollection: 'Study log',
            duplicateHint: i < 2 ? 'id' : null,
          }),
        ),
      ];
      const rows = [single, notebook, zipped, csv].map((r) => ({
        ...r,
        itemIds: items.filter((i) => i.rowId === r.id).map((i) => i.itemId),
      }));
      return reviewScene(rows, items, items.length);
    }

    case '06-review-mixed': {
      const good = row({ name: 'ephesians.md', itemIds: ['x'] });
      const excluded = row({ name: 'grocery-list.md', included: false, itemIds: ['y'] });
      const unsupported = row({ name: 'scan.heic', phase: 'unsupported', error: 'Nothing we could read in this file' });
      const failed = row({
        name: 'corrupt-notes.docx',
        phase: 'parse-failed',
        error: 'Upload failed (413) — larger than the 25MB limit',
        size: 41_000_000,
      });
      const items = [
        item(good.id, { title: 'Ephesians 2', primaryCollection: 'Ephesians', highlightCount: 3 }),
        item(excluded.id, { title: 'Grocery list', status: 'excluded' }),
      ];
      const rows = [good, excluded, unsupported, failed].map((r) => ({
        ...r,
        itemIds: items.filter((i) => i.rowId === r.id).map((i) => i.itemId),
      }));
      return reviewScene(rows, items, 1);
    }

    case '07-importing': {
      const rows = [
        row({ name: 'romans-8-study.md', phase: 'enriching', progress: 0.86, subLabel: 'Linking scripture…' }),
        row({ name: 'evernote-notebook.enex', phase: 'committing', progress: 0.31, subLabel: 'Creating 14 of 34…' }),
        row({ name: 'philippians.md', phase: 'done', progress: 1, fromArchive: 'harvous-backup.zip' }),
        row({ name: 'study-log.csv', phase: 'commit-queued', progress: 0, subLabel: 'Creating note…' }),
      ];
      return (
        <ImportChrome>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
          <section className="proto-import-list">
            <div className="proto-import-list__toolbar">
              <span className="pds-caption">19 of 50 notes</span>
            </div>
            <RowList rows={rows} items={[]} />
          </section>
          <Footer>
            <div className="proto-import-footer__progress">
              <ProtoProgressBar value={19 / 50} />
              <span className="pds-caption">Finding scripture references…</span>
            </div>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
              Stop
            </button>
          </Footer>
        </ImportChrome>
      );
    }

    case '08-importing-large': {
      const phases: RowPhase[] = ['done', 'done', 'done', 'done', 'duplicate', 'done', 'enriching', 'committing'];
      const rows = Array.from({ length: 22 }, (_, i) => {
        const phase = i < 8 ? phases[i] : i < 10 ? 'committing' : 'commit-queued';
        return row({
          name: `study-note-${String(i + 1).padStart(2, '0')}.md`,
          phase,
          progress: phase === 'done' || phase === 'duplicate' ? 1 : phase === 'enriching' ? 0.88 : phase === 'committing' ? 0.4 : 0,
          subLabel: phase === 'enriching' ? 'Linking scripture…' : phase === 'committing' ? 'Creating note…' : null,
          folderPath: i % 3 === 0 ? 'Sermons/2026' : null,
        });
      });
      return (
        <ImportChrome>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
          <section className="proto-import-list">
            <div className="proto-import-list__toolbar">
              <span className="pds-caption">9 of 22 notes</span>
            </div>
            <RowList rows={rows} items={[]} />
          </section>
          <Footer>
            <div className="proto-import-footer__progress">
              <ProtoProgressBar value={9 / 22} />
              <span className="pds-caption">Keeping your folders as you had them…</span>
            </div>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
              Stop
            </button>
          </Footer>
        </ImportChrome>
      );
    }

    case '09-rate-limited': {
      const rows = [
        row({ name: 'romans-8-study.md', phase: 'done', progress: 1 }),
        row({ name: 'psalms-notes.md', phase: 'done', progress: 1 }),
        row({ name: 'evernote-notebook.enex', phase: 'commit-queued', progress: 0.45, subLabel: 'Creating 51 of 120…' }),
      ];
      return (
        <ImportChrome>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
          <section className="proto-import-list">
            <div className="proto-import-list__toolbar">
              <span className="pds-caption">53 of 122 notes</span>
            </div>
            <p className="proto-import-list__wait" role="status">
              Catching our breath — picking back up in 24s.
            </p>
            <RowList rows={rows} items={[]} />
          </section>
          <Footer>
            <div className="proto-import-footer__progress">
              <ProtoProgressBar value={53 / 122} />
              <span className="pds-caption">Almost there…</span>
            </div>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
              Stop
            </button>
          </Footer>
        </ImportChrome>
      );
    }

    case '10-paused': {
      const rows = [
        row({ name: 'romans-8-study.md', phase: 'done', progress: 1 }),
        row({ name: 'psalms-notes.md', phase: 'done', progress: 1 }),
        row({ name: 'evernote-notebook.enex', phase: 'parsed', itemIds: ['a'] }),
        row({ name: 'study-log.csv', phase: 'parsed', itemIds: ['b'] }),
      ];
      const items = [
        ...Array.from({ length: 60 }, () => item(rows[2].id, { title: 'Evernote note' })),
        ...Array.from({ length: 9 }, () => item(rows[3].id, { title: 'Study log row' })),
      ];
      return (
        <ImportChrome>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
          <section className="proto-import-list">
            <div className="proto-import-list__toolbar">
              <span className="pds-caption">2 of 71 notes</span>
            </div>
            <RowList rows={rows} items={items} />
          </section>
          <Footer>
            <span className="pds-caption">Paused — 2 of 71 notes done.</span>
            <button type="button" className="proto-settings-btn">
              Continue
            </button>
          </Footer>
        </ImportChrome>
      );
    }

    case '11-failures': {
      const partial = row({
        name: 'evernote-notebook.enex',
        phase: 'done',
        progress: 1,
        subLabel: "3 of 34 didn't import",
        itemIds: ['a'],
      });
      const failed = row({
        name: 'sermon-archive.docx',
        phase: 'failed',
        progress: 1,
        error: 'Note could not be created — the file had no readable text',
      });
      const dup = row({ name: 'philippians.md', phase: 'duplicate', progress: 1, fromArchive: 'harvous-backup.zip' });
      const ok = row({ name: 'romans-8-study.md', phase: 'done', progress: 1 });
      const items = [
        ...Array.from({ length: 31 }, () => item(partial.id, { status: 'enriched' })),
        ...Array.from({ length: 3 }, () => item(partial.id, { status: 'failed', error: 'Title was empty' })),
      ];
      return (
        <ImportChrome>
          <ImportDropZone variant="compact" onFiles={noop} onDataTransfer={noop} />
          <section className="proto-import-list">
            <div className="proto-import-list__toolbar">
              <span className="pds-caption">32 of 36 notes</span>
            </div>
            <RowList rows={[partial, failed, dup, ok]} items={items} />
          </section>
          <Footer>
            <div className="proto-import-footer__progress">
              <ProtoProgressBar value={1} />
              <span className="pds-caption">Almost there…</span>
            </div>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary">
              Stop
            </button>
          </Footer>
        </ImportChrome>
      );
    }

    case '12-summary':
      return (
        <ImportChrome>
          <ImportSummaryCard
            summary={{
              ...SUMMARY_BASE,
              notesImported: 128,
              highlightsImported: 342,
              scriptureProcessed: 219,
              autoTagsApplied: 96,
              connectionsImported: 41,
            }}
            rows={[]}
            undoing={false}
            onUndo={noop}
            onDone={noop}
            onImportMore={noop}
          />
        </ImportChrome>
      );

    case '13-summary-issues':
      return (
        <ImportChrome>
          <ImportSummaryCard
            summary={{
              ...SUMMARY_BASE,
              notesImported: 32,
              highlightsImported: 14,
              scriptureProcessed: 27,
              autoTagsApplied: 19,
              duplicatesSkipped: 6,
            }}
            rows={[
              row({
                name: 'sermon-archive.docx',
                phase: 'failed',
                error: 'Note could not be created — the file had no readable text',
              }),
              row({
                name: 'corrupt-notes.docx',
                phase: 'parse-failed',
                error: 'Upload failed (413) — larger than the 25MB limit',
              }),
              row({ name: 'philippians.md', phase: 'duplicate' }),
              row({ name: 'colossians.md', phase: 'duplicate' }),
            ]}
            undoing={false}
            onUndo={noop}
            onDone={noop}
            onImportMore={noop}
          />
        </ImportChrome>
      );

    case '14-summary-nothing':
      return (
        <ImportChrome>
          <ImportSummaryCard
            summary={{ ...SUMMARY_BASE, duplicatesSkipped: 128 }}
            rows={Array.from({ length: 4 }, (_, i) =>
              row({ name: `note-${i + 1}.md`, phase: 'duplicate' }),
            )}
            undoing={false}
            onUndo={noop}
            onDone={noop}
            onImportMore={noop}
          />
        </ImportChrome>
      );

    case '15-progress-bar':
      return (
        <div className="proto-theme" style={{ maxWidth: 460, margin: '0 auto', padding: 24, display: 'grid', gap: 20 }}>
          {[
            { caption: 'Determinate, 0%', props: { value: 0 } },
            { caption: 'Determinate, 37% with percent', props: { value: 0.37, showPercent: true } },
            { caption: 'Determinate, 75% mid-phase', props: { value: 0.75, showPercent: true, label: 'Linking scripture…' } },
            { caption: 'Complete', props: { value: 1, showPercent: true } },
            { caption: 'Indeterminate', props: { indeterminate: true, label: 'Reading…' } },
            { caption: 'Just started (1%)', props: { value: 0.01, showPercent: true } },
            { caption: 'Nearly done (99%)', props: { value: 0.99, showPercent: true } },
          ].map(({ caption, props }) => (
            <div key={caption} style={{ display: 'grid', gap: 6 }}>
              <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>
                {caption}
              </span>
              <ProtoProgressBar {...props} />
            </div>
          ))}
        </div>
      );

    case '16-row-phases': {
      const specs: Array<{ phase: RowPhase; name: string; extra?: Partial<ImportRowState> }> = [
        { phase: 'queued', name: 'queued.md' },
        { phase: 'uploading', name: 'uploading.docx', extra: { progress: 0.62, size: 2_400_000 } },
        { phase: 'parsing', name: 'parsing.enex', extra: { progress: 1, subLabel: 'Reading…' } },
        { phase: 'parsed', name: 'parsed.md', extra: { itemIds: ['p'] } },
        { phase: 'parsed', name: 'excluded.md', extra: { itemIds: ['e'], included: false } },
        { phase: 'unsupported', name: 'photo.heic', extra: { error: 'Nothing we could read in this file' } },
        { phase: 'parse-failed', name: 'broken.docx', extra: { error: 'Upload failed (500)' } },
        { phase: 'commit-queued', name: 'waiting.md', extra: { subLabel: 'Creating note…' } },
        { phase: 'committing', name: 'importing.csv', extra: { progress: 0.38, subLabel: 'Creating 5 of 12…' } },
        { phase: 'enriching', name: 'linking.md', extra: { progress: 0.9, subLabel: 'Linking scripture…' } },
        { phase: 'done', name: 'done.md', extra: { progress: 1 } },
        { phase: 'done', name: 'partly-done.enex', extra: { progress: 1, subLabel: "2 of 5 didn't import" } },
        { phase: 'duplicate', name: 'already-here.md', extra: { progress: 1 } },
        { phase: 'failed', name: 'failed.md', extra: { progress: 1, error: 'Note could not be created' } },
      ];
      const rows = specs.map(({ phase, name, extra }) => row({ name, phase, ...extra }));
      const items = [
        item(rows[3].id, { title: 'A parsed note', primaryCollection: 'Romans', highlightCount: 3 }),
        item(rows[4].id, { title: 'An excluded note', status: 'excluded' }),
        // partly-done.enex needs real failed items, not just a subLabel: the chip
        // counts item statuses (as the reducer does), so without these the row
        // claimed a completed tick while its own sub-line said otherwise.
        ...Array.from({ length: 3 }, (_, i) =>
          item(rows[11].id, { title: `Landed ${i + 1}`, status: 'committed' }),
        ),
        ...Array.from({ length: 2 }, (_, i) =>
          item(rows[11].id, { title: `Lost ${i + 1}`, status: 'failed' }),
        ),
      ];
      return (
        <div className="proto-theme" style={{ maxWidth: 680, margin: '0 auto', padding: 24 }}>
          <RowList rows={rows} items={items} />
        </div>
      );
    }

    default:
      return <p className="pds-caption">Unknown scene.</p>;
  }
}

/**
 * One row per dropped file: what it is, what it will become, and where it got to.
 *
 * The row is an object, not a log line — while it's waiting it says what will be
 * created, while it's working it shows a real bar, and when something goes wrong the
 * fix lives on the row itself rather than in a banner somewhere else.
 */
import Icon from '@/components/react/Icon';
import ProtoProgressBar from './ProtoProgressBar';
import { formatFileSize } from './import-file-sources';
import type { ImportItemState, ImportRowState } from './import-engine-state';

export interface ImportFileRowProps {
  row: ImportRowState;
  items: ImportItemState[];
  onToggleInclude: (rowId: string, included: boolean) => void;
  onRemove: (rowId: string) => void;
  onRetry: (rowId: string) => void;
}

/**
 * Every chip is the same neutral grey; only a finished file earns the tick.
 *
 * Colour-coding all five states turned a list of forty files into a traffic-light
 * board where nothing stood out because everything was shouting. Failures don't
 * need the chip to carry them — the row already shows its error in red and a
 * Try again button next to it.
 */
interface StatusChip {
  label: string;
  done?: boolean;
}

function statusChipFor(row: ImportRowState, items: ImportItemState[]): StatusChip | null {
  switch (row.phase) {
    case 'queued':
      return { label: 'Queued' };
    case 'uploading':
      return { label: 'Uploading' };
    case 'parsing':
      return { label: 'Reading' };
    case 'unsupported':
      return { label: 'Nothing to import' };
    case 'parse-failed':
      return { label: "Couldn't read" };
    case 'commit-queued':
      return { label: 'Waiting' };
    case 'committing':
      return { label: 'Importing' };
    case 'enriching':
      return { label: 'Linking' };
    case 'duplicate':
      return { label: 'Already here' };
    case 'failed':
      return { label: 'Failed' };
    case 'done': {
      const failed = items.filter((item) => item.status === 'failed').length;
      // A partial run isn't done, so it doesn't get the tick.
      return failed > 0
        ? { label: `${items.length - failed} of ${items.length}` }
        : { label: 'Imported', done: true };
    }
    case 'parsed':
    default:
      return null;
  }
}

/** What this file will turn into, once we know. */
function previewLine(row: ImportRowState, items: ImportItemState[]): string | null {
  if (row.phase !== 'parsed' || items.length === 0) return null;
  const active = items.filter((item) => item.status !== 'excluded');
  const source = active.length > 0 ? active : items;
  const highlights = source.reduce((sum, item) => sum + item.highlightCount, 0);
  const folder = source[0]?.primaryCollection || 'Unsorted';
  const duplicates = source.filter((item) => item.duplicateHint).length;

  const parts = [
    source.length === 1 ? source[0].title : `${source.length} notes`,
    highlights > 0 ? `${highlights} highlight${highlights === 1 ? '' : 's'}` : null,
    `→ ${folder}`,
    duplicates > 0 ? `${duplicates} already in your library` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function ImportFileRow({
  row,
  items,
  onToggleInclude,
  onRemove,
  onRetry,
}: ImportFileRowProps) {
  const chip = statusChipFor(row, items);
  const preview = previewLine(row, items);
  const showBar = row.phase === 'uploading' || row.phase === 'parsing';
  const showImportBar = row.phase === 'commit-queued' || row.phase === 'committing' || row.phase === 'enriching';
  const isTerminal = row.phase === 'done' || row.phase === 'duplicate' || row.phase === 'failed';
  const canToggle = row.phase === 'parsed';

  return (
    <li
      className={`proto-import-row proto-import-row--${row.phase}${
        row.included ? '' : ' proto-import-row--excluded'
      }`}
      data-testid="import-file-row"
    >
      <span className="proto-import-row__type" aria-hidden>
        {row.extension || 'file'}
      </span>

      <div className="proto-import-row__body">
        <div className="proto-import-row__heading">
          <span className="proto-import-row__name" title={row.path}>
            {row.name}
          </span>
          <span className="proto-import-row__size">{formatFileSize(row.size)}</span>
        </div>

        {row.fromArchive ? (
          <span className="proto-import-row__meta">from {row.fromArchive}</span>
        ) : row.folderPath ? (
          <span className="proto-import-row__meta">{row.folderPath}</span>
        ) : null}

        {preview ? <span className="proto-import-row__preview">{preview}</span> : null}

        {showBar ? (
          <ProtoProgressBar
            value={row.progress}
            indeterminate={row.phase === 'parsing'}
            label={row.phase === 'parsing' ? 'Reading…' : null}
          />
        ) : null}

        {showImportBar ? (
          <ProtoProgressBar value={row.progress} showPercent label={row.subLabel} />
        ) : null}

        {row.error ? <span className="proto-import-row__error">{row.error}</span> : null}
        {isTerminal && row.subLabel ? (
          <span className="proto-import-row__meta">{row.subLabel}</span>
        ) : null}
      </div>

      <div className="proto-import-row__trailing">
        {chip ? (
          <span className="proto-import-row__chip">
            {chip.done ? (
              <Icon name="check" size={10} className="proto-import-row__chip-check" aria-hidden />
            ) : null}
            {chip.label}
          </span>
        ) : null}

        {canToggle ? (
          <label className="proto-import-row__include">
            <input
              type="checkbox"
              checked={row.included}
              onChange={(e) => onToggleInclude(row.id, e.target.checked)}
            />
            <span className="pds-caption">Import</span>
          </label>
        ) : null}

        {/* An icon button the same weight as the × beside it. A filled pill here
            outranked the row's own error text, and every failed row in a long list
            was shouting a label the chip already carries. */}
        {row.phase === 'parse-failed' ? (
          <button
            type="button"
            className="proto-import-row__icon-btn"
            onClick={() => onRetry(row.id)}
            aria-label={`Try importing ${row.name} again`}
            title="Try again"
          >
            <Icon name="arrow-rotate-right" size={13} aria-hidden />
          </button>
        ) : null}

        {row.phase === 'parsed' || row.phase === 'parse-failed' || row.phase === 'unsupported' ? (
          <button
            type="button"
            className="proto-import-row__icon-btn"
            onClick={() => onRemove(row.id)}
            aria-label={`Remove ${row.name}`}
          >
            <Icon name="xmark" size={13} aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}

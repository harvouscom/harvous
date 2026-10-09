/**
 * One row per dropped file: what it is, what it will become, and where it got to.
 *
 * The row is an object, not a log line — while it's waiting it says what will be
 * created, while it's working it shows a real bar, and when something goes wrong the
 * fix lives on the row itself rather than in a banner somewhere else.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import ImportItemPreview from './ImportItemPreview';
import ProtoProgressBar from './ProtoProgressBar';
import { formatFileSize } from './import-file-sources';
import type { ImportItemState, ImportRowState } from './import-engine-state';
import type { ImportItemPreview as ImportItemPreviewData } from './import-session-api';
import '../../../styles/prototype-import-inspect.css';

export interface ImportFileRowProps {
  row: ImportRowState;
  items: ImportItemState[];
  onToggleInclude: (rowId: string, included: boolean) => void;
  /** One note inside a many-note file. */
  onToggleItemInclude: (itemId: string, included: boolean) => void;
  loadPreview: (itemId: string) => Promise<ImportItemPreviewData>;
  onRemove: (rowId: string) => void;
  onRetry: (rowId: string) => void;
  /** Gallery fixtures only — open on first render instead of waiting for a click. */
  initiallyExpanded?: boolean;
  initiallyOpenItemId?: string | null;
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

  const count =
    items.length > 1 && active.length > 0 && active.length < items.length
      ? `${active.length} of ${items.length} notes`
      : `${source.length} notes`;

  const parts = [
    source.length === 1 && items.length === 1 ? source[0].title : count,
    highlights > 0 ? `${highlights} highlight${highlights === 1 ? '' : 's'}` : null,
    `→ ${folder}`,
    duplicates > 0 ? `${duplicates} already in your library` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** The notes inside a many-note file, each one skippable and each one readable. */
function ImportRowItems({
  items,
  onToggleItemInclude,
  loadPreview,
  initiallyOpenItemId = null,
}: Pick<ImportFileRowProps, 'items' | 'onToggleItemInclude' | 'loadPreview' | 'initiallyOpenItemId'>) {
  const [openItemId, setOpenItemId] = useState<string | null>(initiallyOpenItemId);
  return (
    <ul className="proto-import-row__items">
      {items.map((item) => {
        const included = item.status !== 'excluded';
        const open = openItemId === item.itemId;
        return (
          <li
            key={item.itemId}
            className={`proto-import-row__item${included ? '' : ' proto-import-row__item--excluded'}`}
          >
            <div className="proto-import-row__item-line">
              <input
                type="checkbox"
                checked={included}
                onChange={(e) => onToggleItemInclude(item.itemId, e.target.checked)}
                aria-label={`Import ${item.title}`}
              />
              <button
                type="button"
                className="proto-import-row__item-toggle"
                aria-expanded={open}
                onClick={() => setOpenItemId(open ? null : item.itemId)}
              >
                <Icon
                  name="chevron-down"
                  size={10}
                  className={`proto-import-row__chevron${open ? ' proto-import-row__chevron--open' : ''}`}
                  aria-hidden
                />
                <span className="proto-import-row__item-title">{item.title}</span>
              </button>
              <span className="proto-import-row__item-meta">
                {[
                  item.highlightCount > 0
                    ? `${item.highlightCount} highlight${item.highlightCount === 1 ? '' : 's'}`
                    : null,
                  item.duplicateHint ? 'Already here' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {open ? <ImportItemPreview itemId={item.itemId} loadPreview={loadPreview} showTitle={false} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function ImportFileRow({
  row,
  items,
  onToggleInclude,
  onToggleItemInclude,
  loadPreview,
  onRemove,
  onRetry,
  initiallyExpanded = false,
  initiallyOpenItemId = null,
}: ImportFileRowProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const chip = statusChipFor(row, items);
  const preview = previewLine(row, items);
  const showBar = row.phase === 'uploading' || row.phase === 'parsing';
  const showImportBar = row.phase === 'commit-queued' || row.phase === 'committing' || row.phase === 'enriching';
  const isTerminal = row.phase === 'done' || row.phase === 'duplicate' || row.phase === 'failed';
  const canToggle = row.phase === 'parsed';
  // Once a file is on its way in the row is progress, not a choice.
  const canInspect = row.phase === 'parsed' && items.length > 0;
  const isOpen = expanded && canInspect;
  const excludedCount = items.filter((item) => item.status === 'excluded').length;
  const partial = row.included && excludedCount > 0;

  const includeRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (includeRef.current) includeRef.current.indeterminate = partial;
  }, [partial]);

  return (
    <li
      className={`proto-import-row proto-import-row--${row.phase}${
        row.included ? '' : ' proto-import-row--excluded'
      }${isOpen ? ' proto-import-row--open' : ''}`}
      data-testid="import-file-row"
    >
      <span className="proto-import-row__type" aria-hidden>
        {row.extension || 'file'}
      </span>

      <div className="proto-import-row__body">
        <div className="proto-import-row__heading">
          {canInspect ? (
            <button
              type="button"
              className="proto-import-row__disclosure"
              aria-expanded={isOpen}
              onClick={() => setExpanded((open) => !open)}
              title={isOpen ? 'Hide contents' : 'Show what’s inside'}
            >
              <Icon
                name="chevron-down"
                size={11}
                className={`proto-import-row__chevron${isOpen ? ' proto-import-row__chevron--open' : ''}`}
                aria-hidden
              />
              <span className="proto-import-row__name" title={row.path}>
                {row.name}
              </span>
            </button>
          ) : (
            <span className="proto-import-row__name" title={row.path}>
              {row.name}
            </span>
          )}
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
              ref={includeRef}
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

      {isOpen ? (
        <div className="proto-import-row__inspect">
          {items.length === 1 ? (
            <ImportItemPreview itemId={items[0].itemId} loadPreview={loadPreview} />
          ) : (
            <ImportRowItems
              items={items}
              onToggleItemInclude={onToggleItemInclude}
              loadPreview={loadPreview}
              initiallyOpenItemId={initiallyOpenItemId}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}

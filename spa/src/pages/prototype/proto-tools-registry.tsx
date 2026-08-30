/**
 * The Tools card — one row shape, shared by the church hub and Shared Spaces.
 *
 * The rows were six near-identical JSX blocks in PrototypeChurchHub,
 * which meant a second surface wanting the same card had to copy the chrome and
 * then drift from it. Rows are data now; the markup lives here once.
 *
 * Gating deliberately stays at the call site. The church gates are a mix of
 * capability checks, an admin check and a derived staff boolean, each carrying
 * the reasoning for *why* that gate and not the neighbouring one — a gate
 * vocabulary in this file would have to flatten those into a shared language
 * that does not exist, and the comments would be stranded from the rows they
 * explain. Callers build the array; this renders it.
 */
import Icon, { type IconName } from '@/components/react/Icon';
import type { ReactNode } from 'react';

export type ProtoToolRow = {
  /** Stable across renders and surfaces — also the test handle. */
  key: string;
  icon: IconName;
  title: string;
  /** Short: the sidebar's meta column is ~175px before it marquees. */
  meta: string;
  /**
   * 'caret-right' steps into a pane in place; 'expand' leaves the sidebar for
   * the expanded surface. Two different promises, so they get two glyphs.
   */
  chevron?: 'caret-right' | 'expand';
  onSelect: () => void;
};

export function ProtoToolsRowList({
  rows,
  children,
}: {
  rows: ProtoToolRow[];
  /** Non-row card content — today the billing banner, silent when healthy. */
  children?: ReactNode;
}) {
  return (
    <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className="proto-church-tools__row"
          data-tool-row={row.key}
          onClick={row.onSelect}
        >
          <span className="proto-church-tools__row-icon" aria-hidden>
            <Icon name={row.icon} size={13} />
          </span>
          <span className="proto-church-tools__row-text">
            <span className="pds-list-title proto-church-tools__row-title">{row.title}</span>
            <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
              {row.meta}
            </span>
          </span>
          <span className="proto-church-tools__row-chevron" aria-hidden>
            <Icon
              name={
                row.chevron === 'expand'
                  ? 'up-right-and-down-left-from-center'
                  : 'caret-right'
              }
              size={11}
            />
          </span>
        </button>
      ))}
      {children}
    </div>
  );
}

export default ProtoToolsRowList;

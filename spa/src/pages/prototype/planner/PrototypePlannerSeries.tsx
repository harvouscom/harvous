/**
 * The plan by run — the planner's fourth view.
 *
 * Board is the plan by week, Calendar by date, List by group. This is by
 * *series*, which is a fourth way of looking at the same rows rather than a
 * different thing, so it belongs in the same switcher rather than in chrome
 * bolted above the others.
 *
 * It replaced a horizontal legend strip that sat over whichever view you were
 * in. That was wrong twice: it put chrome above the content on the one screen
 * whose whole point is the plan, and it invented a row style for information the
 * church hub's Series lane already renders. This is that lane, at full width —
 * same `proto-church-tools__row` chrome, same `ProtoServiceDateTile`, same
 * extents from `seriesRunsByServiceRows` — so the compact pane and the planner
 * cannot come to disagree about how long a run is.
 *
 * It is also the door to the series sheet, which is where colour, description,
 * and run length are edited. A door that is also a view is better than a door
 * that is only a door.
 */
import Icon from '@/components/react/Icon';
import type { SpaceCoverPickerColor } from '@/utils/space-cover';
import type {
  TeachingPlanSeries,
  TeachingPlanSermon,
} from '../../../hooks/queries/useChurchTeachingPlan';
import { formatSeriesRun, seriesRunsByServiceRows } from '../../../lib/church-services';
import { parseLocalDateInput } from '../../../lib/proto-date-picker';
import ProtoSpaceMenuIcon from '../ProtoSpaceMenuIcon';
import PrototypeListEmptyState from '../PrototypeListEmptyState';

/** "Aug 9" — for a one-week run, where `formatSeriesRun` returns null. */
function formatSeriesStart(iso: string): string | null {
  const d = parseLocalDateInput(iso);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
}

export default function PrototypePlannerSeries({
  series,
  services,
  accentFor,
  openSeriesId,
  canWrite,
  onOpen,
  onNewSeries,
}: {
  series: TeachingPlanSeries[];
  services: TeachingPlanSermon[];
  accentFor: (seriesId: string | null | undefined) => SpaceCoverPickerColor | null;
  openSeriesId: string | null;
  canWrite: boolean;
  onOpen: (series: TeachingPlanSeries) => void;
  onNewSeries: () => void;
}) {
  const runs = seriesRunsByServiceRows(services);

  /*
    Which titles this plan holds more than once. A run label is shown only where
    it disambiguates — a church with a single "Advent" should never meet the
    concept, and one with two should never be asked to tell them apart by date
    alone.
  */
  const repeatedTitles = new Set(
    series
      .map((entry) => entry.title.trim().toLowerCase())
      .filter((title, i, all) => all.indexOf(title) !== i),
  );

  if (series.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="layer-group"
        title="No series yet"
        description={
          canWrite
            ? 'Start one here, or name a series on a sermon and its weeks collect under it.'
            : 'A series appears here once someone names one on a sermon.'
        }
        action={
          canWrite ? (
            <button
              type="button"
              className="proto-glass-surface proto-glass-surface--control proto-glass-action"
              onClick={onNewSeries}
            >
              <Icon name="plus" size={12} aria-hidden />
              <span className="proto-glass-action__label">New series</span>
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="proto-planner-list">
      {canWrite ? (
        <div className="proto-planner-series__actions">
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            onClick={onNewSeries}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">New series</span>
          </button>
        </div>
      ) : null}
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        {series.map((entry) => {
          const run = runs.get(entry.id);
          const span = run ? formatSeriesRun(run) : null;
          const toFill = run?.toFill ?? 0;
          return (
            <button
              key={entry.id}
              type="button"
              data-series-accent={accentFor(entry.id) ?? undefined}
              data-in-series="true"
              data-active={openSeriesId === entry.id ? 'true' : undefined}
              className="proto-church-tools__row proto-planner-list__row"
              onClick={() => onOpen(entry)}
            >
              {/*
                A face, not a date.

                Every other list in the app leads with the tile that says *what
                kind of thing this is* — a space, a channel, a member — and a
                series is a thing in exactly that sense, so it wears the same
                primitive. This view is scanned for "which studies do we have",
                which a face answers faster than a date; the run's own dates move
                into the meta line below, where they read as span rather than as
                identity.
              */}
              <ProtoSpaceMenuIcon
                color={accentFor(entry.id) ?? 'paper'}
                iconName="layer-group"
                size={30}
                radius={8}
              />
              <span className="proto-church-tools__row-text">
                <span
                  className="pds-list-title proto-church-tools__row-title proto-marquee"
                  title={entry.title}
                >
                  <span>
                    {entry.title}
                    {/* Only when this plan holds another run of the same name. */}
                    {entry.runLabel && repeatedTitles.has(entry.title.trim().toLowerCase()) ? (
                      <span className="proto-planner-series__run"> · {entry.runLabel}</span>
                    ) : null}
                  </span>
                </span>
                <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                  {/* The tile answers when it starts, the span how far it runs,
                      and the count how much is actually written. Each is
                      dropped when it would only repeat a neighbour. */}
                  {entry.serviceCount === 1 ? '1 week' : `${entry.serviceCount} weeks`}
                  {/* The span when there is one, the single date when the run is
                      one week long — `formatSeriesRun` returns null there, and
                      dropping the date entirely would lose the only "when" this
                      row has now that the tile no longer carries it. */}
                  {span
                    ? ` · ${span}`
                    : run?.first
                      ? ` · ${formatSeriesStart(run.first) ?? ''}`
                      : ''}
                  {toFill > 0 ? ` · ${toFill} to fill` : ''}
                  {entry.description ? ` · ${entry.description}` : ''}
                </span>
              </span>
              <span className="proto-church-tools__row-chevron" aria-hidden>
                <Icon name="caret-right" size={11} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

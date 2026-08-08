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
import ProtoServiceDateTile from '../ProtoServiceDateTile';
import PrototypeListEmptyState from '../PrototypeListEmptyState';

export default function PrototypePlannerSeries({
  series,
  services,
  accentFor,
  openSeriesId,
  onOpen,
}: {
  series: TeachingPlanSeries[];
  services: TeachingPlanSermon[];
  accentFor: (seriesId: string | null | undefined) => SpaceCoverPickerColor | null;
  openSeriesId: string | null;
  onOpen: (series: TeachingPlanSeries) => void;
}) {
  const runs = seriesRunsByServiceRows(services);

  if (series.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="layer-group"
        title="No series yet"
        /* Says how one comes into being, because there is no "create series"
           button anywhere and there deliberately never was: a series is born by
           naming it on a sermon. */
        description="Name a series on a sermon and its weeks collect here."
      />
    );
  }

  return (
    <div className="proto-planner-list">
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
              {/* The run's first date, in the tile every sermon row uses — so
                  the two lists share an edge and a rhythm. `unwritten` marks a
                  run with nothing written into it yet, the same hollow tile the
                  sermon rows use for a week with no passage. */}
              <ProtoServiceDateTile
                iso={run?.first || null}
                unwritten={toFill > 0 && toFill === entry.serviceCount}
              />
              <span className="proto-church-tools__row-text">
                <span
                  className="pds-list-title proto-church-tools__row-title proto-marquee"
                  title={entry.title}
                >
                  <span>{entry.title}</span>
                </span>
                <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                  {/* The tile answers when it starts, the span how far it runs,
                      and the count how much is actually written. Each is
                      dropped when it would only repeat a neighbour. */}
                  {entry.serviceCount === 1 ? '1 week' : `${entry.serviceCount} weeks`}
                  {span ? ` · ${span}` : ''}
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

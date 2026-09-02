/**
 * The plan as a list, with room to breathe — the compact pane's shape at full
 * width, and the view a keyboard reaches without a drag.
 *
 * Ideas first, then upcoming, then past. That order is not chronological by
 * accident: the top of this list is where a pastor's attention starts, and
 * undated ideas are the thing most likely to be forgotten.
 */
import { useMemo } from 'react';
import Icon from '@/components/react/Icon';
import type {
  ChurchServiceTimeOption,
  TeachingPlanSermon,
} from '../../../hooks/queries/useChurchTeachingPlan';
import type { SpaceCoverPickerColor } from '@/utils/space-cover';
import { localTodayIso, sermonTimeLabel } from '../../../lib/church-services';
import ProtoServiceDateTile from '../ProtoServiceDateTile';
import ProtoSeriesPill from './ProtoSeriesPill';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import type { PlannerSelection } from './PrototypeExpandedPlanner';

function Row({
  service,
  timeLabel,
  accent,
  selected,
  past,
  onSelect,
}: {
  service: TeachingPlanSermon;
  timeLabel: string | null;
  /** Tints the date tile only — the series is still named in the meta line. */
  accent: SpaceCoverPickerColor | null;
  selected: boolean;
  past?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-series-accent={accent ?? undefined}
      data-in-series={accent ? 'true' : undefined}
      className={[
        'proto-church-tools__row',
        'proto-planner-list__row',
        past ? 'proto-church-tools__row--past' : '',
        selected ? 'proto-planner-list__row--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
    >
      <ProtoServiceDateTile iso={service.serviceDate} unwritten={!service.reference} />
      <span className="proto-church-tools__row-text">
        <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={service.title}><span>{service.title}</span></span>
        <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
          {timeLabel ? `${timeLabel} · ` : ''}
          {service.reference || 'No passage yet'}
          {service.seriesTitle ? (
            <>
              {' · '}
              {/* The run's colour travels with its name, rather than tinting
                  the date tile beside it — the tile answers "when", and a
                  border doing "which run" made it answer two questions at
                  once in a colour the eye had to decode. */}
              <ProtoSeriesPill accent={accent} name={service.seriesTitle} compact />
            </>
          ) : null}
        </span>
      </span>
      <span className="proto-church-tools__row-chevron" aria-hidden>
        <Icon name="caret-right" size={11} />
      </span>
    </button>
  );
}

export default function PrototypePlannerList({
  services,
  serviceTimes,
  accentFor,
  canWrite,
  readOnlyMessage,
  itemNoun,
  emptyWritable,
  selection,
  onSelect,
}: {
  services: TeachingPlanSermon[];
  serviceTimes: ChurchServiceTimeOption[];
  /** Shared with the board and calendar so one run is one colour everywhere. */
  accentFor: (seriesId: string | null | undefined) => SpaceCoverPickerColor | null;
  canWrite: boolean;
  /** The resolved sentence, or null when the viewer may write. */
  readOnlyMessage: string | null;
  /** The plan's noun — sermon / gathering / entry. From `planVocabulary`. */
  itemNoun: string;
  /** Scope-aware empty copy — a channel does not "add a sermon". */
  emptyWritable?: string;
  selection: PlannerSelection;
  onSelect: (selection: PlannerSelection) => void;
}) {
  const today = localTodayIso();
  /* Three groups. A null date fails both `>= today` and `< today` in JS, so a
     two-way split would silently drop every idea. */
  const { backlog, upcoming, past } = useMemo(() => {
    const dated = services.filter((s) => s.serviceDate !== null);
    return {
      backlog: services.filter((s) => s.serviceDate === null),
      upcoming: dated.filter((s) => s.serviceDate! >= today),
      past: [...dated.filter((s) => s.serviceDate! < today)].reverse(),
    };
  }, [services, today]);

  const timeLabel = (service: TeachingPlanSermon) => sermonTimeLabel(service, serviceTimes);
  const isSelected = (service: TeachingPlanSermon) =>
    selection?.mode === 'edit' && selection.serviceId === service.id;

  const group = (label: string, rows: TeachingPlanSermon[], past?: boolean) =>
    rows.length === 0 ? null : (
      <>
        <p className="proto-caption proto-teaching-plan__divider">{label}</p>
        {rows.map((service) => (
          <Row
            key={service.id}
            service={service}
            timeLabel={timeLabel(service)}
            accent={accentFor(service.seriesId)}
            selected={isSelected(service)}
            past={past}
            onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
          />
        ))}
      </>
    );

  /*
    Returned above the `.proto-planner-list` wrapper, not inside it. That
    wrapper is a plain block, so an empty state nested in it would sit at the
    top with only its text centred; as a direct child of the column it fills
    the pane and centres in it.
  */
  if (services.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="calendar-week"
        title="Nothing planned yet"
        description={
          canWrite
            ? (emptyWritable ??
              `Plan a ${itemNoun}, or drop an idea in the board to come back to.`)
            : /* Not "the sermons" — this view renders a room's plan too, and a
                 room has neither sermons nor a pastor. */
              (readOnlyMessage ?? `Someone else plans the ${itemNoun}s here.`)
        }
      />
    );
  }

  return (
    <div className="proto-planner-list">
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        {group('Ideas', backlog)}
        {group('Upcoming', upcoming)}
        {group('Past', past, true)}
      </div>

      {readOnlyMessage ? (
        <p className="proto-caption proto-planner__readonly" role="status">
          {readOnlyMessage}
        </p>
      ) : null}
    </div>
  );
}

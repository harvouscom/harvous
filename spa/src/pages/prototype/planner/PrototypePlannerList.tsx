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
import { localTodayIso, sermonTimeLabel } from '../../../lib/church-services';
import type { PlannerSelection } from './PrototypeExpandedPlanner';

function formatRowDate(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Row({
  service,
  timeLabel,
  selected,
  past,
  onSelect,
}: {
  service: TeachingPlanSermon;
  timeLabel: string | null;
  selected: boolean;
  past?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
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
      <span className="proto-church-tools__row-date proto-planner-list__row-date">
        {formatRowDate(service.serviceDate)}
      </span>
      <span className="proto-church-tools__row-text">
        <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={service.title}><span>{service.title}</span></span>
        <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
          {timeLabel ? `${timeLabel} · ` : ''}
          {service.reference || 'No passage yet'}
          {service.seriesTitle ? ` · ${service.seriesTitle}` : ''}
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
  canWrite,
  readOnlyReason,
  emptyWritable,
  selection,
  onSelect,
}: {
  services: TeachingPlanSermon[];
  serviceTimes: ChurchServiceTimeOption[];
  canWrite: boolean;
  readOnlyReason: 'lapsed' | 'role' | null;
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
            selected={isSelected(service)}
            past={past}
            onSelect={() => onSelect({ mode: 'edit', serviceId: service.id })}
          />
        ))}
      </>
    );

  return (
    <div className="proto-planner-list">
      {services.length === 0 ? (
        <p className="proto-caption proto-planner__empty">
          {canWrite
            ? (emptyWritable ??
              'Nothing planned yet. Add a sermon, or drop an idea in the board to come back to.')
            : 'Nothing planned yet.'}
        </p>
      ) : (
        <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
          {group('Ideas', backlog)}
          {group('Upcoming', upcoming)}
          {group('Past', past, true)}
        </div>
      )}

      {readOnlyReason ? (
        <p className="proto-caption proto-planner__readonly" role="status">
          {readOnlyReason === 'lapsed'
            ? 'This plan is read-only while the church pilot is paused.'
            : 'A pastor or admin changes what is planned here.'}
        </p>
      ) : null}
    </div>
  );
}

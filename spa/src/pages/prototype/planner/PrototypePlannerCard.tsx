/**
 * One sermon as a draggable card — the board's and the calendar's shared unit.
 *
 * Two jobs in one control, which is why it is not simply a button: a click
 * opens it in the editor rail, a drag moves it in time. dnd-kit's activation
 * distance is what tells them apart, so a click never begins a drag and a drag
 * never lands as a click.
 */
import { useDraggable } from '@dnd-kit/core';
import Icon from '@/components/react/Icon';
import type { TeachingPlanSermon } from '../../../hooks/queries/useChurchTeachingPlan';

export function PlannerCardBody({
  service,
  timeLabel,
  compact,
}: {
  service: TeachingPlanSermon;
  timeLabel: string | null;
  /** Calendar chips have a day cell's width, not a column's. */
  compact?: boolean;
}) {
  return (
    <>
      <span className="pds-list-title proto-planner-card__title">{service.title}</span>
      {compact ? null : (
        <span className="proto-caption proto-planner-card__meta">
          {/* Time first: a church with a morning and an evening sermon has two
              cards on one date, and without this they read as duplicates. */}
          {timeLabel ? `${timeLabel} · ` : ''}
          {service.reference || 'No passage yet'}
        </span>
      )}
      {service.seriesTitle ? (
        /* Caption weight, not a badge. The pill this replaced gave a series more
           visual weight than the sermon's own passage, which inverted the row:
           what you preach outranks which run it belongs to. */
        <span className="proto-caption proto-planner-card__series">
          <Icon name="timeline" size={9} aria-hidden />
          <span className="proto-planner-card__series-name">{service.seriesTitle}</span>
        </span>
      ) : null}
    </>
  );
}

export default function PrototypePlannerCard({
  service,
  timeLabel,
  draggable,
  selected,
  compact,
  onSelect,
}: {
  service: TeachingPlanSermon;
  timeLabel: string | null;
  draggable: boolean;
  selected: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: service.id,
    disabled: !draggable,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={[
        'proto-planner-card',
        /* Still clickable when read-only — the editor opens to be read — but a
           grab cursor would promise a drag that will not start. */
        draggable ? '' : 'proto-planner-card--static',
        compact ? 'proto-planner-card--compact' : '',
        selected ? 'proto-planner-card--selected' : '',
        /* Left in place but faded while the DragOverlay carries the real card —
           removing it would collapse the column and make the drop target move
           out from under the cursor. */
        isDragging ? 'proto-planner-card--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      {...listeners}
      {...attributes}
    >
      <PlannerCardBody service={service} timeLabel={timeLabel} compact={compact} />
    </button>
  );
}

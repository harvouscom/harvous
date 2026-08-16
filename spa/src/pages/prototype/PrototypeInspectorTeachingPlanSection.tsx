/**
 * "Plan this note" — the note → plan half of the sermon bridge.
 *
 * A pastor writes first and schedules second at least as often as the reverse:
 * the idea arrives, the note gets written, and only then does it become a
 * particular Sunday. The planner's own "Write this sermon" covers the other
 * direction; this is the door for work that started as a note.
 *
 * **It asks which plan, because a church has more than one.** This used to
 * offer the church's sermon plan and nothing else, which quietly said a note
 * could only ever become a sermon. The same person often runs a room too — a
 * youth channel, an adult-ed class, a small group — and every one of those
 * carries its own plan on the same rows. The destinations were already
 * computed (`plannableSpaces`, "a plan you can switch to: the church's own, or
 * one room's") and the space lane already had the identical `link-note`
 * endpoint. Only this component was hardcoded to one of them.
 *
 * **Server-gated throughout, and never general-app UI.** The church plan
 * appears only for a viewer the *server* says holds `manage_teaching_plan`;
 * each room appears only if it is in the viewer's own plannable set. Nothing
 * here re-derives a role from a string.
 *
 * It creates through each plan's ordinary `create` endpoint rather than a
 * bespoke one, so date parsing, slot filtering, the timeless-duplicate guard
 * and series resolution all behave exactly as they do in the planner — then
 * links the note to the row it just made. Two calls: a create that lands and a
 * link that fails leaves a plan row the pastor can see and retry from, which is
 * a better trade than a second copy of every validation rule.
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import { useChurchSermonActions } from '../../hooks/queries/useChurchTeachingPlan';
import { useChurchSpaceSermonActions } from '../../hooks/queries/useChurchSpacePlan';
import { nextOccurrenceOfDay } from '../../lib/church-services';
import type { PlannableSpace } from '../../hooks/useChurchPlannerAccess';
import { PrototypeSectionHeader } from './design-system';
import ProtoDatePicker from './ProtoDatePicker';
import { formatServiceDate } from './PrototypeSermonEditorFields';
import { formatLocalDateInput } from '../../lib/proto-date-picker';

/** Mirrors `earliestSelectableDate` in the sermon editor — one floor, two doors. */
function earliestPlannableDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 56);
  return formatLocalDateInput(d);
}

/**
 * Where a note can land. The church's own plan has no space id; a room's does.
 * Kept as one list so the picker does not need to know which lane it is drawing.
 */
type PlanDestination = {
  spaceId: string | null;
  label: string;
  /** Channel, room, or the church itself — decides the glyph only. */
  icon: 'church' | 'rss' | 'user-group';
};

export type PrototypeInspectorTeachingPlanSectionProps = {
  noteId: string;
  /** The note's own title — what the plan row is named. */
  noteTitle: string;
  /**
   * The note's first scripture reference, if it has one. Canonicalized
   * server-side on create; sent as typed.
   */
  reference?: string | null;
  /** Viewer's home church org — present only for connected staff. */
  churchOrgId: string;
  /**
   * Whether the church-wide sermon plan is one of the destinations. False for
   * someone who runs a room but does not set the church's Sunday — a granted
   * space leader is exactly that person.
   */
  canPlanChurchWide?: boolean;
  /** The rooms whose plans this viewer may write, from `useChurchPlannerAccess`. */
  plannableSpaces?: PlannableSpace[];
  /**
   * The plan row this note is already written for, if any. Server-resolved and
   * viewer-scoped; a colleague's link never appears here.
   */
  plannedForServiceId?: string | null;
};

export default function PrototypeInspectorTeachingPlanSection({
  noteId,
  noteTitle,
  reference,
  churchOrgId,
  canPlanChurchWide = true,
  plannableSpaces = [],
  plannedForServiceId,
}: PrototypeInspectorTeachingPlanSectionProps) {
  const destinations: PlanDestination[] = [
    ...(canPlanChurchWide
      ? [{
          spaceId: null,
          /* Not the church's name: this section only ever appears inside the
             viewer's own church, so naming it again spends the row's width on
             something already known — and at "New Hope Assembly of God Church"
             it truncated the one word that mattered. */
          label: 'Sermons',
          icon: 'church' as const,
        }]
      : []),
    ...plannableSpaces.map((space) => ({
      spaceId: space.id,
      label: space.title,
      /* The same pair the planner's own scope picker draws, for the same
         reason: a broadcast glyph on a room that gathers says something untrue
         about it. */
      icon: space.ministry ? ('rss' as const) : ('user-group' as const),
    })),
  ];

  const [chosen, setChosen] = useState<PlanDestination | null>(null);
  /* Defaults to the next Sunday. `nextOccurrenceOfDay` is the same helper the
     sermon editor's picker seeds from, so both doors open on the same day. */
  const [date, setDate] = useState(() => nextOccurrenceOfDay(0));
  const [error, setError] = useState<string | null>(null);

  const churchActions = useChurchSermonActions(churchOrgId);
  const spaceActions = useChurchSpaceSermonActions(chosen?.spaceId ?? null);
  const actions = chosen?.spaceId ? spaceActions : churchActions;

  /*
    Already on a plan. Said rather than offered again — a second row for the
    same note is the mistake this state exists to prevent, and the planner is
    where a scheduled entry is edited.
  */
  if (plannedForServiceId) {
    return (
      <section className="proto-inspector-section">
        <PrototypeSectionHeader variant="inspector">Plan</PrototypeSectionHeader>
        <p className="proto-caption proto-inspector-muted">
          This note is on a teaching plan. Open the Planner to change when it is taught.
        </p>
      </section>
    );
  }

  /* Nowhere to put it. Renders nothing rather than an empty heading — a viewer
     who runs no room and does not set the church's plan has no question here. */
  if (destinations.length === 0) return null;

  const add = () => {
    if (!chosen || actions.isPending) return;
    setError(null);
    actions.mutate(
      {
        kind: 'create',
        serviceDate: date,
        title: noteTitle.trim() || 'Untitled sermon',
        /* Sent as typed; the server canonicalizes it and refuses a reference it
           cannot parse, which is the same path the planner's editor takes. */
        reference: reference?.trim() || null,
      } as never,
      {
        onSuccess: (res: unknown) => {
          const serviceId = (res as { service?: { id?: string } } | undefined)?.service?.id;
          if (!serviceId) {
            /* The row exists but we cannot name it, so we cannot link it.
               Honest about the half-done state rather than silently dropping
               the link and leaving the note looking unscheduled. */
            setError('Added to the plan, but the note could not be linked to it.');
            return;
          }
          actions.mutate({ kind: 'link-note', noteId, serviceId } as never, {
            onSuccess: () => setChosen(null),
            onError: () => setError('Added to the plan, but the note could not be linked to it.'),
          });
        },
        onError: (err: unknown) => {
          /* The server's own words: "That date already has a sermon" is more
             useful than anything this component could invent. */
          setError(
            err instanceof APIError || err instanceof Error
              ? err.message
              : 'Could not add this to the plan',
          );
        },
      },
    );
  };

  return (
    <section className="proto-inspector-section">
      <PrototypeSectionHeader variant="inspector">Plan</PrototypeSectionHeader>
      {chosen ? (
        <>
          <p className="proto-caption proto-inspector-muted">{chosen.label}</p>
          {/* Backfilling last Sunday is normal; going back a quarter is not —
              the same 56-day floor the sermon editor's own picker uses. */}
          <ProtoDatePicker value={date} min={earliestPlannableDate()} onChange={setDate} />
          <div className="proto-sheet-footer__row">
            <button
              type="button"
              className="proto-share-popover__primary"
              disabled={actions.isPending}
              onClick={add}
            >
              {actions.isPending ? 'Adding…' : `Add ${formatServiceDate(date)}`}
            </button>
            <button
              type="button"
              className="proto-sheet-quiet-action"
              disabled={actions.isPending}
              onClick={() => {
                setError(null);
                setChosen(null);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        /* One button per destination rather than a menu. At the sizes this
           reaches — a church's sermon plan plus the rooms one person runs — a
           list you can read is faster than a picker you must open. */
        <div className="proto-inspector-plan__destinations">
          {destinations.map((destination) => (
            <button
              key={destination.spaceId ?? '__church__'}
              type="button"
              className="proto-glass-surface proto-glass-surface--control proto-glass-action proto-inspector-plan__destination"
              onClick={() => {
                setError(null);
                setChosen(destination);
              }}
            >
              <Icon name={destination.icon} size={12} aria-hidden />
              <span className="proto-glass-action__label">{destination.label}</span>
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p className="proto-caption proto-inspector-muted" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

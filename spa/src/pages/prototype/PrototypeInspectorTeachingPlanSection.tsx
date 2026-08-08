/**
 * "Add to the teaching plan" — the note → plan half of the sermon bridge.
 *
 * A pastor writes first and schedules second at least as often as the reverse:
 * the idea arrives, the note gets written, and only then does it become a
 * particular Sunday. The planner's own "Write this sermon" covers the other
 * direction; this is the door for work that started as a note.
 *
 * **Staff-gated, and never general-app UI.** It renders only for a viewer the
 * *server* says holds `manage_teaching_plan` — the same rule every other
 * pastor surface follows, read from the capability payload and never
 * re-derived from a role string.
 *
 * It creates through the plan's ordinary `create` endpoint rather than a
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
import { nextOccurrenceOfDay } from '../../lib/church-services';
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
  plannedForServiceId,
}: PrototypeInspectorTeachingPlanSectionProps) {
  const actions = useChurchSermonActions(churchOrgId);
  const [picking, setPicking] = useState(false);
  /* Defaults to the next Sunday. `nextOccurrenceOfDay` is the same helper the
     sermon editor's picker seeds from, so both doors open on the same day. */
  const [date, setDate] = useState(() => nextOccurrenceOfDay(0));
  const [error, setError] = useState<string | null>(null);

  /*
    Already on the plan. Said rather than offered again — a second row for the
    same note is the mistake this state exists to prevent, and the planner is
    where a scheduled sermon is edited.
  */
  if (plannedForServiceId) {
    return (
      <section className="proto-inspector-section">
        <PrototypeSectionHeader variant="inspector">Teaching plan</PrototypeSectionHeader>
        <p className="proto-caption proto-inspector-muted">
          This note is on your church's teaching plan. Open the Planner to change when it is
          preached.
        </p>
      </section>
    );
  }

  const add = () => {
    if (actions.isPending) return;
    setError(null);
    actions.mutate(
      {
        kind: 'create',
        serviceDate: date,
        title: noteTitle.trim() || 'Untitled sermon',
        /* Sent as typed; the server canonicalizes it and refuses a reference it
           cannot parse, which is the same path the planner's editor takes. */
        reference: reference?.trim() || null,
      },
      {
        onSuccess: (res) => {
          const serviceId = (res as { service?: { id?: string } } | undefined)?.service?.id;
          if (!serviceId) {
            /* The row exists but we cannot name it, so we cannot link it.
               Honest about the half-done state rather than silently dropping
               the link and leaving the note looking unscheduled. */
            setError('Added to the plan, but the note could not be linked to it.');
            return;
          }
          actions.mutate(
            { kind: 'link-note', noteId, serviceId },
            {
              onSuccess: () => setPicking(false),
              onError: () =>
                setError('Added to the plan, but the note could not be linked to it.'),
            },
          );
        },
        onError: (err) => {
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
      <PrototypeSectionHeader variant="inspector">Teaching plan</PrototypeSectionHeader>
      {picking ? (
        <>
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
                setPicking(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="proto-glass-surface proto-glass-surface--control proto-glass-action"
          onClick={() => setPicking(true)}
        >
          <Icon name="calendar-check" size={12} aria-hidden />
          <span className="proto-glass-action__label">Add to the teaching plan</span>
        </button>
      )}
      {error ? (
        <p className="proto-caption proto-inspector-muted" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * "Your church added 1 step and changed 1 since you copied this" — leaders only, on a group's
 * copy of a church study plan (docs/CHURCH_V2_ROADMAP.md §E, phase 4).
 *
 * New steps can come in, placed where the church put them. A changed step is only ever looked
 * at: the group's own copy may have been adapted, so nothing here overwrites it (Derek, Sept 26
 * 2026). "Open the church's version" goes to the step in the channel; "Mark as seen" clears it.
 */
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import {
  useAddUpstreamSteps,
  useDismissUpstream,
  type SourceUpdate,
} from '../../hooks/queries/useStudyPlanLeaderKit';
import { noteParamSlug } from './proto-route-slugs';

function summary(update: SourceUpdate): string {
  const parts = [
    update.newSteps.length ? `added ${update.newSteps.length === 1 ? '1 step' : `${update.newSteps.length} steps`}` : null,
    update.editedSteps.length ? `changed ${update.editedSteps.length === 1 ? '1' : update.editedSteps.length}` : null,
  ].filter(Boolean);
  return `Your church ${parts.join(' and ')} since you copied this.`;
}

export default function PrototypeSourceUpdateBanner({ threadId, update }: { threadId: string; update: SourceUpdate }) {
  const navigate = useNavigate();
  const add = useAddUpstreamSteps(threadId);
  const dismiss = useDismissUpstream(threadId);
  const busy = add.isPending || dismiss.isPending;

  const markSeen = (ids: string[], done: string) =>
    dismiss.mutate(
      { sourceNoteIds: ids },
      {
        onSuccess: () => window.toast?.success(done),
        onError: (e) => window.toast?.error(e instanceof Error ? e.message : 'Could not update'),
      },
    );

  return (
    <div className="proto-glass-surface proto-glass-surface--panel proto-source-update" role="status">
      <p className="proto-source-update__summary">
        <Icon name="arrows-rotate" size={12} aria-hidden />
        <span>{summary(update)}</span>
      </p>
      {update.newSteps.length ? (
        <ul className="proto-source-update__list">
          {update.newSteps.map((step) => (
            <li key={step.sourceNoteId} className="proto-caption">New: {step.title}</li>
          ))}
        </ul>
      ) : null}
      {update.editedSteps.length ? (
        <ul className="proto-source-update__list">
          {update.editedSteps.map((step) => (
            <li key={step.sourceNoteId} className="proto-caption proto-source-update__edited">
              <span>Changed: {step.title}</span>
              <button
                type="button"
                className="proto-church-review__text-btn"
                onClick={() => navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(step.sourceNoteId) } })}
              >
                Open the church’s version
              </button>
              <button
                type="button"
                className="proto-church-review__text-btn"
                disabled={busy}
                onClick={() => markSeen([step.sourceNoteId], 'Marked as seen')}
              >
                Mark as seen
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="proto-source-update__actions">
        {update.newSteps.length ? (
          <button
            type="button"
            className="proto-settings-btn"
            disabled={busy}
            onClick={() =>
              add.mutate(
                {},
                {
                  onSuccess: (r) => window.toast?.success(r.added === 1 ? '1 step added' : `${r.added} steps added`),
                  onError: (e) => window.toast?.error(e instanceof Error ? e.message : 'Could not add the steps'),
                },
              )
            }
          >
            {update.newSteps.length === 1 ? 'Add the new step' : 'Add the new steps'}
          </button>
        ) : null}
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary"
          disabled={busy}
          onClick={() =>
            markSeen(
              [...update.newSteps.map((s) => s.sourceNoteId), ...update.editedSteps.map((s) => s.sourceNoteId)],
              'Dismissed',
            )
          }
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

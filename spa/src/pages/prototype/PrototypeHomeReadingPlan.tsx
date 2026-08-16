/**
 * Home › your reading plan — where you are, and one tap back into it.
 *
 * A personal plan is a sequence Thread with no space. The server could always
 * build one; nothing rendered it until Aug 2026, because the hook that draws a
 * Thread's steps was gated on a `spaceId` a personal plan does not have.
 *
 * **Only the current step**, deliberately. Home is where you continue a plan,
 * not where you browse it — showing every step would make this a second reading
 * list, and the Threads list is already that. Same division "This Sunday"
 * draws: the appointment, not the schedule.
 *
 * Renders nothing when there are no plans, like every other row group on Home.
 */
import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useReadingPlans } from '../../hooks/queries/useReadingPlans';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteParamSlug } from './proto-route-slugs';

export default function PrototypeHomeReadingPlan() {
  const navigate = useNavigate();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const { data } = useReadingPlans();

  const openStep = useCallback(
    (noteId: string) => {
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
      });
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    },
    [closeDrawer, isMobileSidebar, navigate],
  );

  const plans = (data?.plans ?? []).filter((plan) => plan.currentNoteId);
  if (plans.length === 0) return null;

  return (
    <>
      {plans.map((plan) => (
        <PrototypeHomeRow
          key={plan.threadId}
          icon="layer-group"
          /* The step is the specific thing this row is about; the plan's name
             and your place in it lead the meta line, where the eyebrow lives
             now. No coloured tile: a personal plan belongs to no room. */
          title={plan.currentNoteTitle || 'Next step'}
          meta={[plan.title, plan.total > 0 ? `${plan.currentIndex} of ${plan.total}` : null]}
          aria-label={`Continue ${plan.title}`}
          onClick={() => plan.currentNoteId && openStep(plan.currentNoteId)}
        />
      ))}
    </>
  );
}

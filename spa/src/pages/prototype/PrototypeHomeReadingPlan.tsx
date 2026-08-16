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
 * Renders nothing when there are no plans, like every other church-shaped
 * section on Home.
 */
import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import Icon from '@/components/react/Icon';
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
        <div className="proto-home-section" key={plan.threadId}>
          {/*
            Same anatomy as the This Sunday card — eyebrow inside, no coloured
            tile. The plan's own colour is deliberately not used as a tint here
            either: it would say the *step* belongs to a room, and a personal
            plan has none.
          */}
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--panel proto-home-card proto-home-card--tappable"
            aria-label={`Continue ${plan.title}`}
            onClick={() => plan.currentNoteId && openStep(plan.currentNoteId)}
          >
            {/* The plan names itself; the step count says where you are in it. */}
            <p className="proto-caption proto-home-card__eyebrow">
              {plan.title}
              {plan.total > 0 ? ` · ${plan.currentIndex} of ${plan.total}` : ''}
            </p>
            <div className="proto-home-card__body">
              <div className="proto-home-card__title-row">
                <span className="proto-home-card__icon-orb" aria-hidden>
                  <Icon name="layer-group" size={13} />
                </span>
                <p className="pds-list-title proto-home-card__title">
                  {plan.currentNoteTitle || 'Next step'}
                </p>
                <span className="proto-home-card__chevron" aria-hidden>
                  <Icon name="caret-right" size={11} />
                </span>
              </div>
            </div>
          </button>
        </div>
      ))}
    </>
  );
}

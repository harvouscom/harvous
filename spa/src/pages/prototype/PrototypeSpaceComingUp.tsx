/**
 * "Coming up" inside a church space — the read half of a space plan.
 *
 * Shows **one** gathering: the next one, or the one just past inside the same
 * four-day wall the church card uses, so Thursday still shows Wednesday while
 * someone writes up what they heard. Never a list — the congregant doctrine is
 * *one next gathering per context you joined, never a schedule of any context*
 * (docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1), and this is the
 * per-space half of it.
 *
 * Read-only by design. Planning happens in the My Church hub's teaching plan;
 * this is the room telling you what it is studying, not a door into editing it.
 *
 * Renders nothing at all when the space has no plan — which is the common case,
 * and must stay silent rather than occupy a space that never gathers.
 */
import Icon from '@/components/react/Icon';
import { useChurchSpacePlan } from '../../hooks/queries/useChurchSpacePlan';
import {
  currentSermonFor,
  formatServiceTime,
  sermonEyebrow,
  weekdayLabel,
} from '../../lib/church-services';

export interface PrototypeSpaceComingUpProps {
  spaceId: string | null;
  /**
   * Whether to ask the server at all. The plan endpoint is staff-gated, so a
   * congregant member of the channel would 404 — pass false and render nothing
   * rather than firing a request that cannot succeed.
   */
  enabled: boolean;
}

export default function PrototypeSpaceComingUp({ spaceId, enabled }: PrototypeSpaceComingUpProps) {
  const { data } = useChurchSpacePlan(spaceId, { enabled });

  // Same selection the congregant card uses, so "next" means the same thing in
  // both places — including the grace window.
  //
  // Undated rows are dropped first: the staff plan carries a backlog of ideas
  // now, and "coming up" must never be answered with something nobody has
  // committed to a day.
  const gathering = data
    ? currentSermonFor(
        data.services.filter(
          (service): service is typeof service & { serviceDate: string } =>
            service.serviceDate !== null,
        ),
      )
    : null;
  if (!data || !gathering) return null;

  /*
    The space's own rhythm, not the church's clock list: a space gathers once,
    so its `meetingTime` labels every row rather than each row carrying a time.
  */
  const rhythm =
    data.space.meetingTime && data.space.meetingDay !== null
      ? `${weekdayLabel(data.space.meetingDay)}s · ${formatServiceTime(data.space.meetingTime)}`
      : null;

  return (
    <div className="proto-home-section">
      <p className="proto-caption proto-home-section__eyebrow">
        {sermonEyebrow(gathering)}
        {rhythm ? ` · ${rhythm}` : ''}
      </p>
      {/*
        A div, not a button. There is nowhere for it to go: the plan is staff
        tooling in the hub, and a row that looks tappable and does nothing is
        the exact complaint the Team roster once earned.
      */}
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
        <div className="proto-church-tools__row proto-church-tools__row--status">
          <span className="proto-church-tools__row-icon" aria-hidden>
            <Icon name="calendar-check" size={13} />
          </span>
          <span className="proto-church-tools__row-text">
            <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={gathering.title}><span>{gathering.title}</span></span>
            <span className="proto-caption proto-church-tools__row-meta">
              {gathering.reference || 'No passage yet'}
              {gathering.seriesTitle ? ` · ${gathering.seriesTitle}` : ''}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

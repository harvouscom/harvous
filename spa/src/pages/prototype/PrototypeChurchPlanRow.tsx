/**
 * Staff-only plan status, as a row inside Church tools.
 *
 * Was a banner slab at the top of the hub — three stacked paragraphs and a
 * button shouting above the congregation-facing catalog. Plan state is
 * administration: it belongs in the tools group with the teaching plan and the
 * team, in the same row anatomy as both.
 *
 * Renders nothing for a paid church in good standing — a healthy subscription
 * shouldn't take up room in a sidebar every week. It surfaces only when there
 * is something to decide: a pilot running down, or a plan that has lapsed.
 * Congregants never see it (the query is staff-gated server-side).
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { api } from '../../lib/api';
import { useChurchBilling } from '../../hooks/queries/useChurchBilling';

/** One line, no trailing period — it sits in a row, not a paragraph. */
function pilotCopy(daysLeft: number | null): string {
  if (daysLeft === null) return 'Pilot running';
  if (daysLeft <= 0) return 'Pilot ends today';
  if (daysLeft === 1) return 'Pilot ends tomorrow';
  return `${daysLeft} days left in your pilot`;
}

export default function PrototypeChurchPlanRow({
  orgId,
  isStaff,
}: {
  orgId: string | null;
  isStaff: boolean;
}) {
  const { data } = useChurchBilling(orgId, { enabled: isStaff });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;

  const { sponsorship, plans } = data;
  // Paid and healthy needs no row; billing lives in Settings.
  if (sponsorship.state === 'paid') return null;

  const monthly = plans.find((plan) => plan.interval === 'month') ?? plans[0];
  const lapsed = sponsorship.state === 'lapsed';

  const startCheckout = async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await api.post<{ url?: string; error?: string }>('/api/church/checkout', {
        orgId,
        interval: 'month',
      });
      if (!response.url) throw new Error(response.error ?? 'Could not start checkout');
      window.location.href = response.url;
    } catch {
      setError('Could not start checkout. Please try again.');
      setStarting(false);
    }
  };

  return (
    <div className="proto-church-tools__row proto-church-tools__row--status">
      <span className="proto-church-tools__row-icon" aria-hidden>
        <Icon name={lapsed ? 'circle-exclamation' : 'clock'} size={13} />
      </span>
      <span className="proto-church-tools__row-text">
        <span className="pds-list-title proto-church-tools__row-title">
          {lapsed ? 'Plan ended' : pilotCopy(sponsorship.pilotDaysLeft)}
        </span>
        <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
          {/* With no Polar products configured there is no button, so the
              "talk to us" route has to live here or it disappears entirely. */}
          {error
            ? error
            : !monthly
              ? 'Contact Harvous to subscribe'
              : lapsed
                ? 'Published study stays readable'
                : 'Congregation unaffected'}
        </span>
      </span>
      {monthly ? (
        <button
          type="button"
          className="proto-glass-surface proto-glass-surface--control proto-glass-action"
          disabled={starting}
          onClick={startCheckout}
        >
          {/* Not "Subscribe": by the time this row appears the church is
              already using Harvous, so the ask is to keep going rather than to
              buy something new. The two states are different asks, though —
              a lapsed plan is genuinely being renewed, while a pilot has not
              expired yet and has nothing to renew. "Renew" is also the shorter
              label, which matters in the lapsed row: the longer one truncated
              the line explaining that published study stays readable. */}
          <span className="proto-glass-action__label">
            {starting ? 'Opening…' : lapsed ? 'Renew' : 'Continue'}
          </span>
        </button>
      ) : null}
    </div>
  );
}

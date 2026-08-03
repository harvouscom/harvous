/**
 * Staff-only plan strip in the My Church hub: where the church stands and how
 * to convert.
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

function pilotCopy(daysLeft: number | null): string {
  if (daysLeft === null) return 'Your pilot is running.';
  if (daysLeft <= 0) return 'Your pilot ends today.';
  if (daysLeft === 1) return 'Your pilot ends tomorrow.';
  return `${daysLeft} days left in your pilot.`;
}

export default function PrototypeChurchPlanBanner({
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
  // Paid and healthy needs no banner; billing lives in Settings.
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
    <div className="proto-home-section">
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-plan-banner">
        <p className="proto-church-plan-banner__headline">
          <Icon
            name={lapsed ? 'circle-exclamation' : 'clock'}
            size={12}
            aria-hidden
            className="proto-church-plan-banner__icon"
          />
          {lapsed ? 'Your church plan has ended.' : pilotCopy(sponsorship.pilotDaysLeft)}
        </p>
        <p className="proto-caption proto-church-plan-banner__body">
          {lapsed
            ? 'Everything published stays readable. Subscribe to publish again.'
            : 'Subscribe any time — nothing changes for your congregation.'}
        </p>
        {monthly ? (
          <button
            type="button"
            className="proto-settings-btn"
            disabled={starting}
            onClick={startCheckout}
          >
            {starting ? 'Opening checkout…' : `Subscribe — ${monthly.price}/mo`}
          </button>
        ) : (
          <p className="proto-caption proto-church-plan-banner__body">
            Contact Harvous to set up billing for your church.
          </p>
        )}
        {error ? (
          <p className="proto-caption proto-church-plan-banner__error">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

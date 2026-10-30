import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAdminChurches,
  useAdminHmcInterest,
  useAdminChurchApplications,
  useDecideChurchApplication,
  useClerkOrgs,
  useRegisterChurch,
  useSyncChurchStaff,
  useSetChurchActive,
  useSetChurchPilot,
  useSetChurchManualBilling,
  useUpdateAdminChurch,
  useRefreshAdminChurchHmc,
  searchAdminHmcChurches,
  type AdminChurch,
  type AdminChurchAttention,
  type AdminHmcInterestRow,
} from '@/hooks/queries/useAdminChurches';
import HmcChurchPicker, { type HmcChurchPick } from './HmcChurchPicker';
import '@/styles/admin-usage.css';
import '@/styles/admin-publish.css';
import '@/styles/admin-churches.css';

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).then(() => {
    window.toast?.success('Copied to clipboard');
  });
}

function RegisterChurchForm({
  onRegistered,
  initialPick = null,
}: {
  onRegistered: () => void;
  /** From a lead row: the directory church to register, already picked. */
  initialPick?: HmcChurchPick | null;
}) {
  const register = useRegisterChurch();
  const clerkOrgs = useClerkOrgs();
  const [orgId, setOrgId] = useState('');
  const [hmcPick, setHmcPick] = useState<HmcChurchPick | null>(initialPick);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');

  const searchHmc = useCallback((q: string, st: string) => searchAdminHmcChurches(q, st), []);

  /** Selecting an org prefills the church name with the Clerk org's name when unlinked. */
  const handleSelectOrg = (nextOrgId: string) => {
    setOrgId(nextOrgId);
    const picked = clerkOrgs.data?.orgs.find((org) => org.id === nextOrgId);
    if (picked && !hmcPick && !name.trim()) setName(picked.name);
  };

  const selectable = (clerkOrgs.data?.orgs ?? []).filter((org) => !org.registered);
  const clerkError = clerkOrgs.isError ? (clerkOrgs.error as Error).message : null;
  const linked = Boolean(hmcPick);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId.trim()) return;
    if (hmcPick) {
      register.mutate(
        { orgId: orgId.trim(), hmcChurchId: hmcPick.id },
        {
          onSuccess: (data) => {
            window.toast?.success(`Registered — linked to Here’s My Church (${data.church.name})`);
            setOrgId('');
            setHmcPick(null);
            setName('');
            setCity('');
            setState('');
            setCountry('');
            onRegistered();
          },
          onError: (err) => window.toast?.error(err.message),
        },
      );
      return;
    }
    if (!name.trim()) return;
    register.mutate(
      {
        orgId: orgId.trim(),
        name: name.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        country: country.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          window.toast?.success(`Registered — Clerk org: ${data.clerkOrg.name}`);
          setOrgId('');
          setName('');
          setCity('');
          setState('');
          setCountry('');
          onRegistered();
        },
        onError: (err) => window.toast?.error(err.message),
      },
    );
  };

  return (
    <form className="admin-publish__form" onSubmit={onSubmit}>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="church-org-id">
          Clerk organization
        </label>
        {clerkError ? (
          <p className="admin-publish__message admin-publish__message--error">{clerkError}</p>
        ) : (
          <select
            id="church-org-id"
            className="admin-publish__select"
            value={orgId}
            onChange={(e) => handleSelectOrg(e.target.value)}
            required
            disabled={clerkOrgs.isLoading}
          >
            <option value="">{clerkOrgs.isLoading ? 'Loading organizations…' : 'Select an organization…'}</option>
            {selectable.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
                {typeof org.memberCount === 'number' ? ` · ${org.memberCount}/20 staff` : ''}
              </option>
            ))}
          </select>
        )}
        {!clerkError && !clerkOrgs.isLoading && selectable.length === 0 ? (
          <p className="admin-publish__message">
            No unregistered organizations. Create one in the Clerk dashboard first.
          </p>
        ) : null}
      </div>

      <div className="admin-publish__field">
        <span className="admin-publish__label">Here’s My Church (source of truth)</span>
        <p className="admin-churches__hint admin-churches__hint--spaced">
          Prefer linking a directory church so name and location stay accurate for same-name campuses.
        </p>
        {hmcPick ? (
          <div className="admin-churches__stack">
            <p className="admin-churches__strong">{hmcPick.name}</p>
            <p className="admin-churches__hint">
              {[hmcPick.city, hmcPick.state].filter(Boolean).join(', ')} · <code>{hmcPick.id}</code>
            </p>
            <button type="button" className="admin-action-btn" onClick={() => setHmcPick(null)}>
              Clear HMC link
            </button>
          </div>
        ) : (
          <HmcChurchPicker variant="admin" onSearch={searchHmc} onPick={setHmcPick} />
        )}
      </div>

      {!linked ? (
        <>
          <div className="admin-publish__field">
            <label className="admin-publish__label" htmlFor="church-name">
              Church name (manual fallback)
            </label>
            <input
              id="church-name"
              className="admin-publish__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={!linked}
              maxLength={100}
            />
          </div>
          <div className="admin-publish__field">
            <label className="admin-publish__label" htmlFor="church-city">
              City / State / Country
            </label>
            <div className="admin-churches__inline">
              <input
                id="church-city"
                className="admin-publish__input"
                data-grow=""
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
              <input
                className="admin-publish__input"
                data-grow=""
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                aria-label="State"
              />
              <input
                className="admin-publish__input"
                data-grow=""
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
                aria-label="Country"
              />
            </div>
          </div>
        </>
      ) : null}

      <button
        type="submit"
        className="admin-action-btn admin-action-btn--emphasis"
        disabled={register.isPending || !orgId || (!hmcPick && !name.trim())}
      >
        {register.isPending ? 'Registering…' : 'Register church'}
      </button>
    </form>
  );
}

function EditChurchDetailsForm({ church }: { church: AdminChurch }) {
  const update = useUpdateAdminChurch(church.id);
  const refreshHmc = useRefreshAdminChurchHmc(church.id);
  const linked = Boolean(church.hmcChurchId);
  const [name, setName] = useState(church.name);
  const [city, setCity] = useState(church.city ?? '');
  const [state, setState] = useState(church.state ?? '');
  const [country, setCountry] = useState(church.country ?? '');

  useEffect(() => {
    setName(church.name);
    setCity(church.city ?? '');
    setState(church.state ?? '');
    setCountry(church.country ?? '');
  }, [church.id, church.name, church.city, church.state, church.country, church.hmcChurchId]);

  const searchHmc = useCallback((q: string, st: string) => searchAdminHmcChurches(q, st), []);

  const dirty =
    !linked &&
    (name.trim() !== church.name.trim() ||
      (city.trim() || '') !== (church.city ?? '') ||
      (state.trim() || '') !== (church.state ?? '') ||
      (country.trim() || '') !== (church.country ?? ''));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linked || !name.trim()) return;
    update.mutate(
      {
        name: name.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        country: country.trim() || null,
      },
      {
        onSuccess: () => window.toast?.success('Church details saved'),
        onError: (err) => window.toast?.error(err.message),
      },
    );
  };

  return (
    <div className="admin-churches__stack">
      <h4 className="admin-churches__h4">Church details</h4>
      {linked ? (
        <div className="admin-churches__stack">
          <p className="admin-churches__hint">
            Linked to Here’s My Church — name and location refresh from the directory.
          </p>
          <p className="admin-churches__flush">
            <strong>{church.name}</strong>
          </p>
          <p className="admin-churches__hint">
            {[church.city, church.state].filter(Boolean).join(', ') || 'No location'} ·{' '}
            <code>{church.hmcChurchId}</code>
          </p>
          <div className="admin-churches__inline">
            <button
              type="button"
              className="admin-action-btn admin-action-btn--emphasis"
              disabled={refreshHmc.isPending}
              onClick={() =>
                refreshHmc.mutate(undefined, {
                  onSuccess: () => window.toast?.success('Refreshed from Here’s My Church'),
                  onError: (err) => window.toast?.error(err.message),
                })
              }
            >
              {refreshHmc.isPending ? 'Refreshing…' : 'Refresh from Here’s My Church'}
            </button>
            <button
              type="button"
              className="admin-action-btn"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { hmcChurchId: null },
                  {
                    onSuccess: () => window.toast?.success('Unlinked from Here’s My Church'),
                    onError: (err) => window.toast?.error(err.message),
                  },
                )
              }
            >
              Unlink
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="admin-churches__hint">
            Link a Here’s My Church record (preferred) or edit name/location manually.
          </p>
          <HmcChurchPicker
            variant="admin"
            initialState={church.state ?? ''}
            onSearch={searchHmc}
            onPick={(pick) =>
              update.mutate(
                { hmcChurchId: pick.id },
                {
                  onSuccess: () => window.toast?.success(`Linked to ${pick.name}`),
                  onError: (err) => window.toast?.error(err.message),
                },
              )
            }
          />
          <form onSubmit={onSubmit} className="admin-churches__stack">
            <div className="admin-publish__field">
              <label className="admin-publish__label" htmlFor={`church-edit-name-${church.id}`}>
                Church name
              </label>
              <input
                id={`church-edit-name-${church.id}`}
                className="admin-publish__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </div>
            <div className="admin-publish__field">
              <label className="admin-publish__label" htmlFor={`church-edit-city-${church.id}`}>
                City / State / Country
              </label>
              <div className="admin-churches__inline">
                <input
                  id={`church-edit-city-${church.id}`}
                  className="admin-publish__input"
                  data-grow=""
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                />
                <input
                  className="admin-publish__input"
                  data-grow=""
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  aria-label="State"
                />
                <input
                  className="admin-publish__input"
                  data-grow=""
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                  aria-label="Country"
                />
              </div>
            </div>
            <button
              type="submit"
              className="admin-action-btn admin-action-btn--emphasis"
              disabled={!dirty || update.isPending || !name.trim()}
              data-align-start=""
            >
              {update.isPending ? 'Saving…' : 'Save details'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/** The words a concierge reads on a row; neutral badges, never a coloured dot. */
const ATTENTION_LABEL: Record<AdminChurchAttention, string> = {
  lapsed: 'Plan ended',
  pilot_ending: 'Pilot ending',
  never_posted: 'Never posted',
  quiet: 'Quiet 2+ weeks',
  no_service_times: 'No service times',
  no_one_connected: 'No one connected',
};

function relativeDays(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (Number.isNaN(days)) return null;
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
}

/** One line: plan, then reach, then activity — what a pilot check-in asks, in that order. */
function healthLine(church: AdminChurch, location: string): string {
  const plan = church.billingPlan
    ? 'Paid'
    : pilotDaysLeft(church) !== null
      ? `Pilot · ${pilotDaysLeft(church)}d left`
      : church.isActive
        ? 'Plan ended'
        : null;
  const h = church.health;
  const parts = [
    plan,
    h ? `${h.connectedCount} connected` : null,
    h ? `${h.staffCount} staff` : null,
    h ? `${h.channelCount} channel${h.channelCount === 1 ? '' : 's'}` : null,
    h ? (h.lastPostAt ? `last post ${relativeDays(h.lastPostAt)}` : null) : null,
    h && h.joinedByLinkCount ? `${h.joinedByLinkCount} by link` : null,
    h && h.serviceTimeCount ? `${h.serviceTimeCount} service time${h.serviceTimeCount === 1 ? '' : 's'}` : null,
    location || null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function ChurchRow({ church }: { church: AdminChurch }) {
  const [expanded, setExpanded] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string[] | null>(null);
  const sync = useSyncChurchStaff(church.id);
  const setActive = useSetChurchActive(church.id);
  const setPilot = useSetChurchPilot(church.id);
  const setManualBilling = useSetChurchManualBilling(church.id);
  const onSetManualBilling = (paid: boolean) => {
    const prompt = paid
      ? `Mark ${church.name} as paid (invoice)? It stays sponsored until you clear this.`
      : `Clear the manual plan for ${church.name}? Writes will stop unless a pilot is running.`;
    if (!window.confirm(prompt)) return;
    setManualBilling.mutate(paid, {
      onSuccess: () => window.toast?.success(paid ? 'Marked as paid' : 'Manual plan cleared'),
      onError: (err) => window.toast?.error(err.message),
    });
  };

  const location = [church.city, church.state, church.country].filter(Boolean).join(', ');

  const onSync = () => {
    sync.mutate(undefined, {
      onSuccess: (data) => {
        const totals = data.spaces.reduce(
          (acc, s) => ({ added: acc.added + s.added, promoted: acc.promoted + s.promoted, removed: acc.removed + s.removed }),
          { added: 0, promoted: 0, removed: 0 },
        );
        window.toast?.success(
          `Synced ${data.staffCount} staff — added ${totals.added}, promoted ${totals.promoted}, removed ${totals.removed}`,
        );
        setSyncSummary(data.warnings.length > 0 ? data.warnings : null);
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Sync failed';
        window.toast?.error(message);
        setSyncSummary([message]);
      },
    });
  };

  const onToggleActive = () => {
    if (church.isActive && !window.confirm(`Deactivate ${church.name}?`)) return;
    setActive.mutate(!church.isActive, {
      onSuccess: () => window.toast?.success(church.isActive ? 'Church deactivated' : 'Church reactivated'),
      onError: (err) => window.toast?.error(err.message),
    });
  };

  // Mirrors churchSponsorship() on the server: paid wins, then a live pilot.
  const pilotUntilDate = church.pilotUntil ? new Date(church.pilotUntil) : null;
  const pilotActive = Boolean(
    pilotUntilDate && !Number.isNaN(pilotUntilDate.getTime()) && pilotUntilDate.getTime() > Date.now(),
  );
  const sponsorshipLabel = church.billingPlan
    ? `Paid · ${church.billingStatus === 'manual' ? 'invoice' : church.billingPlan}`
    : pilotActive
      ? `Pilot until ${pilotUntilDate!.toLocaleDateString()}`
      : 'Plan ended — staff can’t post, scheduled posts are on hold, follows are paused. Everything published stays readable.';

  const onSetPilot = (days: number | null) => {
    if (days === null && !window.confirm(`End the pilot for ${church.name} now?`)) return;
    setPilot.mutate(days, {
      onSuccess: () =>
        window.toast?.success(days === null ? 'Pilot ended' : `Pilot set — ${days} days`),
      onError: (err) => window.toast?.error(err.message),
    });
  };

  return (
    <article className={`admin-publish__space-card admin-churches__row${church.isActive ? '' : ' admin-churches__row--inactive'}`}>
      <button
        type="button"
        className="admin-publish__space-header admin-churches__row-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="admin-churches__row-title">
          <span className="admin-publish__space-title">{church.name}</span>
          {!church.isActive ? <span className="admin-publish__badge">Inactive</span> : null}
          {(church.attention ?? []).map((reason) => (
            <span key={reason} className="admin-publish__badge">
              {ATTENTION_LABEL[reason]}
            </span>
          ))}
        </span>
        <span className="admin-publish__space-meta">{healthLine(church, location)}</span>
      </button>
      {expanded ? (
        <div className="admin-publish__space-body admin-churches__stack">
          <div className="admin-churches__inline">
            <button type="button" className="admin-action-btn" onClick={() => copyToClipboard(church.orgId)}>
              Copy Clerk org id
            </button>
            <button type="button" className="admin-action-btn" onClick={onSync} disabled={sync.isPending}>
              {sync.isPending ? 'Syncing…' : 'Sync staff'}
            </button>
            <button type="button" className="admin-action-btn" onClick={onToggleActive} disabled={setActive.isPending}>
              {church.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>

          {/* Plan — while paid or in a pilot, staff can publish; otherwise posts hold. */}
          <p className="admin-publish__space-meta admin-churches__plan">{sponsorshipLabel}</p>
          <div className="admin-churches__inline">
            {church.billingPlan ? null : (
              <>
                <button
                  type="button"
                  className="admin-action-btn"
                  onClick={() => onSetPilot(30)}
                  disabled={setPilot.isPending}
                >
                  {pilotActive ? 'Add 30 days' : 'Start 30-day pilot'}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  onClick={() => onSetPilot(90)}
                  disabled={setPilot.isPending}
                >
                  90 days
                </button>
                {pilotActive ? (
                  <button
                    type="button"
                    className="admin-action-btn"
                    onClick={() => onSetPilot(null)}
                    disabled={setPilot.isPending}
                  >
                    End pilot
                  </button>
                ) : null}
                <button
                  type="button"
                  className="admin-action-btn"
                  onClick={() => onSetManualBilling(true)}
                  disabled={setManualBilling.isPending}
                >
                  Mark paid (invoice)
                </button>
              </>
            )}
            {church.billingPlan && church.billingStatus === 'manual' ? (
              <button
                type="button"
                className="admin-action-btn"
                onClick={() => onSetManualBilling(false)}
                disabled={setManualBilling.isPending}
              >
                Clear manual plan
              </button>
            ) : null}
          </div>
          {church.health?.inReviewCount ? (
            <p className="admin-publish__space-meta">
              {church.health.inReviewCount === 1
                ? '1 post waiting for a pastor’s approval'
                : `${church.health.inReviewCount} posts waiting for a pastor’s approval`}
            </p>
          ) : null}
          {syncSummary ? (
            <ul className="admin-churches__warnings">
              {syncSummary.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <EditChurchDetailsForm church={church} />
        </div>
      ) : null}
    </article>
  );
}

function interestLocation(row: AdminHmcInterestRow): string {
  return [row.churchCity, row.churchState].filter(Boolean).join(', ');
}

/**
 * Churches asking to join. Approve creates the Clerk org (applicant as admin), registers the
 * church with a 30-day pilot, seeds service times from Here's My Church, and connects the
 * applicant — the four hand steps this list replaces.
 */
/** A note to someone who asked from harvous.com: sign in with this email and the request is theirs. */
function setupMailto(row: { name: string; contactEmail: string | null; applicantName?: string | null }): string {
  const first = (row.applicantName ?? '').trim().split(/\s+/)[0];
  const body = [
    first ? `Hi ${first},` : 'Hi,',
    '',
    `Thanks for asking about bringing ${row.name} to Harvous. The next step is to sign in, or create a free account, with this email address:`,
    '',
    `${window.location.origin}/churches/start`,
    '',
    'Your request will already be there, and I will set your church up with you from there.',
    '',
    'Derek',
  ].join('\n');
  return `mailto:${encodeURIComponent(row.contactEmail ?? '')}?subject=${encodeURIComponent(
    `Setting up ${row.name} on Harvous`,
  )}&body=${encodeURIComponent(body)}`;
}

function ChurchApplicationsSection() {
  const applications = useAdminChurchApplications();
  const decide = useDecideChurchApplication();
  const rows = applications.data?.applications ?? [];

  const approve = (row: { id: string; name: string }) => {
    if (!window.confirm(`Approve ${row.name}? This creates its Clerk organization and starts a 30-day pilot.`)) return;
    decide.mutate(
      { id: row.id, decision: 'approve' },
      {
        onSuccess: (result) =>
          window.toast?.success(
            `${row.name} is on Harvous` +
              (result.seededServiceTimes ? ` · ${result.seededServiceTimes} service times from the directory` : '') +
              (result.alreadyPickedCount ? ` · ${result.alreadyPickedCount} already picked it` : ''),
          ),
        onError: (err) => window.toast?.error(err.message),
      },
    );
  };
  const decline = (row: { id: string; name: string }) => {
    const note = window.prompt(`Decline ${row.name}? Optional note the applicant will see:`, '');
    if (note === null) return;
    decide.mutate(
      { id: row.id, decision: 'decline', note: note.trim() || null },
      { onError: (err) => window.toast?.error(err.message) },
    );
  };

  return (
    <section>
      <h3>Requests</h3>
      {applications.isLoading ? <p>Loading…</p> : null}
      {applications.isError ? (
        <p className="admin-publish__message admin-publish__message--error">Failed to load requests.</p>
      ) : null}
      {!applications.isLoading && !applications.isError && rows.length === 0 ? (
        <p className="admin-publish__empty">No requests waiting.</p>
      ) : null}
      <div className="admin-publish__space-list">
        {rows.map((row) => (
          <article key={row.id} className="admin-publish__space-card">
            <div className="admin-publish__space-header admin-churches__row-head admin-churches__row-head--static">
              <span className="admin-churches__row-title">
                <span className="admin-publish__space-title">{row.name}</span>
                {row.source === 'site' ? <span className="admin-publish__badge">From harvous.com</span> : null}
                {!row.applicantUserId ? <span className="admin-publish__badge">No account yet</span> : null}
              </span>
              <span className="admin-publish__space-meta">
                {[row.city, row.state].filter(Boolean).join(', ') || 'No location'}
                {row.hmcChurchId ? ' · HMC' : ' · not in directory'}
                {row.interestCount ? ` · ${row.interestCount} already picked it` : ''}
              </span>
            </div>
            <div className="admin-publish__space-body admin-churches__stack">
              <span className="admin-publish__space-meta">
                {row.applicantName ? `${row.applicantName} · ` : ''}
                {row.applicantRole ?? 'Role not given'}
                {row.contactEmail ? ` · ${row.contactEmail}` : ''}
                {row.timezone ? ` · ${row.timezone}` : ''}
                {` · ${new Date(row.createdAt).toLocaleDateString()}`}
              </span>
              {row.notes ? <p className="admin-churches__note">{row.notes}</p> : null}
              <div className="admin-churches__inline">
                {row.applicantUserId ? (
                  <button
                    type="button"
                    className="admin-action-btn admin-action-btn--emphasis"
                    disabled={decide.isPending}
                    onClick={() => approve(row)}
                  >
                    Approve
                  </button>
                ) : row.contactEmail ? (
                  /* Approval makes the applicant the church's admin, so it waits for an account.
                     This request attaches itself when they sign in with this email. */
                  <a
                    className="admin-action-btn admin-action-btn--emphasis"
                    href={setupMailto(row)}
                  >
                    Email setup link
                  </a>
                ) : null}
                <button type="button" className="admin-action-btn" disabled={decide.isPending} onClick={() => decline(row)}>
                  Decline
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HmcInterestSection({ onRegister }: { onRegister: (pick: HmcChurchPick) => void }) {
  const interest = useAdminHmcInterest();
  // Leads first: unregistered, most picked. Registered churches are context, at the end.
  const rows = [...(interest.data?.interest ?? [])].sort(
    (a, b) =>
      Number(Boolean(a.registeredChurchId)) - Number(Boolean(b.registeredChurchId)) || b.userCount - a.userCount,
  );

  return (
    <section>
      <h3>Leads</h3>
      <p className="admin-churches__intro">
        Churches people picked in Settings › My Church that aren’t on Harvous yet, most picked first.
        Counts only. Everyone who picked one is connected the moment it’s registered.
      </p>
      {interest.isLoading ? <p>Loading…</p> : null}
      {interest.isError ? (
        <p className="admin-publish__message admin-publish__message--error">Failed to load selections.</p>
      ) : null}
      {!interest.isLoading && !interest.isError && rows.length === 0 ? (
        <p className="admin-publish__empty">No My Church HMC selections yet.</p>
      ) : null}
      <div className="admin-publish__space-list">
        {rows.map((row) => {
          const location = interestLocation(row);
          const registered = Boolean(row.registeredChurchId);
          return (
            <article key={row.hmcChurchId} className="admin-publish__space-card">
              <div className="admin-publish__space-header admin-churches__row-head admin-churches__row-head--static">
                <span className="admin-churches__row-title">
                  <span className="admin-publish__space-title">{row.churchName || row.hmcChurchId}</span>
                  {registered ? <span className="admin-publish__badge">On Harvous</span> : null}
                </span>
                <span className="admin-publish__space-meta">
                  {row.userCount === 1 ? '1 person picked it' : `${row.userCount} people picked it`}
                  {location ? ` · ${location}` : ''}
                </span>
                {!registered ? (
                  <button
                    type="button"
                    className="admin-action-btn admin-churches__row-action"
                    onClick={() =>
                      onRegister({
                        id: row.hmcChurchId,
                        shortId: '',
                        name: row.churchName || row.hmcChurchId,
                        city: row.churchCity ?? '',
                        state: row.churchState ?? '',
                      })
                    }
                  >
                    Register
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

type PlanFields = { isActive: boolean; billingPlan: string | null; pilotUntil?: string | null };

/** Whole days left in a pilot (rounded up), or null when there is no live pilot. Mirrors churchSponsorship(). */
function pilotDaysLeft(church: PlanFields, now = Date.now()): number | null {
  if (church.billingPlan || !church.pilotUntil) return null;
  const end = new Date(church.pilotUntil).getTime();
  if (Number.isNaN(end) || end <= now) return null;
  return Math.ceil((end - now) / DAY_MS);
}

/** Lapsed first, then pilots by days left, then everything else in the server's order. */
function byPlanUrgency(a: PlanFields, b: PlanFields): number {
  const rank = (church: PlanFields) => {
    if (!church.isActive || church.billingPlan) return Number.POSITIVE_INFINITY;
    return pilotDaysLeft(church) ?? -1;
  };
  const ra = rank(a);
  const rb = rank(b);
  return ra === rb ? 0 : ra < rb ? -1 : 1;
}

export default function AdminChurchesPanel() {
  const churches = useAdminChurches();
  const applications = useAdminChurchApplications();
  const [registerPick, setRegisterPick] = useState<HmcChurchPick | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const registerRef = useRef<HTMLDetailsElement | null>(null);

  const list = [...(churches.data?.churches ?? [])].sort(byPlanUrgency);
  const active = list.filter((church) => church.isActive);
  const inPilot = active.filter((church) => !church.billingPlan && pilotDaysLeft(church) !== null).length;
  const paid = active.filter((church) => church.billingPlan).length;
  const needsLook = active.filter((church) => (church.attention ?? []).length > 0).length;
  const connected = active.reduce((sum, church) => sum + (church.health?.connectedCount ?? 0), 0);
  const waiting = applications.data?.applications.length ?? 0;

  const registerLead = (pick: HmcChurchPick) => {
    setRegisterPick(pick);
    setRegisterOpen(true);
    requestAnimationFrame(() => registerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="admin-churches">
      <div className="admin-publish__hero" aria-label="Churches summary">
        <Stat value={waiting} label={waiting === 1 ? 'request waiting' : 'requests waiting'} />
        <Stat value={inPilot} label="in a pilot" />
        <Stat value={paid} label="paid" />
        <Stat value={needsLook} label="need a look" />
        <Stat value={connected} label="people connected" />
      </div>

      <ChurchApplicationsSection />

      <section>
        <h3>Churches</h3>
        <p className="admin-churches__intro">Churches that need a look come first.</p>
        {churches.isLoading ? <p>Loading…</p> : null}
        {churches.isError ? <p className="admin-publish__message admin-publish__message--error">Failed to load churches.</p> : null}
        {churches.data?.churches.length === 0 ? <p className="admin-publish__empty">No churches registered yet.</p> : null}
        <div className="admin-publish__space-list">
          {[...active.sort(byAttention), ...list.filter((church) => !church.isActive)].map((church) => (
            <ChurchRow key={church.id} church={church} />
          ))}
        </div>
      </section>

      <HmcInterestSection onRegister={registerLead} />

      <details
        ref={registerRef}
        className="admin-churches__register"
        open={registerOpen}
        onToggle={(e) => setRegisterOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>
          <span className="admin-publish__space-title">Register a church by hand</span>
          <span className="admin-publish__space-meta">
            For a church that didn’t send a request. Create its Clerk organization first (staff only, 20 at most;
            congregants never join it), then link its Here’s My Church listing.
          </span>
        </summary>
        <RegisterChurchForm
          key={registerPick?.id ?? 'blank'}
          initialPick={registerPick}
          onRegistered={() => {
            setRegisterPick(null);
            setRegisterOpen(false);
            void churches.refetch();
          }}
        />
      </details>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="admin-publish__hero-stat">
      <div className="admin-publish__hero-value">{value}</div>
      <div className="admin-publish__hero-label">{label}</div>
    </div>
  );
}

/** Most reasons to look first; then the plan order `byPlanUrgency` already gave. Stable. */
function byAttention(a: AdminChurch, b: AdminChurch): number {
  return (b.attention?.length ?? 0) - (a.attention?.length ?? 0);
}

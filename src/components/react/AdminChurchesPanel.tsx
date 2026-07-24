import React, { useCallback, useEffect, useState } from 'react';
import {
  useAdminChurches,
  useAdminHmcInterest,
  useClerkOrgs,
  useRegisterChurch,
  useCreateChurchSpace,
  useSyncChurchStaff,
  useSetChurchActive,
  useUpdateAdminChurch,
  useRefreshAdminChurchHmc,
  searchAdminHmcChurches,
  type AdminChurch,
  type AdminHmcInterestRow,
} from '@/hooks/queries/useAdminChurches';
import HmcChurchPicker, { type HmcChurchPick } from './HmcChurchPicker';
import { THREAD_COLORS, type ThreadColor } from '@/utils/colors';
import '@/styles/admin-usage.css';
import '@/styles/admin-publish.css';

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).then(() => {
    window.toast?.success('Copied to clipboard');
  });
}

function RegisterChurchForm({ onRegistered }: { onRegistered: () => void }) {
  const register = useRegisterChurch();
  const clerkOrgs = useClerkOrgs();
  const [orgId, setOrgId] = useState('');
  const [hmcPick, setHmcPick] = useState<HmcChurchPick | null>(null);
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
        <p style={{ margin: '0 0 8px', opacity: 0.72, fontSize: 12 }}>
          Prefer linking a directory church so name and location stay accurate for same-name campuses.
        </p>
        {hmcPick ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{hmcPick.name}</p>
            <p style={{ margin: 0, opacity: 0.75, fontSize: 12 }}>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="church-city"
                className="admin-publish__input"
                style={{ flex: '1 1 0', minWidth: 0 }}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
              <input
                className="admin-publish__input"
                style={{ flex: '1 1 0', minWidth: 0 }}
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                aria-label="State"
              />
              <input
                className="admin-publish__input"
                style={{ flex: '1 1 0', minWidth: 0 }}
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

function CreateChurchSpaceForm({ churchId }: { churchId: string }) {
  const create = useCreateChurchSpace(churchId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [color, setColor] = useState<ThreadColor>('paper');

  if (!open) {
    return (
      <button type="button" className="admin-action-btn" onClick={() => setOpen(true)}>
        Create ministry channel
      </button>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !ownerUserId.trim()) return;
    create.mutate(
      { title: title.trim(), ownerUserId: ownerUserId.trim(), color },
      {
        onSuccess: (data) => {
          window.toast?.success(`Ministry channel created: ${data.space.title}`);
          setTitle('');
          setOwnerUserId('');
          setOpen(false);
        },
        onError: (err) => window.toast?.error(err.message),
      },
    );
  };

  return (
    <form className="admin-publish__form" onSubmit={onSubmit}>
      <input
        className="admin-publish__input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Space title"
        required
        maxLength={100}
      />
      <input
        className="admin-publish__input"
        value={ownerUserId}
        onChange={(e) => setOwnerUserId(e.target.value)}
        placeholder="Owner userId (staff member, user_…)"
        required
      />
      <select
        className="admin-publish__select"
        value={color}
        onChange={(e) => setColor(e.target.value as ThreadColor)}
        aria-label="Color"
      >
        {THREAD_COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="admin-action-btn admin-action-btn--emphasis" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="admin-action-btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Church details</h4>
      {linked ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, opacity: 0.72, fontSize: 12 }}>
            Linked to Here’s My Church — name and location refresh from the directory.
          </p>
          <p style={{ margin: 0 }}>
            <strong>{church.name}</strong>
          </p>
          <p style={{ margin: 0, opacity: 0.75, fontSize: 12 }}>
            {[church.city, church.state].filter(Boolean).join(', ') || 'No location'} ·{' '}
            <code>{church.hmcChurchId}</code>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          <p style={{ margin: 0, opacity: 0.72, fontSize: 12 }}>
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
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id={`church-edit-city-${church.id}`}
                  className="admin-publish__input"
                  style={{ flex: '1 1 0', minWidth: 0 }}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                />
                <input
                  className="admin-publish__input"
                  style={{ flex: '1 1 0', minWidth: 0 }}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  aria-label="State"
                />
                <input
                  className="admin-publish__input"
                  style={{ flex: '1 1 0', minWidth: 0 }}
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
              style={{ alignSelf: 'flex-start' }}
            >
              {update.isPending ? 'Saving…' : 'Save details'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function ChurchRow({ church }: { church: AdminChurch }) {
  const [expanded, setExpanded] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string[] | null>(null);
  const sync = useSyncChurchStaff(church.id);
  const setActive = useSetChurchActive(church.id);

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

  return (
    <article className="admin-publish__space-card">
      <button
        type="button"
        className="admin-publish__space-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ width: '100%', textAlign: 'left' }}
      >
        <span className="admin-publish__space-title">{church.name}</span>
        <span className="admin-publish__space-meta">
          {!church.isActive ? 'inactive · ' : ''}
          {church.hmcChurchId ? 'HMC · ' : ''}
          {location ? `${location} · ` : ''}
          {church.spaceCount} space{church.spaceCount === 1 ? '' : 's'}
        </span>
      </button>
      {expanded ? (
        <div className="admin-publish__space-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code>{church.orgId}</code>
            <button type="button" className="admin-action-btn" onClick={() => copyToClipboard(church.orgId)}>
              Copy org id
            </button>
            <button type="button" className="admin-action-btn" onClick={onSync} disabled={sync.isPending}>
              {sync.isPending ? 'Syncing…' : 'Sync staff'}
            </button>
            <button type="button" className="admin-action-btn" onClick={onToggleActive} disabled={setActive.isPending}>
              {church.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
          {syncSummary ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {syncSummary.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <EditChurchDetailsForm church={church} />
          <CreateChurchSpaceForm churchId={church.id} />
        </div>
      ) : null}
    </article>
  );
}

function interestLocation(row: AdminHmcInterestRow): string {
  return [row.churchCity, row.churchState].filter(Boolean).join(', ');
}

function HmcInterestSection() {
  const interest = useAdminHmcInterest();
  const rows = interest.data?.interest ?? [];

  return (
    <section>
      <h3>Churches users selected</h3>
      <p style={{ margin: '4px 0 12px', opacity: 0.75 }}>
        Here’s My Church picks from Settings → My Church — outreach demand (user counts only; not registered
        church orgs).
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
              <div className="admin-publish__space-header" style={{ width: '100%', textAlign: 'left' }}>
                <span className="admin-publish__space-title">{row.churchName || row.hmcChurchId}</span>
                <span className="admin-publish__space-meta">
                  {registered ? 'Registered · ' : ''}
                  {location ? `${location} · ` : ''}
                  {row.userCount} user{row.userCount === 1 ? '' : 's'}
                  {' · '}
                  <code style={{ fontSize: '0.85em' }}>{row.hmcChurchId}</code>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function AdminChurchesPanel() {
  const churches = useAdminChurches();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <h3>Register a church</h3>
        <p style={{ margin: '4px 0 12px', opacity: 0.75 }}>
          Create the Clerk organization first (staff/volunteers only, ≤20 — congregants never join the org), then
          register it here and link a Here’s My Church directory record for name/location.
        </p>
        <RegisterChurchForm onRegistered={() => void churches.refetch()} />
      </section>

      <HmcInterestSection />

      <section>
        <h3>Churches</h3>
        {churches.isLoading ? <p>Loading…</p> : null}
        {churches.isError ? <p className="admin-publish__message admin-publish__message--error">Failed to load churches.</p> : null}
        {churches.data?.churches.length === 0 ? <p className="admin-publish__empty">No churches registered yet.</p> : null}
        <div className="admin-publish__space-list">
          {churches.data?.churches.map((church) => (
            <ChurchRow key={church.id} church={church} />
          ))}
        </div>
      </section>
    </div>
  );
}

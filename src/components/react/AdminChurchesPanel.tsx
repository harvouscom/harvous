import React, { useState } from 'react';
import {
  useAdminChurches,
  useRegisterChurch,
  useCreateChurchSpace,
  useSyncChurchStaff,
  useSetChurchActive,
  type AdminChurch,
} from '@/hooks/queries/useAdminChurches';
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
  const [orgId, setOrgId] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId.trim() || !name.trim()) return;
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
          Clerk organization id
        </label>
        <input
          id="church-org-id"
          className="admin-publish__input"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          placeholder="org_…"
          required
        />
      </div>
      <div className="admin-publish__field">
        <label className="admin-publish__label" htmlFor="church-name">
          Church name
        </label>
        <input
          id="church-name"
          className="admin-publish__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
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
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
          />
          <input
            className="admin-publish__input"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="State"
            aria-label="State"
          />
          <input
            className="admin-publish__input"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Country"
            aria-label="Country"
          />
        </div>
      </div>
      <button type="submit" className="admin-action-btn admin-action-btn--emphasis" disabled={register.isPending}>
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
        Create broadcast space
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
          window.toast?.success(`Broadcast space created: ${data.space.title}`);
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
      onError: (err) => window.toast?.error(err.message),
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
          <CreateChurchSpaceForm churchId={church.id} />
        </div>
      ) : null}
    </article>
  );
}

export default function AdminChurchesPanel() {
  const churches = useAdminChurches();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <h3>Register a church</h3>
        <p style={{ margin: '4px 0 12px', opacity: 0.75 }}>
          Create the organization in the Clerk dashboard first (staff/volunteers only — congregants never join the
          Clerk org), then paste its id here.
        </p>
        <RegisterChurchForm onRegistered={() => void churches.refetch()} />
      </section>

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

/**
 * Admin › Families — support's case view of a household.
 *
 * Find a family by email, user id or family id (an escalated request's ticket links straight
 * to `/admin/families/<id>`). The case shows who is in it and as what, coverage, open
 * invites, requests and the full history, then the overrides. One reason box serves every
 * action: nothing can be changed without saying why, and the why lands in the family's
 * history beside "Changed by Harvous support".
 *
 * No route here reads anyone's notes. Support decides on what the family and the ticket say.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import AdminShell from '@/components/react/AdminShell';
import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import {
  useAdminFamilies,
  useAdminFamily,
  useAdminFamilyAction,
  type AdminFamilyDetail,
} from '@/hooks/queries/useAdminFamilies';
import { FAMILY_ROLE_LABEL, FAMILY_ROLES, type FamilyRole } from '@/lib/family-roles';
import { prototypeAdminFamiliesRouteTo } from '@/lib/prototype-path';
import { toast } from '@/utils/toast';
import '@/styles/admin-usage.css';

const EVENT_LABEL: Record<string, string> = {
  created: 'Started the family',
  renamed: 'Renamed the family',
  invite_created: 'Made an invite',
  invite_revoked: 'Turned off an invite',
  joined: 'Joined',
  role_changed: 'Changed a role',
  removed: 'Removed',
  left: 'Left',
  dissolved: 'Stopped family sharing',
  request_created: 'Asked to become an adult member',
  request_withdrawn: 'Withdrew their request',
  request_decided: 'Answered a request',
  request_escalated: 'Asked Harvous to review',
  frozen: 'Paused changes',
  unfrozen: 'Resumed changes',
  ownership_transferred: 'Transferred ownership',
};

function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ margin: '0 0 24px' }}>
      <h3 className="pds-inspector-label" style={{ textTransform: 'uppercase', color: 'var(--pds-text-tertiary)', margin: '0 0 8px' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap' as const,
  padding: '10px 0',
  borderBottom: '0.5px solid var(--pds-border)',
};

function SmallButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={danger ? 'proto-settings-danger__btn' : 'proto-settings-btn proto-settings-btn--secondary'}
      style={{ padding: '6px 12px', fontSize: 13, minHeight: 0, width: 'auto' }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FamilyCase({ data, onBack }: { data: AdminFamilyDetail; onBack: () => void }) {
  const action = useAdminFamilyAction(data.family.id);
  const [reason, setReason] = useState('');
  const hasReason = reason.trim().length > 0;
  const busy = action.isPending;

  function run(label: string, path: string, body: Record<string, unknown> = {}, confirmText?: string) {
    if (!hasReason) return;
    // The heavy ones ask once more: they change who pays, or who is in the family at all.
    if (confirmText && !window.confirm(confirmText)) return;
    action.mutate(
      { path, body: { ...body, reason: reason.trim() } },
      {
        onSuccess: () => {
          toast.success(label);
          setReason('');
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'That didn’t work'),
      },
    );
  }

  const { family, members, invites, requests, events } = data;
  const pending = requests.filter((r) => r.status === 'pending' || (r.status === 'declined' && r.escalatedAt));

  return (
    <div>
      <button type="button" className="proto-settings-btn proto-settings-btn--secondary" style={{ width: 'auto', marginBottom: 16 }} onClick={onBack}>
        All families
      </button>
      <h2 className="pds-list-title" style={{ fontSize: 22, margin: '0 0 4px' }}>{family.name}</h2>
      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 16px' }}>
        {family.id} · started {when(family.createdAt)} · {family.sponsoring ? 'owner’s Plus is active' : 'owner’s Plus has lapsed'}
        {family.spaceDeleted ? ' · Family Space deleted' : ''}
      </p>
      {family.frozenAt ? (
        <p className="pds-caption" style={{ color: 'var(--pds-destructive)', margin: '0 0 16px' }}>
          Changes paused {when(family.frozenAt)}: {family.frozenReason}
        </p>
      ) : null}

      <Section title="Reason (required for every change)">
        <textarea
          className="proto-settings-field__input"
          style={{ width: '100%', minHeight: 64, resize: 'vertical' }}
          value={reason}
          maxLength={500}
          placeholder="e.g. Ticket #412: child turned 18, parents unreachable."
          onChange={(e) => setReason(e.target.value)}
        />
      </Section>

      {pending.length > 0 ? (
        <Section title="Requests to become an adult member">
          {pending.map((r) => (
            <div key={r.id} style={rowStyle}>
              <span>
                <strong>{r.name}</strong> asked {when(r.createdAt)}
                {r.status === 'declined' ? ' · a parent said not now' : ''}
                {r.escalatedAt ? ` · escalated ${when(r.escalatedAt)}${r.supportTicketId ? ` (ticket #${r.supportTicketId})` : ''}` : ''}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <SmallButton disabled={!hasReason || busy} onClick={() => run('Approved', `/requests/${r.id}`, { decision: 'approve' })}>
                  Approve
                </SmallButton>
                {r.status === 'pending' ? (
                  <SmallButton disabled={!hasReason || busy} onClick={() => run('Declined', `/requests/${r.id}`, { decision: 'decline' })}>
                    Decline
                  </SmallButton>
                ) : null}
              </span>
            </div>
          ))}
        </Section>
      ) : null}

      <Section title={`People · ${members.length}`}>
        {members.map((m) => (
          <div key={m.userId} style={rowStyle}>
            <span style={{ minWidth: 0 }}>
              <strong>{m.name}</strong> · {FAMILY_ROLE_LABEL[m.role]}
              {m.isOwner ? ' · owner' : ''} · {m.covered ? 'covered' : 'not covered'}
              <br />
              <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>
                {m.email ?? 'no email'} · {m.userId} · joined {when(m.joinedAt)}
                {m.roleChangedBy?.startsWith('support:') ? ' · last change by support' : ''}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(FAMILY_ROLES as readonly FamilyRole[])
                .filter((role) => role !== m.role && !(m.isOwner && role !== 'parent'))
                .map((role) => (
                  <SmallButton
                    key={role}
                    disabled={!hasReason || busy}
                    onClick={() => run(`Now ${FAMILY_ROLE_LABEL[role].toLowerCase()}`, '/role', { userId: m.userId, role })}
                  >
                    Make {FAMILY_ROLE_LABEL[role].toLowerCase()}
                  </SmallButton>
                ))}
              {!m.isOwner ? (
                <>
                  <SmallButton disabled={!hasReason || busy} onClick={() => run('Ownership transferred', '/transfer', { userId: m.userId }, `Make ${m.name} the owner? Coverage will come from their Plus.`)}>
                    Make owner
                  </SmallButton>
                  <SmallButton danger disabled={!hasReason || busy} onClick={() => run('Removed', '/remove', { userId: m.userId }, `Remove ${m.name} from ${family.name}?`)}>
                    Remove
                  </SmallButton>
                </>
              ) : null}
            </span>
          </div>
        ))}
      </Section>

      {invites.length > 0 ? (
        <Section title="Open invites">
          {invites.map((i) => (
            <div key={i.id} style={rowStyle}>
              <span>
                {FAMILY_ROLE_LABEL[i.role as FamilyRole] ?? i.role}
                {i.label ? ` · ${i.label}` : ''} · until {when(i.expiresAt)}
              </span>
              <SmallButton disabled={!hasReason || busy} onClick={() => run('Invite turned off', `/invites/${i.id}/revoke`)}>
                Turn off
              </SmallButton>
            </div>
          ))}
        </Section>
      ) : null}

      <Section title="Whole family">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SmallButton
            disabled={!hasReason || busy}
            onClick={() => run(family.frozenAt ? 'Changes resumed' : 'Changes paused', '/freeze', { frozen: !family.frozenAt })}
          >
            {family.frozenAt ? 'Resume changes' : 'Pause changes'}
          </SmallButton>
          <SmallButton danger disabled={!hasReason || busy} onClick={() => run('Family sharing stopped', '/stop', {}, `Stop family sharing for ${family.name}? Coverage ends for everyone.`)}>
            Stop family sharing
          </SmallButton>
        </div>
        <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '8px 0 0' }}>
          Pausing blocks invites, role changes and answers to requests. Members can always leave.
        </p>
      </Section>

      <Section title="History">
        {events.length === 0 ? <p className="pds-caption">Nothing yet.</p> : null}
        {events.map((e) => (
          <div key={e.id} style={{ ...rowStyle, alignItems: 'flex-start' }}>
            <span style={{ minWidth: 0 }}>
              {e.actorKind === 'support' ? <strong>Harvous support</strong> : <strong>{e.actor ?? 'System'}</strong>}{' '}
              {(EVENT_LABEL[e.kind] ?? e.kind).toLowerCase()}
              {e.target && e.target !== e.actor ? ` · ${e.target}` : ''}
              {e.detail ? ` · ${Object.entries(e.detail).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}` : ''}
              {e.reason ? (
                <>
                  <br />
                  <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>“{e.reason}”</span>
                </>
              ) : null}
            </span>
            <span className="pds-caption" style={{ color: 'var(--pds-text-tertiary)', whiteSpace: 'nowrap' }}>{when(e.createdAt)}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function FamiliesPanel({ initialFamilyId }: { initialFamilyId: string | null }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const list = useAdminFamilies(submitted);
  const detail = useAdminFamily(initialFamilyId);

  if (initialFamilyId) {
    if (detail.isLoading) return <p className="pds-caption">Loading…</p>;
    if (detail.isError || !detail.data) return <p className="pds-caption">That family couldn’t be loaded. It may have stopped family sharing.</p>;
    return <FamilyCase data={detail.data} onBack={() => void navigate({ to: prototypeAdminFamiliesRouteTo() as never })} />;
  }

  return (
    <div>
      <form
        style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <input
          className="proto-settings-field__input"
          style={{ flex: '1 1 auto', minWidth: 0 }}
          value={query}
          placeholder="Email, user id, or family id"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="proto-settings-btn proto-settings-btn--primary proto-ink-on-accent" style={{ width: 'auto' }}>
          Find
        </button>
      </form>
      {list.isLoading ? <p className="pds-caption">Loading…</p> : null}
      {list.data?.families.length === 0 ? <p className="pds-caption">No families found.</p> : null}
      {list.data?.families.map((f) => (
        <button
          key={f.id}
          type="button"
          style={{ ...rowStyle, width: '100%', background: 'none', border: 0, borderBottom: '0.5px solid var(--pds-border)', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => void navigate({ to: `${prototypeAdminFamiliesRouteTo()}/${f.id}` as never })}
        >
          <span>
            <strong>{f.name}</strong> · {f.members} {f.members === 1 ? 'person' : 'people'}
          </span>
          <span className="pds-caption" style={{ color: f.escalated || f.frozen ? 'var(--pds-destructive)' : 'var(--pds-text-secondary)' }}>
            {[f.escalated ? 'review requested' : null, f.pendingRequests ? `${f.pendingRequests} pending` : null, f.frozen ? 'paused' : null]
              .filter(Boolean)
              .join(' · ') || 'nothing open'}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function AdminFamiliesPage() {
  const navigate = useNavigate();
  const admin = useHarvousAdminCheck();
  const params = useParams({ strict: false }) as { familyId?: string };

  useEffect(() => {
    if (admin.isError || (admin.isSuccess && admin.data && !admin.data.isAdmin)) navigate({ to: '/' });
  }, [admin.isError, admin.isSuccess, admin.data, navigate]);

  if (admin.isLoading || !admin.isSuccess) return <ProtoStatusChip visible variant="syncing" label="Loading…" />;
  if (!admin.data?.isAdmin) return null;

  return (
    <AdminShell title="Families" subtitle="Households, requests to become an adult member, and support overrides.">
      <FamiliesPanel initialFamilyId={params.familyId ?? null} />
    </AdminShell>
  );
}

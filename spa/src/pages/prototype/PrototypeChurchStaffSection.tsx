/**
 * Staff roster in the My Church hub — how a church staffs itself without a
 * Harvous admin in the loop.
 *
 * Two visibility levels, matching the server: any staff member can see who is
 * on the team; only a Clerk `org:admin` can change it. Collapsed by default —
 * the roster is administration, not the daily job.
 */
import { useState, type FormEvent } from 'react';
import Icon from '@/components/react/Icon';
import {
  useChurchStaff,
  useChurchStaffActions,
  type ChurchStaffResponse,
} from '../../hooks/queries/useChurchStaff';

function roleLabel(role: string): string | null {
  if (role === 'org:admin') return 'Admin';
  return null;
}

export default function PrototypeChurchStaffSection({
  orgId,
  isStaff,
}: {
  orgId: string | null;
  isStaff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data } = useChurchStaff(orgId, { enabled: isStaff });
  const actions = useChurchStaffActions(orgId);

  if (!data) return null;
  const { staff, pendingInvites, canManage, staffCap, seatsUsed } = data as ChurchStaffResponse;

  const run = (action: Parameters<typeof actions.mutate>[0], onDone?: () => void) => {
    setError(null);
    actions.mutate(action, {
      onSuccess: () => onDone?.(),
      onError: (err) => setError(err instanceof Error ? err.message : 'Something went wrong'),
    });
  };

  const onInvite = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    run({ kind: 'invite', email: trimmed }, () => setEmail(''));
  };

  return (
    <div className="proto-home-section">
      <button
        type="button"
        className="proto-church-hub__lane-action proto-church-staff__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'caret-down' : 'caret-right'} size={10} aria-hidden />
        Team · {staff.length}
        {pendingInvites.length > 0 ? ` · ${pendingInvites.length} invited` : ''}
      </button>

      {open ? (
        <div className="proto-church-staff">
          <ul className="proto-church-staff__list">
            {staff.map((member) => (
              <li key={member.userId} className="proto-church-staff__row">
                <span className="proto-church-staff__name">
                  {member.displayName}
                  {member.isSelf ? ' (you)' : ''}
                </span>
                {roleLabel(member.role) ? (
                  <span className="proto-church-staff__role">{roleLabel(member.role)}</span>
                ) : null}
                {canManage && !member.isSelf ? (
                  <button
                    type="button"
                    className="proto-church-staff__action"
                    disabled={actions.isPending}
                    onClick={() => {
                      if (!window.confirm(`Remove ${member.displayName} from your team?`)) return;
                      run({ kind: 'remove', userId: member.userId });
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}

            {pendingInvites.map((invite) => (
              <li key={invite.id} className="proto-church-staff__row">
                <span className="proto-church-staff__name proto-church-staff__name--pending">
                  {invite.emailAddress}
                </span>
                <span className="proto-church-staff__role">Invited</span>
                {canManage ? (
                  <button
                    type="button"
                    className="proto-church-staff__action"
                    disabled={actions.isPending}
                    onClick={() => run({ kind: 'revoke', invitationId: invite.id })}
                  >
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {canManage ? (
            <>
              <form onSubmit={onInvite} className="proto-church-staff__invite">
                <input
                  className="proto-settings-field__input proto-create-folder-sheet__name-input"
                  type="email"
                  value={email}
                  placeholder="Invite by email"
                  disabled={actions.isPending || seatsUsed >= staffCap}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  type="submit"
                  className="proto-settings-btn proto-settings-btn--secondary"
                  disabled={actions.isPending || !email.trim() || seatsUsed >= staffCap}
                >
                  {actions.isPending ? 'Working…' : 'Invite'}
                </button>
              </form>
              <p className="proto-caption proto-church-staff__meta">
                {seatsUsed >= staffCap
                  ? `Your team is full (${staffCap} seats). Remove someone to invite another.`
                  : `${staffCap - seatsUsed} of ${staffCap} seats left. Staff only — your congregation doesn’t need a seat.`}
              </p>
            </>
          ) : null}

          {error ? <p className="proto-caption proto-church-plan-banner__error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

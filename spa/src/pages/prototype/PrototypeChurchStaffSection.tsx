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
  type ChurchStaffMember,
  type ChurchStaffResponse,
} from '../../hooks/queries/useChurchStaff';
import PrototypeChurchMemberSheet from './PrototypeChurchMemberSheet';
import PrototypeChurchInviteSheet from './PrototypeChurchInviteSheet';

import { ASSIGNABLE_CHURCH_ROLES, churchRoleIcon, churchRoleLabel } from '../../lib/church-roles';

export default function PrototypeChurchStaffSection({
  orgId,
  isStaff,
}: {
  orgId: string | null;
  isStaff: boolean;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<ChurchStaffMember | null>(null);
  /* Plain staff by default — the common hire, and the least you can grant. */
  const [inviteRole, setInviteRole] = useState('org:member');
  const [inviteOpen, setInviteOpen] = useState(false);
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

  const sendInvite = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    run({ kind: 'invite', email: trimmed, role: inviteRole }, () => {
      setEmail('');
      setInviteRole('org:member');
      setInviteOpen(false);
    });
  };

  return (
    <div className="proto-home-section">
      {/* A pane, not a disclosure — the hub's Church tools row opens it. */}
      <div className="proto-church-tools__lane-head">
        {/* Count and seats read together — both are "how full is the team". */}
        <p className="proto-caption proto-home-section__eyebrow">
          {staff.length === 1 ? '1 person' : `${staff.length} people`}
          {pendingInvites.length > 0 ? ` · ${pendingInvites.length} invited` : ''}
          {canManage && seatsUsed < staffCap ? ` · ${staffCap - seatsUsed} seats left` : ''}
        </p>
        {canManage && seatsUsed < staffCap ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            disabled={actions.isPending}
            onClick={() => {
              setError(null);
              setInviteOpen(true);
            }}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">Invite</span>
          </button>
        ) : null}
      </div>

      {(
        <div className="proto-church-staff">
          {/*
            Tools-row anatomy, like the teaching plan and the hub. The old
            `proto-church-staff__*` list classes had no CSS at all — name, role
            and action ran together with no spacing. Role reads from the icon
            and the meta line, never from colour.
          */}
          <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
            {staff.map((member) => (
              /* Every row opens, including your own — the row that did nothing
                 was the whole complaint. What the sheet offers differs by who
                 you are; whether it opens does not. */
              <button
                key={member.userId}
                type="button"
                className="proto-church-tools__row"
                onClick={() => {
                  setError(null);
                  setOpenMember(member);
                }}
              >
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <Icon name={churchRoleIcon(member.role)} size={13} />
                </span>
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title">
                    {member.displayName}
                    {member.isSelf ? ' (you)' : ''}
                  </span>
                  <span className="proto-caption proto-church-tools__row-meta">
                    {churchRoleLabel(member.role)}
                  </span>
                </span>
                <span className="proto-church-tools__row-chevron" aria-hidden>
                  <Icon name="caret-right" size={11} />
                </span>
              </button>
            ))}

            {pendingInvites.map((invite) => (
              <div key={invite.id} className="proto-church-tools__row">
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <Icon name="clock" size={13} />
                </span>
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title">
                    {invite.emailAddress}
                  </span>
                  <span className="proto-caption proto-church-tools__row-meta">Invited</span>
                </span>
                {canManage ? (
                  <button
                    type="button"
                    className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                    disabled={actions.isPending}
                    onClick={() => run({ kind: 'revoke', invitationId: invite.id })}
                  >
                    <span className="proto-glass-action__label">Cancel</span>
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {/*
            One row: field and action side by side, in the same glass-pill
            language as every other action in the hub. Was a bare input above a
            full-width grey slab, with a two-line seat explainer under it —
            three stacked blocks for one small job. The seat count moved to the
            lane head (it is status, and it belongs with the people count), and
            "staff only" moved into the placeholder instead of a caption.
          */}
          

          {canManage && seatsUsed >= staffCap ? (
            <p className="proto-caption proto-church-invite__note">
              Team full. Remove someone to invite another.
            </p>
          ) : null}

          {/* Errors from the roster's own actions (invite / revoke). The sheet
              carries its own copy so a removal failure lands where it happened. */}
          {error && !openMember && !inviteOpen ? (
            <p className="proto-caption proto-church-invite__error">{error}</p>
          ) : null}
        </div>
      )}

      <PrototypeChurchInviteSheet
        open={inviteOpen}
        email={email}
        role={inviteRole}
        pending={actions.isPending}
        error={inviteOpen ? error : null}
        seatsLeft={staffCap - seatsUsed}
        onEmailChange={setEmail}
        onRoleChange={setInviteRole}
        onSubmit={sendInvite}
        onOpenChange={(next) => {
          setInviteOpen(next);
          if (!next) setError(null);
        }}
      />

      <PrototypeChurchMemberSheet
        open={Boolean(openMember)}
        member={openMember}
        roleLabel={churchRoleLabel(openMember?.role)}
        canManage={canManage}
        /* Demoting the only admin would leave the church unable to reach its own
           roster; the server refuses it too, this just doesn't offer it. */
        canChangeRole={
          Boolean(openMember) &&
          !openMember!.isSelf &&
          (openMember!.role !== 'org:admin' ||
            staff.filter((m) => m.role === 'org:admin').length > 1)
        }
        onSetRole={(member, role) => run({ kind: 'role', userId: member.userId, role })}
        pending={actions.isPending}
        error={openMember ? error : null}
        onRemove={(member) => {
          if (!window.confirm(`Remove ${member.displayName} from your team?`)) return;
          run({ kind: 'remove', userId: member.userId }, () => setOpenMember(null));
        }}
        onOpenChange={(next) => {
          if (!next) {
            setOpenMember(null);
            setError(null);
          }
        }}
      />
    </div>
  );
}

/**
 * Settings › Family — a household over a shared space. See docs/future/FAMILY_ACCOUNTS.md.
 *
 * One page, four readers: someone who could start a family, a parent (who invites, arranges
 * and sees their children's progress), a child (who sees exactly what their parents see,
 * and can step out of the child role), and an adult member. Drill-downs — a new invite, an
 * open invite, one person — are sub-screens inside the pane, the way Account's are.
 *
 * What a parent sees is progress, never content, and the child's card renders the very same
 * payload, so the arrangement is never something a child has to take on trust.
 */
import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { enterSpaceUrl } from '@/utils/enter-space-link';
import {
  FAMILY_INVITE_LABEL_MAX,
  FAMILY_ROLE_FOR_INVITER,
  FAMILY_ROLE_LABEL,
  canChangeFamilyRole,
  canRemoveFamilyMember,
  type FamilyRole,
} from '@/lib/family-roles';
import { APIError } from '../../../lib/api';
import {
  useChangeFamilyRole,
  useCreateFamily,
  useDecideAdultRequest,
  useEscalateAdultRequest,
  useRequestAdult,
  useWithdrawAdultRequest,
  useCreateFamilyInvite,
  useDissolveFamily,
  useFamily,
  useFamilyProgress,
  useRemoveFamilyMember,
  useRenameFamily,
  useRevokeFamilyInvite,
  type FamilyInvite,
  type FamilyMember,
  type FamilyProgressEntry,
  type FamilyRoleRequest,
  type FamilyResponse,
} from '../../../hooks/queries/useFamily';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import SharedSpaceMemberAvatar from '../SharedSpaceMemberAvatar';
import { ErrorText, Field } from './account/accountShared';
import {
  SettingsConfirmRow,
  SettingsCopyRow,
  SettingsGroup,
  SettingsIntro,
  SettingsRow,
  SettingsShell,
  SettingsSubScreen,
} from './SettingsShell';

export type InFamily = Extract<FamilyResponse, { me: unknown }>;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="pds-inspector-label"
      style={{ padding: '0 0 6px', textTransform: 'uppercase', color: 'var(--pds-text-tertiary)' }}
    >
      {children}
    </div>
  );
}

function Footnote({ children }: { children: ReactNode }) {
  return (
    <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '-6px 0 20px', textWrap: 'pretty' }}>
      {children}
    </p>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof APIError || error instanceof Error) return error.message || fallback;
  return fallback;
}

const LAST_ACTIVE_LABEL: Record<FamilyProgressEntry['lastActive'], string> = {
  day: 'In the last day',
  week: 'This week',
  month: 'This month',
  earlier: 'Over a month ago',
  never: 'Not yet',
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function inviteTitle(invite: FamilyInvite): string {
  const role = FAMILY_ROLE_LABEL[invite.role];
  return invite.label ? `${role} · ${invite.label}` : `${role} invite`;
}

/** The four signals, as rows. Shared by a parent's card and the child's own. */
function ProgressRows({ entry }: { entry: FamilyProgressEntry }) {
  return (
    <SettingsGroup>
      <SettingsRow label="Last active" value={LAST_ACTIVE_LABEL[entry.lastActive]} trailing="none" />
      <SettingsRow label="Chapters read" value={String(entry.chaptersRead)} trailing="none" />
      <SettingsRow
        label="Books"
        sublabel={entry.booksRead.length > 0 ? entry.booksRead.join(', ') : undefined}
        value={entry.booksRead.length === 0 ? 'None yet' : undefined}
        trailing="none"
      />
      <SettingsRow label="Notes written" value={String(entry.notesWritten)} trailing="none" />
    </SettingsGroup>
  );
}

// ─── Starting a family ──────────────────────────────────────────────────────

function StartFamily({ data }: { data: Extract<FamilyResponse, { family: null }> }) {
  const navigate = useNavigate();
  const create = useCreateFamily();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const others = data.maxMembers - 1;

  async function start() {
    setError(null);
    try {
      await create.mutateAsync(name.trim());
      toast.success('Your family is ready. Invite someone next.');
    } catch (e) {
      setError(errorMessage(e, 'Could not start a family. Try again in a moment.'));
    }
  }

  /*
   * Lock PIN's shape: the action first, in its own card under a glyph and a status line, then
   * what a family means as short rows with a glyph each, rather than a paragraph above a field.
   * The hero classes are Lock PIN's, borrowed as-is so the two pages stay one design.
   */
  return (
    <SettingsShell>
      <SettingsGroup>
        <div className="proto-lock-pin-settings__body">
          <div className="proto-lock-pin-settings__hero">
            <span className="proto-lock-pin-settings__glyph" aria-hidden>
              <Icon name="user-group" size={22} />
            </span>
            <span className="proto-lock-pin-settings__hero-text">
              <span className="proto-lock-pin-settings__status">Start a family</span>
              <span className="proto-lock-pin-settings__lead">
                {data.start.hasPlus
                  ? `Name it, then invite up to ${others} people.`
                  : 'Starting a family needs Harvous Plus.'}
              </span>
            </span>
          </div>
          {data.start.hasPlus ? (
            <>
              <Field label="Family name" value={name} placeholder="The Johnson family" onChange={setName} />
              <ErrorText>{error}</ErrorText>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--primary proto-ink-on-accent"
                disabled={create.isPending || name.trim().length === 0}
                onClick={() => void start()}
              >
                {create.isPending ? 'Starting…' : 'Start a family'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--primary proto-ink-on-accent"
              onClick={() => navigate({ to: '/upgrade' })}
            >
              Get Harvous Plus
            </button>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          leadingIcon="folder"
          label="A Family Space everyone shares"
          sublabel="Everyone in the family can read and write there."
          trailing="none"
        />
        <SettingsRow
          leadingIcon="plus"
          label={`Your Plus covers ${others} more people`}
          sublabel="Review, full history and the Connector. Hosting spaces stays yours."
          trailing="none"
        />
        <SettingsRow
          leadingIcon="chart-simple"
          label="Parents see progress, never notes"
          sublabel="Chapters read, books, notes written. Your child sees the same."
          trailing="none"
        />
        <SettingsRow
          leadingIcon="person"
          label="For ages 13 and up"
          sublabel="A child can become an adult member any time."
          trailing="none"
        />
      </SettingsGroup>
    </SettingsShell>
  );
}

// ─── New invite ─────────────────────────────────────────────────────────────

function NewInviteScreen({ onDone }: { onDone: () => void }) {
  const create = useCreateFamilyInvite();
  const [role, setRole] = useState<FamilyRole>('child');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FamilyInvite | null>(null);

  async function make() {
    setError(null);
    try {
      const { invite } = await create.mutateAsync({ role, label: label.trim() || undefined });
      setCreated(invite);
    } catch (e) {
      setError(errorMessage(e, 'Could not make an invite. Try again in a moment.'));
    }
  }

  if (created) {
    return (
      <SettingsSubScreen title="Invite link" onBack={onDone}>
        <SettingsIntro>
          Send this to them. It works once, for a week, and asks them to accept the {FAMILY_ROLE_LABEL[created.role].toLowerCase()} role before
          they join.
        </SettingsIntro>
        <SettingsCopyRow value={created.url} layout="field" copyLabel="Copy link" />
        <div style={{ height: 16 }} />
        <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={onDone}>
          Done
        </button>
      </SettingsSubScreen>
    );
  }

  return (
    <SettingsSubScreen title="Invite someone" onBack={onDone}>
      <SectionLabel>They join as</SectionLabel>
      <SettingsGroup>
        {(['child', 'adult', 'parent'] as const).map((option) => (
          /* The translation picker's shape: the whole row chooses, the tick sits trailing. */
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={role === option}
            className="proto-note-row proto-settings-row"
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', margin: 0, padding: 12, textAlign: 'left' }}
            onClick={() => setRole(option)}
          >
            {/* The app reset sets `flex-shrink: 0` on everything, so the text must opt back in
                or it pushes the tick past the card's edge. */}
            <span className="proto-settings-list-row__main" style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>
                {FAMILY_ROLE_LABEL[option]}
              </span>
              <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
                {FAMILY_ROLE_FOR_INVITER[option]}
              </span>
            </span>
            <span
              className="proto-settings-list-row__trailing proto-settings-list-row__trailing--orb"
              style={{ flex: '0 0 20px', display: 'flex', justifyContent: 'flex-end' }}
              aria-hidden
            >
              {role === option ? (
                <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                  <Icon name="check" size={11} />
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </SettingsGroup>
      <Field
        label="Note for your list (optional)"
        value={label}
        placeholder="For Tyler"
        onChange={(v) => setLabel(v.slice(0, FAMILY_INVITE_LABEL_MAX))}
      />
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        className="proto-settings-btn proto-settings-btn--primary proto-ink-on-accent"
        disabled={create.isPending}
        onClick={() => void make()}
      >
        {create.isPending ? 'Making a link…' : 'Make invite link'}
      </button>
    </SettingsSubScreen>
  );
}

// ─── An open invite ─────────────────────────────────────────────────────────

function InviteScreen({ invite, onDone }: { invite: FamilyInvite; onDone: () => void }) {
  const revoke = useRevokeFamilyInvite();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <SettingsSubScreen title={inviteTitle(invite)} onBack={onDone}>
      <SettingsIntro>Works once, until {shortDate(invite.expiresAt)}.</SettingsIntro>
      <SettingsCopyRow value={invite.url} layout="field" copyLabel="Copy link" />
      <div style={{ height: 16 }} />
      <div ref={anchorRef}>
        <SettingsGroup>
          <SettingsRow label="Turn off this invite" destructive trailing="none" onClick={() => setConfirming(true)} />
        </SettingsGroup>
      </div>
      {confirming ? (
        <ProtoConfirmDialog
          anchorEl={anchorRef.current}
          preferAbove
          title="Turn off this invite?"
          description="The link stops working. You can make a new one any time."
          confirmLabel="Turn off"
          busy={revoke.isPending}
          onConfirm={() =>
            revoke.mutate(invite.id, {
              onSuccess: () => onDone(),
              onError: (e) => toast.error(errorMessage(e, 'Could not turn it off')),
              onSettled: () => setConfirming(false),
            })
          }
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </SettingsSubScreen>
  );
}

// ─── One person ─────────────────────────────────────────────────────────────

type MemberAction = { key: string; label: string; sublabel?: string; destructive?: boolean; confirm: string; run: () => Promise<unknown> };

function MemberScreen({ data, member, onDone }: { data: InFamily; member: FamilyMember; onDone: () => void }) {
  const changeRole = useChangeFamilyRole();
  const remove = useRemoveFamilyMember();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [pending, setPending] = useState<MemberAction | null>(null);
  const actor = { userId: data.me.userId, role: data.me.role };
  const owner = data.family.ownerUserId;

  const roleMove = (to: FamilyRole, label: string, confirm: string, sublabel?: string): MemberAction | null =>
    canChangeFamilyRole({ actor, ownerUserId: owner, targetUserId: member.userId, from: member.role, to }).ok
      ? { key: `role-${to}`, label, sublabel, confirm, run: () => changeRole.mutateAsync({ userId: member.userId, role: to }) }
      : null;

  const actions = [
    roleMove(
      'adult',
      'Make an adult member',
      member.role === 'child'
        ? `Parents will stop seeing ${member.displayName}’s progress.`
        : `${member.displayName} will no longer see the children’s progress.`,
      member.role === 'child' ? 'Parents stop seeing their progress.' : undefined,
    ),
    roleMove('parent', 'Make a parent', `${member.displayName} will be able to invite people and see the children’s progress.`),
    canRemoveFamilyMember({ actor, ownerUserId: owner, targetUserId: member.userId, targetRole: member.role }).ok
      ? {
          key: 'remove',
          label: 'Remove from family',
          destructive: true,
          confirm: `${member.displayName} leaves the Family Space and the family plan. Their own study stays theirs.`,
          run: () => remove.mutateAsync(member.userId),
        }
      : null,
  ].filter((a): a is MemberAction => a !== null);

  return (
    <SettingsSubScreen title={member.displayName} onBack={onDone}>
      <SettingsIntro>
        {FAMILY_ROLE_LABEL[member.role]}
        {member.isOwner ? ' · started this family' : ''}
        {!member.isOwner ? (member.covered ? ' · covered by the family plan' : ' · not covered right now') : ''}
      </SettingsIntro>
      <div ref={anchorRef}>
        {actions.length > 0 ? (
          <SettingsGroup>
            {actions.map((action) => (
              <SettingsRow
                key={action.key}
                label={action.label}
                sublabel={action.sublabel}
                destructive={action.destructive}
                trailing="none"
                onClick={() => setPending(action)}
              />
            ))}
          </SettingsGroup>
        ) : (
          <Footnote>There&rsquo;s nothing you can change for {member.displayName}.</Footnote>
        )}
      </div>
      {pending ? (
        <ProtoConfirmDialog
          anchorEl={anchorRef.current}
          preferAbove
          title={`${pending.label}?`}
          description={pending.confirm}
          confirmLabel={pending.destructive ? 'Remove' : 'Change'}
          busy={changeRole.isPending || remove.isPending}
          onConfirm={() => {
            pending
              .run()
              .then(() => onDone())
              .catch((e) => toast.error(errorMessage(e, 'Could not make that change')))
              .finally(() => setPending(null));
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </SettingsSubScreen>
  );
}

// ─── The family ─────────────────────────────────────────────────────────────

type View = { kind: 'main' } | { kind: 'invite-new' } | { kind: 'invite'; id: string } | { kind: 'member'; userId: string } | { kind: 'rename' };

function RenameScreen({ current, onDone }: { current: string; onDone: () => void }) {
  const rename = useRenameFamily();
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSubScreen title="Family name" onBack={onDone}>
      <Field label="Family name" value={name} onChange={setName} />
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        className="proto-settings-btn proto-settings-btn--primary proto-ink-on-accent"
        disabled={rename.isPending || name.trim().length === 0 || name.trim() === current}
        onClick={() =>
          rename.mutate(name.trim(), {
            onSuccess: () => onDone(),
            onError: (e) => setError(errorMessage(e, 'Could not rename the family')),
          })
        }
      >
        Save
      </button>
    </SettingsSubScreen>
  );
}

// ─── Becoming an adult member ───────────────────────────────────────────────

/**
 * A child can't make themselves an adult member: they ask, and a parent answers. If no one
 * answers in 14 days, or a parent says "not now", they can ask Harvous to review it. Leaving
 * the family is always theirs, at the foot of the page, so asking is never the only way out.
 */
function ChildRequestCard({ request, frozen }: { request: FamilyRoleRequest | null; frozen: boolean }) {
  const ask = useRequestAdult();
  const withdraw = useWithdrawAdultRequest();
  const escalate = useEscalateAdultRequest();
  const [confirming, setConfirming] = useState<'ask' | 'escalate' | null>(null);
  const [message, setMessage] = useState('');
  const now = Date.now();
  const live = request && (request.status === 'pending' || request.status === 'declined') ? request : null;
  const reviewing = Boolean(live?.escalatedAt);
  const canEscalate = Boolean(
    live && !live.escalatedAt && live.escalationOpensAt && new Date(live.escalationOpensAt).getTime() <= now,
  );
  const coolingDown = live?.status === 'declined' && live.askAgainAt && new Date(live.askAgainAt).getTime() > now;
  const fail = (e: unknown) => toast.error(errorMessage(e, 'Could not do that'));

  if (confirming === 'ask') {
    return (
      <section className="proto-settings-danger" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
        <SettingsConfirmRow
          prompt="Ask your parents? If one of them approves, they’ll stop seeing your progress."
          confirmLabel="Ask"
          busy={ask.isPending}
          onConfirm={() => ask.mutate(undefined, { onError: fail, onSettled: () => setConfirming(null) })}
          onCancel={() => setConfirming(null)}
        />
      </section>
    );
  }

  if (confirming === 'escalate' && live) {
    return (
      <SettingsGroup>
        <div className="proto-lock-pin-settings__body">
          <Field
            label="Anything Harvous should know? (optional)"
            value={message}
            placeholder="For example: I turned 18 and live on my own now."
            onChange={(v) => setMessage(v.slice(0, 1000))}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--primary proto-ink-on-accent"
              disabled={escalate.isPending}
              onClick={() =>
                escalate.mutate(
                  { requestId: live.id, message: message.trim() || undefined },
                  {
                    onSuccess: () => toast.success('Sent to Harvous support. They’ll reply by email.'),
                    onError: fail,
                    onSettled: () => setConfirming(null),
                  },
                )
              }
            >
              {escalate.isPending ? 'Sending…' : 'Ask Harvous to review'}
            </button>
            <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        </div>
      </SettingsGroup>
    );
  }

  return (
    <SettingsGroup>
      {!live || (live.status === 'declined' && !coolingDown && !reviewing) ? (
        <SettingsRow
          label="Ask to become an adult member"
          sublabel={frozen ? 'Paused while Harvous support looks into something.' : 'A parent approves it. Then they stop seeing your progress.'}
          disabled={frozen}
          trailing="none"
          onClick={() => setConfirming('ask')}
        />
      ) : reviewing ? (
        <SettingsRow
          label="Harvous support is reviewing your request"
          sublabel={`You asked on ${shortDate(live.createdAt)}. They’ll reply by email.`}
          trailing="none"
        />
      ) : live.status === 'pending' ? (
        <>
          <SettingsRow
            label="Waiting for a parent to answer"
            sublabel={
              canEscalate
                ? `You asked on ${shortDate(live.createdAt)} and no one has answered.`
                : `You asked on ${shortDate(live.createdAt)}.${live.escalationOpensAt ? ` If no one answers, you can ask Harvous to review it after ${shortDate(live.escalationOpensAt)}.` : ''}`
            }
            trailing="none"
          />
          {canEscalate ? (
            <SettingsRow label="Ask Harvous to review" onClick={() => setConfirming('escalate')} />
          ) : null}
          <SettingsRow
            label="Take back my request"
            trailing="none"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(live.id, { onError: fail })}
          />
        </>
      ) : (
        <>
          <SettingsRow
            label="A parent said not now"
            sublabel={live.askAgainAt ? `You can ask again on ${shortDate(live.askAgainAt)}.` : undefined}
            trailing="none"
          />
          {canEscalate ? (
            <SettingsRow
              label="Ask Harvous to review"
              sublabel="Harvous support can look at it with you."
              onClick={() => setConfirming('escalate')}
            />
          ) : null}
        </>
      )}
    </SettingsGroup>
  );
}

/** A parent's view of a request: who asked, what approving does, and the two answers. */
function ParentRequestCard({ request, frozen }: { request: FamilyRoleRequest; frozen: boolean }) {
  const decide = useDecideAdultRequest();
  const answer = (decision: 'approve' | 'decline') =>
    decide.mutate(
      { requestId: request.id, decision },
      {
        onSuccess: () =>
          toast.success(decision === 'approve' ? `${request.displayName} is now an adult member` : 'They can ask again in 30 days'),
        onError: (e) => toast.error(errorMessage(e, 'Could not answer')),
      },
    );
  /* One ordinary row and two small, equal answers — not a hero. While support has the family
     paused the answers go: the notice at the top of the page already says why. */
  return (
    <SettingsGroup>
      <SettingsRow
        label={`${request.displayName} asked to become an adult member`}
        sublabel={
          frozen
            ? 'You can answer once Harvous support is done.'
            : `If you approve, parents stop seeing their progress.${request.escalatedAt ? ' They’ve also asked Harvous to review it.' : ''}`
        }
        trailing="none"
      />
      {!frozen ? (
        <div style={{ display: 'flex', gap: 8, padding: '0 12px 12px' }}>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--primary proto-ink-on-accent"
            style={{ flex: '1 1 0', minWidth: 0, width: 'auto' }}
            disabled={decide.isPending}
            onClick={() => answer('approve')}
          >
            Approve
          </button>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            style={{ flex: '1 1 0', minWidth: 0, width: 'auto' }}
            disabled={decide.isPending}
            onClick={() => answer('decline')}
          >
            Not now
          </button>
        </div>
      ) : null}
    </SettingsGroup>
  );
}

/** Exported for the dev gallery (`/__dev/family-design`), which renders it inside a demo. */
export function FamilyView({ data }: { data: InFamily }) {
  const navigate = useNavigate();
  const { family, me, maxMembers } = data;
  const isParent = me.role === 'parent';
  const progress = useFamilyProgress(me.role !== 'adult');
  const remove = useRemoveFamilyMember();
  const dissolve = useDissolveFamily();
  const [view, setView] = useState<View>({ kind: 'main' });
  const [confirmLeave, setConfirmLeave] = useState(false);
  const frozen = Boolean(family.frozen);
  const requests = family.requests ?? [];

  const back = () => setView({ kind: 'main' });
  if (view.kind === 'invite-new') return <NewInviteScreen onDone={back} />;
  if (view.kind === 'rename') return <RenameScreen current={family.name} onDone={back} />;
  if (view.kind === 'invite') {
    const invite = family.invites.find((i) => i.id === view.id);
    if (invite) return <InviteScreen invite={invite} onDone={back} />;
  }
  if (view.kind === 'member') {
    const member = family.members.find((m) => m.userId === view.userId);
    if (member) return <MemberScreen data={data} member={member} onDone={back} />;
  }

  const seats = family.members.length + family.invites.length;
  const myEntry = me.role === 'child' ? progress.data?.entries.find((e) => e.userId === me.userId) : undefined;
  const children = isParent ? (progress.data?.entries ?? []) : [];

  return (
    <SettingsShell>
      {!family.sponsoring ? (
        <SettingsIntro>
          {me.isOwner
            ? 'Your Plus has ended, so it isn’t covering your family right now. Everyone stays in the family.'
            : `${family.ownerFirstName ?? 'The owner'}’s Plus isn’t covering the family right now. You’re still in it.`}
        </SettingsIntro>
      ) : null}
      {frozen ? (
        <SettingsIntro>
          Harvous support has paused changes to this family while they look into something. You can still leave.
        </SettingsIntro>
      ) : null}

      {isParent
        ? requests
            .filter((r) => r.status === 'pending')
            .map((r) => <ParentRequestCard key={r.id} request={r} frozen={frozen} />)
        : null}

      <SettingsGroup>
        <SettingsRow
          label={family.name}
          sublabel={isParent ? 'Rename' : undefined}
          leadingIcon="user-group"
          trailing={isParent ? 'chevron' : 'none'}
          onClick={isParent ? () => setView({ kind: 'rename' }) : undefined}
        />
        {family.spaceAvailable ? (
          <SettingsRow
            label="Open the Family Space"
            sublabel="Everyone in the family can read and write here."
            onClick={() => void navigate({ to: enterSpaceUrl(family.spaceId) as never })}
          />
        ) : null}
      </SettingsGroup>

      <SectionLabel>{`People · ${family.members.length} of ${maxMembers}`}</SectionLabel>
      <SettingsGroup>
        {family.members.map((member) => (
          <SettingsRow
            key={member.userId}
            label={member.isMe ? `${member.displayName} (you)` : member.displayName}
            sublabel={`${FAMILY_ROLE_LABEL[member.role]}${member.isOwner ? ' · pays for Plus' : member.covered ? ' · covered' : ''}${member.changedBySupport ? ' · changed by Harvous support' : ''}`}
            leadingNode={
              <SharedSpaceMemberAvatar
                userId={member.userId}
                displayName={member.displayName}
                userColor={member.userColor}
                profileImageUrl={member.profileImageUrl}
              />
            }
            trailing={isParent && !member.isMe && !frozen ? 'chevron' : 'none'}
            onClick={isParent && !member.isMe && !frozen ? () => setView({ kind: 'member', userId: member.userId }) : undefined}
          />
        ))}
        {isParent
          ? family.invites.map((invite) => (
              <SettingsRow
                key={invite.id}
                label={inviteTitle(invite)}
                sublabel={`Invite sent · works until ${shortDate(invite.expiresAt)}`}
                leadingIcon="envelope"
                onClick={() => setView({ kind: 'invite', id: invite.id })}
              />
            ))
          : null}
        {isParent && seats < maxMembers ? (
          <SettingsRow
            label="Invite someone"
            leadingIcon="plus"
            disabled={!family.sponsoring || frozen}
            onClick={() => setView({ kind: 'invite-new' })}
          />
        ) : null}
      </SettingsGroup>
      {me.hasOwnPlus && !me.isOwner && family.sponsoring ? (
        <Footnote>You also have your own Plus. The family covers you, so you can cancel yours from Plan any time.</Footnote>
      ) : null}

      {isParent && children.length > 0 ? (
        <>
          <SectionLabel>How your children are doing · last 30 days</SectionLabel>
          {children.map((entry) => (
            <div key={entry.userId}>
              <p className="pds-list-title" style={{ margin: '0 0 6px', color: 'var(--pds-text-primary)' }}>
                {entry.displayName}
              </p>
              <ProgressRows entry={entry} />
            </div>
          ))}
          <Footnote>Counts only. You never see their notes, highlights, searches, or Review.</Footnote>
        </>
      ) : null}

      {me.role === 'child' ? (
        <>
          <SectionLabel>What your parents can see · last 30 days</SectionLabel>
          {myEntry ? (
            <ProgressRows entry={myEntry} />
          ) : (
            <SettingsGroup>
              <SettingsRow label={progress.isLoading ? 'Loading…' : 'Nothing to show yet'} trailing="none" />
            </SettingsGroup>
          )}
          <Footnote>They can never see your notes, highlights, searches, or Review.</Footnote>
          <ChildRequestCard request={requests[0] ?? null} frozen={frozen} />
        </>
      ) : null}

      {/* My Notes' danger strip: a hairline and one quiet word, red only when you reach for
          it, with the confirm replacing it in place. Stopping family sharing isn't something to browse
          past in a card of its own. */}
      <section className="proto-settings-danger">
        {confirmLeave ? (
          <SettingsConfirmRow
            prompt={
              me.isOwner
                ? 'Stop family sharing? Your Plus stops covering everyone, and parents stop seeing progress. The Family Space stays, with everyone in it.'
                : me.role === 'child'
                  ? 'Leave the family? Your parents stop seeing your progress right away. Your notes in the Family Space leave with you, and the family plan stops covering you.'
                  : 'Leave the family? Your notes in the Family Space leave with you, and the family plan stops covering you.'
            }
            confirmLabel={me.isOwner ? 'Stop sharing' : 'Leave'}
            busy={dissolve.isPending || remove.isPending}
            onConfirm={() => {
              const done = {
                onSettled: () => setConfirmLeave(false),
                onError: (e: unknown) => toast.error(errorMessage(e, 'Could not do that')),
              };
              if (me.isOwner) dissolve.mutate(undefined, done);
              else remove.mutate(me.userId, done);
            }}
            onCancel={() => setConfirmLeave(false)}
          />
        ) : (
          <div className="proto-settings-danger__actions">
            <button
              type="button"
              className="proto-settings-danger__btn"
              disabled={me.isOwner && frozen}
              onClick={() => setConfirmLeave(true)}
            >
              {me.isOwner ? 'Stop family sharing' : 'Leave the family'}
            </button>
          </div>
        )}
      </section>


    </SettingsShell>
  );
}

export default function PrototypeFamilyPage() {
  const { data, isLoading, isError } = useFamily();
  if (isLoading) return <SettingsShell>{null}</SettingsShell>;
  if (isError || !data) {
    return (
      <SettingsShell>
        <SettingsIntro>Family settings couldn&rsquo;t load. Try again in a moment.</SettingsIntro>
      </SettingsShell>
    );
  }
  if (data.family === null) return <StartFamily data={data} />;
  return <FamilyView data={data as InFamily} />;
}

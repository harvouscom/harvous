/**
 * Ministries — an expanded tool opened from the My Church hub (docs/CHURCH_V2_ROADMAP.md §C).
 *
 * The main column is the church as its ministries: each one with its channels and groups, then
 * "Church-wide" for what belongs to none. Any space moves with the menu on its row. Choosing a
 * ministry docks its editor beside the list — name, description, which teachers lead it — the
 * planner's and Review questions' shape rather than a modal.
 *
 * Arranging is a church admin's (`manage_staff`); every staffer can look. Scoping only ever
 * applies to teachers and plain staff: admins, pastors and coordinators lead the whole church.
 */
import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { APIError } from '../../lib/api';
import {
  useChurchMinistries,
  useChurchMinistryActions,
  type ChurchMinistry,
  type ChurchMinistriesResponse,
  type MinistryAction,
  type MinistrySpace,
} from '../../hooks/queries/useChurchMinistries';
import { useChurchStaff, type ChurchStaffMember } from '../../hooks/queries/useChurchStaff';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import { useProtoShell } from '../../layouts/proto-shell-context';
import ProtoSidebarExpandedPanel from './ProtoSidebarExpandedPanel';
import ProtoSelectMenu, { type ProtoSelectOption } from './ProtoSelectMenu';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import PrototypeStaffToolGate from './PrototypeStaffToolGate';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import type { ExpandedSidebarToolProps } from './PrototypeExpandedSidebarHost';

const CHURCH_WIDE = '__church__';
/** Roles that always lead every space — mirrors CHURCH_WIDE_ROLES on the server. */
const CHURCH_WIDE_ROLES = new Set(['org:admin', 'org:pastor', 'org:coordinator']);

type Selection = { mode: 'create' } | { mode: 'edit'; ministryId: string } | null;

function spaceMeta(space: MinistrySpace, ministryName: string | null): string {
  if (space.kind !== 'channel') return 'Group';
  if (space.audience === 'ministry' && ministryName) return `Channel · ${ministryName} groups only`;
  if (space.audience === 'leaders' && ministryName) return `Channel · ${ministryName} leaders only`;
  return 'Channel';
}

type Audience = 'church' | 'ministry' | 'leaders';

function audienceOptions(ministryName: string): ProtoSelectOption<Audience>[] {
  return [
    { value: 'church', label: 'Anyone in the church can follow', triggerLabel: 'Open to all' },
    { value: 'ministry', label: `Only people in ${ministryName} groups`, triggerLabel: 'Groups only' },
    { value: 'leaders', label: `Only ${ministryName} group leaders`, triggerLabel: 'Leaders only' },
  ];
}

export default function PrototypeExpandedMinistries({ exiting, origin, onClose }: ExpandedSidebarToolProps) {
  const { activeChurchOrgId } = useProtoShell();
  const orgId = activeChurchOrgId ?? null;
  const staffStatus = useChurchStaffStatus(orgId);
  const { can } = staffStatus;
  const isStaff = can('publish');
  const query = useChurchMinistries(orgId, { enabled: isStaff });
  const staffQuery = useChurchStaff(orgId, { enabled: isStaff });
  const actions = useChurchMinistryActions(orgId);
  const [selection, setSelection] = useState<Selection>(null);
  const [showArchived, setShowArchived] = useState(false);
  /* Narrowing a channel removes follows, so it asks first — with the count, never names. */
  const [audienceConfirm, setAudienceConfirm] = useState<{
    space: MinistrySpace;
    audience: Audience;
    count: number;
    anchor: HTMLElement | null;
  } | null>(null);

  const data = query.data;
  const canManage = Boolean(data?.canManage);
  const live = useMemo(() => (data?.ministries ?? []).filter((m) => !m.archivedAt), [data]);
  const archived = useMemo(() => (data?.ministries ?? []).filter((m) => m.archivedAt), [data]);
  const editing = selection?.mode === 'edit' ? live.find((m) => m.id === selection.ministryId) ?? null : null;

  const moveOptions: ProtoSelectOption<string>[] = [
    ...live.map((m) => ({ value: m.id, label: m.name })),
    { value: CHURCH_WIDE, label: 'Church-wide' },
  ];

  function run(action: MinistryAction, done?: string) {
    actions.mutate(action, {
      onSuccess: (response) => {
        if (response?.sync && !response.sync.ok) {
          window.toast?.error('Saved. Leaders will update on the next sync — use Sync on Team if it is urgent.');
        } else if (done) {
          window.toast?.success(done);
        }
      },
      onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not do that'),
    });
  }

  function move(space: MinistrySpace, to: string) {
    const ministryId = to === CHURCH_WIDE ? null : to;
    actions.mutate(
      { type: 'assign-space', spaceId: space.id, ministryId },
      {
        onSuccess: () => window.toast?.success(`${space.title} moved`),
        onError: (error) => {
          // A group and its channel belong together — offer to move both rather than dead-end.
          if (error instanceof APIError && error.code === 'PAIRED_ACROSS_MINISTRIES') {
            actions.mutate(
              { type: 'assign-space', spaceId: space.id, ministryId, movePair: true },
              {
                onSuccess: () => window.toast?.success(`${space.title} and its paired space moved together`),
                onError: (again) => window.toast?.error(again instanceof Error ? again.message : 'Could not move it'),
              },
            );
            return;
          }
          window.toast?.error(error instanceof Error ? error.message : 'Could not move it');
        },
      },
    );
  }

  function applyAudience(space: MinistrySpace, audience: Audience) {
    actions.mutate(
      { type: 'set-channel-audience', spaceId: space.id, audience },
      {
        onSuccess: () =>
          window.toast?.success(audience === 'church' ? `${space.title} is open to the whole church` : `${space.title} restricted`),
        onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not change that'),
      },
    );
  }

  function changeAudience(space: MinistrySpace, audience: Audience) {
    if (audience === space.audience) return;
    // Opening up removes nothing; narrowing may, so count first.
    if (audience === 'church') {
      applyAudience(space, audience);
      return;
    }
    actions.mutate(
      { type: 'set-channel-audience', spaceId: space.id, audience, dryRun: true },
      {
        onSuccess: (response) => {
          const count = response?.affectedFollowCount ?? 0;
          if (count === 0) {
            applyAudience(space, audience);
            return;
          }
          const anchor = document.querySelector<HTMLElement>(`[data-ministry-space-row="${space.id}"]`);
          setAudienceConfirm({ space, audience, count, anchor });
        },
        onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not change that'),
      },
    );
  }

  const spaceRow = (space: MinistrySpace, current: string, ministryName: string | null = null) => (
    <div
      key={space.id}
      className="proto-church-tools__row proto-church-tools__row--status"
      data-ministry-space-row={space.id}
    >
      <span className="proto-church-tools__row-icon" aria-hidden>
        <Icon name={space.kind === 'channel' ? 'rss' : 'user-group'} size={13} />
      </span>
      <span className="proto-church-tools__row-text">
        <span className="pds-list-title proto-church-tools__row-title">{space.title}</span>
        <span className="proto-caption proto-church-tools__row-meta">{spaceMeta(space, ministryName)}</span>
      </span>
      {canManage && ministryName && space.kind === 'channel' ? (
        <ProtoSelectMenu<Audience>
          label={`Who can follow ${space.title}`}
          options={audienceOptions(ministryName)}
          menuWidth={260}
          value={(space.audience as Audience) ?? 'church'}
          disabled={actions.isPending}
          className="proto-ministries__move"
          onChange={(value) => changeAudience(space, value)}
        />
      ) : null}
      {canManage && moveOptions.length > 1 ? (
        <ProtoSelectMenu<string>
          label={`Ministry for ${space.title}`}
          options={moveOptions}
          value={current}
          disabled={actions.isPending}
          className="proto-ministries__move"
          onChange={(value) => {
            if (value !== current) move(space, value);
          }}
        />
      ) : null}
    </div>
  );

  const hasAnything = live.length > 0 || (data?.unassignedSpaces.length ?? 0) > 0;

  return (
    <ProtoSidebarExpandedPanel
      label="Ministries"
      title="Ministries"
      actions={
        canManage ? (
          <button
            type="button"
            className="proto-glass-surface proto-glass-surface--control proto-glass-action"
            onClick={() => setSelection({ mode: 'create' })}
          >
            <Icon name="plus" size={12} aria-hidden />
            <span className="proto-glass-action__label">New ministry</span>
          </button>
        ) : undefined
      }
      exiting={exiting}
      origin={origin}
      centered
      onClose={onClose}
    >
      <div className="proto-planner">
        <div className="proto-planner__main">
          {!isStaff ? (
            <PrototypeStaffToolGate
              loading={staffStatus.isLoading}
              error={staffStatus.isError}
              onRetry={() => void staffStatus.refetch()}
              toolName="Ministries"
            />
          ) : query.isPending ? (
            <ProtoSpaceLoading label="Loading ministries" />
          ) : query.isError || !data ? (
            <div className="proto-church-review__body proto-church-review__body--empty">
              <PrototypeListEmptyState
                iconName="circle-exclamation"
                title="Couldn’t load ministries"
                action={
                  <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={() => void query.refetch()}>
                    Try again
                  </button>
                }
              />
            </div>
          ) : live.length === 0 ? (
            <div className="proto-church-review__body proto-church-review__body--empty">
              <PrototypeListEmptyState
                iconName="layer-group"
                title="No ministries yet"
                description="Group your channels and groups — Kids, Youth, Adults — and give each ministry's teachers just the rooms they lead."
                action={
                  canManage ? (
                    <button type="button" className="proto-settings-btn" onClick={() => setSelection({ mode: 'create' })}>
                      New ministry
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="proto-church-review__body">
              {live.map((ministry) => (
                <section key={ministry.id} className="proto-ministries__group">
                  <button
                    type="button"
                    className="proto-ministries__head"
                    aria-current={editing?.id === ministry.id ? 'true' : undefined}
                    disabled={!canManage}
                    onClick={() => setSelection({ mode: 'edit', ministryId: ministry.id })}
                  >
                    <span className="pds-list-title">{ministry.name}</span>
                    <span className="proto-caption proto-ministries__head-meta">
                      {ministry.staffUserIds.length
                        ? `${ministry.staffUserIds.length} ${ministry.staffUserIds.length === 1 ? 'teacher' : 'teachers'}`
                        : 'Led by the whole team'}
                    </span>
                  </button>
                  {ministry.spaces.length ? (
                    <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                      {ministry.spaces.map((space) => spaceRow(space, ministry.id, ministry.name))}
                    </div>
                  ) : (
                    <p className="proto-caption proto-ministries__empty">
                      Nothing here yet. Move a channel or group in from below.
                    </p>
                  )}
                </section>
              ))}

              {data.unassignedSpaces.length ? (
                <section className="proto-ministries__group">
                  <div className="proto-ministries__head proto-ministries__head--static">
                    <span className="pds-list-title">Church-wide</span>
                    <span className="proto-caption proto-ministries__head-meta">Led by the whole team</span>
                  </div>
                  <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                    {data.unassignedSpaces.map((space) => spaceRow(space, CHURCH_WIDE))}
                  </div>
                </section>
              ) : null}

              {archived.length ? (
                <section className="proto-ministries__group">
                  <button type="button" className="proto-church-review__text-btn" onClick={() => setShowArchived((v) => !v)}>
                    {showArchived ? 'Hide archived' : `Archived (${archived.length})`}
                  </button>
                  {showArchived ? (
                    <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                      {archived.map((ministry) => (
                        <div key={ministry.id} className="proto-church-tools__row proto-church-tools__row--status">
                          <span className="proto-church-tools__row-text">
                            <span className="pds-list-title proto-church-tools__row-title">{ministry.name}</span>
                          </span>
                          {canManage ? (
                            <button
                              type="button"
                              className="proto-church-review__text-btn"
                              disabled={actions.isPending}
                              onClick={() => run({ type: 'restore', ministryId: ministry.id }, `${ministry.name} restored`)}
                            >
                              Restore
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {!hasAnything ? null : (
                <p className="proto-caption proto-church-review__note">
                  Teachers you scope to a ministry lead only its rooms. Admins, pastors and coordinators
                  lead everything.
                </p>
              )}
            </div>
          )}
        </div>

        {audienceConfirm ? (
          <ProtoConfirmDialog
            anchorEl={audienceConfirm.anchor}
            alignRight
            title={`Restrict ${audienceConfirm.space.title}?`}
            description={`${
              audienceConfirm.count === 1 ? '1 person follows' : `${audienceConfirm.count} people follow`
            } it from outside the new audience. They stop following, and its notes and Review questions stop reaching them.`}
            confirmLabel="Restrict"
            cancelLabel="Keep it open"
            busy={actions.isPending}
            onConfirm={() => {
              const { space, audience } = audienceConfirm;
              setAudienceConfirm(null);
              applyAudience(space, audience);
            }}
            onCancel={() => setAudienceConfirm(null)}
          />
        ) : null}

        {selection && canManage ? (
          <MinistryEditorPane
            key={selection.mode === 'edit' ? selection.ministryId : 'new'}
            ministry={editing}
            staff={staffQuery.data?.staff ?? []}
            allMinistries={live}
            busy={actions.isPending}
            onClose={() => setSelection(null)}
            onCreated={(ministryId) => setSelection({ mode: 'edit', ministryId })}
            onAction={(action, done, after) =>
              actions.mutate(action, {
                onSuccess: (response) => {
                  if (response?.sync && !response.sync.ok) {
                    window.toast?.error('Saved. Leaders will update on the next sync.');
                  } else if (done) window.toast?.success(done);
                  after?.(response);
                },
                onError: (error) => window.toast?.error(error instanceof Error ? error.message : 'Could not do that'),
              })
            }
          />
        ) : null}
      </div>
    </ProtoSidebarExpandedPanel>
  );
}

function MinistryEditorPane({
  ministry,
  staff,
  allMinistries,
  busy,
  onClose,
  onAction,
  onCreated,
}: {
  ministry: ChurchMinistry | null;
  staff: ChurchStaffMember[];
  allMinistries: ChurchMinistry[];
  busy: boolean;
  onClose: () => void;
  onAction: (action: MinistryAction, done?: string, after?: (response?: ChurchMinistriesResponse) => void) => void;
  /** A new ministry opens in its editor, where its teachers are picked. */
  onCreated: (ministryId: string) => void;
}) {
  const [name, setName] = useState(ministry?.name ?? '');
  const [description, setDescription] = useState(ministry?.description ?? '');
  const [confirmArchive, setConfirmArchive] = useState<DOMRect | null>(null);
  const creating = !ministry;
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const dirty = trimmed !== (ministry?.name ?? '') || (description.trim() || '') !== (ministry?.description ?? '');

  /** Everyone's current ministries, so ticking one person changes only this ministry for them. */
  const ministriesOf = (userId: string) => allMinistries.filter((m) => m.staffUserIds.includes(userId)).map((m) => m.id);

  function save() {
    if (!trimmed) return;
    if (creating) {
      onAction({ type: 'create', name: trimmed, description: description.trim() || null }, `${trimmed} created`, (response) => {
        const created = response?.ministries.find((m) => !m.archivedAt && m.name === trimmed);
        if (created) onCreated(created.id);
        else onClose();
      });
    } else {
      onAction({ type: 'update', ministryId: ministry.id, name: trimmed, description: description.trim() || null }, 'Saved');
    }
  }

  function toggleTeacher(member: ChurchStaffMember, on: boolean) {
    if (!ministry) return;
    const current = ministriesOf(member.userId);
    const next = on ? [...new Set([...current, ministry.id])] : current.filter((id) => id !== ministry.id);
    onAction(
      { type: 'set-staff', userId: member.userId, ministryIds: next },
      on
        ? `${member.displayName} now leads ${ministry.name}`
        : next.length
          ? `${member.displayName} no longer leads ${ministry.name}`
          : `${member.displayName} leads the whole church again`,
    );
  }

  const scopable = staff.filter((member) => !CHURCH_WIDE_ROLES.has(member.role));
  const wide = staff.filter((member) => CHURCH_WIDE_ROLES.has(member.role));

  return (
    <aside className="proto-planner-editor proto-church-review-pane" aria-label={creating ? 'New ministry' : 'Edit ministry'}>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">{creating ? 'New ministry' : ministry.name}</span>
        <div className="proto-side-panel__header-actions">
          <button type="button" className="proto-side-panel__action-btn" onClick={onClose} aria-label="Close" title="Close">
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>
      <div className="proto-planner-editor__body">
        <div className="proto-church-review-editor">
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">Name</span>
            <input
              className="proto-settings-field__input"
              value={name}
              maxLength={40}
              placeholder="Youth"
              onChange={(event) => setName(event.target.value)}
              autoFocus={creating}
            />
          </label>
          <label className="proto-settings-field">
            <span className="proto-settings-field__label">Description</span>
            <textarea
              className="proto-settings-field__input proto-church-review-editor__prompt"
              rows={2}
              value={description}
              maxLength={140}
              placeholder="Grades 6–12, Wednesday nights"
              onChange={(event) => setDescription(event.target.value.replace(/\n/g, ' '))}
            />
          </label>

          {ministry ? (
            <>
              <p className="proto-settings-field__label proto-church-review-editor__label">Teachers who lead it</p>
              {scopable.length ? (
                <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
                  {scopable.map((member) => {
                    const on = ministry.staffUserIds.includes(member.userId);
                    return (
                      <button
                        key={member.userId}
                        type="button"
                        className="proto-church-tools__row"
                        aria-pressed={on}
                        disabled={busy}
                        onClick={() => toggleTeacher(member, !on)}
                      >
                        <span className="proto-church-tools__row-text">
                          <span className="pds-list-title proto-church-tools__row-title">{member.displayName}</span>
                          <span className="proto-caption proto-church-tools__row-meta">
                            {ministriesOf(member.userId).length
                              ? allMinistries
                                  .filter((m) => m.staffUserIds.includes(member.userId))
                                  .map((m) => m.name)
                                  .join(', ')
                              : 'Leads the whole church'}
                          </span>
                        </span>
                        <span
                          className={`proto-church-review-editor__correct${on ? ' proto-church-review-editor__correct--on proto-ink-on-accent' : ''}`}
                          aria-hidden
                        >
                          {on ? <Icon name="check" size={10} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="proto-caption proto-church-review-editor__hint">
                  Only teachers and staff can be scoped. Give someone the Teacher role on Team first.
                </p>
              )}
              {wide.length ? (
                <p className="proto-caption proto-church-review-editor__hint">
                  {wide.map((m) => m.displayName).join(', ')} {wide.length === 1 ? 'leads' : 'lead'} every ministry as{' '}
                  {wide.length === 1 ? 'an admin, pastor or coordinator' : 'admins, pastors or coordinators'}.
                </p>
              ) : null}
              {scopable.length ? (
                <p className="proto-caption proto-church-review-editor__hint">
                  A teacher you tick here leads only the rooms in their ministries. Untick everything and
                  they lead the whole church again.
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="proto-add-notes-sheet__footer proto-church-review-editor__footer">
          {ministry ? (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              disabled={busy}
              onClick={(event) => setConfirmArchive(event.currentTarget.getBoundingClientRect())}
            >
              Archive
            </button>
          ) : null}
          <button
            type="button"
            className="proto-share-popover__primary"
            disabled={busy || !trimmed || (!creating && !dirty)}
            onClick={save}
          >
            {creating ? 'Create' : 'Save'}
          </button>
        </div>
      </div>

      {confirmArchive && ministry ? (
        <ProtoConfirmDialog
          anchorRect={confirmArchive}
          preferAbove
          title={`Archive ${ministry.name}?`}
          description={
            ministry.spaces.length
              ? `Its ${ministry.spaces.length === 1 ? 'room becomes' : `${ministry.spaces.length} rooms become`} church-wide. Teachers scoped only here will lead nothing until you scope them again.`
              : 'Teachers scoped only here will lead nothing until you scope them again.'
          }
          confirmLabel="Archive"
          cancelLabel="Keep"
          busy={busy}
          onConfirm={() => {
            setConfirmArchive(null);
            onAction({ type: 'archive', ministryId: ministry.id, releaseSpaces: true }, `${ministry.name} archived`, onClose);
          }}
          onCancel={() => setConfirmArchive(null)}
        />
      ) : null}
    </aside>
  );
}

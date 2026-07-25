/**
 * People + invite management for a shared space. Owner sees the invite-link
 * controls (create / copy / revoke); everyone sees the member list.
 * Prototype-native — do not reuse Classic's EditSpacePanel/SpaceMembersList.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { prototypeHomeRouteTo, prototypeSettingsSupportRouteTo } from '@/lib/prototype-path';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import {
  formatInviteExpiry,
  resolveInviteExpiresAt,
  type InviteExpiryPreset,
} from '../../lib/shared-space-invite-expiry';
import { getSpaceMembersCapacityCopy, MEMBERS_PER_SPACE_CAP } from '@/lib/shared-spaces-limits';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useSpaceMembers, useSpaceInvites } from '../../hooks/queries/useSpace';
import { useCreateSpaceInvite, useRevokeSpaceInvite } from '../../hooks/mutations/useSpaceInviteActions';
import { useRemoveSpaceMember } from '../../hooks/mutations/useRemoveSpaceMember';
import { isDeletedSpaceUnavailableError, useDeleteSharedSpace } from '../../hooks/mutations/useDeleteSharedSpace';

import PrototypeSpaceSettingsSection from './PrototypeSpaceSettingsSection';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import SharedSpaceMemberAvatar from './SharedSpaceMemberAvatar';
import SharedSpaceInviteExpiryPicker from './SharedSpaceInviteExpiryPicker';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import { SettingsGroup, SettingsRow } from './settings/SettingsShell';

export interface PrototypeSpacePeopleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceTitle: string;
  spaceColor?: string | null;
  spaceDescription?: string | null;
  /** Stored light cover — restores the selected image variant in settings. */
  spaceCoverBgLight?: import('@/utils/space-cover').SpaceCoverBg | null;
  spacePublishCadence?: import('@/utils/channel-publish-cadence').PublishCadence | null;
  spaceCadenceStale?: boolean;
  /** Nav/dashboard hint until members query resolves (keeps owner hub reachable). */
  viewerIsOwner?: boolean;
  /** Ministry channel staff (owner/leader) — follower list + settings while members load. */
  viewerCanModerate?: boolean;
  /** Ministry channel: follower moderation + color settings; no invite links. */
  ministryChannel?: boolean;
}

export type PendingRemoveMember = {
  userId: string;
  displayName: string;
  isSelf: boolean;
};

export function membershipRemovalConfirmationCopy(member: PendingRemoveMember): {
  title: string;
  description: string;
} {
  if (member.isSelf) {
    return {
      title: 'Leave this space?',
      description: 'Your notes stay in My Home.',
    };
  }
  return {
    title: `Remove ${member.displayName}?`,
    description: 'Their notes stay in My Home.',
  };
}

export function resolvePeopleQueryState(input: {
  isLoading: boolean;
  isError: boolean;
  count: number;
}): 'loading' | 'error' | 'empty' | 'ready' {
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  return input.count === 0 ? 'empty' : 'ready';
}

/**
 * Owner view is a settings-style hub (mirrors the Account page): a short list of
 * rows, each drilling into its own focused sub-view. Members (non-owners) skip the
 * hub — they only have the people list — so they land on it directly.
 */
type PeopleView = 'hub' | 'people' | 'invites' | 'details';

export default function PrototypeSpacePeopleSheet({
  open,
  onOpenChange,
  spaceId,
  spaceTitle: spaceTitleProp,
  spaceColor,
  spaceDescription,
  spaceCoverBgLight,
  spacePublishCadence = null,
  spaceCadenceStale = false,
  viewerIsOwner = false,
  viewerCanModerate = false,
  ministryChannel = false,
}: PrototypeSpacePeopleSheetProps) {
  const [spaceTitle, setSpaceTitle] = useState(spaceTitleProp);
  const [view, setView] = useState<PeopleView>('hub');
  const navigate = useNavigate();
  const { userId: authUserId } = useAuth();
  const { isMobileSidebar, setActiveSpaceId } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();
  const descriptionId = useId();
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [pendingRemoveMember, setPendingRemoveMember] = useState<PendingRemoveMember | null>(null);
  const [removeConfirmAnchor, setRemoveConfirmAnchor] = useState<DOMRect | null>(null);
  const [pendingRevokeInviteId, setPendingRevokeInviteId] = useState<string | null>(null);
  const [revokeConfirmAnchor, setRevokeConfirmAnchor] = useState<DOMRect | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmAnchor, setDeleteConfirmAnchor] = useState<DOMRect | null>(null);
  const [inviteExpiryPreset, setInviteExpiryPreset] = useState<InviteExpiryPreset>('30d');
  const [inviteCustomDate, setInviteCustomDate] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  const membersQuery = useSpaceMembers(spaceId);
  const ownerFromMembers = membersQuery.data?.members.some((m) => m.userId === authUserId && m.role === 'owner');
  const isOwner = membersQuery.data?.isOwner ?? ownerFromMembers ?? viewerIsOwner;
  const selfRole = membersQuery.data?.members.find((m) => m.userId === authUserId)?.role;
  const isChannelStaff =
    ministryChannel &&
    (isOwner || selfRole === 'leader' || selfRole === 'owner' || viewerCanModerate);
  /** Owner hub, or ministry staff hub (followers + channel settings). */
  const canManageHub = isOwner || isChannelStaff;
  const invitesQuery = useSpaceInvites(spaceId, isOwner && !ministryChannel);
  const createInvite = useCreateSpaceInvite(spaceId);
  const revokeInvite = useRevokeSpaceInvite(spaceId);
  const removeMember = useRemoveSpaceMember(spaceId);
  const deleteSpace = useDeleteSharedSpace();

  useEffect(() => {
    setSpaceTitle(spaceTitleProp);
  }, [spaceTitleProp, spaceId]);

  useEffect(() => {
    if (!open) {
      setView('hub');
      setCopiedInviteId(null);
      setPendingRemoveMember(null);
      setRemoveConfirmAnchor(null);
      setPendingRevokeInviteId(null);
      setRevokeConfirmAnchor(null);
      if (!deleteSpace.isPending) {
        setDeleteConfirmOpen(false);
        setDeleteConfirmAnchor(null);
      }
      setIsCreatingInvite(false);
    }
  }, [open, deleteSpace.isPending]);

  useEffect(() => {
    if (view !== 'invites') setIsCreatingInvite(false);
  }, [view]);

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.12,
      fallbackWidth: 340,
      fallbackHeight: 420,
    },
    [membersQuery.data, invitesQuery.data, view, isCreatingInvite],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation, {
    ignoreSelector: '.harvous-delete-confirm',
    dismissOnEscape: false,
  });
  useProtoDialogFocus({
    open: open && showPopoverPortal,
    dialogRef: cardRef,
    onDismiss: () => onOpenChange(false),
  });

  async function copyInvite(inviteId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteId(inviteId);
      toast.success('Invite link copied');
      setTimeout(() => setCopiedInviteId((prev) => (prev === inviteId ? null : prev)), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  }

  function memberRowAction(m: { userId: string; role: string; displayName: string }) {
    if (m.role === 'owner') return null;
    // Shared Spaces: owner removes. Ministry channels: staff may remove followers for moderation.
    if (m.userId !== authUserId && (isOwner || (ministryChannel && isChannelStaff))) return 'remove';
    if (m.userId === authUserId) return 'leave';
    return null;
  }

  function handleConfirmRemoveMember() {
    if (!pendingRemoveMember) return;
    const { userId, isSelf } = pendingRemoveMember;
    removeMember.mutate(userId, {
      onSuccess: () => {
        setPendingRemoveMember(null);
        setRemoveConfirmAnchor(null);
        if (isSelf) {
          setActiveSpaceId(null);
          onOpenChange(false);
          void navigate({ to: prototypeHomeRouteTo() as any, replace: true });
        }
      },
      onError: (err) => {
        const msg =
          err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update membership';
        toast.error(msg);
      },
    });
  }

  function handleConfirmRevokeInvite() {
    if (!pendingRevokeInviteId) return;
    revokeInvite.mutate(pendingRevokeInviteId, {
      onSuccess: () => {
        setPendingRevokeInviteId(null);
        setRevokeConfirmAnchor(null);
      },
      onError: (err) => {
        const msg =
          err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not turn off link';
        toast.error(msg);
      },
    });
  }

  function handleConfirmDeleteSpace() {
    deleteSpace.mutate(spaceId, {
      onSuccess: () => {
        setDeleteConfirmOpen(false);
        setDeleteConfirmAnchor(null);
        setActiveSpaceId(null);
        onOpenChange(false);
        void navigate({ to: prototypeHomeRouteTo() as any, replace: true });
      },
      onError: (err) => {
        if (isDeletedSpaceUnavailableError(err)) {
          setDeleteConfirmOpen(false);
          setDeleteConfirmAnchor(null);
          setActiveSpaceId(null);
          onOpenChange(false);
          void navigate({ to: prototypeHomeRouteTo() as any, replace: true });
        }
        const msg =
          err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not delete space';
        toast.error(msg);
      },
    });
  }

  const members = membersQuery.data?.members ?? [];
  const invites = invitesQuery.data?.invites ?? [];
  const memberCount = members.length;
  const memberLimit = membersQuery.data?.limits?.membersPerSpace ?? MEMBERS_PER_SPACE_CAP;
  const ownerCapacityCopy =
    isOwner && !ministryChannel && !membersQuery.isLoading
      ? getSpaceMembersCapacityCopy({ memberCount, memberLimit })
      : null;
  const activeInvites = invites.length;
  const showBack = canManageHub && view !== 'hub';
  const peopleLabel = ministryChannel ? 'Followers' : 'People';
  const settingsLabel = ministryChannel ? 'Channel settings' : 'Space settings';
  const manageLabel = ministryChannel ? 'Manage channel' : 'Manage space';
  // On a sub-view the header title becomes that section's name (the eyebrow label
  // inside the scroll is dropped as redundant); the hub keeps "Manage space".
  const headerPrimary = !canManageHub
    ? peopleLabel
    : view === 'people'
      ? peopleLabel
      : view === 'invites'
        ? 'Invite links'
        : view === 'details'
          ? settingsLabel
          : manageLabel;

  const memberListState = resolvePeopleQueryState({
    isLoading: membersQuery.isLoading,
    isError: membersQuery.isError,
    count: members.length,
  });
  const memberList =
    memberListState === 'loading' ? (
      <p className="proto-inspector-section-title">Loading…</p>
    ) : memberListState === 'error' ? (
      <div className="proto-shared-thread-state" role="alert">
        <p>Could not load people.</p>
        <button type="button" className="proto-shared-thread-action" onClick={() => void membersQuery.refetch()}>
          Retry
        </button>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ownerCapacityCopy ? (
          <div className="proto-shared-people-capacity">
            {ownerCapacityCopy.inviteLine ? <p>{ownerCapacityCopy.inviteLine}</p> : null}
            <p className="proto-shared-people-capacity__limit">
              <span>{ownerCapacityCopy.maxLineText}</span>{' '}
              {ownerCapacityCopy.atLimit ? (
                <button
                  type="button"
                  className="proto-shared-people-capacity__support-link"
                  onClick={() => {
                    onOpenChange(false);
                    void navigate({ to: prototypeSettingsSupportRouteTo() as any });
                  }}
                >
                  Contact support
                </button>
              ) : null}
            </p>
          </div>
        ) : null}
        {members.map((m) => {
          const rowAction = memberRowAction(m);
          return (
            <div key={m.userId} className="proto-shared-people-row">
              <SharedSpaceMemberAvatar
                userId={m.userId}
                firstName={m.firstName}
                displayName={m.displayName}
                userColor={m.userColor}
                profileImageUrl={m.profileImageUrl}
              />
              <span className="proto-shared-people-row__name">{m.displayName}</span>
              {m.userId === authUserId ? <span className="proto-shared-people-row__tag">You</span> : null}
              {m.role === 'owner' ? (
                <span className="proto-shared-people-row__tag proto-shared-people-row__tag--owner">Owner</span>
              ) : null}
              {rowAction ? (
                <button
                  type="button"
                  className={`proto-shared-people-row__action${rowAction === 'remove' ? ' proto-shared-people-row__action--destructive' : ''}`}
                  disabled={removeMember.isPending}
                  onClick={(e) => {
                    setRemoveConfirmAnchor(e.currentTarget.getBoundingClientRect());
                    setPendingRemoveMember({
                      userId: m.userId,
                      displayName: m.displayName,
                      isSelf: m.userId === authUserId,
                    });
                  }}
                >
                  {rowAction === 'leave' ? 'Leave space' : 'Remove'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );

  async function submitCreateInvite() {
    let expiresAt: string | null;
    try {
      expiresAt = resolveInviteExpiresAt(inviteExpiryPreset, inviteCustomDate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Pick a valid expiration');
      return;
    }
    try {
      await createInvite.mutateAsync({ expiresAt });
      setIsCreatingInvite(false);
    } catch (err) {
      const msg =
        err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not create invite link';
      toast.error(msg);
    }
  }

  const invitesView = (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {invites.map((invite) => {
          const displayUrl = invite.inviteUrl.replace(/^https?:\/\//, '');
          const isCopied = copiedInviteId === invite.id;
          return (
            <div key={invite.id} className="proto-shared-invite">
              <div className="proto-share-popover__url-row">
                <input
                  type="text"
                  readOnly
                  value={displayUrl}
                  className="proto-share-popover__url-input"
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Invite link"
                />
                <button
                  type="button"
                  className="proto-share-popover__copy"
                  aria-label="Copy invite link"
                  onClick={() => void copyInvite(invite.id, invite.inviteUrl)}
                >
                  {isCopied ? (
                    <>
                      <Icon name="check" size={14} aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Icon name="copy" size={14} aria-hidden />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="proto-share-popover__actions">
                <span className="proto-shared-invite__expiry">{formatInviteExpiry(invite.expiresAt)}</span>
                <button
                  type="button"
                  className="proto-share-popover__link-action proto-share-popover__link-action--danger"
                  disabled={revokeInvite.isPending}
                  onClick={(e) => {
                    setRevokeConfirmAnchor(e.currentTarget.getBoundingClientRect());
                    setPendingRevokeInviteId(invite.id);
                  }}
                >
                  Turn off link
                </button>
              </div>
            </div>
          );
        })}
        {invitesQuery.isError ? (
          <div className="proto-shared-thread-state" role="alert">
            <p>Could not load invite links.</p>
            <button type="button" className="proto-shared-thread-action" onClick={() => void invitesQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : invitesQuery.isLoading ? (
          <p className="proto-inspector-muted proto-connect-note-sheet__status">Loading…</p>
        ) : invites.length === 0 ? (
          <div className="proto-shared-invite-empty">
            <PrototypeListEmptyState
              iconName="link"
              title="No invite links yet"
              description="Create a link to share this space with others."
            />
          </div>
        ) : null}
      </div>

      {isCreatingInvite ? (
        <div className="proto-shared-invite-create">
          <SharedSpaceInviteExpiryPicker
            preset={inviteExpiryPreset}
            customDate={inviteCustomDate}
            onPresetChange={setInviteExpiryPreset}
            onCustomDateChange={setInviteCustomDate}
            idPrefix={`invite-expiry-${spaceId}`}
          />
          <div className="proto-space-switcher__create-actions">
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              disabled={createInvite.isPending}
              onClick={() => setIsCreatingInvite(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="proto-settings-btn"
              disabled={createInvite.isPending}
              onClick={() => void submitCreateInvite()}
            >
              {createInvite.isPending ? 'Creating…' : 'Create link'}
            </button>
          </div>
        </div>
      ) : (
        <div className="proto-add-notes-sheet__footer">
          <button type="button" className="proto-share-popover__primary" onClick={() => setIsCreatingInvite(true)}>
            New invite link
          </button>
        </div>
      )}
    </>
  );

  // Owner / channel-staff hub — one row per concern (Account-page pattern).
  const hub = (
    <div className="proto-settings__content">
      <SettingsGroup>
        <SettingsRow
          label={peopleLabel}
          sublabel={ministryChannel ? 'Followers (moderation)' : 'Members and access'}
          value={String(memberCount)}
          onClick={() => setView('people')}
        />
        {!ministryChannel ? (
          <SettingsRow
            label="Invite links"
            sublabel="Create and share invites"
            value={activeInvites > 0 ? `${activeInvites} active` : 'None'}
            onClick={() => setView('invites')}
          />
        ) : null}
        <SettingsRow
          label={settingsLabel}
          sublabel="Name, description, color, and cover"
          onClick={() => setView('details')}
        />
      </SettingsGroup>
    </div>
  );

  let body: React.ReactNode;
  if (membersQuery.isError) {
    body = memberList;
  } else if (!canManageHub) {
    body = memberList;
  } else if (view === 'people') {
    body = memberList;
  } else if (view === 'invites' && !ministryChannel) {
    body = invitesView;
  } else if (view === 'details') {
    body = (
      <>
        <PrototypeSpaceSettingsSection
          spaceId={spaceId}
          initialTitle={spaceTitle}
          initialColor={spaceColor}
          initialDescription={spaceDescription}
          initialCoverBgLight={spaceCoverBgLight}
          initialPublishCadence={spacePublishCadence}
          initialCadenceStale={spaceCadenceStale}
          onSaved={setSpaceTitle}
          iconName={ministryChannel ? 'rss' : 'user-group'}
          ministryChannel={ministryChannel}
        />
        {isOwner ? (
          <div className="proto-shared-manage-danger">
            <button
              type="button"
              className="proto-share-popover__link-action proto-share-popover__link-action--danger"
              disabled={deleteSpace.isPending}
              onClick={(e) => {
                setDeleteConfirmAnchor(e.currentTarget.getBoundingClientRect());
                setDeleteConfirmOpen(true);
              }}
            >
              {deleteSpace.isPending ? 'Deleting…' : ministryChannel ? 'Delete channel' : 'Delete space'}
            </button>
          </div>
        ) : null}
      </>
    );
  } else {
    body = hub;
  }

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          {showBack ? (
            <button
              type="button"
              className="proto-side-panel__action-btn"
              onClick={() => setView('hub')}
              aria-label="Back"
              title="Back"
            >
              <Icon name="caret-left" size={14} />
            </button>
          ) : (
            <ProtoSpaceMenuIcon
              color={spaceColor ?? 'paper'}
              size={44}
              radius={13}
              glyphSize={18}
              iconName={ministryChannel ? 'rss' : 'user-group'}
            />
          )}
          <span className="proto-study-thread-popover__title-block">
            <span
              id={headingId}
              className="proto-study-thread-popover__title"
              role="heading"
              aria-level={2}
              tabIndex={-1}
              data-proto-dialog-heading
            >
              {headerPrimary}
            </span>
            <span id={descriptionId} className="proto-study-thread-popover__subtitle">
              {spaceTitle}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-connect-note-sheet__scroll">{body}</div>
    </>
  );

  const confirmDialogs = (
    <>
      {pendingRemoveMember && removeConfirmAnchor ? (
        <ProtoConfirmDialog
          anchorRect={removeConfirmAnchor}
          {...membershipRemovalConfirmationCopy(pendingRemoveMember)}
          confirmLabel={pendingRemoveMember.isSelf ? 'Leave' : 'Remove'}
          cancelLabel="Cancel"
          busy={removeMember.isPending}
          onConfirm={handleConfirmRemoveMember}
          onCancel={() => {
            if (!removeMember.isPending) {
              setPendingRemoveMember(null);
              setRemoveConfirmAnchor(null);
            }
          }}
        />
      ) : null}
      {pendingRevokeInviteId && revokeConfirmAnchor ? (
        <ProtoConfirmDialog
          anchorRect={revokeConfirmAnchor}
          title="Turn off invite link?"
          description="It will stop working."
          confirmLabel="Turn off"
          cancelLabel="Keep"
          busy={revokeInvite.isPending}
          onConfirm={handleConfirmRevokeInvite}
          onCancel={() => {
            if (!revokeInvite.isPending) {
              setPendingRevokeInviteId(null);
              setRevokeConfirmAnchor(null);
            }
          }}
        />
      ) : null}
      {deleteConfirmOpen && deleteConfirmAnchor ? (
        <ProtoConfirmDialog
          anchorRect={deleteConfirmAnchor}
          title={`Delete "${spaceTitle}"?`}
          description="Restore within 30 days; notes stay in My Home."
          confirmLabel="Delete"
          cancelLabel="Keep"
          busy={deleteSpace.isPending}
          onConfirm={handleConfirmDeleteSpace}
          onCancel={() => {
            if (!deleteSpace.isPending) {
              setDeleteConfirmOpen(false);
              setDeleteConfirmAnchor(null);
            }
          }}
        />
      ) : null}
    </>
  );

  if (!open && !mounted) {
    return confirmDialogs;
  }

  if (showPopoverPortal && typeof document !== 'undefined') {
    return (
      <>
        {createPortal(
          <>
            <ProtoDialogBackdrop
              exiting={exiting}
              onDismiss={() => onOpenChange(false)}
              aria-label="Close manage space dialog"
            />
            <ProtoPopoverShell
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              aria-describedby={descriptionId}
              className={portaledDialogShellClassName(
                'proto-connect-note-popover proto-create-folder-popover',
                exiting,
              )}
              style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999, zIndex: 6000 }}
            >
              <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet proto-shared-manage-sheet">
                {content}
              </div>
            </ProtoPopoverShell>
          </>,
          document.body,
        )}
        {confirmDialogs}
      </>
    );
  }

  if (!open) {
    return confirmDialogs;
  }

  return (
    <>
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          onOverlayClick={() => onOpenChange(false)}
          overlayClassName="proto-connect-note-sheet-overlay"
          className="proto-connect-note-sheet proto-create-folder-sheet proto-shared-manage-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          aria-describedby={descriptionId}
        >
          {content}
        </DrawerContent>
      </Drawer.Root>
      {confirmDialogs}
    </>
  );
}

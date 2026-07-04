/**
 * People + invite management for a shared space. Owner sees the invite-link
 * controls (create / copy / revoke); everyone sees the member list.
 * Prototype-native — do not reuse Classic's EditSpacePanel/SpaceMembersList.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { spaceIconAccentHex, avatarGlyphColorForAccent } from '@/utils/space-cover';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { APIError } from '../../lib/api';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useSpaceMembers, useSpaceInvites } from '../../hooks/queries/useSpace';
import { useCreateSpaceInvite, useRevokeSpaceInvite } from '../../hooks/mutations/useSpaceInviteActions';
import { useRemoveSpaceMember } from '../../hooks/mutations/useRemoveSpaceMember';
import { useDeleteSharedSpace } from '../../hooks/mutations/useDeleteSharedSpace';

import PrototypeSpaceSettingsSection from './PrototypeSpaceSettingsSection';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { SettingsGroup, SettingsRow } from './settings/SettingsShell';

export interface PrototypeSpacePeopleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceTitle: string;
  spaceColor?: string | null;
  spaceDescription?: string | null;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  return `Expires ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

type PendingRemoveMember = {
  userId: string;
  displayName: string;
  isSelf: boolean;
};

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
}: PrototypeSpacePeopleSheetProps) {
  const [spaceTitle, setSpaceTitle] = useState(spaceTitleProp);
  const [view, setView] = useState<PeopleView>('hub');
  const navigate = useNavigate();
  const { userId: authUserId } = useAuth();
  const { isMobileSidebar, setActiveSpaceId } = useProtoShell();
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);

  // Member avatar tint — pastel appearance accent + darkened initial (matches the join page).
  const memberAvatarStyle = (color?: string | null): React.CSSProperties => {
    const bg = spaceIconAccentHex(color || 'blue', colorScheme);
    return { background: bg, color: avatarGlyphColorForAccent(bg, colorScheme) ?? undefined };
  };
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [pendingRemoveMember, setPendingRemoveMember] = useState<PendingRemoveMember | null>(null);
  const [removeConfirmAnchor, setRemoveConfirmAnchor] = useState<DOMRect | null>(null);
  const [pendingRevokeInviteId, setPendingRevokeInviteId] = useState<string | null>(null);
  const [revokeConfirmAnchor, setRevokeConfirmAnchor] = useState<DOMRect | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmAnchor, setDeleteConfirmAnchor] = useState<DOMRect | null>(null);

  const membersQuery = useSpaceMembers(spaceId);
  const isOwner = membersQuery.data?.isOwner ?? false;
  const invitesQuery = useSpaceInvites(spaceId, isOwner);
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
      setDeleteConfirmOpen(false);
      setDeleteConfirmAnchor(null);
    }
  }, [open]);

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const shouldUsePopover = open && !shouldUseSheetPresentation;

  useLayoutEffect(() => {
    if (!shouldUsePopover) return;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 420;
    const cardWidth = cardRef.current?.getBoundingClientRect().width ?? 340;
    const viewportMargin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      left: Math.max(viewportMargin, (vw - cardWidth) / 2),
      top: Math.max(viewportMargin, Math.min(vh - cardHeight - viewportMargin, vh * 0.12)),
    });
  }, [shouldUsePopover, membersQuery.data, invitesQuery.data, view]);

  useDismissOnOutside(cardRef, () => onOpenChange(false), shouldUsePopover);

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
    if (isOwner && m.userId !== authUserId) return 'remove';
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
          void navigate({ to: prototypeHomeRouteTo(), replace: true });
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
          err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not revoke invite';
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
        void navigate({ to: prototypeHomeRouteTo(), replace: true });
      },
      onError: (err) => {
        const msg =
          err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not delete space';
        toast.error(msg);
      },
    });
  }

  const members = membersQuery.data?.members ?? [];
  const invites = invitesQuery.data?.invites ?? [];
  const memberCount = members.length;
  const activeInvites = invites.length;
  const showBack = isOwner && view !== 'hub';
  // On a sub-view the header title becomes that section's name (the eyebrow label
  // inside the scroll is dropped as redundant); the hub keeps "Manage space".
  const headerPrimary = !isOwner
    ? 'People'
    : view === 'people'
      ? 'People'
      : view === 'invites'
        ? 'Invite links'
        : view === 'details'
          ? 'Space settings'
          : 'Manage space';

  const memberList = membersQuery.isLoading ? (
    <p className="proto-inspector-section-title">Loading…</p>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {members.map((m) => {
        const rowAction = memberRowAction(m);
        return (
          <div key={m.userId} className="proto-shared-people-row">
            <span className="proto-shared-people-row__avatar" aria-hidden style={memberAvatarStyle(m.userColor)}>
              {(m.firstName || m.displayName || '?').charAt(0).toUpperCase()}
            </span>
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
                <span className="proto-shared-invite__expiry">{formatExpiry(invite.expiresAt)}</span>
                <button
                  type="button"
                  className="proto-share-popover__link-action proto-share-popover__link-action--danger"
                  disabled={revokeInvite.isPending}
                  onClick={(e) => {
                    setRevokeConfirmAnchor(e.currentTarget.getBoundingClientRect());
                    setPendingRevokeInviteId(invite.id);
                  }}
                >
                  Revoke link
                </button>
              </div>
            </div>
          );
        })}
        {invites.length === 0 && !invitesQuery.isLoading ? (
          <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>No active invite links yet.</p>
        ) : null}
      </div>

      <div className="proto-add-notes-sheet__footer">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={createInvite.isPending}
          onClick={() => void createInvite.mutateAsync()}
        >
          {createInvite.isPending ? 'Creating…' : 'New invite link'}
        </button>
      </div>
    </>
  );

  // Owner hub — one row per concern, each drilling into its own sub-view (Account-page pattern).
  const hub = (
    <div className="proto-settings__content">
      <SettingsGroup>
        <SettingsRow
          label="People"
          sublabel="Members and access"
          value={String(memberCount)}
          onClick={() => setView('people')}
        />
        <SettingsRow
          label="Invite links"
          sublabel="Create and share invites"
          value={activeInvites > 0 ? `${activeInvites} active` : 'None'}
          onClick={() => setView('invites')}
        />
        <SettingsRow
          label="Space settings"
          sublabel="Name, description, and color"
          onClick={() => setView('details')}
        />
      </SettingsGroup>
    </div>
  );

  let body: React.ReactNode;
  if (!isOwner) {
    body = memberList;
  } else if (view === 'people') {
    body = memberList;
  } else if (view === 'invites') {
    body = invitesView;
  } else if (view === 'details') {
    body = (
      <>
        <PrototypeSpaceSettingsSection
          spaceId={spaceId}
          initialTitle={spaceTitle}
          initialColor={spaceColor}
          initialDescription={spaceDescription}
          onSaved={setSpaceTitle}
        />
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
            {deleteSpace.isPending ? 'Deleting…' : 'Delete space'}
          </button>
        </div>
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
            <ProtoSpaceMenuIcon color={spaceColor ?? 'paper'} size={44} radius={13} glyphSize={18} />
          )}
            <span className="proto-study-thread-popover__title-block">
              <span className="proto-study-thread-popover__title">{headerPrimary}</span>
              <span className="proto-study-thread-popover__subtitle">{spaceTitle}</span>
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
          title={
            pendingRemoveMember.isSelf
              ? 'Leave this space?'
              : `Remove ${pendingRemoveMember.displayName}?`
          }
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
          title="Revoke this invite link? Anyone with the link will no longer be able to join."
          confirmLabel="Revoke"
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
          title={`Delete "${spaceTitle}"? This removes it for everyone and can't be undone.`}
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

  if (!open) {
    return confirmDialogs;
  }

  if (shouldUsePopover && typeof document !== 'undefined') {
    return (
      <>
        {createPortal(
          <ProtoPopoverShell
            ref={cardRef}
            role="dialog"
            aria-label={`People in ${spaceTitle}`}
            className="proto-connect-note-popover proto-create-folder-popover"
            style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999, zIndex: 6000 }}
          >
            <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet proto-shared-manage-sheet">
              {content}
            </div>
          </ProtoPopoverShell>,
          document.body,
        )}
        {confirmDialogs}
      </>
    );
  }

  return (
    <>
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          onOverlayClick={() => onOpenChange(false)}
          overlayClassName="proto-connect-note-sheet-overlay"
          className="proto-connect-note-sheet proto-create-folder-sheet proto-shared-manage-sheet"
        >
          {content}
        </DrawerContent>
      </Drawer.Root>
      {confirmDialogs}
    </>
  );
}

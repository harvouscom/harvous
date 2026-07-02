/**
 * People + invite management for a shared space. Owner sees the invite-link
 * controls (create / copy / revoke); everyone sees the member list.
 * Prototype-native — do not reuse Classic's EditSpacePanel/SpaceMembersList.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useSpaceMembers, useSpaceInvites } from '../../hooks/queries/useSpace';
import { useCreateSpaceInvite, useRevokeSpaceInvite } from '../../hooks/mutations/useSpaceInviteActions';

export interface PrototypeSpacePeopleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceTitle: string;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  return `Expires ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function PrototypeSpacePeopleSheet({
  open,
  onOpenChange,
  spaceId,
  spaceTitle,
}: PrototypeSpacePeopleSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const membersQuery = useSpaceMembers(spaceId);
  const isOwner = membersQuery.data?.isOwner ?? false;
  const invitesQuery = useSpaceInvites(spaceId, isOwner);
  const createInvite = useCreateSpaceInvite(spaceId);
  const revokeInvite = useRevokeSpaceInvite(spaceId);

  useEffect(() => {
    if (!open) setCopiedInviteId(null);
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
  }, [shouldUsePopover, membersQuery.data, invitesQuery.data]);

  useDismissOnOutside(cardRef, () => onOpenChange(false), shouldUsePopover);

  async function copyInvite(inviteId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInviteId(inviteId);
      setTimeout(() => setCopiedInviteId((prev) => (prev === inviteId ? null : prev)), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  const members = membersQuery.data?.members ?? [];
  const invites = invitesQuery.data?.invites ?? [];

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="user-group" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">People in {spaceTitle}</span>
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

      <div className="proto-connect-note-sheet__scroll">
        {membersQuery.isLoading ? (
          <p className="proto-inspector-section-title">Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {members.map((m) => (
              <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: `var(--color-${m.userColor || 'blue'})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {(m.firstName || m.displayName || '?').charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                  {m.displayName}
                </span>
                {m.role === 'owner' ? (
                  <span className="proto-menu-item__check" aria-hidden style={{ width: 'auto', fontSize: 11, opacity: 0.6 }}>
                    Owner
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {isOwner ? (
          <>
            <p className="proto-inspector-section-title proto-create-folder-sheet__notes-label" style={{ marginTop: 12 }}>
              Invite links
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 10,
                    border: '1px solid var(--pds-border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{formatExpiry(invite.expiresAt)}</div>
                  </div>
                  <button
                    type="button"
                    className="proto-side-panel__action-btn"
                    title="Copy link"
                    aria-label="Copy invite link"
                    onClick={() => void copyInvite(invite.id, invite.inviteUrl)}
                  >
                    <Icon name={copiedInviteId === invite.id ? 'check' : 'link'} size={13} />
                  </button>
                  <button
                    type="button"
                    className="proto-side-panel__action-btn"
                    title="Revoke link"
                    aria-label="Revoke invite link"
                    disabled={revokeInvite.isPending}
                    onClick={() => revokeInvite.mutate(invite.id)}
                  >
                    <Icon name="xmark" size={12} />
                  </button>
                </div>
              ))}
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
        ) : null}
      </div>
    </>
  );

  if (!open) return null;

  if (shouldUsePopover && typeof document !== 'undefined') {
    return createPortal(
      <ProtoPopoverShell
        ref={cardRef}
        role="dialog"
        aria-label={`People in ${spaceTitle}`}
        className="proto-connect-note-popover proto-create-folder-popover"
        style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999, zIndex: 6000 }}
      >
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet">{content}</div>
      </ProtoPopoverShell>,
      document.body,
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-create-folder-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}

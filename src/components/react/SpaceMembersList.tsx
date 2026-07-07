import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import ConfirmDialog from './dialogs/ConfirmDialog';
import { useDesktopMainModalPortal } from '@/hooks/useDesktopMainModalPortal';
import { resolveClerkProfileImageUrl, resolveSpaceMemberProfileImageUrl } from '@/utils/clerk-profile-image';

interface Member {
  userId: string;
  role: 'owner' | 'member';
  firstName?: string | null;
  lastName?: string | null;
  /** First name + last initial only (API no longer sends lastName for privacy). */
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
  joinedAt: string;
}

interface PendingInvitation {
  id: string;
  invitedEmail?: string | null;
  invitedUserId?: string | null;
  inviteToken: string;
  message?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface SpaceMembersListProps {
  spaceId: string;
  spaceName: string;
  isOwner: boolean;
  onClose: () => void;
  onMemberRemoved?: () => void;
}

export default function SpaceMembersList({
  spaceId,
  spaceName,
  isOwner,
  onClose,
  onMemberRemoved,
}: SpaceMembersListProps) {
  const { portalTarget } = useDesktopMainModalPortal();
  const { userId: authUserId } = useAuth();
  const { user } = useUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [showLeaveConfirmDialog, setShowLeaveConfirmDialog] = useState(false);
  const [pendingLeaveUserId, setPendingLeaveUserId] = useState<string | null>(null);
  const [showRemoveMemberDialog, setShowRemoveMemberDialog] = useState(false);
  const [pendingRemoveMemberUserId, setPendingRemoveMemberUserId] = useState<string | null>(null);
  const [pendingRemoveMemberName, setPendingRemoveMemberName] = useState<string | null>(null);

  useEffect(() => {
    fetchMembers();
  }, [spaceId]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`/api/spaces/${spaceId}/members`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load members');
      }

      setMembers(data.members || []);
      setPendingInvitations(data.pendingInvitations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const memberPhotoUrl = (member: Member): string | null => {
    if (member.userId === authUserId) {
      return resolveClerkProfileImageUrl(user, member.profileImageUrl);
    }
    return resolveSpaceMemberProfileImageUrl(member.profileImageUrl);
  };

  const handleRemoveMember = (userId: string, memberName: string) => {
    const isSelf = members.find(m => m.userId === userId && m.role !== 'owner');

    if (isSelf) {
      setPendingLeaveUserId(userId);
      setShowLeaveConfirmDialog(true);
      return;
    }

    setPendingRemoveMemberUserId(userId);
    setPendingRemoveMemberName(memberName);
    setShowRemoveMemberDialog(true);
  };

  const handleConfirmRemoveMember = async () => {
    if (!pendingRemoveMemberUserId || !pendingRemoveMemberName) return;
    const userIdToRemove = pendingRemoveMemberUserId;
    setShowRemoveMemberDialog(false);
    setPendingRemoveMemberUserId(null);
    setPendingRemoveMemberName(null);

    try {
      setRemovingUserId(userIdToRemove);

      const response = await fetch(`/api/spaces/${spaceId}/members/${userIdToRemove}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove person');
      }

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || 'Person removed successfully',
            type: 'success',
          },
        })
      );

      await fetchMembers();
      if (onMemberRemoved) onMemberRemoved();
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: err.message || 'Failed to remove person',
            type: 'error',
          },
        })
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleConfirmLeave = async () => {
    if (!pendingLeaveUserId) return;
    const userIdToRemove = pendingLeaveUserId;
    setShowLeaveConfirmDialog(false);
    setPendingLeaveUserId(null);

    try {
      setRemovingUserId(userIdToRemove);

      const response = await fetch(`/api/spaces/${spaceId}/members/${userIdToRemove}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to leave space');
      }

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || 'You have left the space',
            type: 'success',
          },
        })
      );

      if (onMemberRemoved) onMemberRemoved();
      onClose();
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: err.message || 'Failed to leave space',
            type: 'error',
          },
        })
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  const getMemberDisplayName = (member: Member) => {
    if (member.displayName) return member.displayName;
    const first = member.firstName || '';
    const lastInitial = member.lastName ? member.lastName.charAt(0).toUpperCase() + '.' : '';
    if (first || lastInitial) return `${first} ${lastInitial}`.trim();
    return member.email || 'Unknown User';
  };

  const getInvitationDisplayEmail = (invitation: PendingInvitation) => {
    return invitation.invitedEmail || 'Link-based invitation';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Use hard-coded month abbreviations instead of toLocaleDateString to avoid
    // iOS PWA ignoring the 'en-US' locale hint and returning full month names.
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  return (
    <>
      {createPortal(
    <div
      className="modal-overlay p-5"
      style={{ zIndex: 9999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex-stack bg-white rounded-[24px] w-full max-w-[600px] max-h-[90vh] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]" style={{ gap: 0 }}>
        {/* Header */}
        <div className="flex-between p-6 border-b border-[var(--color-fog-white)] shrink-0">
          <h2 className="text-[18px] font-semibold text-[var(--color-deep-grey)] m-0">
            People in {spaceName}
          </h2>
          <button
            className="flex-center bg-transparent border-none text-[32px] leading-none text-[var(--color-pebble-grey)] cursor-pointer p-0 w-8 h-8 hover:text-[var(--color-deep-grey)] transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-fill scroll-y p-6">
          {loading && (
            <div className="text-center py-10 text-[var(--color-pebble-grey)]">
              Loading...
            </div>
          )}

          {error && !loading && (
            <div className="bg-[#FED7D7] text-[var(--color-red)] px-4 py-3 rounded-xl mb-4 text-[14px]">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Members List */}
              <div className="mb-8 last:mb-0">
                <h3 className="text-[14px] font-semibold text-[var(--color-stone-grey)] uppercase tracking-wide m-0 mb-3">
                  People ({members.length})
                </h3>
                <div className="flex-stack" style={{ gap: '0.5rem' }}>
                  {members.map((member) => {
                    const displayName = getMemberDisplayName(member);
                    const isRemoving = removingUserId === member.userId;
                    const canRemove = isOwner && member.role !== 'owner';
                    const photoUrl = memberPhotoUrl(member);

                    return (
                      <div
                        key={member.userId}
                        className="flex-between p-3 bg-[var(--color-snow-white)] rounded-xl" style={{ gap: '0.75rem' }}
                      >
                        <div className="flex-row flex-fill" style={{ gap: '0.75rem' }}>
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={displayName}
                              className="w-10 h-10 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-full shrink-0 flex-center text-white font-semibold text-[16px]"
                              style={{ backgroundImage: 'var(--color-gradient-blue)' }}
                            >
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-fill">
                            <div className="text-[14px] font-medium text-[var(--color-deep-grey)] mb-1 text-truncate">
                              {displayName}
                            </div>
                            <div className="flex-row text-[12px] text-[var(--color-pebble-grey)]" style={{ gap: '0.5rem' }}>
                              {member.role === 'owner' ? (
                                <span className="inline-block px-2 py-0.5 rounded-xl text-[11px] font-semibold uppercase tracking-wide bg-[var(--color-bold-blue)] text-white">
                                  Owner
                                </span>
                              ) : null}
                              <span className="text-[12px] text-[var(--color-stone-grey)]">
                                Joined {formatDate(member.joinedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        {canRemove && (
                          <button
                            className="px-3 py-1.5 bg-[#FFF5F5] text-[var(--color-red)] border border-[#FEB2B2] rounded-md text-[13px] font-medium cursor-pointer hover:bg-[#FED7D7] hover:border-[#FC8181] transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => handleRemoveMember(member.userId, displayName)}
                            disabled={isRemoving}
                          >
                            {isRemoving ? 'Removing...' : 'Remove'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pending Invitations (Owner Only) */}
              {isOwner && pendingInvitations.length > 0 && (
                <div className="mb-0">
                  <h3 className="text-[14px] font-semibold text-[var(--color-stone-grey)] uppercase tracking-wide m-0 mb-3">
                    Pending Invitations ({pendingInvitations.length})
                  </h3>
                  <div className="flex-stack" style={{ gap: '0.5rem' }}>
                    {pendingInvitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex-between p-3 bg-[var(--color-snow-white)] rounded-xl" style={{ gap: '0.75rem' }}
                      >
                        <div className="flex-fill">
                          <div className="text-[14px] font-medium text-[var(--color-deep-grey)] mb-1 text-truncate">
                            {getInvitationDisplayEmail(invitation)}
                          </div>
                          <div className="text-[12px] text-[var(--color-pebble-grey)]">
                            Sent {formatDate(invitation.createdAt)}
                            {invitation.expiresAt && (
                              <> · Expires {formatDate(invitation.expiresAt)}</>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-row p-4 border-t border-[var(--color-fog-white)] shrink-0" style={{ gap: '0.75rem' }}>
          <button
            className="flex-fill px-6 py-3 bg-[var(--color-bold-blue)] text-white border-none rounded-full text-[14px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    portalTarget
      )}
      {showLeaveConfirmDialog && (
        <ConfirmDialog
          isOpen={true}
          title="Leave this space?"
          message="Anything you've added to this space will remain in the space unless you remove it. You can rejoin later with the same link."
          confirmLabel="Leave Space"
          cancelLabel="Cancel"
          onConfirm={handleConfirmLeave}
          onCancel={() => {
            setShowLeaveConfirmDialog(false);
            setPendingLeaveUserId(null);
          }}
        />
      )}
      {showRemoveMemberDialog && pendingRemoveMemberName && (
        <ConfirmDialog
          isOpen={true}
          title={`Remove ${pendingRemoveMemberName}?`}
          message={`${pendingRemoveMemberName} will be removed from "${spaceName}" and will no longer have access to this space.`}
          confirmLabel="Remove"
          cancelLabel="Cancel"
          confirmDestructive={true}
          onConfirm={handleConfirmRemoveMember}
          onCancel={() => {
            setShowRemoveMemberDialog(false);
            setPendingRemoveMemberUserId(null);
            setPendingRemoveMemberName(null);
          }}
        />
      )}
    </>
  );
}

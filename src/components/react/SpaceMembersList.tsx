import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Member {
  userId: string;
  role: 'owner' | 'member';
  firstName?: string | null;
  lastName?: string | null;
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
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

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

  const handleRemoveMember = async (userId: string, memberName: string) => {
    const isSelf = members.find(m => m.userId === userId && m.role !== 'owner');
    const confirmMessage = isSelf
      ? `Are you sure you want to leave "${spaceName}"?`
      : `Remove ${memberName} from "${spaceName}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setRemovingUserId(userId);

      const response = await fetch(`/api/spaces/${spaceId}/members/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove member');
      }

      // Show success toast
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || 'Member removed successfully',
            type: 'success',
          },
        })
      );

      // If removing self, close panel and trigger parent callback
      if (isSelf) {
        if (onMemberRemoved) onMemberRemoved();
        onClose();
      } else {
        // Refresh member list
        await fetchMembers();
        if (onMemberRemoved) onMemberRemoved();
      }
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: err.message || 'Failed to remove member',
            type: 'error',
          },
        })
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  const getMemberDisplayName = (member: Member) => {
    if (member.firstName || member.lastName) {
      return `${member.firstName || ''} ${member.lastName || ''}`.trim();
    }
    return member.email || 'Unknown User';
  };

  const getInvitationDisplayEmail = (invitation: PendingInvitation) => {
    return invitation.invitedEmail || 'Link-based invitation';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-[24px] w-full max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-fog-white)] shrink-0">
          <h2 className="text-[18px] font-semibold text-[var(--color-deep-grey)] m-0">
            People in {spaceName}
          </h2>
          <button
            className="bg-transparent border-none text-[32px] leading-none text-[var(--color-pebble-grey)] cursor-pointer p-0 w-8 h-8 flex items-center justify-center hover:text-[var(--color-deep-grey)] transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
                <div className="flex flex-col gap-2">
                  {members.map((member) => {
                    const displayName = getMemberDisplayName(member);
                    const isRemoving = removingUserId === member.userId;
                    const canRemove = isOwner && member.role !== 'owner';

                    return (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between p-3 bg-[var(--color-snow-white)] rounded-xl gap-3"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {member.profileImageUrl ? (
                            <img
                              src={member.profileImageUrl}
                              alt={displayName}
                              className="w-10 h-10 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-semibold text-[16px]"
                              style={{ backgroundImage: 'var(--color-gradient-blue)' }}
                            >
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-medium text-[var(--color-deep-grey)] mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
                              {displayName}
                            </div>
                            <div className="flex items-center gap-2 text-[12px] text-[var(--color-pebble-grey)]">
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
                  <div className="flex flex-col gap-2">
                    {pendingInvitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-3 bg-[var(--color-snow-white)] rounded-xl gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-medium text-[var(--color-deep-grey)] mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
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
        <div className="flex gap-3 p-4 border-t border-[var(--color-fog-white)] shrink-0">
          <button
            className="flex-1 px-6 py-3 bg-[var(--color-bold-blue)] text-white border-none rounded-xl text-[14px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

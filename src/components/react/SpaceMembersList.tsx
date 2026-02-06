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
      className="panel-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="panel-container members-list-panel">
        {/* Header */}
        <div className="panel-header">
          <h2 className="panel-title">Members of {spaceName}</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="panel-content">
          {loading && (
            <div className="loading-state">Loading members...</div>
          )}

          {error && !loading && (
            <div className="error-message">{error}</div>
          )}

          {!loading && !error && (
            <>
              {/* Members List */}
              <div className="members-section">
                <h3 className="section-title">
                  Members ({members.length})
                </h3>
                <div className="members-list">
                  {members.map((member) => {
                    const displayName = getMemberDisplayName(member);
                    const isRemoving = removingUserId === member.userId;
                    const canRemove = isOwner && member.role !== 'owner';

                    return (
                      <div key={member.userId} className="member-row">
                        <div className="member-info">
                          {member.profileImageUrl ? (
                            <img
                              src={member.profileImageUrl}
                              alt={displayName}
                              className="member-avatar"
                            />
                          ) : (
                            <div className="member-avatar-placeholder">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="member-details">
                            <div className="member-name">{displayName}</div>
                            <div className="member-meta">
                              {member.role === 'owner' ? (
                                <span className="role-badge owner">Owner</span>
                              ) : (
                                <span className="role-badge member">Member</span>
                              )}
                              <span className="joined-date">
                                Joined {formatDate(member.joinedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        {canRemove && (
                          <button
                            className="remove-button"
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
                <div className="invitations-section">
                  <h3 className="section-title">
                    Pending Invitations ({pendingInvitations.length})
                  </h3>
                  <div className="invitations-list">
                    {pendingInvitations.map((invitation) => (
                      <div key={invitation.id} className="invitation-row">
                        <div className="invitation-info">
                          <div className="invitation-email">
                            {getInvitationDisplayEmail(invitation)}
                          </div>
                          <div className="invitation-meta">
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
        <div className="panel-actions">
          <button className="button-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      <style>{`
        .panel-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
        }

        .members-list-panel {
          background: white;
          border-radius: 12px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px;
          border-bottom: 1px solid #e2e8f0;
          flex-shrink: 0;
        }

        .panel-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a202c;
          margin: 0;
        }

        .panel-close {
          background: none;
          border: none;
          font-size: 32px;
          line-height: 1;
          color: #718096;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .panel-close:hover {
          color: #2d3748;
        }

        .panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .loading-state {
          text-align: center;
          padding: 40px;
          color: #718096;
        }

        .error-message {
          background: #fed7d7;
          color: #c53030;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .members-section,
        .invitations-section {
          margin-bottom: 32px;
        }

        .members-section:last-child,
        .invitations-section:last-child {
          margin-bottom: 0;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #4a5568;
          margin: 0 0 12px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .members-list,
        .invitations-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .member-row,
        .invitation-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          background: #f7fafc;
          border-radius: 8px;
          gap: 12px;
        }

        .member-info,
        .invitation-info {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .member-avatar,
        .member-avatar-placeholder {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .member-avatar {
          object-fit: cover;
        }

        .member-avatar-placeholder {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 16px;
        }

        .member-details,
        .invitation-info {
          flex: 1;
          min-width: 0;
        }

        .member-name,
        .invitation-email {
          font-size: 14px;
          font-weight: 500;
          color: #2d3748;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .member-meta,
        .invitation-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #718096;
        }

        .role-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .role-badge.owner {
          background: #667eea;
          color: white;
        }

        .role-badge.member {
          background: #e2e8f0;
          color: #4a5568;
        }

        .joined-date {
          font-size: 12px;
          color: #a0aec0;
        }

        .remove-button {
          padding: 6px 12px;
          background: #fff5f5;
          color: #c53030;
          border: 1px solid #feb2b2;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .remove-button:hover:not(:disabled) {
          background: #fed7d7;
          border-color: #fc8181;
        }

        .remove-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .panel-actions {
          display: flex;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid #e2e8f0;
          flex-shrink: 0;
        }

        .button-primary {
          flex: 1;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          background: #667eea;
          color: white;
        }

        .button-primary:hover {
          background: #5a67d8;
        }

        @media (max-width: 600px) {
          .members-list-panel {
            max-height: 95vh;
          }

          .member-row,
          .invitation-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .remove-button {
            width: 100%;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}

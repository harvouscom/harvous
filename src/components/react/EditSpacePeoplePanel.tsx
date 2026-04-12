import React, { useState, useEffect, useMemo } from 'react';
import { getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import ButtonSmall from './ButtonSmall';
import ActionButton from './ActionButton';
import ConfirmDialog from './dialogs/ConfirmDialog';
import { usePersistedUserId } from '@/utils/user-id';

interface EditSpacePeoplePanelProps {
  spaceId: string;
  spaceTitle?: string;
  spaceColor?: ThreadColor;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function EditSpacePeoplePanel({
  spaceId,
  spaceTitle = '',
  spaceColor = 'paper',
  onClose,
  inBottomSheet = false
}: EditSpacePeoplePanelProps) {
  const userId = usePersistedUserId();
  const [members, setMembers] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [pendingRemoveMember, setPendingRemoveMember] = useState<{
    userId: string;
    memberName: string;
    isSelf: boolean;
  } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isLoadingShareLink, setIsLoadingShareLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // Normalize share URL to current origin (SPA) so copy/link is correct when API is on a different host (e.g. dev API port)
  const displayShareUrl = useMemo(() => {
    if (!shareUrl) return null;
    try {
      const u = new URL(shareUrl);
      return typeof window !== 'undefined' ? window.location.origin + u.pathname : shareUrl;
    } catch {
      return shareUrl;
    }
  }, [shareUrl]);

  const fetchMemberInfo = async () => {
    try {
      setIsLoadingMembers(true);
      const response = await fetch(`/api/spaces/${spaceId}/members`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setIsOwner(data.isOwner || false);
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error fetching member info:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const fetchShareLink = async () => {
    try {
      setIsLoadingShareLink(true);
      const response = await fetch(`/api/spaces/${spaceId}/share-link`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setShareUrl(data.shareUrl || null);
      }
    } catch (error) {
      console.error('Error fetching share link:', error);
    } finally {
      setIsLoadingShareLink(false);
    }
  };

  const handleCopyLink = async () => {
    const urlToCopy = displayShareUrl ?? shareUrl;
    if (!urlToCopy) return;
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Failed to copy link', type: 'error' } }));
    }
  };

  const handleRefreshLink = async () => {
    try {
      setIsLoadingShareLink(true);
      const response = await fetch(`/api/spaces/${spaceId}/share-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setShareUrl(data.shareUrl || null);
        window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Share link refreshed', type: 'success' } }));
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Failed to refresh link', type: 'error' } }));
    } finally {
      setIsLoadingShareLink(false);
    }
  };

  const handleRemoveMember = (memberUserId: string, memberName: string) => {
    const isSelf = memberUserId === userId;
    setPendingRemoveMember({ userId: memberUserId, memberName, isSelf });
  };

  const handleConfirmRemoveMember = async () => {
    if (!pendingRemoveMember) return;
    const { userId: userIdToRemove, isSelf } = pendingRemoveMember;
    setPendingRemoveMember(null);

    try {
      setRemovingUserId(userIdToRemove);

      const response = await fetch(`/api/spaces/${spaceId}/members/${userIdToRemove}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove member');
      }

      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: data.message || (isSelf ? 'You have left the space' : 'Member removed successfully'),
            type: 'success'
          }
        })
      );

      await fetchMemberInfo();
    } catch (err: any) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: err.message || 'Failed to remove member',
            type: 'error'
          }
        })
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  useEffect(() => {
    if (spaceId) {
      fetchMemberInfo();
      fetchShareLink();
    }
  }, [spaceId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && spaceId) {
        fetchMemberInfo();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [spaceId]);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeEditSpacePeoplePanel'));
    }
  };

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className="form-layout">
        <div className="form-layout--expand" style={{ position: 'relative' }}>
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isLoadingMembers ? 'opacity-60 pointer-events-none' : ''}`}>
            <div
              className="panel__header"
              style={{
                backgroundColor: getThreadColorCSS(spaceColor),
                color: getThreadTextColorCSS(spaceColor)
              }}
            >
              <div className="panel__title">
                <p>People</p>
              </div>
            </div>

            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                <div className="panel__content-scroll">
                <div className="space-people-list">
                  <div className="space-people-list__rows">
                    {members.map((member) => {
                      const initials = [member.firstName?.[0], member.lastName?.[0]]
                        .filter(Boolean)
                        .join('')
                        .toUpperCase() || '?';
                      const displayName = member.displayName
                        ?? ([member.firstName, member.lastName ? member.lastName[0] + '.' : null]
                            .filter(Boolean)
                            .join(' ')
                            .trim()
                            || member.email || 'Unknown');
                      const isRemoving = removingUserId === member.userId;
                      const canRemove = isOwner && member.role !== 'owner';

                      return (
                        <div key={member.userId} className="space-people-list__row">
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: 0,
                              width: '2.75rem',
                              borderTopLeftRadius: '0.75rem',
                              borderBottomLeftRadius: '0.75rem',
                              overflow: 'hidden',
                              backgroundColor: `var(--color-${member.userColor || 'blue'})`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '16px',
                              fontWeight: 700,
                              color: 'var(--color-deep-grey)',
                              flexShrink: 0
                            }}
                          >
                            {initials}
                          </div>
                          <span className="space-people-list__name" style={{ paddingLeft: '3.5rem' }}>
                            {displayName}
                          </span>
                          {member.role === 'owner' && (
                            <span className="space-people-list__owner-badge">Creator</span>
                          )}
                          {canRemove && (
                            <ActionButton
                              variant="Remove"
                              onClick={() => handleRemoveMember(member.userId, displayName)}
                              disabled={isRemoving}
                              className="space-people-list__remove w-8 h-8"
                              aria-label={`Remove ${displayName}`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {isOwner && shareUrl && (
                  <div className="space-share-link" style={{ marginTop: 'auto' }}>
                    <div className="space-share-link__container">
                      <input
                        type="text"
                        readOnly
                        value={displayShareUrl ?? shareUrl ?? ''}
                        className="space-share-link__input"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <ButtonSmall
                        type="button"
                        onClick={handleCopyLink}
                        disabled={isLoadingShareLink}
                        state="Default"
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </ButtonSmall>
                    </div>
                    <button
                      type="button"
                      onClick={handleRefreshLink}
                      disabled={isLoadingShareLink}
                      className="btn-cta btn--secondary"
                    >
                      <span className="btn-cta__content">
                        Generate a new sharable link
                      </span>
                      <div className="btn-cta__shadow" />
                    </button>
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel__footer--buttons">
          <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
        </div>
      </div>

      <style>{`
        .space-people-list__header {
          font-family: var(--font-sans);
          font-size: 14px;
          color: var(--color-stone-grey);
          text-align: center;
          padding: 0.5rem 0 0.75rem;
        }

        .space-people-list__rows {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .space-people-list__row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0 0.75rem 0 0;
          border-radius: 0.75rem;
          background: white;
          height: 48px;
          box-sizing: border-box;
          overflow: hidden;
        }

        .space-people-list__name {
          font-family: var(--font-sans);
          font-size: 16px;
          font-weight: 700;
          color: var(--color-deep-grey);
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .space-people-list__owner-badge {
          flex-shrink: 0;
          background: rgba(120, 118, 111, 0.1);
          border-radius: 1.5rem;
          padding: 0.25rem 0.625rem;
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 600;
          color: var(--color-deep-grey);
          line-height: 1;
        }

        .space-people-list__remove {
          flex-shrink: 0;
          margin-left: auto;
        }

        .space-share-link {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .space-share-link__container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--color-gradient-gray);
          border-radius: 1.5rem;
        }

        .space-share-link__container .btn {
          flex-shrink: 0;
        }

        .space-share-link__input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          font-size: 0.875rem;
          line-height: 1.25rem;
          color: var(--color-deep-grey);
          outline: none;
          text-overflow: ellipsis;
          font-family: var(--font-sans);
        }
      `}</style>

      {pendingRemoveMember && (
        <ConfirmDialog
          isOpen={true}
          title={pendingRemoveMember.isSelf ? 'Leave This Space?' : `Remove ${pendingRemoveMember.memberName}?`}
          message={
            pendingRemoveMember.isSelf
              ? `Are you sure you want to leave "${spaceTitle}"?`
              : `${pendingRemoveMember.memberName} will be removed from "${spaceTitle}" and will no longer have access to this space.`
          }
          confirmLabel={pendingRemoveMember.isSelf ? 'Leave Space' : 'Remove'}
          cancelLabel="Cancel"
          confirmDestructive={true}
          onConfirm={handleConfirmRemoveMember}
          onCancel={() => setPendingRemoveMember(null)}
        />
      )}
    </div>
  );
}
